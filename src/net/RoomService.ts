import type { GameState, LordId } from '../game/types';
import { BOARD } from '../data/board';
import { HostRoom, type HostSnapshot } from './HostRoom';
import { dial, listen, type Link } from './p2p/link';
import { RoomPresence } from './p2p/presence';
import { LocalDirectory, LocalSignal, SupabaseDirectory, SupabaseSignal, type Directory, type SignalChannel } from './p2p/signaling';
import { RoomError, codeOf, type EventRow, type GamePublic, type GameResponse, type Member, type Room } from './roomTypes';
import { localP2P, projectKey, supabase } from './supabase';

export { RoomError, isOnline, OFFLINE_MS } from './roomTypes';
export type { EventRow, GamePublic, GameResponse, Member, Room } from './roomTypes';

/** 傳輸時省略固定的地圖格子，收到後在這裡補上 */
export function withTiles(state: GameState): GameState {
  if (!state.tiles?.length) state.tiles = structuredClone(BOARD.tiles);
  return state;
}

/** 房主傳給玩家的訊息、玩家送給房主的請求 */
type Op = 'join' | 'leave' | 'ready' | 'lord' | 'rounds' | 'addAi' | 'removeAi' | 'heartbeat' | 'room' | 'game' | 'events'
  | 'start' | 'answer' | 'continue' | 'takeover' | 'reclaim';
type Args = Record<string, unknown>;
type Msg =
  | { t: 'req'; id: number; op: Op; args: Args }
  | { t: 'res'; id: number; ok: boolean; data?: unknown; error?: string }
  | { t: 'room'; room: Room; members: Member[] }
  | { t: 'update'; update: GameResponse };

interface RoomWatch { kind: 'room'; onChange: () => void; onStatus: (online: boolean) => void }
interface GameWatch { kind: 'game'; onUpdate: (u: GameResponse) => void; onStatus: (online: boolean) => void }
export type WatchHandle = RoomWatch | GameWatch;

const HOST_SAVE = (code: string) => projectKey(`xiantu-p2p-host-${code}`);
const REQUEST_TIMEOUT = 20_000;
const HOST_BEAT_MS = 20_000;

const clone = <T>(v: T): T => (v == null ? v : (JSON.parse(JSON.stringify(v)) as T));
/** 傳輸用：去掉地圖格子（每位玩家本來就有） */
const wire = <T>(v: T): T => JSON.parse(JSON.stringify(v, (k, val) => (k === 'tiles' ? undefined : val))) as T;
const randomId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);

/** 本機的儲存：開發用的分頁模式改用 sessionStorage，讓同一瀏覽器的兩個分頁是兩位不同玩家 */
const store = () => (localP2P() ? sessionStorage : localStorage);
function persistentId(key: string) {
  try {
    let v = store().getItem(key);
    if (!v) store().setItem(key, (v = randomId()));
    return v;
  } catch {
    return randomId();
  }
}

/**
 * 多人連線（點對點）：
 * - Supabase 只保存「房號 → 開房玩家」，並在建立連線的幾秒內轉交雙方的連線資訊（含 IP）。
 * - 連上之後，所有遊戲資料直接在玩家與房主之間傳送（WebRTC DataChannel）。
 * - 房主的瀏覽器就是權威端（HostRoom）：骰子、規則、存檔都在房主這邊；房主自己的操作直接呼叫，不經網路。
 */
export class RoomService {
  userId = '';
  private local = localP2P();
  private sb = this.local ? null : supabase();
  private dir: Directory;
  private presence = new RoomPresence((code) => this.dir.present(code));
  private secret = '';
  /** 這次開啟頁面的連線識別（重新整理會換新的；房號目錄會跟著更新） */
  private peerId = randomId();
  private code: string | null = null;
  private connected = false;
  private watchers = new Set<WatchHandle>();
  // 房主
  private host: HostRoom | null = null;
  private hostSignal: SignalChannel | null = null;
  private stopListen: (() => void) | null = null;
  private links = new Set<Link>();
  private hostBeat: ReturnType<typeof setInterval> | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  // 玩家
  private link: Link | null = null;
  private nickname = '';
  private reqId = 0;
  private waiting = new Map<number, { resolve: (v: unknown) => void; reject: (e: unknown) => void; timer: ReturnType<typeof setTimeout> }>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 1000;
  private cache: { room: Room; members: Member[] } | null = null;

  constructor() {
    if (this.local) this.dir = new LocalDirectory(() => this.userId);
    else if (this.sb) this.dir = new SupabaseDirectory(this.sb);
    else throw new RoomError('尚未設定 Supabase（VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY）');
    window.addEventListener('pagehide', () => { this.saveNow(); void this.presence.stop(); });
    window.addEventListener('pageshow', () => { if (this.code) this.presence.start(this.code); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) void this.presence.ping(); });
  }

  /** 匿名登入：同一個瀏覽器會沿用同一個身分，重新整理後仍能回到原本的房間 */
  async signIn(): Promise<string> {
    this.secret = persistentId(projectKey('xiantu-p2p-seat'));
    if (this.local) return (this.userId = persistentId('xiantu-p2p-local-user'));
    const sb = this.sb!;
    const { data } = await sb.auth.getSession();
    if (data.session?.user) {
      // 確認本機的登入資料仍然有效（例如專案換過金鑰）；失效就丟掉重新登入
      const { data: check, error } = await sb.auth.getUser();
      if (!error && check.user) return (this.userId = check.user.id);
      await sb.auth.signOut({ scope: 'local' }).catch(() => {});
    }
    const { data: signed, error } = await sb.auth.signInAnonymously();
    if (error || !signed.user) throw new RoomError(error?.message.includes('Anonymous') ? '伺服器尚未開啟匿名登入（Authentication → Anonymous sign-ins）' : codeOf(error));
    return (this.userId = signed.user.id);
  }

  private signal(code: string): SignalChannel {
    return this.local ? new LocalSignal(code) : new SupabaseSignal(this.sb!, code);
  }

  // ───────────────────────── 建立與加入 ─────────────────────────

  async createRoom(nickname: string, maxRounds: number | null) {
    this.closeAll();
    const code = await this.dir.create(this.peerId, 'waiting');
    this.host = HostRoom.create(code, this.userId, this.secret, nickname, maxRounds);
    await this.startHosting(code);
    return { room_id: code, code };
  }

  /** 以房號加入；自己開的房間（本機有存檔）則重新開始主持 */
  async joinRoom(code: string, nickname: string) {
    this.nickname = nickname;
    if (this.code === code && (this.host || this.link?.open)) return this.call<{ room_id: string; code: string; rejoined: boolean }>('join', { nickname });
    this.closeAll();
    const saved = this.loadSave(code);
    if (saved && saved.room.host_id === this.userId && (saved.room.status !== 'closed' || saved.pub?.over)) {
      this.host = HostRoom.restore(saved);
      await this.dir.claim(code, this.peerId, this.host.room.status);
      await this.startHosting(code);
      return this.host.join(this.userId, this.secret, nickname);
    }
    const info = await this.dir.lookup(code);
    if (!info) throw new RoomError('ROOM_NOT_FOUND');
    if (info.status === 'closed' || info.host_id === this.userId) throw new RoomError('ROOM_CLOSED');
    if (!info.online) throw new RoomError('HOST_OFFLINE');
    this.code = code;
    await this.connect(info.host_peer);
    const joined = await this.call<{ room_id: string; code: string; rejoined: boolean }>('join', { nickname });
    this.presence.start(code);
    return joined;
  }

  leaveRoom(_roomId: string) {
    return this.leave();
  }

  private async leave() {
    await this.presence.stop();
    if (this.host) {
      const host = this.host;
      host.leave(this.userId);
      const closed = host.room.status === 'closed';
      if (closed) await this.dir.close(host.room.code).catch(() => {});
      // 等待中離開：房間關閉，刪掉存檔；對局中離開：保留存檔，之後輸入房號即可接著主持
      this.stopHosting(!closed || !!host.pub?.over);
    } else if (this.link?.open) {
      await this.request('leave', {}).catch(() => {});
    }
    this.closeAll();
  }

  // ───────────────────────── 房間操作（與舊版 RPC 同名） ─────────────────────────

  setReady(_r: string, ready: boolean) { return this.call<void>('ready', { ready }); }
  setLord(_r: string, lord: LordId) { return this.call<void>('lord', { lord }); }
  setRounds(_r: string, rounds: number | null) { return this.call<void>('rounds', { rounds }); }
  addAi(_r: string) { return this.call<void>('addAi', {}); }
  removeAi(_r: string, memberId: string) { return this.call<void>('removeAi', { memberId }); }
  heartbeat(_r: string) { return this.call<void>('heartbeat', {}); }

  async fetchRoom(_r: string): Promise<{ room: Room; members: Member[] }> {
    if (!this.host && !this.link?.open && this.cache) return clone(this.cache);
    return this.call<{ room: Room; members: Member[] }>('room', {});
  }

  async fetchGame(_r: string): Promise<GamePublic | null> {
    const pub = await this.call<GamePublic | null>('game', {});
    if (pub) withTiles(pub.state);
    return pub;
  }

  fetchEvents(_r: string, after: number) {
    return this.call<EventRow[]>('events', { after });
  }

  /** 對局操作：由房主（權威端）執行 */
  async game(action: 'start' | 'answer' | 'continue' | 'takeover' | 'reclaim', _r: string, extra: Args = {}) {
    const res = await this.call<GameResponse>(action, extra);
    if (res?.state) withTiles(res.state);
    return res;
  }

  watchRoom(_r: string, onChange: () => void, onStatus: (online: boolean) => void): WatchHandle {
    const w: RoomWatch = { kind: 'room', onChange, onStatus };
    this.watchers.add(w);
    queueMicrotask(() => this.watchers.has(w) && onStatus(this.connected));
    return w;
  }

  /** onEvent 保留舊版介面；點對點時房主直接推送完整更新（onUpdate） */
  watchGame(_r: string, _onEvent: (row: EventRow) => void, onStatus: (online: boolean) => void, onUpdate: (u: GameResponse) => void): WatchHandle {
    const w: GameWatch = { kind: 'game', onUpdate, onStatus };
    this.watchers.add(w);
    queueMicrotask(() => this.watchers.has(w) && onStatus(this.connected));
    return w;
  }

  unwatch(h: WatchHandle | null) {
    if (h) this.watchers.delete(h);
  }

  private setConnected(on: boolean) {
    if (this.connected === on) return;
    this.connected = on;
    for (const w of this.watchers) w.onStatus(on);
  }

  private notifyRoom() {
    for (const w of this.watchers) if (w.kind === 'room') w.onChange();
  }

  private notifyUpdate(u: GameResponse) {
    if (u.state) withTiles(u.state);
    for (const w of this.watchers) if (w.kind === 'game') w.onUpdate(u);
  }

  /** 房主直接呼叫本機的權威端；玩家送請求給房主 */
  private async call<T>(op: Op, args: Args): Promise<T> {
    if (this.host) return clone((await this.hostCall(this.userId, op, { ...args, secret: this.secret, nickname: args.nickname ?? this.nickname })) as T);
    return (await this.request(op, args)) as T;
  }

  // ───────────────────────── 房主 ─────────────────────────

  private async hostCall(userId: string, op: Op, a: Args): Promise<unknown> {
    const h = this.host!;
    switch (op) {
      case 'join': return h.join(userId, (a.secret as string) ?? null, String(a.nickname ?? ''));
      case 'leave': return h.leave(userId);
      case 'ready': return h.setReady(userId, !!a.ready);
      case 'lord': return h.setLord(userId, a.lord as LordId);
      case 'rounds': return h.setRounds(userId, (a.rounds as number | null) ?? null);
      case 'addAi': return h.addAi(userId);
      case 'removeAi': return h.removeAi(userId, String(a.memberId));
      case 'heartbeat': return h.heartbeat(userId);
      case 'room': return { room: h.room, members: h.members() };
      case 'game': return h.getGame();
      case 'events': return h.getEvents(Number(a.after) || 0);
      case 'start': return h.start(userId);
      case 'answer': return h.answer(userId, String(a.seq), a.answer, (a.opId as string) ?? null);
      case 'continue': return h.continue();
      case 'takeover': return h.takeover(userId, a.lord as LordId);
      case 'reclaim': return h.reclaim(userId);
    }
  }

  private async startHosting(code: string) {
    const host = this.host!;
    this.code = code;
    host.onRoom = () => this.pushRoom();
    host.onUpdate = (u) => this.pushUpdate(u);
    host.onChange = () => this.scheduleSave();
    this.hostSignal = this.signal(code);
    this.stopListen = listen(this.hostSignal, this.peerId, (link) => this.acceptLink(link));
    await this.hostSignal.ready;
    const beat = () => void this.dir.touch(code, this.peerId, host.room.status === 'closed' && !host.pub?.over ? 'closed' : host.room.status).catch(() => {});
    beat();
    this.hostBeat = setInterval(beat, HOST_BEAT_MS);
    this.saveNow();
    this.setConnected(true);
    this.presence.start(code);
  }

  private acceptLink(link: Link) {
    this.links.add(link);
    link.onMessage((m) => void this.onHostMessage(link, m as Msg));
    link.onClose(() => {
      this.links.delete(link);
      if (link.userId) this.host?.markOffline(link.userId);
    });
  }

  private async onHostMessage(link: Link, m: Msg) {
    if (m.t !== 'req' || !this.host) return;
    try {
      let data: unknown;
      if (m.op === 'join') {
        // 身分由玩家自報，座位鑰匙防止冒用別人的座位
        const user = String(m.args.userId ?? '');
        if (!user) throw new RoomError('NOT_SIGNED_IN');
        data = this.host.join(user, (m.args.secret as string) ?? null, String(m.args.nickname ?? ''));
        link.userId = user;
        link.send({ t: 'room', room: this.host.room, members: this.host.members() } satisfies Msg);
      } else {
        if (!link.userId) throw new RoomError('NOT_MEMBER');
        this.host.touch(link.userId);
        data = await this.hostCall(link.userId, m.op, m.args);
      }
      link.send({ t: 'res', id: m.id, ok: true, data: data === undefined ? null : wire(data) } satisfies Msg);
    } catch (e) {
      link.send({ t: 'res', id: m.id, ok: false, error: codeOf(e) } satisfies Msg);
    }
  }

  private pushRoom() {
    const h = this.host!;
    const msg: Msg = { t: 'room', room: h.room, members: h.members() };
    for (const l of this.links) if (l.userId) l.send(msg);
    this.cache = clone({ room: h.room, members: h.members() });
    this.notifyRoom();
    // 房間狀態改變時同步更新房號目錄
    if (this.code) void this.dir.touch(this.code, this.peerId, h.room.status === 'closed' && !h.pub?.over ? 'closed' : h.room.status).catch(() => {});
  }

  private pushUpdate(u: GameResponse) {
    const msg: Msg = { t: 'update', update: wire(u) };
    for (const l of this.links) if (l.userId) l.send(msg);
    this.notifyUpdate(clone(u));
  }

  private scheduleSave() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.saveNow(), 300);
  }

  private saveNow() {
    if (!this.host) return;
    try {
      localStorage.setItem(HOST_SAVE(this.host.room.code), JSON.stringify(wire(this.host.snapshot())));
    } catch (e) {
      console.warn('無法儲存房主存檔', e);
    }
  }

  private loadSave(code: string): HostSnapshot | null {
    try {
      const raw = localStorage.getItem(HOST_SAVE(code));
      if (!raw) return null;
      const s = JSON.parse(raw) as HostSnapshot;
      // 存檔省略了地圖格子：補回快照與公開狀態
      if (s.record) withTiles(s.record.snapshot);
      if (s.pub) withTiles(s.pub.state);
      return s;
    } catch {
      return null;
    }
  }

  private stopHosting(keepSave: boolean) {
    if (!this.host) return;
    if (keepSave) this.saveNow();
    else localStorage.removeItem(HOST_SAVE(this.host.room.code));
    if (this.saveTimer) clearTimeout(this.saveTimer);
    if (this.hostBeat) clearInterval(this.hostBeat);
    this.saveTimer = this.hostBeat = null;
    this.stopListen?.();
    this.hostSignal?.close();
    this.stopListen = null;
    this.hostSignal = null;
    for (const l of [...this.links]) l.close();
    this.links.clear();
    this.host.dispose();
    this.host = null;
  }

  // ───────────────────────── 玩家 ─────────────────────────

  private async connect(hostPeer: string) {
    const signal = this.signal(this.code!);
    try {
      const link = await dial(signal, this.peerId, hostPeer);
      this.link = link;
      link.onMessage((m) => this.onClientMessage(m as Msg));
      link.onClose(() => this.onDisconnected(link));
      this.reconnectDelay = 1000;
      this.setConnected(true);
    } finally {
      signal.close();
    }
  }

  private onClientMessage(m: Msg) {
    if (m.t === 'res') {
      const w = this.waiting.get(m.id);
      if (!w) return;
      this.waiting.delete(m.id);
      clearTimeout(w.timer);
      if (m.ok) w.resolve(m.data);
      else w.reject(new RoomError(m.error ?? 'UNKNOWN'));
    } else if (m.t === 'room') {
      this.cache = { room: m.room, members: m.members };
      this.notifyRoom();
    } else if (m.t === 'update') {
      this.notifyUpdate(m.update);
    }
  }

  private request(op: Op, args: Args): Promise<unknown> {
    const link = this.link;
    if (!link?.open) return Promise.reject(new RoomError('DISCONNECTED'));
    const id = ++this.reqId;
    const full = op === 'join' ? { ...args, userId: this.userId, secret: this.secret } : args;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiting.delete(id);
        reject(new RoomError('TIMEOUT'));
      }, REQUEST_TIMEOUT);
      this.waiting.set(id, { resolve, reject, timer });
      if (!link.send({ t: 'req', id, op, args: full } satisfies Msg)) {
        clearTimeout(timer);
        this.waiting.delete(id);
        reject(new RoomError('DISCONNECTED'));
      }
    });
  }

  private onDisconnected(link: Link) {
    if (this.link !== link) return;
    this.link = null;
    for (const [id, w] of this.waiting) {
      clearTimeout(w.timer);
      w.reject(new RoomError('DISCONNECTED'));
      this.waiting.delete(id);
    }
    this.setConnected(false);
    this.scheduleReconnect();
  }

  /** 與房主斷線後自動重連（房主重新整理、網路切換等）；房間關閉則通知畫面 */
  private scheduleReconnect() {
    if (this.reconnectTimer || !this.code || this.host) return;
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      const code = this.code;
      if (!code || this.host || this.link) return;
      try {
        const info = await this.dir.lookup(code);
        if (!info || info.status === 'closed') {
          void this.presence.stop();
          if (this.cache) this.cache.room.status = 'closed';
          this.notifyRoom();
          return;
        }
        if (info.online) {
          await this.connect(info.host_peer);
          await this.request('join', { nickname: this.nickname });
          return;
        }
      } catch { /* 下次再試 */ }
      this.reconnectDelay = Math.min(this.reconnectDelay * 1.6, 8000);
      this.scheduleReconnect();
    }, this.reconnectDelay);
  }

  private closeAll() {
    void this.presence.stop();
    this.stopHosting(true);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    const link = this.link;
    this.link = null;
    link?.close();
    this.code = null;
    this.cache = null;
    this.setConnected(false);
  }
}

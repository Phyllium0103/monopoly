import type { LordId } from '../game/types';
import { LORD_IDS } from '../faction/Faction';
import {
  advance,
  answer as answerRecord,
  createMultiplayerState,
  newRecord,
  reclaim as reclaimRecord,
  takeover as takeoverRecord,
  type GameRecord,
  type StepResult,
} from '../engine/server';
import { OFFLINE_MS, RoomError, type EventRow, type GamePublic, type GameResponse, type Member, type Room } from './roomTypes';

/** 房主端保存的座位：secret 是加入時瀏覽器提供的座位鑰匙，重新連線時用來確認是本人 */
export interface Seat extends Member {
  secret: string | null;
}

/** 存在房主瀏覽器的完整資料：重新整理後可從這裡繼續 */
export interface HostSnapshot {
  room: Room;
  seats: Seat[];
  record: GameRecord | null;
  pub: GamePublic | null;
  events: EventRow[];
  ops: [string, number][];
}

const MAX_PLAYERS = 4;
/** 補抓用的事件只保留最近幾版（太舊的玩家改讀完整狀態） */
const KEEP_EVENTS = 60;
const KEEP_OPS = 300;

const uid = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
const iso = (ms = Date.now()) => new Date(ms).toISOString();

/** 與舊版資料庫的 clean_nickname 相同：去掉 HTML 字元、空白，最多 16 字 */
export const cleanNickname = (s: string) => (s ?? '').replace(/[<>&"]/g, '').trim().slice(0, 16) || '無名修士';

/**
 * 點對點多人的權威端：在房主的瀏覽器上執行。
 * 房間規則（加入、準備、選陣營、電腦、開始）與原本資料庫 RPC 相同；
 * 對局沿用 engine/server.ts 的「快照 + 重播」推進，房主重新整理後可從保存的記錄接著玩。
 * 所有會改變遊戲的操作依序執行，同時兩個操作不會互相覆蓋。
 */
export class HostRoom {
  /** 房間或成員有變化（要推送給所有人） */
  onRoom: () => void = () => {};
  /** 對局推進了一個版本（要推送給所有人） */
  onUpdate: (u: GameResponse) => void = () => {};
  /** 任何需要存檔的變化 */
  onChange: () => void = () => {};
  private lock: Promise<unknown> = Promise.resolve();
  private continueTimer: ReturnType<typeof setTimeout> | null = null;

  private constructor(
    public room: Room,
    public seats: Seat[],
    public record: GameRecord | null,
    public pub: GamePublic | null,
    public events: EventRow[],
    public ops: Map<string, number>,
  ) {}

  static create(code: string, userId: string, secret: string, nickname: string, maxRounds: number | null) {
    const room: Room = { id: code, code, host_id: userId, status: 'waiting', max_players: MAX_PLAYERS, max_rounds: maxRounds };
    const h = new HostRoom(room, [], null, null, [], new Map());
    h.seats.push(h.newSeat(userId, secret, nickname, 'human', 'cao', true));
    return h;
  }

  static restore(s: HostSnapshot) {
    const h = new HostRoom(s.room, s.seats, s.record, s.pub, s.events ?? [], new Map(s.ops ?? []));
    // 重新整理前連著的人都要重新連線：先一律視為離線，連回來後再更新
    for (const m of h.seats) if (m.kind === 'human' && m.user_id !== s.room.host_id) m.last_seen_at = iso(Date.now() - OFFLINE_MS - 1000);
    return h;
  }

  snapshot(): HostSnapshot {
    return { room: this.room, seats: this.seats, record: this.record, pub: this.pub, events: this.events, ops: [...this.ops] };
  }

  /** 給玩家看的成員列表（不含座位鑰匙） */
  members(): Member[] {
    return this.seats.map(({ secret: _secret, ...m }) => m);
  }

  // ───────────────────────── 房間 ─────────────────────────

  private newSeat(userId: string | null, secret: string | null, nickname: string, kind: 'human' | 'ai', lord: LordId, isHost = false): Seat {
    const now = iso();
    return {
      id: uid(), room_id: this.room.id, user_id: userId, secret, nickname: cleanNickname(nickname), kind, lord_id: lord,
      is_host: isHost, ready: kind === 'ai', ai_control: false, joined_at: now, last_seen_at: now,
    };
  }

  private seatOf(userId: string) {
    return this.seats.find((m) => m.user_id === userId);
  }

  private member(userId: string) {
    const m = this.seatOf(userId);
    if (!m) throw new RoomError('NOT_MEMBER');
    return m;
  }

  private assertHost(userId: string) {
    if (this.room.host_id !== userId) throw new RoomError('NOT_HOST');
  }

  private assertWaiting() {
    if (this.room.status !== 'waiting') throw new RoomError('NOT_IN_WAITING_ROOM');
  }

  private freeLord(): LordId {
    const taken = new Set(this.seats.map((m) => m.lord_id));
    const lord = LORD_IDS.find((l) => !taken.has(l));
    if (!lord) throw new RoomError('ROOM_FULL');
    return lord;
  }

  private changed() {
    this.onRoom();
    this.onChange();
  }

  /** 有收到某人的訊息：更新最後上線時間 */
  touch(userId: string) {
    const m = this.seatOf(userId);
    if (m) m.last_seen_at = iso();
  }

  /** 某人的連線斷了：立刻顯示為離線（房主才能馬上交由電腦代打） */
  markOffline(userId: string) {
    const m = this.seatOf(userId);
    if (!m || m.kind !== 'human') return;
    m.last_seen_at = iso(Date.now() - OFFLINE_MS - 1000);
    this.changed();
  }

  /** 加入；已是成員則回到原座位（需要同一個瀏覽器的座位鑰匙） */
  join(userId: string, secret: string | null, nickname: string) {
    if (this.room.status === 'closed' && !this.pub?.over) throw new RoomError('ROOM_CLOSED');
    const existing = this.seatOf(userId);
    if (existing) {
      if (existing.secret && existing.secret !== secret) throw new RoomError('SEAT_TAKEN');
      existing.last_seen_at = iso();
      this.changed();
      return { room_id: this.room.id, code: this.room.code, rejoined: true };
    }
    if (this.room.status !== 'waiting') throw new RoomError(this.room.status === 'playing' ? 'ROOM_STARTED' : 'ROOM_CLOSED');
    if (this.seats.length >= this.room.max_players) throw new RoomError('ROOM_FULL');
    this.seats.push(this.newSeat(userId, secret, nickname, 'human', this.freeLord()));
    this.changed();
    return { room_id: this.room.id, code: this.room.code, rejoined: false };
  }

  /**
   * 離開：等待中直接移除座位；對局中保留座位（可回來，房主可交由電腦代打）。
   * 房主在等待中離開會關閉房間；對局中離開則對局暫停，房主用同一個瀏覽器輸入房號即可接著主持。
   */
  leave(userId: string) {
    const m = this.seatOf(userId);
    if (!m) return;
    if (this.room.status === 'waiting') {
      if (m.is_host) this.room.status = 'closed';
      else this.seats = this.seats.filter((x) => x !== m);
    } else {
      m.last_seen_at = iso(Date.now() - OFFLINE_MS - 1000);
    }
    this.changed();
  }

  setReady(userId: string, ready: boolean) {
    this.assertWaiting();
    const m = this.member(userId);
    m.ready = ready;
    m.last_seen_at = iso();
    this.changed();
  }

  setLord(userId: string, lord: LordId) {
    this.assertWaiting();
    if (!LORD_IDS.includes(lord)) throw new RoomError('BAD_TARGET');
    const m = this.member(userId);
    if (this.seats.some((x) => x !== m && x.lord_id === lord)) throw new RoomError('LORD_TAKEN');
    m.lord_id = lord;
    m.ready = false;
    this.changed();
  }

  setRounds(userId: string, rounds: number | null) {
    this.assertHost(userId);
    this.assertWaiting();
    if (rounds !== null && !(Number.isInteger(rounds) && rounds >= 10 && rounds <= 200)) throw new RoomError('BAD_TARGET');
    this.room.max_rounds = rounds;
    this.changed();
  }

  addAi(userId: string) {
    this.assertHost(userId);
    this.assertWaiting();
    if (this.seats.length >= this.room.max_players) throw new RoomError('ROOM_FULL');
    const n = this.seats.filter((m) => m.kind === 'ai').length + 1;
    this.seats.push(this.newSeat(null, null, `電腦${n}`, 'ai', this.freeLord()));
    this.changed();
  }

  removeAi(userId: string, memberId: string) {
    this.assertHost(userId);
    this.assertWaiting();
    this.seats = this.seats.filter((m) => !(m.id === memberId && m.kind === 'ai'));
    this.changed();
  }

  heartbeat(userId: string) {
    this.touch(userId);
    this.onRoom();
  }

  // ───────────────────────── 對局 ─────────────────────────

  /** 依序執行：前一個操作完成（不論成功與否）才開始下一個 */
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.lock.then(fn, fn);
    this.lock = run.catch(() => {});
    return run;
  }

  getGame(): GamePublic | null {
    return this.pub;
  }

  getEvents(after: number): EventRow[] {
    return this.events.filter((e) => e.version > after);
  }

  start(userId: string) {
    return this.serial(async () => {
      this.assertHost(userId);
      if (this.room.status === 'closed') throw new RoomError('ROOM_CLOSED');
      if (this.pub) throw new RoomError('ALREADY_STARTED');
      if (this.seats.some((m) => m.kind === 'human' && !m.ready)) throw new RoomError('NOT_ALL_READY');
      if (this.seats.length < 2) throw new RoomError('NEED_TWO_SEATS');
      this.room.status = 'playing';
      const seats = [...this.seats]
        .sort((a, b) => a.joined_at.localeCompare(b.joined_at))
        .map((m) => ({ lord: m.lord_id, human: m.kind === 'human', name: m.nickname }));
      const seed = (Math.random() * 0x7fffffff) | 0;
      const state = createMultiplayerState(seats, this.room.max_rounds, seed);
      const res = this.commit(await advance(newRecord(state, seed)), null);
      this.changed();
      return res;
    });
  }

  answer(userId: string, seq: string, value: unknown, opId: string | null) {
    return this.serial(async () => {
      if (!this.record || !this.pub) throw new RoomError('NO_GAME');
      if (opId && this.ops.has(opId)) return { ok: true, duplicate: true, version: this.ops.get(opId) } as GameResponse;
      const m = this.member(userId);
      if (m.ai_control) throw new RoomError('AI_CONTROLLED');
      let rec: GameRecord;
      try {
        rec = answerRecord(this.record, this.pub.pending, m.lord_id, String(seq), value);
      } catch {
        throw new RoomError('STALE_ANSWER');
      }
      return this.commit(await advance(rec), opId);
    });
  }

  /** 全是電腦行動時，每次只推進一段；房主端自己會接著推進，玩家也可以請求繼續 */
  continue() {
    return this.serial(async () => {
      if (!this.record || !this.pub) throw new RoomError('NO_GAME');
      if (this.pub.over || this.pub.pending) return { ok: true, version: this.pub.version } as GameResponse;
      return this.commit(await advance(this.record), null);
    });
  }

  /** 房主把斷線的玩家交給電腦代打 */
  takeover(userId: string, lord: LordId) {
    return this.serial(async () => {
      this.assertHost(userId);
      if (!this.record || !this.pub) throw new RoomError('NO_GAME');
      const target = this.seats.find((m) => m.lord_id === lord);
      if (!target || target.kind !== 'human' || target.ai_control) throw new RoomError('BAD_TARGET');
      if (Date.now() - new Date(target.last_seen_at).getTime() < OFFLINE_MS) throw new RoomError('PLAYER_ONLINE');
      const res = this.commit(await advance(takeoverRecord(this.record, lord)), null);
      target.ai_control = true;
      this.changed();
      return res;
    });
  }

  /** 被代打的玩家回來接手：下一位主公的回合開始時生效 */
  reclaim(userId: string) {
    return this.serial(async () => {
      const m = this.member(userId);
      if (!m.ai_control) return { ok: true } as GameResponse;
      if (!this.record) throw new RoomError('NO_GAME');
      const res = this.commit(await advance(reclaimRecord(this.record, m.lord_id)), null);
      m.ai_control = false;
      this.changed();
      return res;
    });
  }

  private commit(r: StepResult, opId: string | null): GameResponse {
    const version = (this.pub?.version ?? 0) + 1;
    this.record = r.record;
    this.pub = { version, state: r.state, pending: r.pending as GamePublic['pending'], over: r.over, paused: r.paused };
    this.events.push({ version, events: r.events });
    if (this.events.length > KEEP_EVENTS) this.events.splice(0, this.events.length - KEEP_EVENTS);
    if (opId) {
      this.ops.set(opId, version);
      if (this.ops.size > KEEP_OPS) this.ops.delete(this.ops.keys().next().value!);
    }
    if (r.over) this.room.status = 'closed';
    const update: GameResponse = { ok: true, version, state: r.state, pending: this.pub.pending, over: r.over, paused: r.paused, events: r.events };
    this.onUpdate(update);
    this.onChange();
    // 全是電腦在行動：房主端自己接著推進，不必等任何人
    if (r.paused && !r.pending && !r.over) {
      if (this.continueTimer) clearTimeout(this.continueTimer);
      this.continueTimer = setTimeout(() => void this.continue().catch(() => {}), 30);
    }
    return update;
  }

  /** 停止主持（離開或關閉頁面）：取消排定的自動推進 */
  dispose() {
    if (this.continueTimer) clearTimeout(this.continueTimer);
    this.onRoom = this.onChange = () => {};
    this.onUpdate = () => {};
  }
}

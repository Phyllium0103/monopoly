import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { RoomError, codeOf } from '../roomTypes';

/** 配對訊息：玩家送出 offer、房主回 answer；SDP 內含雙方的 IP 與連接埠候選 */
export interface Signal {
  kind: 'offer' | 'answer';
  from: string;
  to: string;
  nonce: string;
  sdp: string;
}

/** 配對頻道：只在建立連線的那幾秒使用，之後遊戲資料走點對點 */
export interface SignalChannel {
  ready: Promise<void>;
  send(s: Signal): Promise<void>;
  onSignal(cb: (s: Signal) => void): () => void;
  close(): void;
}

/** 房號對應的房主 */
export interface HostInfo {
  host_id: string;
  host_peer: string;
  status: 'waiting' | 'playing' | 'closed';
  /** 房主最近 3 分鐘內有回報 */
  online: boolean;
}

/** 房號目錄：房號 → 開房玩家（房主）的連線識別 */
export interface Directory {
  /** 建立房間，回傳新的 5 位數房號 */
  create(peer: string, status: HostInfo['status']): Promise<string>;
  /** 房主重新整理後重新登記同一個房號 */
  claim(code: string, peer: string, status: HostInfo['status']): Promise<void>;
  lookup(code: string): Promise<HostInfo | null>;
  /** 房主定期回報仍在線上 */
  touch(code: string, peer: string, status: HostInfo['status']): Promise<void>;
  /** Any player still in the room, including one waiting for the host to reconnect. */
  present(code: string): Promise<void>;
  close(code: string): Promise<void>;
}

// ───────────────────────── Supabase ─────────────────────────

export class SupabaseSignal implements SignalChannel {
  private ch: RealtimeChannel;
  private cbs = new Set<(s: Signal) => void>();
  ready: Promise<void>;

  constructor(private sb: SupabaseClient, code: string) {
    // 私有頻道：資料庫政策只允許登入的玩家使用「仍開著的房間」的配對頻道
    this.ch = sb.channel(`p2p:${code}`, { config: { private: true, broadcast: { self: false } } });
    this.ch.on('broadcast', { event: 'signal' }, (m) => {
      for (const cb of this.cbs) cb(m.payload as Signal);
    });
    this.ready = new Promise<void>((resolve, reject) => {
      this.ch.subscribe((status) => {
        if (status === 'SUBSCRIBED') resolve();
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') reject(new RoomError('SIGNAL_FAILED'));
      });
    });
    this.ready.catch(() => {});
  }

  async send(s: Signal) {
    await this.ready;
    const r = await this.ch.send({ type: 'broadcast', event: 'signal', payload: s });
    if (r !== 'ok') throw new RoomError('SIGNAL_FAILED');
  }

  onSignal(cb: (s: Signal) => void) {
    this.cbs.add(cb);
    return () => void this.cbs.delete(cb);
  }

  close() {
    this.cbs.clear();
    void this.sb.removeChannel(this.ch);
  }
}

export class SupabaseDirectory implements Directory {
  constructor(private sb: SupabaseClient) {}

  private async rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.sb.rpc(fn, args);
    if (error) throw new RoomError(codeOf(error));
    return data as T;
  }

  create(peer: string, status: HostInfo['status']) {
    return this.rpc<string>('p2p_create_room', { p_peer: peer, p_status: status });
  }
  claim(code: string, peer: string, status: HostInfo['status']) {
    return this.rpc<void>('p2p_claim_room', { p_code: code, p_peer: peer, p_status: status });
  }
  lookup(code: string) {
    return this.rpc<HostInfo | null>('p2p_lookup', { p_code: code });
  }
  touch(code: string, peer: string, status: HostInfo['status']) {
    return this.rpc<void>('p2p_touch', { p_code: code, p_peer: peer, p_status: status });
  }
  close(code: string) {
    return this.rpc<void>('p2p_close', { p_code: code });
  }
  present(code: string) {
    return this.rpc<void>('p2p_present', { p_code: code });
  }
}

// ───────────────────────── 本機測試（同一個瀏覽器的不同分頁） ─────────────────────────

const DIR_KEY = 'xiantu-p2p-local-dir';
/** 與資料庫相同：房主超過 3 分鐘沒回報才視為不在線上（背景分頁的計時器會被瀏覽器放慢） */
const ONLINE_MS = 180_000;

/** 開發用：網址加上 ?p2p=local 時，以 BroadcastChannel 在同一瀏覽器的分頁間配對，不需要 Supabase */
export class LocalSignal implements SignalChannel {
  private bc: BroadcastChannel;
  private cbs = new Set<(s: Signal) => void>();
  ready = Promise.resolve();

  constructor(code: string) {
    this.bc = new BroadcastChannel(`xiantu-p2p-${code}`);
    this.bc.onmessage = (e) => {
      for (const cb of this.cbs) cb(e.data as Signal);
    };
  }
  async send(s: Signal) {
    this.bc.postMessage(s);
  }
  onSignal(cb: (s: Signal) => void) {
    this.cbs.add(cb);
    return () => void this.cbs.delete(cb);
  }
  close() {
    this.cbs.clear();
    this.bc.close();
  }
}

type LocalRow = { host_id: string; host_peer: string; status: HostInfo['status']; seen: number; occupied?: number };

export class LocalDirectory implements Directory {
  constructor(private userId: () => string) {}

  private read(): Record<string, LocalRow> {
    try {
      const rows = JSON.parse(localStorage.getItem(DIR_KEY) ?? '{}') as Record<string, LocalRow>;
      let changed = false;
      for (const [code, row] of Object.entries(rows)) {
        if (Date.now() - Math.max(row.seen, row.occupied ?? row.seen) > 300_000) {
          delete rows[code]; changed = true;
        }
      }
      if (changed) this.write(rows);
      return rows;
    } catch {
      return {};
    }
  }
  private write(rows: Record<string, LocalRow>) {
    localStorage.setItem(DIR_KEY, JSON.stringify(rows));
  }

  async create(peer: string, status: HostInfo['status']) {
    const rows = this.read();
    for (let i = 0; i < 40; i++) {
      const code = String(Math.floor(Math.random() * 100000)).padStart(5, '0');
      const r = rows[code];
      if (r && r.status !== 'closed' && Date.now() - r.seen < 24 * 3600_000) continue;
      rows[code] = { host_id: this.userId(), host_peer: peer, status, seen: Date.now(), occupied: Date.now() };
      this.write(rows);
      return code;
    }
    throw new RoomError('NO_FREE_CODE');
  }
  async claim(code: string, peer: string, status: HostInfo['status']) {
    const rows = this.read();
    const r = rows[code];
    if (r && r.host_id !== this.userId() && r.status !== 'closed') throw new RoomError('ROOM_NOT_FOUND');
    rows[code] = { host_id: this.userId(), host_peer: peer, status, seen: Date.now(), occupied: Date.now() };
    this.write(rows);
  }
  async lookup(code: string) {
    const r = this.read()[code];
    return r ? { host_id: r.host_id, host_peer: r.host_peer, status: r.status, online: Date.now() - r.seen < ONLINE_MS } : null;
  }
  async touch(code: string, peer: string, status: HostInfo['status']) {
    const rows = this.read();
    const r = rows[code];
    if (!r || r.host_id !== this.userId()) return;
    Object.assign(r, { host_peer: peer, status, seen: Date.now(), occupied: Date.now() });
    this.write(rows);
  }
  async close(code: string) {
    const rows = this.read();
    if (rows[code]?.host_id === this.userId()) Object.assign(rows[code], { status: 'closed', occupied: Date.now() });
    this.write(rows);
  }
  async present(code: string) {
    const rows = this.read();
    if (rows[code]) { rows[code].occupied = Date.now(); this.write(rows); }
  }
}

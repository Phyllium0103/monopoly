import { RoomError } from '../roomTypes';
import type { SignalChannel } from './signaling';

/**
 * 點對點連線（WebRTC DataChannel）。
 * 配對時雙方交換 SDP（含各自的 IP 與連接埠候選），交換完成後所有遊戲資料直接在玩家之間傳送，不經過伺服器。
 * 先用 STUN 取得自己的公開位址；有設定 TURN 時，直連失敗會改由 TURN 轉送。
 */

export function iceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }];
  const turn = import.meta.env.VITE_TURN_URL as string | undefined;
  if (turn) {
    servers.push({
      urls: turn.split(',').map((s) => s.trim()),
      username: import.meta.env.VITE_TURN_USERNAME as string | undefined,
      credential: import.meta.env.VITE_TURN_CREDENTIAL as string | undefined,
    });
  }
  return servers;
}

// ───────────────────────── 訊息分段 ─────────────────────────

/** DataChannel 單則訊息在各瀏覽器都安全的大小；超過就分段（完整遊戲狀態可能上百 KB） */
const CHUNK = 15_000;
let chunkSeq = 0;

export function encode(msg: unknown): string[] {
  const s = JSON.stringify(msg);
  if (s.length <= CHUNK) return ['1' + s];
  const id = `${Date.now().toString(36)}${(chunkSeq++).toString(36)}`;
  const n = Math.ceil(s.length / CHUNK);
  const parts: string[] = [];
  for (let i = 0; i < n; i++) parts.push(`C${id}|${i}|${n}|${s.slice(i * CHUNK, (i + 1) * CHUNK)}`);
  return parts;
}

/** 把分段的訊息組回來；完整時回傳物件，否則回傳 undefined */
export class Decoder {
  private parts = new Map<string, { n: number; got: number; data: string[] }>();

  push(raw: string): unknown {
    if (raw[0] === '1') return JSON.parse(raw.slice(1));
    if (raw[0] !== 'C') return undefined;
    const [id, i, n] = raw.slice(1).split('|', 3);
    const body = raw.slice(1 + id.length + i.length + n.length + 3);
    let p = this.parts.get(id);
    if (!p) this.parts.set(id, (p = { n: Number(n), got: 0, data: [] }));
    if (p.data[Number(i)] === undefined) p.got++;
    p.data[Number(i)] = body;
    if (p.got < p.n) return undefined;
    this.parts.delete(id);
    return JSON.parse(p.data.join(''));
  }
}

// ───────────────────────── 連線 ─────────────────────────

export class Link {
  private decoder = new Decoder();
  private handlers = new Set<(msg: unknown) => void>();
  private closeHandlers = new Set<() => void>();
  private closed = false;
  /** 房主端：這條連線已通過驗證的玩家 */
  userId: string | null = null;

  constructor(private pc: RTCPeerConnection, private dc: RTCDataChannel) {
    dc.onmessage = (e) => {
      const msg = this.decoder.push(String(e.data));
      if (msg !== undefined) for (const h of this.handlers) h(msg);
    };
    dc.onclose = () => this.close();
    let lost: ReturnType<typeof setTimeout> | null = null;
    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      if (s === 'failed' || s === 'closed') this.close();
      // 短暫斷線可能自己恢復；超過幾秒才視為中斷
      else if (s === 'disconnected') lost ??= setTimeout(() => pc.connectionState !== 'connected' && this.close(), 6000);
      else if (s === 'connected' && lost) {
        clearTimeout(lost);
        lost = null;
      }
    };
  }

  get open() {
    return !this.closed && this.dc.readyState === 'open';
  }

  send(msg: unknown) {
    if (!this.open) return false;
    try {
      for (const part of encode(msg)) this.dc.send(part);
      return true;
    } catch {
      this.close();
      return false;
    }
  }

  onMessage(h: (msg: unknown) => void) {
    this.handlers.add(h);
  }

  onClose(h: () => void) {
    if (this.closed) h();
    else this.closeHandlers.add(h);
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    try { this.dc.close(); } catch { /* 已關閉 */ }
    try { this.pc.close(); } catch { /* 已關閉 */ }
    for (const h of this.closeHandlers) h();
    this.closeHandlers.clear();
    this.handlers.clear();
  }
}

/** 等候 ICE 候選收集完成（或逾時），回傳含所有候選位址的 SDP，免去逐筆交換候選 */
async function gathered(pc: RTCPeerConnection, ms = 4000): Promise<string> {
  if (pc.iceGatheringState !== 'complete') {
    await new Promise<void>((resolve) => {
      const t = setTimeout(resolve, ms);
      pc.addEventListener('icegatheringstatechange', () => {
        if (pc.iceGatheringState === 'complete') {
          clearTimeout(t);
          resolve();
        }
      });
    });
  }
  return pc.localDescription!.sdp;
}

const nonce = () => Math.random().toString(36).slice(2, 10);

/** 玩家端：向房主發出連線請求 */
export async function dial(signal: SignalChannel, me: string, host: string, timeoutMs = 20_000): Promise<Link> {
  const pc = new RTCPeerConnection({ iceServers: iceServers() });
  const dc = pc.createDataChannel('game', { ordered: true });
  const id = nonce();
  try {
    await signal.ready;
    const answered = new Promise<string>((resolve, reject) => {
      const t = setTimeout(() => reject(new RoomError('HOST_OFFLINE')), timeoutMs);
      const off = signal.onSignal((s) => {
        if (s.kind === 'answer' && s.to === me && s.nonce === id) {
          clearTimeout(t);
          off();
          resolve(s.sdp);
        }
      });
    });
    await pc.setLocalDescription(await pc.createOffer());
    await signal.send({ kind: 'offer', from: me, to: host, nonce: id, sdp: await gathered(pc) });
    await pc.setRemoteDescription({ type: 'answer', sdp: await answered });
    await new Promise<void>((resolve, reject) => {
      if (dc.readyState === 'open') return resolve();
      const t = setTimeout(() => reject(new RoomError('P2P_FAILED')), timeoutMs);
      dc.onopen = () => {
        clearTimeout(t);
        resolve();
      };
      pc.addEventListener('connectionstatechange', () => {
        if (pc.connectionState === 'failed') {
          clearTimeout(t);
          reject(new RoomError('P2P_FAILED'));
        }
      });
    });
    return new Link(pc, dc);
  } catch (e) {
    pc.close();
    throw e;
  }
}

/** 房主端：接受玩家的連線請求；每條連線開通後呼叫 onLink。回傳停止接受的函式 */
export function listen(signal: SignalChannel, me: string, onLink: (link: Link) => void): () => void {
  const seen = new Set<string>();
  return signal.onSignal(async (s) => {
    if (s.kind !== 'offer' || s.to !== me || seen.has(s.nonce)) return;
    seen.add(s.nonce);
    const pc = new RTCPeerConnection({ iceServers: iceServers() });
    pc.ondatachannel = (e) => {
      const dc = e.channel;
      const ready = () => onLink(new Link(pc, dc));
      if (dc.readyState === 'open') ready();
      else dc.onopen = ready;
    };
    // 配對沒完成就放棄的連線，過一陣子自動清掉
    const giveUp = setTimeout(() => pc.connectionState !== 'connected' && pc.close(), 30_000);
    pc.addEventListener('connectionstatechange', () => pc.connectionState === 'connected' && clearTimeout(giveUp));
    try {
      await pc.setRemoteDescription({ type: 'offer', sdp: s.sdp });
      await pc.setLocalDescription(await pc.createAnswer());
      await signal.send({ kind: 'answer', from: me, to: s.from, nonce: s.nonce, sdp: await gathered(pc) });
    } catch (e) {
      console.warn('p2p answer failed', e);
      pc.close();
    }
  });
}

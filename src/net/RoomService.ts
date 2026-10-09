import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import type { GameState, LordId } from '../game/types';
import type { Prompt } from '../engine/prompts';
import type { ViewEvent } from '../engine/view';
import { supabase } from './supabase';

export interface Room {
  id: string;
  code: string;
  host_id: string;
  status: 'waiting' | 'playing' | 'closed';
  max_players: number;
  max_rounds: number | null;
}

export interface Member {
  id: string;
  room_id: string;
  user_id: string | null;
  nickname: string;
  kind: 'human' | 'ai';
  lord_id: LordId;
  is_host: boolean;
  ready: boolean;
  ai_control: boolean;
  joined_at: string;
  last_seen_at: string;
}

export interface GamePublic {
  version: number;
  state: GameState;
  pending: { lord: LordId; seq: string; prompt: Prompt } | null;
  over: boolean;
  paused: boolean;
}

export interface EventRow {
  version: number;
  events: ViewEvent[];
}

/** 超過這段時間沒有心跳就視為離線 */
export const OFFLINE_MS = 45_000;
export const isOnline = (m: Member) => m.kind === 'ai' || Date.now() - new Date(m.last_seen_at).getTime() < OFFLINE_MS;

/** 錯誤代碼轉成玩家看得懂的訊息 */
const MESSAGES: Record<string, string> = {
  ROOM_NOT_FOUND: '找不到房間，請確認房號',
  ROOM_STARTED: '這個房間已經開始遊戲，無法加入',
  ROOM_FULL: '房間已滿',
  ROOM_CLOSED: '房間已關閉',
  NOT_HOST: '只有房主可以這麼做',
  NOT_ALL_READY: '還有玩家尚未準備',
  NEED_TWO_SEATS: '至少需要兩位玩家（可加入電腦）',
  ALREADY_STARTED: '遊戲已經開始',
  LORD_TAKEN: '這個陣營已被選走',
  NOT_IN_WAITING_ROOM: '房間不在等待狀態',
  NO_FREE_CODE: '暫時無法產生房號，請再試一次',
  NOT_SIGNED_IN: '尚未登入，請重新整理頁面',
  STALE_ANSWER: '這個抉擇已經過時',
  VERSION_CONFLICT: '其他玩家剛好也在操作，已重新同步',
  AI_CONTROLLED: '目前由電腦代打中',
  PLAYER_ONLINE: '該玩家仍在線上',
  UNAUTHORIZED: '登入已失效，請重新整理頁面',
  NOT_MEMBER: '你不在這個房間裡',
};

export class RoomError extends Error {
  constructor(public code: string) {
    super(MESSAGES[code] ?? code);
  }
}

const codeOf = (e: unknown): string => {
  const msg = (e as { message?: string })?.message ?? String(e);
  const known = Object.keys(MESSAGES).find((k) => msg.includes(k));
  if (known) return known;
  if (/fetch|network|Failed to fetch|NetworkError/i.test(msg)) return '網路連線失敗，請稍後再試';
  return msg;
};

/** 房間與對局的所有雲端操作 */
export class RoomService {
  private sb: SupabaseClient;
  userId = '';

  constructor() {
    const sb = supabase();
    if (!sb) throw new RoomError('尚未設定 Supabase（VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY）');
    this.sb = sb;
  }

  /** 匿名登入：同一個瀏覽器會沿用同一個身分，重新整理後仍能回到原本的房間 */
  async signIn(): Promise<string> {
    const { data } = await this.sb.auth.getSession();
    if (data.session?.user) return (this.userId = data.session.user.id);
    const { data: signed, error } = await this.sb.auth.signInAnonymously();
    if (error || !signed.user) throw new RoomError(error?.message.includes('Anonymous') ? '伺服器尚未開啟匿名登入（Authentication → Anonymous sign-ins）' : codeOf(error));
    return (this.userId = signed.user.id);
  }

  private async rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.sb.rpc(fn, args);
    if (error) throw new RoomError(codeOf(error));
    return data as T;
  }

  createRoom(nickname: string, maxRounds: number | null) {
    return this.rpc<{ room_id: string; code: string }>('create_room', { p_nickname: nickname, p_max_rounds: maxRounds });
  }
  joinRoom(code: string, nickname: string) {
    return this.rpc<{ room_id: string; code: string; rejoined: boolean }>('join_room', { p_code: code, p_nickname: nickname });
  }
  leaveRoom(roomId: string) { return this.rpc<void>('leave_room', { p_room: roomId }); }
  setReady(roomId: string, ready: boolean) { return this.rpc<void>('set_ready', { p_room: roomId, p_ready: ready }); }
  setLord(roomId: string, lord: LordId) { return this.rpc<void>('set_lord', { p_room: roomId, p_lord: lord }); }
  setRounds(roomId: string, rounds: number | null) { return this.rpc<void>('set_room_rounds', { p_room: roomId, p_max_rounds: rounds }); }
  addAi(roomId: string) { return this.rpc<void>('add_ai', { p_room: roomId }); }
  removeAi(roomId: string, memberId: string) { return this.rpc<void>('remove_ai', { p_room: roomId, p_member: memberId }); }
  heartbeat(roomId: string) { return this.rpc<void>('heartbeat', { p_room: roomId }); }

  async fetchRoom(roomId: string): Promise<{ room: Room; members: Member[] }> {
    const [r, m] = await Promise.all([
      this.sb.from('rooms').select('*').eq('id', roomId).maybeSingle<Room>(),
      this.sb.from('room_members').select('*').eq('room_id', roomId).order('joined_at'),
    ]);
    if (r.error || m.error) throw new RoomError(codeOf(r.error ?? m.error));
    if (!r.data) throw new RoomError('ROOM_NOT_FOUND');
    return { room: r.data, members: (m.data ?? []) as Member[] };
  }

  async fetchGame(roomId: string): Promise<GamePublic | null> {
    const { data, error } = await this.sb.from('game_public').select('version, state, pending, over, paused').eq('room_id', roomId).maybeSingle<GamePublic>();
    if (error) throw new RoomError(codeOf(error));
    return data;
  }

  async fetchEvents(roomId: string, after: number): Promise<EventRow[]> {
    const { data, error } = await this.sb.from('game_events').select('version, events').eq('room_id', roomId).gt('version', after).order('version');
    if (error) throw new RoomError(codeOf(error));
    return (data ?? []) as EventRow[];
  }

  /** 呼叫權威端（Edge Function） */
  async game(action: 'start' | 'answer' | 'continue' | 'takeover' | 'reclaim', roomId: string, extra: Record<string, unknown> = {}) {
    const { data, error } = await this.sb.functions.invoke('game', { body: { action, roomId, ...extra } });
    if (error) {
      // 從錯誤回應中取出代碼
      let code = codeOf(error);
      try {
        const body = await (error as { context?: Response }).context?.json();
        if (body?.error) code = body.error;
      } catch { /* 沒有回應內容 */ }
      throw new RoomError(code);
    }
    return data as { ok: boolean; version?: number; duplicate?: boolean };
  }

  /** 訂閱房間與成員變化 */
  watchRoom(roomId: string, onChange: () => void, onStatus: (online: boolean) => void): RealtimeChannel {
    return this.sb
      .channel(`room:${roomId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_members', filter: `room_id=eq.${roomId}` }, onChange)
      // 刪除事件無法依欄位過濾，收到就重新讀取
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'room_members' }, onChange)
      .subscribe((status) => onStatus(status === 'SUBSCRIBED'));
  }

  /** 訂閱對局事件（每次權威端寫入新版本都會插入一列） */
  watchGame(roomId: string, onEvent: (row: EventRow) => void, onStatus: (online: boolean) => void): RealtimeChannel {
    return this.sb
      .channel(`game:${roomId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'game_events', filter: `room_id=eq.${roomId}` }, (p) => onEvent(p.new as EventRow))
      .subscribe((status) => onStatus(status === 'SUBSCRIBED'));
  }

  unwatch(channel: RealtimeChannel | null) {
    if (channel) void this.sb.removeChannel(channel);
  }
}

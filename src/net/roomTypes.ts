import type { GameState, LordId } from '../game/types';
import type { Prompt } from '../engine/prompts';
import type { ViewEvent } from '../engine/view';

/** 房間（房號即房間 id） */
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

/** 房主（權威端）回傳：新的版本、完整狀態與這次產生的畫面事件 */
export interface GameResponse {
  ok: boolean;
  version?: number;
  duplicate?: boolean;
  state?: GameState;
  pending?: GamePublic['pending'];
  over?: boolean;
  paused?: boolean;
  events?: ViewEvent[];
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
  HOST_OFFLINE: '房主目前不在線上，請等房主回來再加入',
  P2P_FAILED: '無法與房主建立直接連線（可能是公司、學校或電信業者的網路阻擋了點對點連線）',
  SIGNAL_FAILED: '無法連上配對伺服器，請稍後再試',
  SEAT_TAKEN: '這個座位屬於另一個瀏覽器，請用原本的瀏覽器回來',
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
  NO_GAME: '對局尚未開始',
  BAD_TARGET: '無法對這位玩家這麼做',
  DISCONNECTED: '與房主的連線中斷，重新連線中……',
  TIMEOUT: '房主沒有回應，請稍後再試',
};

export class RoomError extends Error {
  constructor(public code: string) {
    super(MESSAGES[code] ?? code);
  }
}

/** 從錯誤取出已知代碼 */
export const codeOf = (e: unknown): string => {
  if (e instanceof RoomError) return e.code;
  const msg = (e as { message?: string })?.message ?? String(e);
  const known = Object.keys(MESSAGES).find((k) => msg.includes(k));
  if (known) return known;
  if (/fetch|network|Failed to fetch|NetworkError/i.test(msg)) return '網路連線失敗，請稍後再試';
  return msg;
};

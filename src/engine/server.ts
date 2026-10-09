import type { GameState, LordId } from '../game/types';
import { createGameState } from '../game/GameState';
import { eliminate } from '../systems/CitySystem';
import { LORD_IDS } from '../faction/Faction';
import { Engine } from './Engine';
import { defaultAnswer, type Prompt } from './prompts';
import { RecordingView, type ViewEvent } from './view';

/**
 * 多人模式的權威端（在 Supabase Edge Function 上執行）。
 *
 * 遊戲流程是「一連串 await 玩家抉擇」的程式，沒辦法在兩次 HTTP 請求之間暫停保存，
 * 所以採用「快照 + 重播」：每位主公回合開始時存一份完整快照；之後玩家每回答一次，
 * 就從快照用同一組亂數種子把本回合重跑一遍，依序餵入已記錄的回答，直到遇到新的抉擇為止。
 * 亂數由伺服器產生且固定，重播的結果與上一次完全相同，玩家無法偽造骰子或結果。
 */

export interface Seat {
  lord: LordId;
  human: boolean;
  name: string;
}

/** 只存在伺服器的資料（含密封出價等尚未公開的回答） */
export interface GameRecord {
  seed: number;
  /** 第幾次迴圈（每位主公一回合為一次） */
  iteration: number;
  /** 本次迴圈開始時的完整狀態 */
  snapshot: GameState;
  /** 本次迴圈已收到的回答 */
  answers: unknown[];
  /** 本次迴圈中途改由電腦代打：主公 → 從第幾個回答開始 */
  autoFrom: Partial<Record<LordId, number>>;
  /** 下次迴圈開始時交還玩家操作的主公 */
  reclaim: LordId[];
}

/** 等待某位玩家回答的抉擇；seq 用來拒絕過時或重複的回答 */
export interface Pending {
  lord: LordId;
  seq: string;
  prompt: Prompt;
}

export interface StepResult {
  record: GameRecord;
  /** 給玩家看的最新狀態 */
  state: GameState;
  pending: Pending | null;
  events: ViewEvent[];
  over: boolean;
  /** 為了控制單次運算量而暫停（全是電腦在行動），之後再呼叫 advance 繼續 */
  paused: boolean;
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** 由座位建立多人對局：沒有人入座的主公不參與本局 */
export function createMultiplayerState(seats: Seat[], maxRounds: number | null, seed: number): GameState {
  return withSeed(seed, () => {
    const first = seats[0]?.lord ?? 'cao';
    const state = createGameState(first, maxRounds);
    for (const id of LORD_IDS) {
      const seat = seats.find((s) => s.lord === id);
      const lord = state.lords[id];
      lord.isPlayer = !!seat?.human;
      lord.seatName = seat?.name;
      if (!seat) {
        eliminate(state, lord);
        lord.absent = true;
        lord.rank = 99;
      }
    }
    // 回合從第一位入座者開始
    while (!state.lords[state.order[state.turn]].alive) state.turn = (state.turn + 1) % state.order.length;
    return state;
  });
}

export function newRecord(state: GameState, seed: number): GameRecord {
  return { seed, iteration: 0, snapshot: clone(state), answers: [], autoFrom: {}, reclaim: [] };
}

/** mulberry32：小而穩定的種子亂數 */
function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const iterationSeed = (seed: number, iteration: number) => (Math.imul(seed ^ 0x9e3779b9, 31) + Math.imul(iteration + 1, 0x85ebca6b)) | 0;

function withSeed<T>(seed: number, fn: () => T): T {
  const original = Math.random;
  Math.random = mulberry32(seed);
  try {
    return fn();
  } finally {
    Math.random = original;
  }
}

/** 單次請求最多跑幾次迴圈，避免全是電腦時超過 Edge Function 的運算時間 */
const MAX_ITERATIONS_PER_CALL = 12;

/**
 * 從目前的記錄繼續推進，直到需要玩家回答、遊戲結束，或達到單次運算上限。
 * 不會修改傳入的 record。
 */
export async function advance(input: GameRecord): Promise<StepResult> {
  const record = clone(input);
  const events: ViewEvent[] = [];
  for (let n = 0; n < MAX_ITERATIONS_PER_CALL; n++) {
    const r = await runIteration(record);
    events.push(...r.events);
    if (r.pending) return { record, state: r.state, pending: r.pending, events, over: false, paused: false };
    if (r.over) return { record, state: r.state, pending: null, events, over: true, paused: false };
    // 本次迴圈結束：新的快照，清空回答
    for (const id of record.reclaim) r.state.lords[id].isPlayer = true;
    for (const id of Object.keys(record.autoFrom) as LordId[]) {
      if (!record.reclaim.includes(id)) r.state.lords[id].isPlayer = false;
    }
    record.snapshot = clone(r.state);
    record.answers = [];
    record.autoFrom = {};
    record.reclaim = [];
    record.iteration++;
  }
  return { record, state: clone(record.snapshot), pending: null, events, over: false, paused: true };
}

interface IterationResult {
  state: GameState;
  pending: Pending | null;
  over: boolean;
  events: ViewEvent[];
}

async function runIteration(record: GameRecord): Promise<IterationResult> {
  const state = clone(record.snapshot);
  const view = new RecordingView();
  const answers = record.answers;
  let consumed = 0;
  view.live = answers.length === 0;
  let pending: Pending | null = null;
  let signal!: () => void;
  const blocked = new Promise<void>((r) => (signal = r));
  const isAuto = (id: LordId) => record.autoFrom[id] !== undefined && consumed >= record.autoFrom[id]!;

  const engine = new Engine(state, {
    view,
    multiplayer: true,
    isAuto,
    send: (lord, prompt) => {
      // 通知視窗不需要等待回答：記錄成事件給該玩家看
      if (prompt.kind === 'message') {
        void view.notice(lord, prompt.title, prompt.text, prompt.icon, prompt.button);
        return Promise.resolve(null);
      }
      if (isAuto(lord)) return Promise.resolve(defaultAnswer(prompt));
      if (consumed < answers.length) {
        const a = answers[consumed++];
        if (consumed === answers.length) view.live = true;
        return Promise.resolve(a);
      }
      pending = { lord, seq: `${record.iteration}:${consumed}`, prompt: clone(prompt) };
      signal();
      // 停在這裡：本次請求到此為止，引擎不會再往下執行
      return new Promise(() => {});
    },
  });

  const original = Math.random;
  Math.random = mulberry32(iterationSeed(record.seed, record.iteration));
  try {
    const outcome = await Promise.race([
      engine.step().then((cont) => ({ done: true as const, cont })),
      blocked.then(() => ({ done: false as const, cont: true })),
    ]);
    if (!outcome.done) return { state, pending, over: false, events: view.events };
    return { state, pending: null, over: !outcome.cont || state.over, events: view.events };
  } finally {
    Math.random = original;
  }
}

/** 玩家回答目前的抉擇；seq 不符代表回答已過時 */
export function answer(record: GameRecord, pending: Pending | null, lord: LordId, seq: string, value: unknown): GameRecord {
  if (!pending || pending.lord !== lord || pending.seq !== seq) throw new Error('STALE_ANSWER');
  const next = clone(record);
  next.answers.push(value === undefined ? null : value);
  return next;
}

/** 斷線玩家交由電腦代打：目前的抉擇與之後的抉擇都由電腦決定 */
export function takeover(record: GameRecord, lord: LordId): GameRecord {
  const next = clone(record);
  if (next.autoFrom[lord] === undefined && next.snapshot.lords[lord].isPlayer) next.autoFrom[lord] = next.answers.length;
  next.reclaim = next.reclaim.filter((id) => id !== lord);
  return next;
}

/** 玩家回來接手：下一位主公的回合開始時生效 */
export function reclaim(record: GameRecord, lord: LordId): GameRecord {
  const next = clone(record);
  const controlledByAi = next.autoFrom[lord] !== undefined || !next.snapshot.lords[lord].isPlayer;
  if (controlledByAi && !next.reclaim.includes(lord)) next.reclaim.push(lord);
  return next;
}

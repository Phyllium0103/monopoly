import type { GameState } from './types';
import { BOARD, hasCurrentBoard } from '../data/board';

/** 單機存檔：只有一格，每位主公回合開始時覆寫 */
const KEY = 'solo-save';

export interface SoloSave {
  state: GameState;
  /** 存檔時間（毫秒） */
  savedAt: number;
}

/** 地圖格子固定不變，存檔時省略 */
export function encodeSoloSave(state: GameState, savedAt = Date.now()): string {
  return JSON.stringify({ savedAt, state }, (key, value) => (key === 'tiles' ? undefined : value));
}

/** 還原存檔；格式損壞、已結束或地圖版本不同的存檔一律視為沒有存檔 */
export function decodeSoloSave(raw: string | null): SoloSave | null {
  if (!raw) return null;
  try {
    const save = JSON.parse(raw) as SoloSave;
    const state = save?.state;
    if (!state?.lords || !state.generals || !state.cities || !state.order?.length || state.over) return null;
    state.tiles = BOARD.tiles;
    if (!hasCurrentBoard(state) || !state.lords[state.player]) return null;
    return { state, savedAt: Number(save.savedAt) || 0 };
  } catch {
    return null;
  }
}

/** 寫入存檔；瀏覽器不允許或空間不足時回傳 false，遊戲照常進行 */
export function writeSoloSave(state: GameState): boolean {
  try {
    localStorage.setItem(KEY, encodeSoloSave(state));
    return true;
  } catch (error) {
    console.warn('無法儲存單機存檔', error);
    return false;
  }
}

export function loadSoloSave(): SoloSave | null {
  try {
    return decodeSoloSave(localStorage.getItem(KEY));
  } catch {
    return null;
  }
}

export function clearSoloSave() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* 忽略 */
  }
}

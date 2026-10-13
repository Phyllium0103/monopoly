import { REALMS } from './generals';

/** 使用者已選定的 02 白玉極簡・境界圖示遞進版。 */
export const REALM_FRAME_STYLE = 'white-jade-icon-progression-v1';
export const REALM_FRAME_ATLAS = 'art/realm-frames/white-jade-icon-progression.png';
export const REALM_FRAME_ATLAS_SIZE = [1536, 1024] as const;

/** 圖集中的 11 個透明視窗，與遊戲境界 0～10 一一對應。 */
export const REALM_FRAME_WINDOWS = [
  [9, 84, 255, 380], [256, 74, 265, 385], [523, 70, 249, 390],
  [780, 70, 258, 394], [1030, 69, 262, 393], [1284, 48, 249, 416],
  [21, 511, 288, 400], [320, 518, 288, 397], [630, 500, 276, 421],
  [924, 492, 305, 424], [1221, 504, 303, 417],
] as const;

export function realmFrameFor(realm: number) {
  const index = Number.isFinite(realm)
    ? Math.max(0, Math.min(REALMS.length - 1, Math.trunc(realm)))
    : 0;
  return { index, name: REALMS[index], window: REALM_FRAME_WINDOWS[index] };
}


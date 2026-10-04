import type { Element } from '../game/types';

/** 天下大事帶來的全域修正值，由 EventSystem 每輪重新計算 */
export const WORLD = {
  /** 修為獲得倍率（靈力爆發） */
  expMult: 1,
  /** 渡劫天雷傷害倍率（天道垂青） */
  boltMult: 1,
  /** 低階突破成功率加成（天道垂青） */
  breakBonus: 0,
  /** 當令五行（五行輪轉） */
  element: null as Element | null,
  /** 過路費倍率（群雄會盟） */
  tollMult: 1,
  /** 禁止開戰（群雄會盟） */
  noBattle: false,
  /** 上古秘境現世 */
  realmBlessed: false,
};

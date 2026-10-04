import type { Element } from '../game/types';

/** 九州風雲帶來的全域修正值，由 EventSystem 每輪重新計算 */
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
  /** 城池靈石收入倍率（商路暢通、蝗災） */
  incomeMult: 1,
  /** 閉關修為倍率（靈潮湧動） */
  seclusionMult: 1,
  /** 聽風樓招募價倍率（招賢令） */
  recruitMult: 1,
};

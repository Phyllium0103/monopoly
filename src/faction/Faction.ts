import type { FactionId, Owner } from '../game/types';

export interface FactionDef {
  id: FactionId;
  name: string;
  sect: string;
  color: number;
  css: string;
  motto: string;
  traits: string[];
  bonusText: string;
  /** 英雄戰力倍率 */
  heroPower: number;
  /** 修煉速度倍率 */
  cultivation: number;
  /** 每名角色可帶兵量倍率 */
  troopCapacity: number;
  /** 己方城池防禦倍率 */
  cityDefense: number;
  /** 建設成本倍率 */
  buildCost: number;
  /** 城池收入倍率 */
  income: number;
  /** 糧草消耗倍率 */
  foodCost: number;
  /** 水路移動步數成本 */
  waterCost: number;
  /** 移動後觸發隨機事件機率 */
  eventChance: number;
  /** 事件效果倍率 */
  eventPower: number;
  /** 丹藥成本倍率 */
  pillCost: number;
  /** 是否能看見敵方守軍（情報） */
  intel: boolean;
}

export const FACTIONS: Record<FactionId, FactionDef> = {
  wei: {
    id: 'wei',
    name: '魏',
    sect: '玄甲宗',
    color: 0x3d6fd6,
    css: '#4f80e8',
    motto: '以制度與大軍建立穩固的勢力。',
    traits: ['軍陣', '煉器', '制度'],
    bonusText: '軍隊容量 +30%｜城防 +20%｜建設成本 -25%',
    heroPower: 1,
    cultivation: 1,
    troopCapacity: 1.3,
    cityDefense: 1.2,
    buildCost: 0.75,
    income: 1,
    foodCost: 1,
    waterCost: 2,
    eventChance: 0.3,
    eventPower: 1,
    pillCost: 1,
    intel: false,
  },
  shu: {
    id: 'shu',
    name: '蜀',
    sect: '劍閣天宗',
    color: 0x2fa35a,
    css: '#3cc06c',
    motto: '依靠少數強大的英雄改變戰局。',
    traits: ['劍修', '天命', '英雄'],
    bonusText: '英雄戰力 +30%｜修煉速度 +30%｜軍隊容量 -20%',
    heroPower: 1.3,
    cultivation: 1.3,
    troopCapacity: 0.8,
    cityDefense: 1,
    buildCost: 1,
    income: 1,
    foodCost: 1,
    waterCost: 2,
    eventChance: 0.3,
    eventPower: 1,
    pillCost: 1,
    intel: false,
  },
  wu: {
    id: 'wu',
    name: '吳',
    sect: '滄瀾丹府',
    color: 0xd64535,
    css: '#ec5a48',
    motto: '利用經濟與水運累積資源。',
    traits: ['水運', '丹道', '商業'],
    bonusText: '城池收入 +25%｜糧草消耗 -20%｜水路移動 1 步｜丹藥 -30%',
    heroPower: 1,
    cultivation: 1,
    troopCapacity: 1,
    cityDefense: 1,
    buildCost: 1,
    income: 1.25,
    foodCost: 0.8,
    waterCost: 1,
    eventChance: 0.3,
    eventPower: 1,
    pillCost: 0.7,
    intel: false,
  },
  jin: {
    id: 'jin',
    name: '晉',
    sect: '天機陰陽門',
    color: 0x8a4fd0,
    css: '#a46ae8',
    motto: '利用情報與天機掌控戰場。',
    traits: ['陣法', '天機', '陰陽'],
    bonusText: '事件效果 +20%｜事件機率提高｜洞悉敵軍｜天機陣削弱敵城',
    heroPower: 1,
    cultivation: 1,
    troopCapacity: 1,
    cityDefense: 1,
    buildCost: 1,
    income: 1,
    foodCost: 1,
    waterCost: 2,
    eventChance: 0.45,
    eventPower: 1.2,
    pillCost: 1,
    intel: true,
  },
};

export const FACTION_IDS: FactionId[] = ['wei', 'shu', 'wu', 'jin'];

export const NEUTRAL_COLOR = 0x9a9486;

export function ownerColor(owner: Owner): number {
  return owner === 'neutral' ? NEUTRAL_COLOR : FACTIONS[owner].color;
}

export function ownerName(owner: Owner): string {
  return owner === 'neutral' ? '無主' : FACTIONS[owner].name;
}

export function ownerCss(owner: Owner): string {
  return owner === 'neutral' ? '#b0aa9c' : FACTIONS[owner].css;
}

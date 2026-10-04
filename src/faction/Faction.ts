import type { LordId, Owner } from '../game/types';

export interface LordDef {
  id: LordId;
  name: string;
  kingdom: string;
  title: string;
  color: number;
  css: string;
  capital: string;
  desc: string;
}

export const LORDS: Record<LordId, LordDef> = {
  cao: { id: 'cao', name: '曹操', kingdom: '魏', title: '魏武', color: 0x3d6fd6, css: '#4f80e8', capital: 'xuchang', desc: '挾天子以令諸侯，猛將謀臣如雲。' },
  sun: { id: 'sun', name: '孫權', kingdom: '吳', title: '吳侯', color: 0xd64535, css: '#ec5a48', capital: 'jianye', desc: '坐擁江東，水軍與謀士冠絕天下。' },
  liu: { id: 'liu', name: '劉備', kingdom: '蜀', title: '昭烈', color: 0x2fa35a, css: '#3cc06c', capital: 'chengdu', desc: '仁德服眾，五虎上將所向披靡。' },
  dong: { id: 'dong', name: '董卓', kingdom: '群雄', title: '太師', color: 0x7a3fb0, css: '#a46ae8', capital: 'changan', desc: '群雄割據，西涼鐵騎與河北豪傑並起，坐擁天下第一猛將。' },
};

export const LORD_IDS: LordId[] = ['cao', 'sun', 'liu', 'dong'];

export const NEUTRAL_COLOR = 0x9a9486;

export function ownerColor(owner: Owner): number {
  return owner === 'neutral' ? NEUTRAL_COLOR : LORDS[owner].color;
}

export function ownerName(owner: Owner): string {
  return owner === 'neutral' ? '無主' : LORDS[owner].name;
}

/** 將領所屬國名（仙人為方外） */
export function originKingdom(origin: LordId | 'immortal'): string {
  return origin === 'immortal' ? '方外' : LORDS[origin].kingdom;
}

export function originCss(origin: LordId | 'immortal'): string {
  return origin === 'immortal' ? '#c9a0ff' : LORDS[origin].css;
}

export function ownerCss(owner: Owner): string {
  return owner === 'neutral' ? '#b0aa9c' : LORDS[owner].css;
}

/** 陣營特色：數值皆為加減比例（0.15 = +15%），growth 為每回合額外繁榮度 */
export interface LordTrait {
  title: string;
  /** 城池靈石收入 */
  stonesMult?: number;
  /** 城池士兵收入 */
  soldiersMult?: number;
  /** 每回合額外繁榮度成長 */
  growth?: number;
  /** 收取的過路費 */
  tollMult?: number;
  /** 徵兵價格（負數為折扣） */
  soldierPrice?: number;
  /** 守城戰力 */
  garrisonDef?: number;
  /** 攻城戰力 */
  siege?: number;
  /** 擂台傷害 */
  duelDmg?: number;
  /** 武將修為獲得 */
  expMult?: number;
  /** 低階突破成功率 */
  breakBonus?: number;
  /** 使用物品的體力消耗減免 */
  itemStamina?: number;
  /** 聽風樓招募價（負數為折扣） */
  recruit?: number;
  /** 秘境隕落率減免 */
  realmSafety?: number;
  /** 戰鬥勝利獲得的修為加成 */
  battleExp?: number;
  /** 開局靈石、士兵加成 */
  startStones?: number;
  startSoldiers?: number;
  /** 文字說明：長處與短處 */
  pros: string[];
  cons: string[];
}

/** 四個陣營各有擅長的玩法：魏重修煉與謀略、蜀重經營、吳重守成與過路費、群雄重戰鬥與擴張 */
export const TRAITS: Record<LordId, LordTrait> = {
  cao: {
    title: '制度謀略',
    expMult: 0.15,
    breakBonus: 0.05,
    itemStamina: 0.2,
    recruit: -0.2,
    stonesMult: 0.05,
    soldiersMult: -0.05,
    pros: ['武將修為獲得 +15%', '低階突破成功率 +5%', '使用物品體力消耗 −20%', '聽風樓招募價 8 折', '城池靈石收入 +5%'],
    cons: ['城池士兵收入 −5%'],
  },
  liu: {
    title: '仁政經營',
    stonesMult: 0.15,
    soldiersMult: 0.1,
    growth: 0.1,
    soldierPrice: -0.25,
    startStones: 0.15,
    duelDmg: -0.05,
    siege: -0.1,
    pros: ['城池靈石收入 +15%、士兵收入 +10%', '城池繁榮度每回合多成長 0.1', '徵兵價格 −25%', '開局靈石 +15%'],
    cons: ['擂台傷害 −5%', '攻城戰力 −10%'],
  },
  sun: {
    title: '江東守成',
    garrisonDef: 0.15,
    tollMult: 0.1,
    realmSafety: 0.15,
    siege: -0.1,
    expMult: -0.05,
    pros: ['守城戰力 +15%', '收取的過路費 +10%', '秘境隕落率 −15%'],
    cons: ['攻城戰力 −10%', '武將修為獲得 −5%'],
  },
  dong: {
    title: '武力至上',
    duelDmg: 0.12,
    siege: 0.2,
    battleExp: 0.5,
    startSoldiers: 0.25,
    stonesMult: -0.15,
    tollMult: -0.1,
    growth: -0.05,
    pros: ['擂台傷害 +12%', '攻城戰力 +20%', '戰鬥勝利獲得的修為 +50%', '開局士兵 +25%'],
    cons: ['城池靈石收入 −15%', '收取的過路費 −10%', '繁榮度每回合少成長 0.05'],
  },
};

const NO_TRAIT: LordTrait = { title: '', pros: [], cons: [] };

/** 某位主公的陣營特色（無主或不存在時沒有加成） */
export function traitOf(id: LordId | 'neutral' | null | undefined): LordTrait {
  return id && id !== 'neutral' ? TRAITS[id] : NO_TRAIT;
}

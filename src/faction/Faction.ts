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
  dong: { id: 'dong', name: '董卓', kingdom: '西涼', title: '太師', color: 0x7a3fb0, css: '#a46ae8', capital: 'changan', desc: '西涼鐵騎橫行，坐擁天下第一猛將。' },
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

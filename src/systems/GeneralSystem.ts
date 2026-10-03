import type { CraftStat, Equipment, General, Lord, Technique } from '../game/types';
import { REALMS, REALM_EXP, REALM_MULT } from '../data/generals';
import { techniqueSpeed } from '../data/items';

export function realmName(g: General): string {
  return REALMS[g.realm];
}

export function attack(g: General): number {
  const t = g.technique?.power ?? 0;
  return Math.round((g.base.force + g.bonusForce + (g.weapon?.value ?? 0)) * REALM_MULT[g.realm] * (1 + t));
}

export function defense(g: General): number {
  const t = g.technique?.power ?? 0;
  return Math.round((g.base.defense + g.bonusDefense + (g.armor?.value ?? 0)) * REALM_MULT[g.realm] * (1 + t * 0.5));
}

export function maxHp(g: General): number {
  return Math.round((g.base.hp + (g.armor?.hp ?? 0)) * REALM_MULT[g.realm]);
}

/** 煉丹／煉器／畫符／佈陣，境界越高越精 */
export function craft(g: General, stat: CraftStat): number {
  return Math.round(g.base[stat] * (1 + g.realm * 0.1));
}

/** 綜合戰力，用於攻城、秘境與 AI 評估 */
export function power(g: General): number {
  return Math.round(attack(g) * 2 + defense(g) + maxHp(g) / 5);
}

export function totalCraft(g: General): number {
  return craft(g, 'alchemy') + craft(g, 'forging') + craft(g, 'talisman') + craft(g, 'formation');
}

export function breakthroughChance(g: General): number {
  const diff = g.technique?.difficulty ?? 3;
  return Math.max(0.05, Math.min(0.95, 0.75 - (diff - 1) * 0.07 - g.realm * 0.06 + g.breakBonus));
}

export interface CultivateResult {
  attempted: boolean;
  success: boolean;
}

/** 每回合開始時修煉；修為滿了自動嘗試突破 */
export function cultivateTurn(g: General): CultivateResult {
  if (g.realm >= REALMS.length - 1) return { attempted: false, success: false };
  g.exp += techniqueSpeed(g.technique);
  const need = REALM_EXP[g.realm];
  if (g.exp < need) return { attempted: false, success: false };
  if (Math.random() < breakthroughChance(g)) {
    const ratio = g.hp / maxHp(g);
    g.realm++;
    g.exp = 0;
    g.breakBonus = 0;
    g.hp = Math.round(maxHp(g) * Math.max(ratio, 0.5));
    return { attempted: true, success: true };
  }
  g.exp = Math.round(need * 0.7);
  return { attempted: true, success: false };
}

/** 自廢修為：境界歸零、功法散去，才能改學其他功法 */
export function abolish(g: General) {
  g.realm = 0;
  g.exp = 0;
  g.technique = null;
  g.breakBonus = 0;
  g.hp = Math.min(g.hp, maxHp(g));
}

/** 回合開始的回復 */
export function recover(g: General) {
  g.stamina = Math.min(100, g.stamina + 15);
  g.hp = Math.min(maxHp(g), g.hp + Math.round(maxHp(g) * 0.12));
}

export function generalValue(g: General): number {
  return Math.round(power(g) * 8 + totalCraft(g) * 10 + (g.weapon?.price ?? 0) * 0.5 + (g.armor?.price ?? 0) * 0.5 + (g.technique?.price ?? 0) * 0.5);
}

/** 聽風樓招募價：本國將領較便宜 */
export function recruitPrice(g: General, lord: string): number {
  const base = generalValue(g) * 0.6 + 2000;
  return Math.round((base * (g.origin === lord ? 0.6 : 1.5)) / 100) * 100;
}

/** 裝備神器或寶衣；換下的裝備放回行囊 */
export function equip(lord: Lord, g: General, e: Equipment) {
  const old = g[e.kind];
  g[e.kind] = e;
  lord.gear = lord.gear.filter((x) => x.uid !== e.uid);
  if (old) lord.gear.push(old);
  g.hp = Math.min(g.hp, maxHp(g));
}

/** 學習功法，學會後不可更換 */
export function learn(lord: Lord, g: General, t: Technique) {
  g.technique = t;
  lord.scrolls = lord.scrolls.filter((x) => x.uid !== t.uid);
}

import type { City, CraftStat, Equipment, General, Lord, Technique } from '../game/types';
import { REALMS, REALM_EXP, REALM_MULT } from '../data/generals';
import { techniqueExp } from '../data/items';
import { WORLD } from './WorldMods';
import { terrainOf } from '../data/terrain';
import { fx } from '../data/passives';

export function realmName(g: General): string {
  return REALMS[g.realm];
}

export function attack(g: General): number {
  const t = g.technique?.power ?? 0;
  return Math.round((g.base.force + g.bonusForce + (g.weapon?.value ?? 0)) * REALM_MULT[g.realm] * (1 + t) * (1 + (fx(g).atk ?? 0)));
}

export function defense(g: General): number {
  const t = g.technique?.power ?? 0;
  return Math.round((g.base.defense + g.bonusDefense + (g.armor?.value ?? 0)) * REALM_MULT[g.realm] * (1 + t * 0.5) * (1 + (fx(g).def ?? 0)));
}

export function maxHp(g: General): number {
  return Math.round((g.base.hp + (g.armor?.hp ?? 0)) * REALM_MULT[g.realm] * (1 + (fx(g).hp ?? 0)));
}

/** 煉丹／煉器／畫符／佈陣，境界越高越精 */
export function craft(g: General, stat: CraftStat): number {
  return Math.round((g.base[stat] + (fx(g).craft?.[stat] ?? 0)) * (1 + g.realm * 0.1));
}

/** 綜合戰力，用於攻城、秘境與 AI 評估 */
export function power(g: General): number {
  return Math.round(attack(g) * 2 + defense(g) + maxHp(g) / 5);
}

export function totalCraft(g: General): number {
  return craft(g, 'alchemy') + craft(g, 'forging') + craft(g, 'talisman') + craft(g, 'formation');
}

// ───────────────────────── 修為與瓶頸 ─────────────────────────

export function expCap(g: General): number {
  return g.realm < REALM_EXP.length ? REALM_EXP[g.realm] : Infinity;
}

/** 修為已滿，需手動突破 */
export function inBottleneck(g: General): boolean {
  return g.realm < REALMS.length - 1 && g.exp >= expCap(g);
}

/** 增加修為（瓶頸時溢出的部分作廢），回傳實際增加量 */
export function addExp(g: General, amount: number): number {
  const before = g.exp;
  g.exp = Math.min(expCap(g), g.exp + Math.max(0, Math.round(amount)));
  return g.exp - before;
}

const APTITUDE_MULT = { heaven: 1.5, earth: 1, pseudo: 0.6 };
/** 極品靈脈：駐守者修為加倍 */
export const SPIRIT_VEINS = new Set(['luoyang', 'changan']);

/** 周天吐納：每回合被動修為；駐守城池依繁榮度（靈氣濃度）額外增加，閉關再加倍 */
export function passiveExp(g: General, city: City | null): number {
  let n = (30 + techniqueExp(g.technique)) * APTITUDE_MULT[g.aptitude];
  if (g.status === 'garrison' && city) {
    // 繁榮度即靈氣濃度，再依地貌增減（山地、丘陵最宜修行）
    n += (city.prosperity / 3) * (SPIRIT_VEINS.has(city.id) ? 2 : 1) * (1 + terrainOf(city).spirit);
    if (g.secluded) n *= 2 * WORLD.seclusionMult;
  }
  return Math.round(n * WORLD.expMult * (1 + (fx(g).exp ?? 0)));
}

// ───────────────────────── 突破 ─────────────────────────

/** 築基→金丹以上要渡雷劫 */
export function needsTribulation(g: General): boolean {
  return g.realm >= 2;
}

/** 低階突破成功率 */
export function breakChance(g: General): number {
  const base = [0.9, 0.75][g.realm] ?? 0.5;
  let c = base + (g.aptitude === 'heaven' ? 0.15 : g.aptitude === 'pseudo' ? -0.1 : 0);
  // 只有修習高難度功法才會拖累突破
  if (g.technique) c -= (g.technique.difficulty - 1) * 0.03;
  if (g.hp < maxHp(g) * 0.5) c -= 0.15;
  if (g.foundation && g.realm === 1) c = Math.max(c, 0.95);
  c -= g.demon * 0.3;
  c += WORLD.breakBonus + (fx(g).breakBonus ?? 0) + g.breakBoost;
  return Math.max(0.05, Math.min(0.95, c));
}

export function canAttemptBreak(g: General, round: number): { ok: boolean; reason: string } {
  if (!inBottleneck(g)) return { ok: false, reason: '修為未滿' };
  if (g.status === 'realm' || g.status === 'dead') return { ok: false, reason: '不在宗門掌控中' };
  if (!needsTribulation(g) && g.failedRound >= round) return { ok: false, reason: '氣血未復，下一輪才能再試' };
  return { ok: true, reason: '' };
}

export function levelUp(g: General) {
  const ratio = g.hp / maxHp(g);
  g.realm++;
  g.exp = 0;
  g.hp = Math.max(1, Math.round(maxHp(g) * ratio));
}

/** 低階突破失敗的血量懲罰（依突破前的境界）：境界越高扣得越多 */
export const BREAK_FAIL_HP = [0.1, 0.2];
/** 低階突破失敗損失的修為比例 */
export const BREAK_FAIL_EXP = 0.2;

/** 低階突破：機率判定，失敗損失 20% 修為與依境界而定的血量 */
export function attemptBreak(g: General, round: number): boolean {
  const ok = Math.random() < breakChance(g);
  g.foundation = false;
  g.demon = 0;
  g.breakBoost = 0;
  if (ok) {
    levelUp(g);
    return true;
  }
  g.exp = Math.round(g.exp * (1 - BREAK_FAIL_EXP));
  g.hp = Math.max(1, g.hp - Math.round(maxHp(g) * (BREAK_FAIL_HP[g.realm] ?? 0.2)));
  g.failedRound = round;
  return false;
}

export const TRIBULATION_BOLTS = [3, 4, 5, 6, 7, 8, 9, 10];
const TRIBULATION_BASE = [550, 700, 900, 1250, 1600, 2100, 2700, 3500];

export function boltCount(g: General): number {
  return TRIBULATION_BOLTS[g.realm - 2] ?? 10;
}

/** 單道天雷的預估傷害（防禦、寶衣、護法陣、體質、心魔都會影響） */
export function boltDamage(g: General): number {
  const def = defense(g);
  const reduce = def / (def + 300);
  const thunder = 1 - (fx(g).tribulation ?? 0);
  return TRIBULATION_BASE[g.realm - 2] * (1 - reduce) * (1 - g.ward) * thunder * (1 + g.demon * 0.5) * WORLD.boltMult * (1 - g.breakBoost);
}

export interface TribulationResult {
  bolts: number[];
  success: boolean;
  /** 失敗時：死亡或兵解重修 */
  fate: 'death' | 'rebirth' | null;
  fromRealm: number;
}

/** 渡雷劫：逐道扣血，撐過全部即突破；血量歸零則一半身死道消、一半兵解重修 */
export function tribulation(g: General): TribulationResult {
  const fromRealm = g.realm;
  const per = boltDamage(g);
  const bolts: number[] = [];
  let hp = g.hp;
  for (let i = 0; i < boltCount(g); i++) {
    const dmg = Math.round(per * (0.8 + Math.random() * 0.4));
    bolts.push(dmg);
    hp -= dmg;
    if (hp <= 0) break;
  }
  g.ward = 0;
  g.demon = 0;
  g.breakBoost = 0;
  if (hp > 0) {
    g.hp = hp;
    levelUp(g);
    return { bolts, success: true, fate: null, fromRealm };
  }
  if (Math.random() < 0.5) {
    g.status = 'dead';
    g.owner = null;
    g.cityId = null;
    g.hp = 0;
    return { bolts, success: false, fate: 'death', fromRealm };
  }
  g.realm = 0;
  g.exp = 0;
  g.hp = Math.round(maxHp(g) * 0.3);
  return { bolts, success: false, fate: 'rebirth', fromRealm };
}

/** 生死歷練：勝者掠奪敗者一成修為，偽靈根加倍 */
export function battleExp(winner: General, loser: General | null): number {
  const steal = loser ? Math.round(loser.exp * 0.1) : 0;
  if (loser) loser.exp -= steal;
  const gain = (steal + 60 * (winner.realm + 1)) * (winner.aptitude === 'pseudo' ? 2 : 1);
  return addExp(winner, gain);
}

/** 閉關被打斷：走火入魔，重傷並損失一半修為 */
export function qiDeviation(g: General) {
  g.secluded = false;
  g.hp = Math.max(1, Math.round(maxHp(g) * 0.1));
  g.exp = Math.round(g.exp / 2);
}

/** 自廢修為：境界歸零、功法散去，才能改學其他功法 */
export function abolish(g: General) {
  g.realm = 0;
  g.exp = 0;
  g.technique = null;
  g.foundation = false;
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

/** 境界越高，武將身價倍數越大 */
const REALM_SALE_MULT = [1, 1.6, 2.5, 4, 6, 9, 13, 18, 25, 35, 50];

/** 破產變賣時的武將身價：依能力值與境界，遠高於招募價（不含裝備，賣出時裝備會自動卸下） */
export function generalSaleValue(g: General): number {
  return Math.round(((power(g) * 10 + totalCraft(g) * 14) * REALM_SALE_MULT[g.realm]) / 100) * 100;
}

/** 聽風樓招募價：本國將領較便宜 */
export function recruitPrice(g: General, lord: string): number {
  const base = generalValue(g) * 0.6 + 2000;
  return Math.round((base * (g.origin === lord ? 0.6 : 1.5) * WORLD.recruitMult) / 100) * 100;
}

/** 裝備神器或寶衣；換下的裝備放回行囊 */
export function equip(lord: Lord, g: General, e: Equipment) {
  const old = g[e.kind];
  g[e.kind] = e;
  lord.gear = lord.gear.filter((x) => x.uid !== e.uid);
  if (old) lord.gear.push(old);
  g.hp = Math.min(g.hp, maxHp(g));
}

/** 卸下神器或寶衣，放回行囊 */
export function unequip(lord: Lord, g: General, kind: 'weapon' | 'armor') {
  const e = g[kind];
  if (!e) return;
  g[kind] = null;
  lord.gear.push(e);
  g.hp = Math.min(g.hp, maxHp(g));
}

/** 學習功法，學會後不可更換 */
export function learn(lord: Lord, g: General, t: Technique) {
  g.technique = t;
  lord.scrolls = lord.scrolls.filter((x) => x.uid !== t.uid);
}

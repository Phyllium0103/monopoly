import type { City, CraftStat, Equipment, General, Lord, LordId, Technique } from '../game/types';
import { REALMS, REALM_EXP, REALM_MULT } from '../data/generals';
import { ELEMENT_BIAS, techniqueExp } from '../data/items';
import { WORLD } from './WorldMods';
import { terrainOf } from '../data/terrain';
import { fx, lordAura, passiveState } from '../data/passives';
import { traitOf } from '../faction/Faction';

/** Avoid floating point half-rounding differences from the editable spreadsheet. */
const roundStat=(value:number)=>Math.round(Number(value.toFixed(8)));

export function realmName(g: General): string {
  return REALMS[g.realm];
}

export function realmMultiplier(g: General): number { return REALM_MULT[g.realm] * (fx(g).realmFactor ?? 1); }
export function maxStamina(g: General): number { return Math.max(0, 100 + (fx(g).maxStamina ?? 0)); }
export function expMultiplier(g: General): number {
  if (g.ghostSourceId) return 0;
  const aura=g.owner && g.status === 'free' ? lordAura(g.owner,'partyExp') + (g.isLord ? lordAura(g.owner,'partyLordExp') : 0) + ((passiveState()?.lords[g.owner].clearCultivationTurns ?? 0)>0 ? 1 : 0) : 0;
  return Math.max(0,1+(fx(g).exp??0)+aura);
}
export function attack(g: General): number {
  const t = (g.technique?.power ?? 0) * (g.technique ? ELEMENT_BIAS[g.technique.element].atk : 1);
  return roundStat((g.base.force + g.bonusForce + (g.weapon?.force ?? 0) + (g.armor?.force ?? 0)) * realmMultiplier(g) * (1 + t) * (1 + (fx(g).atk ?? 0)) * (1 + (fx(g).allStats ?? 0)));
}

export function defense(g: General): number {
  const t = (g.technique?.power ?? 0) * (g.technique ? ELEMENT_BIAS[g.technique.element].def : 1);
  return roundStat((g.base.defense + g.bonusDefense + (g.armor?.defense ?? 0) + (g.weapon?.defense ?? 0)) * realmMultiplier(g) * (1 + t * 0.5) * (1 + (fx(g).def ?? 0)) * (1 + (fx(g).allStats ?? 0)));
}

export function maxHp(g: General): number {
  return roundStat((g.base.hp + (g.armor?.hp ?? 0) + (g.weapon?.hp ?? 0)) * realmMultiplier(g) * (1 + (fx(g).hp ?? 0)) * (1 + (fx(g).allStats ?? 0)));
}

/** 煉丹／煉器／畫符／佈陣，境界越高越精 */
export function craft(g: General, stat: CraftStat): number {
  return roundStat((g.base[stat] + (fx(g).craft?.[stat] ?? 0) + (g.weapon?.craft[stat] ?? 0) + (g.armor?.craft[stat] ?? 0)) * (1 + g.realm * 0.1) * (fx(g).realmFactor ?? 1) * (1 + (fx(g).allStats ?? 0)));
}

/** 綜合戰力，用於攻城、秘境與 AI 評估 */
export function power(g: General): number {
  return roundStat(attack(g) * 2 + defense(g) + maxHp(g) / 5);
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
  g.exp = Math.min(expCap(g), g.exp + Math.max(0, Math.round(amount * expMultiplier(g))));
  return g.exp - before;
}

const APTITUDE_MULT = { waste: 0.8, metal: 1, wood: 1, water: 1, fire: 1, earth: 1, heaven: 1.2 };
/** 極品靈脈：駐守者修為加倍 */
export const SPIRIT_VEINS = new Set(['luoyang', 'changan']);

/** 周天吐納：每回合被動修為；駐守城池依繁榮度（靈氣濃度）額外增加，閉關再加倍 */
export function passiveExp(g: General, city: City | null): number {
  if (g.ghostSourceId) return 0;
  let n = 30 + techniqueExp(g.technique);
  if (g.status === 'garrison' && city) {
    // 繁榮度即靈氣濃度，再依地貌增減（山地、丘陵最宜修行）
    n += (city.prosperity / 3) * (SPIRIT_VEINS.has(city.id) ? 2 : 1) * (1 + terrainOf(city).spirit);
    if (g.secluded) n *= 2 * WORLD.seclusionMult;
  }
  return Math.round(n * APTITUDE_MULT[g.aptitude] * WORLD.expMult * (1 + (traitOf(g.owner).expMult ?? 0)));
}

// ───────────────────────── 突破 ─────────────────────────

/** 築基→金丹以上要渡雷劫 */
export function needsTribulation(g: General): boolean {
  return g.realm >= 2;
}

/** 低階突破成功率 */
export function breakChance(g: General): number {
  const base = [0.9, 0.75][g.realm] ?? 0.5;
  let c = base;
  if (g.hp < maxHp(g) * 0.5) c -= 0.15;
  if (g.foundation && g.realm === 1) return 1;
  c -= g.demon * 0.3;
  c += WORLD.breakBonus + (fx(g).breakBonus ?? 0) + (traitOf(g.owner).breakBonus ?? 0);
  return Math.max(0.05, Math.min(0.95, c));
}

export function canAttemptBreak(g: General, round: number): { ok: boolean; reason: string } {
  if (!inBottleneck(g)) return { ok: false, reason: '修為未滿' };
  if (g.ghostSourceId || g.status === 'realm' || g.status === 'dead') return { ok: false, reason: '不在宗門掌控中' };
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
/** 未裝備、無護法時，完整雷劫平均消耗基礎境界血量的比例。 */
export const TRIBULATION_HP_RATIO = [0.52, 0.60, 0.68, 0.76, 0.84, 0.92, 1.02, 1.12];
/** 單道天雷傷害的浮動範圍：預估值的 ±35% */
export const BOLT_SPREAD = 0.35;

export function boltCount(g: General): number {
  return TRIBULATION_BOLTS[g.realm - 2] ?? 10;
}

/** 單道天雷的預估傷害（防禦、寶衣、護法陣、體質、心魔都會影響） */
export function boltDamage(g: General): number {
  const stage = Math.max(0, Math.min(TRIBULATION_HP_RATIO.length - 1, g.realm - 2));
  const baselineHp = g.base.hp * REALM_MULT[g.realm];
  const baselineDefense = g.base.defense;
  // 境界成長同步提高天雷；額外防禦、血量裝備和被動仍有實際幫助。
  const defenseFactor = (baselineDefense + 200) / (defense(g) / REALM_MULT[g.realm] + 200);
  const thunder = Math.max(0, 1 - (fx(g).tribulation ?? 0));
  return baselineHp * TRIBULATION_HP_RATIO[stage] / boltCount(g) * defenseFactor
    * Math.max(0, 1 - g.ward) * thunder * (1 + g.demon * 0.5) * WORLD.boltMult * Math.max(0, 1 - g.breakBoost);
}

/** 天雷傷害的實際範圍與平均（單道與全部） */
export function boltRange(g: General) {
  const per = boltDamage(g);
  const n = boltCount(g);
  return {
    count: n,
    min: Math.round(per * (1 - BOLT_SPREAD)),
    max: Math.round(per * (1 + BOLT_SPREAD)),
    avg: Math.round(per),
    totalMin: Math.round(per * (1 - BOLT_SPREAD) * n),
    totalMax: Math.round(per * (1 + BOLT_SPREAD) * n),
    totalAvg: Math.round(per * n),
  };
}

export interface TribulationResult {
  bolts: number[];
  success: boolean;
  /** 失敗時：死亡或兵解重修 */
  fate: 'death' | 'rebirth' | 'saved' | null;
  fromRealm: number;
}

/** 渡雷劫：逐道扣血，撐過全部即突破；血量歸零則一半身死道消、一半兵解重修 */
export async function tribulation(g: General, protect?: () => Promise<boolean>): Promise<TribulationResult> {
  if (fx(g).tribulationSuccess) { const fromRealm=g.realm; g.sevenLife=false; g.ward=0; g.demon=0; g.breakBoost=0; levelUp(g); return {bolts:[],success:true,fate:null,fromRealm}; }
  const seven = g.sevenLife;
  g.sevenLife = false;
  const fromRealm = g.realm;
  const per = boltDamage(g);
  const bolts: number[] = [];
  let hp = g.hp;
  for (let i = 0; i < boltCount(g); i++) {
    const dmg = Math.round(per * (1 - BOLT_SPREAD + Math.random() * BOLT_SPREAD * 2));
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
    if (seven) {
      g.hp = maxHp(g); g.exp = Math.round(g.exp * 0.5);
      return { bolts, success: false, fate: 'saved', fromRealm };
    }
    if (protect && await protect()) return { bolts, success: false, fate: 'saved', fromRealm };
    g.status = 'dead';
    g.lastOwner = g.owner;
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

/** 生死歷練：勝者掠奪敗者一成修為 */
export function battleExp(winner: General, loser: General | null): number {
  const steal = loser ? Math.round(loser.exp * 0.1) : 0;
  if (loser) loser.exp -= steal;
  const gain = (steal + 60 * (winner.realm + 1)) * (1 + (traitOf(winner.owner).battleExp ?? 0));
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
  g.stamina = Math.min(maxStamina(g), Math.round((g.stamina + 15 * Math.max(0,1+(fx(g).staminaRecovery??0))) * 10) / 10);
  g.hp = Math.min(maxHp(g), g.hp + Math.round(maxHp(g) * 0.12));
}

export function generalValue(g: General): number {
  if (g.ghostSourceId) return 0;
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
  return Math.round((base * (g.origin === lord ? 0.6 : 1.5) * WORLD.recruitMult * (1 + (traitOf(lord as LordId).recruit ?? 0)) * Math.max(0,1-lordAura(lord as LordId,'partyRecruit'))) / 100) * 100;
}

/** 裝備神器或寶衣；換下的裝備放回行囊 */
export function equip(lord: Lord, g: General, e: Equipment) {
  if (g.ghostSourceId) return;
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

/** 靈根與功法相容性；玩家介面、電腦與實際裝備共用規則。 */
export function canLearn(g: General, t: Technique): { ok: boolean; reason: string } {
  if (g.ghostSourceId) return {ok:false,reason:'冤魂無法裝備功法'};
  if (g.technique) return { ok: false, reason: '已修習功法，須先自廢修為' };
  if (g.aptitude === 'waste') return { ok: false, reason: '廢靈根無法裝備功法' };
  if (g.aptitude !== 'heaven' && g.aptitude !== t.element) return { ok: false, reason: '靈根與功法五行不符' };
  return { ok: true, reason: '' };
}

/** 學習功法，學會後不可更換 */
export function learn(lord: Lord, g: General, t: Technique): boolean {
  if (!canLearn(g, t).ok || !lord.scrolls.some(x => x.uid === t.uid)) return false;
  g.technique = t;
  lord.scrolls = lord.scrolls.filter((x) => x.uid !== t.uid);
  return true;
}

import type { City, CraftStat, Equipment, General, Lord, LordId, Technique, GameState, Stats } from '../game/types';
import { makePersonalWeapon } from '../data/weaponCatalog';
import { mortalTrialTurns, TRIBULATION_RULES } from '../data/breakthroughRules';
import { REALMS, REALM_EXP, REALM_MULT } from '../data/generals';
import { techniqueForce, techniqueSpeed } from '../data/items';
import { WORLD } from './WorldMods';
import { fx, lordAura, passiveState } from '../data/passives';
import { awardBreakthrough } from '../data/talents';
import { GOLDEN_CORES, earlyBreakChance } from '../data/breakthroughRules';

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
  const t = techniqueForce(g.technique);
  return roundStat((g.base.force + g.bonusForce + (g.armor?.force ?? 0)) * realmMultiplier(g) * (1 + t) * (1 + (fx(g).atk ?? 0)) * (1 + (fx(g).allStats ?? 0)));
}

export function defense(g: General): number {
  return roundStat((g.base.defense + g.bonusDefense + (g.armor?.defense ?? 0)) * realmMultiplier(g) * (1 + (fx(g).def ?? 0)) * (1 + (fx(g).allStats ?? 0)));
}

export function maxHp(g: General): number {
  return roundStat((g.base.hp + (g.armor?.hp ?? 0)) * realmMultiplier(g) * (1 + (fx(g).hp ?? 0)) * (1 + (fx(g).allStats ?? 0)));
}

/** 煉丹／煉器／畫符／佈陣，境界越高越精 */
export function craft(g: General, stat: CraftStat): number {
  return roundStat((g.base[stat] + (fx(g).craft?.[stat] ?? 0) + (g.armor?.craft[stat] ?? 0)) * (1 + g.realm * 0.1) * (fx(g).realmFactor ?? 1) * (1 + (fx(g).allStats ?? 0)) * (1 + (fx(g).craftPct ?? 0)));
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
  if (g.mortalTrial) return Infinity;
  if (g.realm === 2) return g.goldenCore ? GOLDEN_CORES[g.goldenCore].exp : 2400;
  return g.realm < REALM_EXP.length ? REALM_EXP[g.realm] : Infinity;
}

/** 修為已滿，需手動突破 */
export function inBottleneck(g: General): boolean {
  return g.realm < REALMS.length - 1 && g.exp >= expCap(g);
}

/** 增加修為（瓶頸時溢出的部分作廢），回傳實際增加量 */
export function addExp(g: General, amount: number): number {
  if (g.mortalTrial) return 0;
  const before = g.exp;
  g.exp = Math.min(expCap(g), g.exp + Math.max(0, Math.round(amount * expMultiplier(g))));
  return g.exp - before;
}

const APTITUDE_MULT = { waste: 0.8, metal: 1, wood: 1, water: 1, fire: 1, earth: 1, heaven: 1.2 };
/** 極品靈脈：駐守者修為加倍 */
export const SPIRIT_VEINS = new Set(['luoyang', 'changan']);

/** 周天吐納：每回合被動修為；駐守城池依繁榮度（靈氣濃度）額外增加，閉關再加倍；功法提高修練速度 */
export function passiveExp(g: General, city: City | null): number {
  if (g.ghostSourceId) return 0;
  let n = 30;
  if (g.status === 'garrison' && city) {
    // 繁榮度即靈氣濃度
    n += (city.prosperity / 3) * (SPIRIT_VEINS.has(city.id) ? 2 : 1);
    if (g.secluded) n *= 2 * WORLD.seclusionMult * (1 + (fx(g).seclusionExp ?? 0));
  }
  return Math.round(n * (1 + techniqueSpeed(g.technique)) * APTITUDE_MULT[g.aptitude] * WORLD.expMult);
}

// ───────────────────────── 突破 ─────────────────────────

/** 築基→金丹以上要渡雷劫 */
export function needsTribulation(g: General): boolean {
  return g.realm === 3 || g.realm === 7;
}

/** 低階突破成功率 */
export function breakChance(g: General): number {
  if (g.realm === 0 || g.realm === 1) return earlyBreakChance(g.realm, g.aptitude, g.foundation);
  return 1;
}

export function canAttemptBreak(g: General, round: number): { ok: boolean; reason: string } {
  if (g.mortalTrial) return { ok: false, reason: '正在紅塵化凡' };
  if (!inBottleneck(g)) return { ok: false, reason: '修為未滿' };
  if (g.ghostSourceId || g.status === 'realm' || g.status === 'dead') return { ok: false, reason: '不在宗門掌控中' };
  void round;
  const state = passiveState();
  const lord = g.owner && state?.lords[g.owner];
  if (g.realm === 2 && !g.goldenCore) return { ok: false, reason: '請先選擇金丹路線' };
  if (g.realm === 2 && g.goldenCore === 'heavenly' && g.aptitude !== 'heaven') return { ok: false, reason: '天道金丹僅天靈根可修煉' };
  if (g.realm === 5 && (!lord || ESSENCE_ELEMENTS.some(e => (lord.essences?.[e] ?? 0) < 1))) return { ok: false, reason: '五行本源各需一個' };
  if (g.realm === 6 && ![g.weapon, g.armor].some(e => e && e.tier >= 9)) return { ok: false, reason: '需裝備天階武器或寶衣' };
  if (g.realm === 8 && (!state || !ascensionCities(state, g).length)) return { ok: false, reason: '需有未綁定且繁榮度大於200的麾下城池' };
  return { ok: true, reason: '' };
}

export const ESSENCE_ELEMENTS = ['metal', 'wood', 'water', 'fire', 'earth'] as const;
export const ESSENCE_NAMES = ['庚金本源', '乙木本源', '癸水本源', '離火本源', '戊土本源'];
export function ascensionCities(state: GameState, g: General): City[] {
  return Object.values(state.cities).filter(c => c.owner === g.owner && c.prosperity > 200 && !Object.values(state.generals).some(other => other.boundCityId === c.id));
}

/** Used by player and AI after the same eligibility check. */
export function completeBreak(g: General, round: number, cityId?: string): boolean {
  if (!canAttemptBreak(g, round).ok || needsTribulation(g)) return false;
  const state = passiveState();
  const lord = g.owner && state?.lords[g.owner];
  if (!lord) return false;
  if (g.realm < 2) return attemptBreak(g, round);
  if (g.realm === 4) {
    const [min, max] = mortalTrialTurns(g.aptitude);
    g.mortalTrial = { turns: min + Math.floor(Math.random() * (max - min + 1)), weapon: g.weapon };
    if (g.armor) lord.gear.push(g.armor);
    g.weapon = null; g.armor = null; g.realm = 0; g.exp = 0;
    g.hp = Math.min(g.hp, maxHp(g));
    return true;
  }
  if (g.realm === 5) for (const e of ESSENCE_ELEMENTS) lord.essences![e]!--;
  if (g.realm === 6) {
    const bonus: Partial<Stats> & { penetration?: number } = {};
    for (const equipment of [g.weapon, g.armor]) {
      if (!equipment || equipment.tier < 9) continue;
      const factor = equipment.kind === 'weapon' ? 0.5 : 1;
      for (const key of ['force', 'defense', 'hp'] as const) bonus[key] = (bonus[key] ?? 0) + equipment[key] * factor;
      for (const key of ['alchemy', 'forging', 'talisman', 'formation'] as const) bonus[key] = (bonus[key] ?? 0) + (equipment.craft[key] ?? 0) * factor;
      bonus.penetration = (bonus.penetration ?? 0) + (equipment.penetration ?? 0) * factor;
      if (equipment.kind === 'weapon') g.weapon = makePersonalWeapon(g.id);
      else g.armor = null;
    }
    for (const key of Object.keys(g.base) as (keyof Stats)[]) g.base[key] += bonus[key] ?? 0;
    g.fusionBonus = bonus;
  }
  if (g.realm === 8) {
    if (!state || !ascensionCities(state, g).some(c => c.id === cityId)) return false;
    g.boundCityId = cityId;
  }
  levelUp(g);
  return true;
}

/** Remove bonuses once their required realm is lost, including resurrection/abolition. */
export function reconcileProgression(state: GameState) {
  for (const g of Object.values(state.generals)) {
    if (g.boundCityId && (g.status === 'dead' || state.cities[g.boundCityId]?.owner !== g.owner)) {
      delete g.boundCityId;
      if (g.realm >= 9) { g.realm = 8; g.exp = 0; }
    }
    if (g.mortalTrial && g.status === 'dead') { g.weapon = g.mortalTrial.weapon; delete g.mortalTrial; }
    for (const [field, minimum] of [['coreBonus', 3], ['fusionBonus', 7]] as const) {
      const bonus = g[field];
      if (bonus && g.realm < minimum && !g.mortalTrial) {
        for (const key of Object.keys(g.base) as (keyof Stats)[]) g.base[key] -= bonus[key] ?? 0;
        delete g[field];
        if (field === 'coreBonus') delete g.goldenCore;
      }
    }
    if (g.status !== 'dead') g.hp = Math.min(g.hp, maxHp(g));
  }
}

export function levelUp(g: General) {
  if (g.realm>=REALMS.length-1) return;
  const ratio = g.hp / maxHp(g);
  g.realm++;
  if (g.realm === 3 && g.goldenCore && !g.coreBonus) {
    const core = GOLDEN_CORES[g.goldenCore];
    g.coreBonus = {};
    for (const key of ['force', 'alchemy', 'forging', 'talisman', 'formation'] as const) {
      if (core.stat === 'all' || core.stat === key) {
        g.base[key] += core.gain;
        g.coreBonus[key] = core.gain;
      }
    }
  }
  // 境界成長寫回基礎能力，與一般境界倍率各自計算；低階突破同樣適用。
  const growth=fx(g);
  for(const stat of ['force','defense','alchemy','forging','talisman','formation'] as const) g.base[stat]+=growth.levelBaseGain??0;
  g.base.hp+=growth.levelHpGain??0;
  g.exp = 0;
  g.hp = Math.max(1, Math.round(maxHp(g) * ratio));
  awardBreakthrough(passiveState(), g);
}

/** 低階突破失敗的血量懲罰（依突破前的境界）：境界越高扣得越多 */
export const BREAK_FAIL_HP = [0, 0.25];
/** 低階突破失敗損失的修為比例 */
export const BREAK_FAIL_EXP = 0.25;

/** 煉氣失敗損失50%修為；築基失敗損失25%修為與最大血量。 */
export function attemptBreak(g: General, round: number): boolean {
  if (g.realm > 1 || !canAttemptBreak(g, round).ok) return false;
  const ok = Math.random() < breakChance(g);
  if (g.realm === 1) g.foundation = false;
  g.demon = 0;
  if (ok) {
    levelUp(g);
    return true;
  }
  g.exp = Math.round(g.exp * (g.realm === 0 ? 0.5 : 1 - BREAK_FAIL_EXP));
  g.hp = Math.max(1, g.hp - Math.round(maxHp(g) * (BREAK_FAIL_HP[g.realm] ?? 0.2)));
  g.failedRound = round;
  return false;
}

/** 單道天雷傷害的浮動範圍：預估值的 ±20%。 */
export const BOLT_SPREAD = 0.2;

export function boltCount(g: General): number {
  return g.realm === 3 ? TRIBULATION_RULES.nascentSoul.bolts : g.realm === 7 ? TRIBULATION_RULES.tribulation.bolts : 0;
}

/** 單道天雷的預估傷害（基礎境界血量、護法、雷劫被動、心魔及世界事件；防禦不影響） */
export function boltDamage(g: General): number {
  if (!needsTribulation(g)) return 0;
  const baselineHp = maxHp({ ...g, armor: null, weapon: null });
  // 天雷依基礎境界血量成長，不受防禦數值影響。
  const thunder = Math.max(0, 1 - (fx(g).tribulation ?? 0));
  return baselineHp * (g.realm === 3 ? TRIBULATION_RULES.nascentSoul.totalHpRatio : TRIBULATION_RULES.tribulation.totalHpRatio) / boltCount(g)
    * Math.max(0, 1 - g.ward) * thunder;
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
  /** 失敗時：死亡或保命。 */
  fate: 'death' | 'saved' | null;
  fromRealm: number;
}

/** 渡雷劫：逐道扣血，撐過全部即突破；血量歸零先判定保命，否則死亡。 */
export async function tribulation(g: General, protect?: () => Promise<boolean>): Promise<TribulationResult> {
  if (fx(g).tribulationSuccess) { const fromRealm=g.realm; g.sevenLife=false; g.ward=0; g.demon=0; levelUp(g); return {bolts:[],success:true,fate:null,fromRealm}; }
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
  if (hp > 0) {
    g.hp = hp;
    levelUp(g);
    return { bolts, success: true, fate: null, fromRealm };
  }
  {
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
}

/** 生死歷練：勝者掠奪敗者一成修為 */
export function battleExp(winner: General, loser: General | null): number {
  const steal = loser ? Math.round(loser.exp * 0.1) : 0;
  if (loser) loser.exp -= steal;
  const gain = (steal + 60 * (winner.realm + 1));
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
  if (g.mortalTrial) { g.weapon = g.mortalTrial.weapon; delete g.mortalTrial; }
  g.realm = 0;
  g.exp = 0;
  g.technique = null;
  g.foundation = false;
  const state = passiveState();
  if (state) reconcileProgression(state);
  g.hp = Math.min(g.hp, maxHp(g));
}

/** 回合開始的回復 */
export function recover(g: General) {
  g.stamina = Math.min(maxStamina(g), Math.round((g.stamina + 15 * Math.max(0,1+(fx(g).staminaRecovery??0))) * 10) / 10);
  g.hp = Math.min(maxHp(g), g.hp + Math.round(maxHp(g) * 0.12));
}

export function generalValue(g: General): number {
  if (g.ghostSourceId) return 0;
  return Math.round(power(g) * 8 + totalCraft(g) * 10 + (g.armor?.price ?? 0) * 0.5 + (g.technique?.price ?? 0) * 0.5);
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
  return Math.round((base * (g.origin === lord ? 0.6 : 1.5) * WORLD.recruitMult * Math.max(0,1-lordAura(lord as LordId,'partyRecruit'))) / 100) * 100;
}

/** 裝備寶衣；換下的寶衣放回行囊。 */
export function equip(lord: Lord, g: General, e: Equipment) {
  if (g.mortalTrial) return;
  if (g.ghostSourceId) return;
  if (e.kind === 'weapon' || e.fixedGeneralId) throw Error('專屬武器不可更換');
  const old = g[e.kind];
  g[e.kind] = e;
  lord.gear = lord.gear.filter((x) => x.uid !== e.uid);
  if (old) lord.gear.push(old);
  g.hp = Math.min(g.hp, maxHp(g));
}

/** 卸下寶衣，專屬武器不可卸下。 */
export function unequip(lord: Lord, g: General, kind: 'weapon' | 'armor') {
  const e = g[kind];
  if (!e || e.fixedGeneralId) return;
  g[kind] = null;
  lord.gear.push(e);
  g.hp = Math.min(g.hp, maxHp(g));
}

/** 靈根與功法相容性；玩家介面、電腦與實際裝備共用規則。 */
export function canLearn(g: General, t: Technique): { ok: boolean; reason: string } {
  if (g.ghostSourceId) return {ok:false,reason:'冤魂無法裝備功法'};
  if (g.technique) return { ok: false, reason: '已修習功法，須先自廢修為' };
  if (g.aptitude === 'waste') return { ok: false, reason: '廢靈根無法裝備功法' };
  // 技藝功法（煉丹、煉器、畫符、佈陣）沒有五行，任何靈根都能修習
  if (t.element && g.aptitude !== 'heaven' && g.aptitude !== t.element) return { ok: false, reason: '靈根與功法五行不符' };
  return { ok: true, reason: '' };
}

/** 學習功法，學會後不可更換 */
export function learn(lord: Lord, g: General, t: Technique): boolean {
  if (!canLearn(g, t).ok || !lord.scrolls.some(x => x.uid === t.uid)) return false;
  g.technique = t;
  lord.scrolls = lord.scrolls.filter((x) => x.uid !== t.uid);
  return true;
}

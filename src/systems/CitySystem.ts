import type { City, GameState, General, Lord, LordId } from '../game/types';
import { citiesOf, freeGenerals, generalsOf, joinLord } from '../game/GameState';
import { defense, generalValue, power } from './GeneralSystem';
import { beastPower } from '../data/items';
import { fmtProsperity, fmtStones } from '../game/Currency';
import { WORLD } from './WorldMods';
import { terrainOf } from '../data/terrain';
import { fx } from '../data/passives';

export const SOLDIER_PRICE = 2;
export const MIN_GARRISON = 300;
/** 一名城池守軍約等於十名隨行士兵 */
export const GARRISON_STRENGTH = 10;

/** 過路費：隨繁榮度加速成長（前期便宜、後期昂貴），同一主公城池越多也越貴 */
export function toll(city: City, ownerCities = 1): number {
  return Math.round(Math.pow(city.prosperity, 1.5) * 7 * (city.capital ? 1.2 : 1) * (1 + 0.1 * Math.max(0, ownerCities - 1)));
}

export function cityToll(state: GameState, city: City): number {
  return city.owner === 'neutral' ? 0 : Math.round(toll(city, citiesOf(state, city.owner).length) * WORLD.tollMult);
}

/** 城池收入，受地貌與駐將被動增減 */
export function cityIncome(city: City, garrison: General | null = null) {
  const t = terrainOf(city);
  const f = garrison ? fx(garrison) : {};
  return {
    stones: Math.round(city.prosperity * 1.5 * (1 + t.stones) * (1 + (f.cityStones ?? 0)) * WORLD.incomeMult),
    soldiers: Math.round(city.prosperity * 2 * (1 + t.soldiers) * (1 + (f.citySoldiers ?? 0))),
  };
}

export function cityIncomeOf(state: GameState, city: City) {
  return cityIncome(city, city.garrisonGeneral ? state.generals[city.garrisonGeneral] : null);
}

/** 守城戰力：守軍 ×10，駐將防禦越高加成越多，再加上駐將本身戰力；受地貌影響，護城大陣 ×1.5 */
export function garrisonPower(state: GameState, city: City): number {
  const g = city.garrisonGeneral ? state.generals[city.garrisonGeneral] : null;
  const command = g ? 1 + defense(g) / 300 : 1;
  const f = g ? fx(g) : {};
  const base = city.garrisonSoldiers * GARRISON_STRENGTH * (1 + (f.troops ?? 0)) * command + (g ? power(g) * 2 : 0);
  return Math.round(base * (1 + terrainOf(city).defense) * (1 + (f.garrisonDef ?? 0)) * (city.shieldTurns > 0 ? 1.5 : 1));
}

/** 佔領無主城池需支付的安撫費 */
export function occupyCost(city: City): number {
  return Math.round(city.prosperity * 60);
}

export function canOccupy(state: GameState, lord: Lord, city?: City): boolean {
  if (city && lord.stones < occupyCost(city)) return false;
  return lord.soldiers >= MIN_GARRISON && freeGenerals(state, lord.id).length > 0;
}

/** 派遣武將與士兵駐守，佔領城池；cost 為支付的靈石（攻城奪下則為 0） */
export function occupy(state: GameState, lord: Lord, city: City, generalId: string, soldiers: number, cost = 0) {
  lord.stones -= cost;
  const g = state.generals[generalId];
  g.status = 'garrison';
  g.cityId = city.id;
  lord.soldiers -= soldiers;
  city.owner = lord.id;
  city.garrisonGeneral = generalId;
  city.garrisonSoldiers = soldiers;
}

/** 城池回歸無主：駐將回到主公身邊（或宗門），守軍解散 */
export function releaseCity(state: GameState, city: City) {
  if (city.garrisonGeneral) {
    const g = state.generals[city.garrisonGeneral];
    if (g.status === 'garrison' && g.owner) joinLord(state, g.owner, g);
  }
  city.owner = 'neutral';
  city.garrisonGeneral = null;
  city.garrisonSoldiers = 0;
  city.shieldTurns = 0;
}

export interface PayResult {
  paid: number;
  bankrupt: boolean;
  notes: string[];
}

/** 城池變賣價：佔領費的一半 */
export function citySaleValue(city: City): number {
  return Math.round(occupyCost(city) * 0.5);
}

/**
 * 付款：先付靈石；不足時從繁榮度最低的城池開始變賣（守軍回到主公、駐將回到身邊），
 * 城池賣光仍不足，隨行武將才隨機離開（進入聽風樓）以身價抵債；只剩主公一人仍付不清就破產
 */
export function pay(state: GameState, from: Lord, amount: number, to: Lord | null): PayResult {
  const notes: string[] = [];
  const settle = () => {
    const cash = Math.min(from.stones, remaining);
    from.stones -= cash;
    if (to) to.stones += cash;
    remaining -= cash;
  };
  let remaining = amount;
  settle();
  const owned = citiesOf(state, from.id).sort((a, b) => a.prosperity - b.prosperity);
  while (remaining > 0 && owned.length) {
    const city = owned.shift()!;
    const value = citySaleValue(city);
    from.soldiers += city.garrisonSoldiers;
    city.garrisonSoldiers = 0;
    releaseCity(state, city);
    from.stones += value;
    notes.push(`靈石不足，變賣城池「${city.name}」，得 ${fmtStones(value)}`);
    settle();
  }
  while (remaining > 0) {
    const party = freeGenerals(state, from.id);
    if (!party.length) break;
    const g = party[Math.floor(Math.random() * party.length)];
    const offset = Math.min(remaining, generalValue(g));
    remaining -= offset;
    if (to) to.stones += offset;
    g.owner = null;
    g.status = 'free';
    g.cityId = null;
    g.secluded = false;
    notes.push(`靈石不足，${g.name}離開投奔聽風樓，抵債 ${fmtStones(offset)}`);
  }
  const bankrupt = remaining > 0;
  if (bankrupt) eliminate(state, from);
  return { paid: amount - remaining, bankrupt, notes };
}

export function eliminate(state: GameState, lord: Lord) {
  lord.alive = false;
  lord.stones = 0;
  for (const city of citiesOf(state, lord.id)) releaseCity(state, city);
  for (const g of generalsOf(state, lord.id)) {
    g.owner = null;
    g.status = 'free';
    g.cityId = null;
    g.secluded = false;
  }
  lord.expeditions = [];
  // 越早出局名次越後
  const fallen = Object.values(state.lords).filter((l) => !l.alive).length;
  lord.rank = 5 - fallen;
}

/** 總資產：靈石 + 士兵 + 城池 + 將領 + 物品 */
export function totalAssets(state: GameState, id: LordId) {
  const l = state.lords[id];
  const cities = citiesOf(state, id);
  const cityValue = cities.reduce((s, c) => s + c.prosperity * 100 + c.garrisonSoldiers * SOLDIER_PRICE, 0);
  const gens = generalsOf(state, id);
  const generalValueSum = gens.reduce((s, g) => s + generalValue(g), 0);
  const itemValue =
    l.items.reduce((s, i) => s + i.price, 0) +
    l.gear.reduce((s, i) => s + i.price, 0) +
    l.scrolls.reduce((s, i) => s + i.price, 0) +
    (l.beast?.price ?? 0);
  return {
    stones: l.stones,
    soldiers: l.soldiers,
    cities: cities.length,
    generals: gens.length,
    cityValue,
    generalValue: generalValueSum,
    itemValue,
    total: Math.round(l.stones + l.soldiers * SOLDIER_PRICE + cityValue + generalValueSum + itemValue * 0.5),
  };
}

export function beastSiegeBonus(lord: Lord): number {
  return lord.beast ? beastPower(lord.beast).siege * 10 : 0;
}

// ───────────────────────── 城池排名 ─────────────────────────

export type RankMetric = 'prosperity' | 'stones' | 'soldiers' | 'toll' | 'defense';

export interface RankDef {
  id: RankMetric;
  name: string;
  icon: string;
  note: string;
  value: (state: GameState, city: City) => number;
  format: (n: number) => string;
}

export const RANK_METRICS: RankDef[] = [
  { id: 'prosperity', name: '繁榮度', icon: '🏮', note: '城池的富庶與人氣，影響收入、過路費、靈氣濃度與佔領費', value: (_s, c) => c.prosperity, format: (n) => fmtProsperity(n) },
  { id: 'stones', name: '靈石收入', icon: '💎', note: '每回合為主人帶來的靈石（含地貌、駐將被動與九州風雲）；無主城池為佔領後的預估值', value: (s, c) => cityIncomeOf(s, c).stones, format: (n) => fmtStones(n) },
  { id: 'soldiers', name: '士兵收入', icon: '⚔️', note: '每回合為主人帶來的士兵；無主城池為佔領後的預估值', value: (s, c) => cityIncomeOf(s, c).soldiers, format: (n) => `+${n}` },
  { id: 'toll', name: '過路費', icon: '💰', note: '他人踏入時要繳的費用；無主城池為佔領後的預估值', value: (s, c) => (c.owner === 'neutral' ? toll(c) : cityToll(s, c)), format: (n) => fmtStones(n) },
  { id: 'defense', name: '守城戰力', icon: '🏯', note: '守軍、駐將、地貌與護城大陣的綜合戰力；無主城池無守軍', value: (s, c) => (c.owner === 'neutral' ? 0 : garrisonPower(s, c)), format: (n) => (n ? String(n) : '—') },
];

export interface RankEntry {
  city: City;
  value: number;
  /** 並列時名次相同 */
  rank: number;
}

/** 某項指標的全城池排名（由高到低） */
export function rankCities(state: GameState, metric: RankMetric): RankEntry[] {
  const def = RANK_METRICS.find((m) => m.id === metric)!;
  const rows = Object.values(state.cities)
    .map((city) => ({ city, value: def.value(state, city) }))
    .sort((a, b) => b.value - a.value);
  let rank = 0;
  return rows.map((r, i) => {
    if (i === 0 || rows[i - 1].value !== r.value) rank = i + 1;
    return { ...r, rank };
  });
}

/** 單一城池在各項指標的名次 */
export function cityRanks(state: GameState, cityId: string): Record<RankMetric, number> {
  const out = {} as Record<RankMetric, number>;
  for (const m of RANK_METRICS) out[m.id] = rankCities(state, m.id).find((r) => r.city.id === cityId)!.rank;
  return out;
}

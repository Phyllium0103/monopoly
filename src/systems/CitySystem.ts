import type { City, GameState, Lord, LordId } from '../game/types';
import { citiesOf, generalsOf } from '../game/GameState';
import { generalValue, power } from './GeneralSystem';
import { beastPower } from '../data/items';
import { fmtStones } from '../game/Currency';

export const SOLDIER_PRICE = 10;
export const MIN_GARRISON = 100;

/** 過路費：隨繁榮度加速成長（前期便宜、後期昂貴），同一主公城池越多也越貴 */
export function toll(city: City, ownerCities = 1): number {
  return Math.round(Math.pow(city.prosperity, 1.5) * 7 * (city.capital ? 1.2 : 1) * (1 + 0.1 * Math.max(0, ownerCities - 1)));
}

export function cityToll(state: GameState, city: City): number {
  return city.owner === 'neutral' ? 0 : toll(city, citiesOf(state, city.owner).length);
}

export function cityIncome(city: City) {
  return { stones: Math.round(city.prosperity * 1.5), soldiers: Math.floor(city.prosperity / 2) };
}

/** 守城戰力：駐守武將 + 守軍，城池駐軍加成 ×1.5，護城大陣再 ×1.5 */
export function garrisonPower(state: GameState, city: City): number {
  const g = city.garrisonGeneral ? state.generals[city.garrisonGeneral] : null;
  const base = (g ? power(g) : 0) + city.garrisonSoldiers;
  return Math.round(base * 1.5 * (city.shieldTurns > 0 ? 1.5 : 1) * (1 + city.prosperity / 400));
}

/** 佔領無主城池需支付的安撫費（變賣時只能收回一半） */
export function occupyCost(city: City): number {
  return city.prosperity * 60;
}

export function canOccupy(state: GameState, lord: Lord, city?: City): boolean {
  if (city && lord.stones < occupyCost(city)) return false;
  return lord.soldiers >= MIN_GARRISON && generalsOf(state, lord.id).some((g) => g.status === 'free');
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

/** 城池回歸無主：駐將回到主公身邊，守軍解散 */
export function releaseCity(state: GameState, city: City) {
  if (city.garrisonGeneral) {
    const g = state.generals[city.garrisonGeneral];
    if (g.status === 'garrison') {
      g.status = 'free';
      g.cityId = null;
    }
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

/** 付款；靈石不足時依序變賣物品與城池，仍不足則破產 */
export function pay(state: GameState, from: Lord, amount: number, to: Lord | null): PayResult {
  const notes: string[] = [];
  const sell = (label: string, value: number) => {
    from.stones += value;
    notes.push(`變賣${label}，得 ${fmtStones(value)}`);
  };
  while (from.stones < amount && from.items.length) {
    const it = from.items.pop()!;
    sell('物品', Math.round(it.price * 0.5));
  }
  while (from.stones < amount && from.scrolls.length) {
    const s = from.scrolls.pop()!;
    sell(`功法「${s.name}」`, Math.round(s.price * 0.5));
  }
  while (from.stones < amount && from.gear.length) {
    const e = from.gear.pop()!;
    sell(`「${e.name}」`, Math.round(e.price * 0.5));
  }
  if (from.stones < amount && from.beast) {
    sell(`靈獸「${from.beast.name}」`, Math.round(from.beast.price * 0.5));
    from.beast = null;
  }
  // 從繁榮度最低的城池開始放棄
  const owned = citiesOf(state, from.id).sort((a, b) => a.prosperity - b.prosperity);
  while (from.stones < amount && owned.length) {
    const city = owned.shift()!;
    const value = Math.round(occupyCost(city) * 0.5);
    from.soldiers += city.garrisonSoldiers;
    releaseCity(state, city);
    sell(`城池「${city.name}」`, value);
  }
  const paid = Math.min(amount, from.stones);
  from.stones -= paid;
  if (to) to.stones += paid;
  const bankrupt = paid < amount;
  if (bankrupt) eliminate(state, from);
  return { paid, bankrupt, notes };
}

export function eliminate(state: GameState, lord: Lord) {
  lord.alive = false;
  lord.stones = 0;
  for (const city of citiesOf(state, lord.id)) releaseCity(state, city);
  for (const g of generalsOf(state, lord.id)) {
    g.owner = null;
    g.status = 'free';
    g.cityId = null;
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
  const cityValue = cities.reduce((s, c) => s + c.prosperity * 100 + c.garrisonSoldiers * 8, 0);
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
    total: Math.round(l.stones + l.soldiers * 8 + cityValue + generalValueSum + itemValue * 0.5),
  };
}

export function beastSiegeBonus(lord: Lord): number {
  return lord.beast ? beastPower(lord.beast).siege : 0;
}

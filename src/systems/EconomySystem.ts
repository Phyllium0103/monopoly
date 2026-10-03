import type { City, FactionId, GameState, ResourceKey, Resources } from '../game/types';
import { FACTIONS } from '../faction/Faction';
import { citiesOf, heroesOf } from '../game/GameState';

export const RESOURCE_NAMES: Record<ResourceKey, string> = {
  stones: '靈石',
  food: '糧草',
  wood: '木材',
  iron: '鐵礦',
  qi: '靈氣',
};

export const RESOURCE_ICONS: Record<ResourceKey, string> = {
  stones: '💎',
  food: '🌾',
  wood: '🪵',
  iron: '⛏️',
  qi: '✨',
};

export type Cost = Partial<Resources>;

export function emptyResources(): Resources {
  return { stones: 0, food: 0, wood: 0, iron: 0, qi: 0 };
}

export function cityIncome(city: City, faction: FactionId): Resources {
  const m = FACTIONS[faction].income;
  const sp = city.specialty;
  return {
    stones: Math.round((20 + city.population / 50 + city.resources / 40 + (sp === 'trade' ? 30 : 0)) * m),
    food: Math.round((city.population / 9 + (sp === 'food' ? 40 : 0)) * m),
    wood: Math.round((sp === 'wood' ? 35 : 10) * m),
    iron: Math.round((sp === 'iron' ? 30 : 6) * m),
    qi: Math.round((city.spiritEnergy / 5 + (sp === 'qi' ? 12 : 0)) * m),
  };
}

export function scaleCost(cost: Cost, mult: number): Cost {
  const out: Cost = {};
  for (const k of Object.keys(cost) as ResourceKey[]) out[k] = Math.round((cost[k] ?? 0) * mult);
  return out;
}

export function canAfford(res: Resources, cost: Cost): boolean {
  return (Object.keys(cost) as ResourceKey[]).every((k) => res[k] >= (cost[k] ?? 0));
}

export function pay(res: Resources, cost: Cost) {
  for (const k of Object.keys(cost) as ResourceKey[]) res[k] -= cost[k] ?? 0;
}

export function addResources(res: Resources, gain: Partial<Resources>) {
  for (const k of Object.keys(gain) as ResourceKey[]) res[k] += gain[k] ?? 0;
}

export function formatCost(cost: Cost): string {
  return (Object.keys(cost) as ResourceKey[])
    .filter((k) => (cost[k] ?? 0) !== 0)
    .map((k) => `${RESOURCE_NAMES[k]} ${cost[k]}`)
    .join('、');
}

export function formatGain(gain: Partial<Resources>): string {
  return (Object.keys(gain) as ResourceKey[])
    .filter((k) => (gain[k] ?? 0) !== 0)
    .map((k) => `${RESOURCE_NAMES[k]} ${gain[k]! > 0 ? '+' : ''}${gain[k]}`)
    .join('、');
}

/** 回合結算：城池收入、人口成長、駐軍補充、軍糧消耗 */
export function settleFaction(state: GameState, faction: FactionId): { income: Resources; upkeep: number; deserted: number } {
  const fs = state.factions[faction];
  const income = emptyResources();
  for (const city of citiesOf(state, faction)) {
    addResources(income, cityIncome(city, faction));
    city.population = Math.round(city.population * 1.02 + 5);
    city.garrison += 6 + Math.round(city.population / 400);
    city.recruitable = 3;
  }
  addResources(fs.resources, income);

  const heroes = heroesOf(state, faction);
  const troops = heroes.reduce((s, h) => s + h.troops, 0);
  const upkeep = Math.round(troops * 0.1 * FACTIONS[faction].foodCost);
  fs.resources.food -= upkeep;

  let deserted = 0;
  if (fs.resources.food < 0) {
    // 斷糧：軍隊逃散
    for (const h of heroes) {
      const loss = Math.ceil(h.troops * 0.2);
      h.troops -= loss;
      deserted += loss;
    }
    fs.resources.food = 0;
  }
  if (fs.formationCooldown > 0) fs.formationCooldown--;
  return { income, upkeep, deserted };
}

export interface BuildOption {
  id: 'fortify' | 'expand' | 'spirit';
  name: string;
  desc: string;
  cost: Cost;
}

export function buildOptions(faction: FactionId): BuildOption[] {
  const m = FACTIONS[faction].buildCost;
  return [
    { id: 'fortify', name: '加固城防', desc: '城防 +20，守軍 +40', cost: scaleCost({ stones: 80, wood: 60, iron: 40 }, m) },
    { id: 'expand', name: '擴建城池', desc: '人口 +200，資源 +100', cost: scaleCost({ stones: 100, wood: 100 }, m) },
    { id: 'spirit', name: '聚靈陣', desc: '靈氣 +15', cost: scaleCost({ stones: 120, qi: 40 }, m) },
  ];
}

export function applyBuild(state: GameState, city: City, option: BuildOption): string {
  const fs = state.factions[state.player];
  pay(fs.resources, option.cost);
  switch (option.id) {
    case 'fortify':
      city.defense += 20;
      city.garrison += 40;
      break;
    case 'expand':
      city.population += 200;
      city.resources += 100;
      break;
    case 'spirit':
      city.spiritEnergy += 15;
      break;
  }
  return `${city.name}完成「${option.name}」：${option.desc}。`;
}

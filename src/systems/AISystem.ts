import type { City, CraftStat, GameState, General, Lord } from '../game/types';
import { freeGenerals, generalsOf } from '../game/GameState';
import { attack, craft, defense, maxHp, power } from './GeneralSystem';
import { MIN_GARRISON, SOLDIER_PRICE, beastSiegeBonus, cityToll, garrisonPower, occupyCost } from './CitySystem';
import { equipRealm } from '../data/items';
import { canUse, def, usePreroll } from './ItemSystem';
import type { BattleKind } from './BattleSystem';
import type { Offer } from './ShopSystem';
import { deathChance } from './RealmSystem';

/** 擲骰前：療傷、換裝、學功法、補兵 */
export function aiPreroll(state: GameState, lord: Lord): string[] {
  const logs: string[] = [];
  const gens = generalsOf(state, lord.id).filter((g) => g.status !== 'realm');

  // 自動裝備最好的神器、寶衣
  for (const kind of ['weapon', 'armor'] as const) {
    const pool = lord.gear.filter((e) => e.kind === kind).sort((a, b) => b.value - a.value);
    for (const e of pool) {
      const candidates = gens
        .filter((g) => g.realm >= equipRealm(e.tier) && (g[kind]?.value ?? 0) < e.value)
        .sort((a, b) => (kind === 'weapon' ? b.base.force - a.base.force : b.base.defense - a.base.defense));
      const g = candidates[0];
      if (!g) continue;
      const old = g[kind];
      g[kind] = e;
      lord.gear = lord.gear.filter((x) => x.uid !== e.uid);
      if (old) lord.gear.push(old);
      if (kind === 'armor') g.hp = Math.min(g.hp, maxHp(g));
      logs.push(`${g.name}換上「${e.name}」`);
    }
  }
  // 學功法
  for (const s of [...lord.scrolls].sort((a, b) => b.tier - a.tier)) {
    const g = gens.filter((x) => !x.technique).sort((a, b) => power(b) - power(a))[0];
    if (!g) break;
    g.technique = s;
    lord.scrolls = lord.scrolls.filter((x) => x.uid !== s.uid);
    logs.push(`${g.name}習得「${s.name}」`);
  }
  // 吃回血丹
  for (const g of gens.filter((x) => x.hp < maxHp(x) * 0.4)) {
    const pill = lord.items.find((i) => i.defId === 'heal');
    const user = pill && gens.find((u) => canUse(pill, u).ok);
    if (pill && user) logs.push(usePreroll(state, lord, pill, user, { general: g }));
  }
  // 永久增益丹藥直接吃
  for (const pill of lord.items.filter((i) => ['force', 'guard', 'breakthrough'].includes(i.defId))) {
    const user = gens.find((u) => canUse(pill, u).ok);
    const target = [...gens].sort((a, b) => power(b) - power(a))[0];
    if (user && target) logs.push(usePreroll(state, lord, pill, user, { general: target }));
  }
  // 縮地符
  const stride = lord.items.find((i) => i.defId === 'stride');
  const strideUser = stride && gens.find((u) => u.status === 'free' && canUse(stride, u).ok);
  if (stride && strideUser && Math.random() < 0.4) logs.push(usePreroll(state, lord, stride, strideUser, {}));
  // 補兵
  if (lord.soldiers < 600 && lord.stones > 8000) {
    const n = 500;
    lord.stones -= n * SOLDIER_PRICE;
    lord.soldiers += n;
    logs.push(`徵兵 ${n}`);
  }
  return logs;
}

/** 路過或停在無主城池：是否佔領 */
export function aiOccupy(state: GameState, lord: Lord, city: City): { generalId: string; soldiers: number } | null {
  const free = freeGenerals(state, lord.id);
  if (!free.length || lord.soldiers < MIN_GARRISON) return null;
  // 保留一筆備用金應付過路費
  if (lord.stones - occupyCost(city) < 8000) return null;
  // 只剩一名武將時，只為較繁榮的城池出手
  if (free.length === 1 && city.prosperity < 50) return null;
  const g = [...free].sort((a, b) => power(a) - power(b))[0];
  const soldiers = Math.max(MIN_GARRISON, Math.min(lord.soldiers - 100, Math.round(city.prosperity * 4)));
  if (soldiers < MIN_GARRISON || soldiers > lord.soldiers) return null;
  return { generalId: g.id, soldiers };
}

export interface AiBattleChoice {
  kind: BattleKind | 'pay';
  generals: General[];
}

const CRAFTS: CraftStat[] = ['alchemy', 'forging', 'talisman', 'formation'];

/** 踏入敵城：繳費或選擇最有把握的戰鬥 */
export function aiEnemyCity(state: GameState, lord: Lord, city: City): AiBattleChoice {
  const free = freeGenerals(state, lord.id).filter((g) => g.hp > maxHp(g) * 0.3);
  if (!free.length) return { kind: 'pay', generals: [] };
  const owner = state.lords[city.owner as Lord['id']];
  const defenders = defenderPool(state, city);
  const cost = cityToll(state, city);

  // 攻城：明顯優勢才打
  const team = [...free].sort((a, b) => power(b) - power(a)).slice(0, 3);
  const siegePower = team.reduce((s, g) => s + power(g), 0) + lord.soldiers + beastSiegeBonus(lord);
  if (siegePower > garrisonPower(state, city) * 1.35 && free.length >= 2) return { kind: 'siege', generals: team };

  // 單挑
  const best = [...free].sort((a, b) => duelScore(b) - duelScore(a))[0];
  const bestDef = [...defenders].sort((a, b) => duelScore(b) - duelScore(a))[0];
  if (bestDef && duelScore(best) > duelScore(bestDef) * 1.15) return { kind: 'duel', generals: [best] };

  // 技藝比試
  for (const stat of CRAFTS) {
    const me = [...free].sort((a, b) => craft(b, stat) - craft(a, stat))[0];
    const them = [...defenders].sort((a, b) => craft(b, stat) - craft(a, stat))[0];
    if (them && craft(me, stat) > craft(them, stat) * 1.25) return { kind: stat, generals: [me] };
  }
  // 付得起就付
  if (lord.stones >= cost * 2 || !owner) return { kind: 'pay', generals: [] };
  return { kind: 'pay', generals: [] };
}

function duelScore(g: General): number {
  return attack(g) * Math.sqrt(g.hp) + defense(g) * 3;
}

/** 守方可出戰的將領：駐將 + 主公身邊的將領 */
export function defenderPool(state: GameState, city: City): General[] {
  if (city.owner === 'neutral') return [];
  const pool = freeGenerals(state, city.owner);
  if (city.garrisonGeneral) pool.unshift(state.generals[city.garrisonGeneral]);
  return pool;
}

export function aiDefender(state: GameState, city: City, kind: BattleKind): General | null {
  const pool = defenderPool(state, city);
  if (!pool.length) return null;
  if (kind === 'duel') return [...pool].sort((a, b) => duelScore(b) - duelScore(a))[0];
  const stat = kind as CraftStat;
  return [...pool].sort((a, b) => craft(b, stat) - craft(a, stat))[0];
}

/** 商店：保留一筆備用金，挑一件買；將領不足時優先招募 */
export function aiShop(state: GameState, lord: Lord, offers: Offer[]): Offer | null {
  const reserve = 6000;
  const affordable = offers.filter((o) => o.price <= lord.stones - reserve);
  if (!affordable.length) return null;
  const recruits = affordable.filter((o) => o.kind === 'general');
  if (recruits.length && generalsOf(state, lord.id).length < 9) return recruits.sort((a, b) => a.price - b.price)[0];
  const want = affordable.filter((o) => {
    if (o.kind === 'beast') return !lord.beast || lord.beast.tier < o.beast.tier;
    if (o.kind === 'item') return def(o.item).category === '丹藥' || ['stride', 'truce', 'citadel'].includes(o.item.defId);
    return true;
  });
  if (!want.length || Math.random() < 0.3) return null;
  return want.sort((a, b) => b.price - a.price)[0];
}

/** 秘境：有三名以上空閒武將且風險可接受時派遣 */
export function aiRealm(state: GameState, lord: Lord): General[] | null {
  const free = freeGenerals(state, lord.id).sort((a, b) => power(b) - power(a));
  if (free.length < 3) return null;
  const team = free.length >= 4 ? free.slice(1, 4) : free.slice(0, 3);
  const risk = team.reduce((s, g) => s + deathChance(g, team), 0) / 3;
  return risk < 0.3 && Math.random() < 0.6 ? team : null;
}

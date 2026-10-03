import type { Character, GameState, MapNode } from '../game/types';
import { FACTIONS } from '../faction/Faction';
import { REALMS, realmForCultivation } from '../character/Character';
import { canAfford, pay, scaleCost, type Cost } from './EconomySystem';

export interface GainResult {
  gained: number;
  brokeThrough: boolean;
  newRealm: string;
}

/** 增加修為並自動突破。突破時提升攻防。 */
export function gainCultivation(hero: Character, amount: number): GainResult {
  const before = hero.level;
  hero.cultivation += Math.round(amount);
  const after = realmForCultivation(hero.cultivation);
  if (after > before) {
    for (let i = before; i < after; i++) {
      hero.attack += 10;
      hero.defense += 8;
      hero.loyalty = Math.min(100, hero.loyalty + 3);
    }
    hero.level = after;
  }
  return { gained: Math.round(amount), brokeThrough: after > before, newRealm: REALMS[after] };
}

export const CULTIVATE_COST: Cost = { qi: 15 };

export function pillCost(hero: Character): Cost {
  return scaleCost({ stones: 150, qi: 30 }, FACTIONS[hero.faction].pillCost);
}

function placeSpirit(state: GameState, node: MapNode): number {
  if (node.type === 'city') return state.cities[node.id].spiritEnergy;
  if (node.type === 'realm') return 90;
  if (node.tile === 'vein') return 75;
  return 30;
}

export function cultivationMultiplier(state: GameState, hero: Character): number {
  const tide = state.qiTideTurn === state.turn ? 1.3 : 1;
  return FACTIONS[hero.faction].cultivation * tide;
}

/** 閉關修煉：依所在地靈氣決定效果，並帶動弟子精進 */
export function cultivate(state: GameState, hero: Character, node: MapNode): { ok: boolean; message: string; result?: GainResult } {
  const fs = state.factions[hero.faction];
  if (!canAfford(fs.resources, CULTIVATE_COST)) return { ok: false, message: '靈氣不足，無法修煉。' };
  pay(fs.resources, CULTIVATE_COST);
  const base = 120 + placeSpirit(state, node) * 2.2;
  const amount = base * cultivationMultiplier(state, hero) * (0.9 + Math.random() * 0.2);
  const result = gainCultivation(hero, amount);

  // 弟子隨主修煉：部分弟子晉升
  let promoted = 0;
  for (let lv = fs.disciples.length - 2; lv >= 0; lv--) {
    const n = Math.floor(fs.disciples[lv] * 0.25);
    if (n > 0 && lv < hero.level) {
      fs.disciples[lv] -= n;
      fs.disciples[lv + 1] += n;
      promoted += n;
    }
  }

  let message = `${hero.name}於${node.name}閉關修煉，修為 +${result.gained}。`;
  if (state.qiTideTurn === state.turn) message += '（靈氣潮汐加持）';
  if (promoted > 0) message += ` ${promoted} 名弟子隨之精進。`;
  if (result.brokeThrough) message += ` ✦ 突破至【${result.newRealm}】！`;
  return { ok: true, message, result };
}

/** 服用丹藥：花費靈石換取大量修為 */
export function takePill(state: GameState, hero: Character): { ok: boolean; message: string; result?: GainResult } {
  const fs = state.factions[hero.faction];
  const cost = pillCost(hero);
  if (!canAfford(fs.resources, cost)) return { ok: false, message: '資源不足，無法煉丹。' };
  pay(fs.resources, cost);
  const result = gainCultivation(hero, 380 * cultivationMultiplier(state, hero));
  let message = `${hero.name}服下靈丹，修為 +${result.gained}。`;
  if (result.brokeThrough) message += ` ✦ 突破至【${result.newRealm}】！`;
  return { ok: true, message, result };
}

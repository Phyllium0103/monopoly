import type { City, FactionState, GameState } from '../game/types';
import { canAfford, pay, type Cost } from './EconomySystem';

export const DISCIPLE_POWER = [10, 25, 60, 150, 400];
export const DISCIPLE_COST: Cost = { stones: 100 };

export function discipleCount(fs: FactionState): number {
  return fs.disciples.reduce((a, b) => a + b, 0);
}

export function disciplePower(fs: FactionState): number {
  return fs.disciples.reduce((s, n, lv) => s + n * DISCIPLE_POWER[lv], 0);
}

export function recruitDisciples(state: GameState, city: City, count: number): { ok: boolean; message: string } {
  const fs = state.factions[state.player];
  const n = Math.min(count, city.recruitable);
  if (n <= 0) return { ok: false, message: `${city.name}本回合已無可招募的弟子。` };
  const cost: Cost = { stones: (DISCIPLE_COST.stones ?? 0) * n };
  if (!canAfford(fs.resources, cost)) return { ok: false, message: '靈石不足。' };
  pay(fs.resources, cost);
  city.recruitable -= n;
  fs.disciples[0] += n;
  return { ok: true, message: `於${city.name}招募練氣期弟子 ×${n}。宗門弟子共 ${discipleCount(fs)} 人。` };
}

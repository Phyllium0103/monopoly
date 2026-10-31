import type { GameState, Lord } from '../game/types';
import { recruitCost } from './CitySystem';

export const RECRUIT_BATCH = 100;
/** The same price and lord discounts as before, charged in complete 100-person batches. */
export function recruitmentMaximum(lord: Lord): number {
  const cost = recruitCost(lord.id, RECRUIT_BATCH);
  return cost > 0 ? Math.max(0, Math.floor(lord.stones / cost) * RECRUIT_BATCH) : 2000;
}

/** Authoritative location and payment check, shared by human and AI visits. */
export function recruitAtBureau(state: GameState, lord: Lord, amount: number): boolean {
  if (!lord.alive || lord.relicJourney || state.tiles[lord.position]?.kind !== 'recruitment') return false;
  if (!Number.isSafeInteger(amount) || amount < RECRUIT_BATCH || amount % RECRUIT_BATCH !== 0) return false;
  const cost = recruitCost(lord.id, amount);
  if (!Number.isFinite(cost) || cost < 0 || cost > lord.stones) return false;
  lord.stones -= cost;
  lord.soldiers += amount;
  return true;
}

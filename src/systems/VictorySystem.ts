import type { GameState, LordId } from '../game/types';
import { REALMS } from '../data/generals';
/** 只有存活的主公本人到達真仙才立即獲勝。 */
export function immortalWinner(state: GameState): LordId | null {
  for (const id of state.order) {
    if (state.lords[id].alive && Object.values(state.generals).some(g => g.owner === id && g.isLord && g.status !== 'dead' && g.realm >= REALMS.length - 1)) return id;
  }
  return null;
}

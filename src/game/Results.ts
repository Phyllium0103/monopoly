import type { GameState } from './types';
import { LORD_IDS } from '../faction/Faction';
import { totalAssets } from '../systems/CitySystem';

/** 所有模式共用：勝者優先，存活者依資產，出局者依出局名次。 */
export function resultStandings(state: GameState) {
  return LORD_IDS.filter(id => !state.lords[id].absent)
    .map(id => ({ id, a: totalAssets(state, id), l: state.lords[id] }))
    .sort((x, y) => {
      if (x.id === y.id) return 0;
      if (x.id === state.winner) return -1;
      if (y.id === state.winner) return 1;
      if (x.l.alive !== y.l.alive) return x.l.alive ? -1 : 1;
      if (!x.l.alive) return x.l.rank - y.l.rank;
      return y.a.total - x.a.total;
    });
}

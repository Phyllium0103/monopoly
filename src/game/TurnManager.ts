import type { GameState } from './types';
import { FACTION_IDS } from '../faction/Faction';
import { settleFaction } from '../systems/EconomySystem';
import { heroesOf } from './GameState';

export interface TurnSummary {
  incomeText: string;
  upkeep: number;
  deserted: number;
  gameOver: boolean;
}

/** 回合結束：所有勢力結算收入與軍糧，然後推進回合 */
export function advanceTurn(state: GameState, formatIncome: (r: ReturnType<typeof settleFaction>['income']) => string): TurnSummary {
  let summary: TurnSummary = { incomeText: '', upkeep: 0, deserted: 0, gameOver: false };
  for (const f of FACTION_IDS) {
    const r = settleFaction(state, f);
    if (f === state.player) summary = { incomeText: formatIncome(r.income), upkeep: r.upkeep, deserted: r.deserted, gameOver: false };
  }
  state.turn++;
  if (state.turn > state.maxTurns) {
    state.over = true;
    summary.gameOver = true;
  }
  for (const h of heroesOf(state, state.player)) {
    h.moved = false;
    h.acted = false;
  }
  return summary;
}

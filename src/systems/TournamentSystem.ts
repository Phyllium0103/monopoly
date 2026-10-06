import type { GameState, Lord } from '../game/types';
import { nextUid } from '../game/GameState';
import { equipDesc, makeEquipment, makeTechnique, techniqueDesc } from '../data/items';
import type { Duel, Side } from './BattleSystem';
import type { Offer } from './ShopSystem';

/** Uniform random bracket, with a bye for an odd number of surviving lords. */
export function tournamentBracket(lords: Lord[]): (Lord | null)[] {
  const bracket: (Lord | null)[] = [...lords];
  for (let i=bracket.length-1;i>0;i--) {
    const j=Math.floor(Math.random()*(i+1));
    [bracket[i],bracket[j]]=[bracket[j],bracket[i]];
  }
  if (bracket.length%2) bracket.push(null);
  return bracket;
}

/** A draw advances the higher remaining HP ratio; an exact tie uses a lottery. */
export function tournamentWinner(duel: Duel): Side {
  if (duel.winner) return duel.winner;
  const a=duel.a.hp/duel.a.maxHp,b=duel.b.hp/duel.b.maxHp;
  if (Math.abs(a-b)>1e-9) return a>b?'a':'b';
  return Math.random()<0.5?'a':'b';
}

/** Champion receives exactly one top heavenly technique, weapon or armor, equally likely. */
export function grantTournamentPrize(state: GameState,lord: Lord): Offer {
  const kind=Math.floor(Math.random()*3);
  if (kind===0) {
    const t=makeTechnique(nextUid(state,'t'),11);lord.scrolls.push(t);
    return {kind:'technique',technique:t,label:t.name,sub:techniqueDesc(t),price:0};
  }
  const e=makeEquipment(nextUid(state,'e'),kind===1?'weapon':'armor',11);lord.gear.push(e);
  return {kind:'equipment',equipment:e,label:e.name,sub:equipDesc(e),price:0};
}

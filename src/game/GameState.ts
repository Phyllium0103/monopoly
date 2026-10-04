import type { City, General, GameState, Lord, LordId } from './types';
import { BOARD } from '../data/board';
import { GENERAL_SEEDS } from '../data/generals';
import { LORDS, LORD_IDS } from '../faction/Faction';
import { maxHp } from '../systems/GeneralSystem';

export const MAX_ROUNDS = 40;
/** 開局靈石：3 上品 */
export const START_STONES = 30000;
export const START_SOLDIERS = 20000;
/** 主公身邊最多隨行武將數，其餘留在宗門 */
export const PARTY_LIMIT = 10;

export function createGameState(player: LordId): GameState {
  const cities: Record<string, City> = {};
  for (const s of BOARD.cities) {
    cities[s.id] = {
      id: s.id,
      name: s.name,
      tile: s.tile,
      owner: s.owner ?? 'neutral',
      prosperity: s.prosperity,
      capital: !!s.owner,
      garrisonGeneral: null,
      garrisonSoldiers: s.owner ? 1000 : 0,
      shieldTurns: 0,
    };
  }

  const generals: Record<string, General> = {};
  for (const g of GENERAL_SEEDS) {
    const capital = LORDS[g.origin as LordId].capital;
    const gen: General = {
      id: g.id,
      name: g.name,
      origin: g.origin,
      owner: g.start ? (g.origin as LordId) : null,
      base: { force: g.s[0], defense: g.s[1], hp: g.s[2], alchemy: g.s[3], forging: g.s[4], talisman: g.s[5], formation: g.s[6] },
      realm: g.realm,
      exp: 0,
      aptitude: g.aptitude,
      failedRound: 0,
      foundation: false,
      demon: 0,
      ward: 0,
      breakBoost: 0,
      secluded: false,
      hp: 0,
      stamina: 100,
      bonusForce: 0,
      bonusDefense: 0,
      weapon: null,
      armor: null,
      technique: null,
      status: g.garrison ? 'garrison' : 'free',
      cityId: g.garrison ? capital : null,
    };
    gen.hp = maxHp(gen);
    generals[g.id] = gen;
    if (g.garrison) cities[capital].garrisonGeneral = g.id;
  }

  // 玩家先行，其餘依序
  const start = LORD_IDS.indexOf(player);
  const order = LORD_IDS.map((_, i) => LORD_IDS[(start + i) % LORD_IDS.length]);

  const lords = {} as Record<LordId, Lord>;
  for (const id of LORD_IDS) {
    lords[id] = {
      id,
      isPlayer: id === player,
      alive: true,
      stones: START_STONES,
      soldiers: START_SOLDIERS,
      position: cities[LORDS[id].capital].tile,
      stunned: 0,
      tollFree: false,
      siegeBoost: 1,
      doubleDice: false,
      fixedDice: null,
      bonusSteps: 0,
      items: [],
      gear: [],
      scrolls: [],
      beast: null,
      expeditions: [],
      rank: 0,
    };
  }

  return {
    round: 1,
    maxRounds: MAX_ROUNDS,
    order,
    turn: 0,
    player,
    lords,
    generals,
    cities,
    tiles: BOARD.tiles,
    over: false,
    uid: 1,
    events: [],
    usedEvents: [],
    merchantTile: null,
    banditTiles: [],
    favoredElement: null,
  };
}

export function nextUid(state: GameState, prefix: string): string {
  return `${prefix}${state.uid++}`;
}

export function generalsOf(state: GameState, lord: LordId): General[] {
  return Object.values(state.generals).filter((g) => g.owner === lord && g.status !== 'dead');
}

/** 隨主公行動、可出戰的將領（最多 PARTY_LIMIT 名） */
export function freeGenerals(state: GameState, lord: LordId): General[] {
  return generalsOf(state, lord).filter((g) => g.status === 'free');
}

/** 留在宗門的將領 */
export function sectGenerals(state: GameState, lord: LordId): General[] {
  return generalsOf(state, lord).filter((g) => g.status === 'sect');
}

/** 將領回到主公麾下：隨行未滿就隨行，否則留在宗門 */
export function joinLord(state: GameState, lord: LordId, g: General) {
  g.owner = lord;
  g.cityId = null;
  g.secluded = false;
  g.status = freeGenerals(state, lord).length < PARTY_LIMIT ? 'free' : 'sect';
}

/** 武將戰死：從主公與城池除名 */
export function killGeneral(state: GameState, g: General) {
  if (g.cityId) {
    const city = state.cities[g.cityId];
    if (city && city.garrisonGeneral === g.id) city.garrisonGeneral = null;
  }
  g.status = 'dead';
  g.owner = null;
  g.cityId = null;
  g.secluded = false;
  g.hp = 0;
}

export function citiesOf(state: GameState, lord: LordId): City[] {
  return Object.values(state.cities).filter((c) => c.owner === lord);
}

export function currentLord(state: GameState): Lord {
  return state.lords[state.order[state.turn]];
}

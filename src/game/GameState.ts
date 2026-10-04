import type { City, General, GameState, Lord, LordId } from './types';
import { BOARD } from '../data/board';
import { GENERAL_SEEDS } from '../data/generals';
import { LORDS, LORD_IDS } from '../faction/Faction';
import { maxHp } from '../systems/GeneralSystem';

/** 開局可選的最大回合數；無盡模式為 null */
export const ROUND_OPTIONS = [20, 30, 40, 60, 80, 100];
export const DEFAULT_ROUNDS = 40;
/** 開局靈石：3 上品 */
export const START_STONES = 30000;
export const START_SOLDIERS = 20000;
/** 主公身邊最多隨行武將數，其餘留在宗門 */
export const PARTY_LIMIT = 10;

export function createGameState(player: LordId, maxRounds: number | null = DEFAULT_ROUNDS): GameState {
  const cities: Record<string, City> = {};
  for (const s of BOARD.cities) {
    cities[s.id] = {
      id: s.id,
      name: s.name,
      tile: s.tile,
      owner: s.owner ?? 'neutral',
      prosperity: s.prosperity,
      capital: !!s.owner,
      garrisonGenerals: [],
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
    if (g.garrison) cities[capital].garrisonGenerals.push(g.id);
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
    maxRounds,
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

/** 一座城池最多駐守的武將數 */
export const GARRISON_LIMIT = 3;

export function garrisonOf(state: GameState, city: City): General[] {
  return city.garrisonGenerals.map((id) => state.generals[id]);
}

/** 復活死去的武將：歸入主公麾下，修為歸零，血量依比例，境界可能跌落 */
export function reviveGeneral(state: GameState, lord: LordId, g: General, hpRatio = 1, realmLoss = 0) {
  g.status = 'free';
  g.exp = 0;
  g.demon = 0;
  g.ward = 0;
  g.breakBoost = 0;
  g.realm = Math.max(0, g.realm - realmLoss);
  g.hp = Math.max(1, Math.round(maxHp(g) * hpRatio));
  g.stamina = 100;
  joinLord(state, lord, g);
}

/** 武將戰死：從主公與城池除名 */
export function killGeneral(state: GameState, g: General) {
  if (g.cityId) {
    const city = state.cities[g.cityId];
    if (city) city.garrisonGenerals = city.garrisonGenerals.filter((id) => id !== g.id);
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

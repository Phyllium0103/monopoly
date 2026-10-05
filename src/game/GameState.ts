import type { City, General, GameState, Lord, LordId } from './types';
import { BOARD } from '../data/board';
import { GENERAL_SEEDS, type GeneralSeed } from '../data/generals';
import { LORDS, LORD_IDS, TRAITS } from '../faction/Faction';
import { maxHp } from '../systems/GeneralSystem';
import { bestContest } from '../systems/CitySystem';
import { createForkDirections } from '../systems/MovementSystem';

/** 開局可選的最大回合數；無盡模式為 null */
export const ROUND_OPTIONS = [20, 30, 40, 60, 80, 100];
export const DEFAULT_ROUNDS = 40;
/** 開局靈石：3 上品 */
export const START_STONES = 30000;
export const START_SOLDIERS = 20000;
/** 主公身邊最多隨行武將數，其餘留在宗門 */
export const PARTY_LIMIT = 10;

/** 每位人物建立時獨立骰靈根，三種靈根機率相同。 */
export function rollAptitude(): General['aptitude'] {
  return (['heaven', 'earth', 'pseudo'] as const)[Math.floor(Math.random() * 3)];
}

/** 由種子資料建立武將（含聽風樓與後續現身的隱藏人物） */
export function newGeneral(
  seed: { id: string; name: string; s: GeneralSeed['s']; realm: number; aptitude: General['aptitude'] },
  origin: General['origin'],
  owner: LordId | null,
  status: General['status'],
  cityId: string | null,
  isLord = false,
): General {
  const g: General = {
    id: seed.id,
    name: seed.name,
    origin,
    owner,
    isLord,
    lastOwner: null,
    base: { force: seed.s[0], defense: seed.s[1], hp: seed.s[2], alchemy: seed.s[3], forging: seed.s[4], talisman: seed.s[5], formation: seed.s[6] },
    realm: seed.realm,
    exp: 0,
    aptitude: rollAptitude(),
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
    status,
    cityId,
  };
  g.hp = maxHp(g);
  return g;
}

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
      contest: 'alchemy',
    };
  }

  const generals: Record<string, General> = {};
  const freeCount: Record<string, number> = {};
  for (const g of GENERAL_SEEDS) {
    const capital = LORDS[g.origin as LordId].capital;
    const owner = g.start ? (g.origin as LordId) : null;
    // 隨行最多 PARTY_LIMIT 人，多出來的開局放在宗門
    let status: General['status'] = 'free';
    if (g.garrison) status = 'garrison';
    else if (owner) {
      freeCount[owner] = (freeCount[owner] ?? 0) + 1;
      if (freeCount[owner] > PARTY_LIMIT) status = 'sect';
    }
    generals[g.id] = newGeneral(g, g.origin, owner, status, g.garrison ? capital : null, !!g.lord);
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
      stones: Math.round(START_STONES * (1 + (TRAITS[id].startStones ?? 0))),
      soldiers: Math.round(START_SOLDIERS * (1 + (TRAITS[id].startSoldiers ?? 0))),
      position: cities[LORDS[id].capital].tile,
      lastTile: null,
      forkExit: null,
      veinsTapped: [],
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

  const state: GameState = {
    round: 1,
    maxRounds,
    order,
    turn: 0,
    player,
    lords,
    generals,
    cities,
    tiles: BOARD.tiles,
    forkDirections: createForkDirections(BOARD.tiles),
    over: false,
    winner: null,
    uid: 1,
    events: [],
    usedEvents: [],
    merchantTile: null,
    banditTiles: [],
    favoredElement: null,
  };
  for (const city of Object.values(cities)) city.contest = bestContest(state, city);
  return state;
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

/** 可以派去駐守城池、探索秘境、被變賣的隨行武將（不含主公本人） */
export function deployable(state: GameState, lord: LordId): General[] {
  return freeGenerals(state, lord).filter((g) => !g.isLord);
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
export const GARRISON_LIMIT = 5;

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

/** 城池失去所有駐將就成為空城：守軍離開，回到主公身邊。回傳是否變成空城 */
export function abandonIfEmpty(state: GameState, cityId: string | null): boolean {
  if (!cityId) return false;
  const c = state.cities[cityId];
  if (!c || c.owner === 'neutral' || c.garrisonGenerals.length) return false;
  state.lords[c.owner].soldiers += c.garrisonSoldiers;
  c.garrisonSoldiers = 0;
  c.owner = 'neutral';
  c.shieldTurns = 0;
  return true;
}

/** 武將戰死：從主公與城池除名；若因此變成空城，回傳城池 id */
export function killGeneral(state: GameState, g: General): string | null {
  let abandoned: string | null = null;
  if (g.cityId) {
    const city = state.cities[g.cityId];
    if (city) {
      city.garrisonGenerals = city.garrisonGenerals.filter((id) => id !== g.id);
      if (abandonIfEmpty(state, g.cityId)) abandoned = g.cityId;
    }
  }
  g.status = 'dead';
  g.lastOwner = g.owner;
  g.owner = null;
  g.cityId = null;
  g.secluded = false;
  g.hp = 0;
  return abandoned;
}

export function citiesOf(state: GameState, lord: LordId): City[] {
  return Object.values(state.cities).filter((c) => c.owner === lord);
}

export function currentLord(state: GameState): Lord {
  return state.lords[state.order[state.turn]];
}

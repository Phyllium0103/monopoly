import type { City, FactionId, FactionState, GameState, Owner, Resources } from './types';
import { CITY_SEEDS } from '../world/MapData';
import { HERO_SEEDS, createCharacter } from '../character/Character';
import { FACTION_IDS } from '../faction/Faction';

export const MAX_TURNS = 30;

function startingResources(isPlayer: boolean): Resources {
  return isPlayer
    ? { stones: 500, food: 600, wood: 200, iron: 150, qi: 120 }
    : { stones: 300, food: 400, wood: 150, iron: 100, qi: 80 };
}

export function createGameState(player: FactionId): GameState {
  const cities: Record<string, City> = {};
  for (const s of CITY_SEEDS) {
    cities[s.id] = {
      id: s.id,
      name: s.name,
      owner: s.owner,
      population: s.population,
      defense: s.defense,
      garrison: s.garrison,
      resources: s.resources,
      spiritEnergy: s.spiritEnergy,
      specialty: s.specialty,
      capital: !!s.capital,
      recruitable: 3,
      position: { ...s.pos },
    };
  }

  const factions = {} as Record<FactionId, FactionState>;
  for (const id of FACTION_IDS) {
    factions[id] = {
      id,
      isPlayer: id === player,
      resources: startingResources(id === player),
      disciples: [id === player ? 5 : 3, 0, 0, 0, 0],
      formationCooldown: 0,
    };
  }

  const characters = FACTION_IDS.flatMap((f) => {
    const capital = Object.values(cities).find((c) => c.owner === f && c.capital)!;
    return HERO_SEEDS[f].map((seed) => createCharacter(seed, f, capital.id));
  });

  return {
    turn: 1,
    maxTurns: MAX_TURNS,
    player,
    factions,
    cities,
    characters,
    qiTideTurn: -1,
    over: false,
  };
}

export function citiesOf(state: GameState, owner: Owner): City[] {
  return Object.values(state.cities).filter((c) => c.owner === owner);
}

export function heroesOf(state: GameState, faction: FactionId) {
  return state.characters.filter((c) => c.faction === faction);
}

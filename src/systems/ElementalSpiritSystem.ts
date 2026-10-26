import type { Element, ElementalSpirit, GameState } from '../game/types';
import { nextUid } from '../game/GameState';

export const SPIRIT_ELEMENTS: readonly Element[] = ['metal', 'wood', 'water', 'fire', 'earth'];
export const SPIRIT_CAP = 15;
export const SPIRIT_BATCH = 3;
export const SPIRIT_ROUND_INTERVAL = 5;

/** Shared reservations for spirits, existing events, and future map objects. */
export function occupiedMapTiles(state: GameState, options: { spirits?: boolean; lords?: boolean } = {}): Set<number> {
  const occupied = new Set<number>(state.banditTiles);
  if (state.merchantTile !== null) occupied.add(state.merchantTile);
  for (const object of state.mapOccupants ?? []) for (const tile of object.tiles) occupied.add(tile);
  if (options.lords !== false) for (const lord of Object.values(state.lords)) {
    if (lord.alive && !lord.absent && !lord.relicJourney) occupied.add(lord.position);
  }
  if (options.spirits !== false) for (const spirit of state.elementalSpirits ?? []) occupied.add(spirit.tile);
  return occupied;
}

function freeRoads(state: GameState, occupied: Set<number>): number[] {
  // Building trigger cells and junction signposts already have a map purpose.
  return state.tiles.filter(t => t.kind === 'road' && t.links.length <= 2 && !occupied.has(t.index)).map(t => t.index);
}

/** No rewards, inventory changes, log, tooltip or dialog yet. */
export function collectElementalSpirits(state: GameState, tile: number): boolean {
  const before = state.elementalSpirits ?? [];
  const remaining = before.filter(spirit => spirit.tile !== tile);
  if (remaining.length === before.length) return false;
  state.elementalSpirits = remaining;
  return true;
}

/** Repair reservations when an event or a future object occupies an existing spot. */
export function reconcileElementalSpirits(state: GameState, random = Math.random): boolean {
  const before = state.elementalSpirits ?? [];
  const lordTiles = new Set(Object.values(state.lords).filter(l => l.alive && !l.absent && !l.relicJourney).map(l => l.position));
  const occupied = occupiedMapTiles(state, { spirits: false });
  const remaining: ElementalSpirit[] = [], ids = new Set<string>();
  for (const spirit of before) {
    if (remaining.length >= SPIRIT_CAP || ids.has(spirit.id) || !SPIRIT_ELEMENTS.includes(spirit.element) || lordTiles.has(spirit.tile)) continue;
    let tile = spirit.tile;
    const current = state.tiles[tile];
    if (!current || current.kind !== 'road' || current.links.length > 2 || occupied.has(tile)) {
      const candidates = freeRoads(state, occupied);
      if (!candidates.length) continue;
      tile = candidates[Math.floor(random() * candidates.length)];
    }
    remaining.push(tile === spirit.tile ? spirit : { ...spirit, tile });
    occupied.add(tile); ids.add(spirit.id);
  }
  state.elementalSpirits = remaining;
  return before.length !== remaining.length || before.some((s, i) => s.id !== remaining[i]?.id || s.tile !== remaining[i]?.tile);
}

/** After 5/10/15 completed full rounds; never catch up or refill between batches. */
export function spawnElementalSpirits(state: GameState, completedRounds = state.round - 1, random = Math.random): number {
  if (!Number.isInteger(completedRounds) || completedRounds <= 0 || completedRounds % SPIRIT_ROUND_INTERVAL !== 0 || (state.elementalSpiritSpawnRound ?? 0) >= completedRounds) return 0;
  state.elementalSpiritSpawnRound = completedRounds;
  reconcileElementalSpirits(state, random);
  const spirits = state.elementalSpirits ??= [];
  const candidates = freeRoads(state, occupiedMapTiles(state));
  const count = Math.min(SPIRIT_BATCH, SPIRIT_CAP - spirits.length, candidates.length);
  for (let i = 0; i < count; i++) {
    const tile = candidates.splice(Math.floor(random() * candidates.length), 1)[0];
    spirits.push({ id: nextUid(state, 'spirit-'), element: SPIRIT_ELEMENTS[Math.floor(random() * SPIRIT_ELEMENTS.length)], tile, bornRound: completedRounds });
  }
  return count;
}

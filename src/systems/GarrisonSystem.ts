import type { City, GameState, Lord, Tile } from '../game/types';

/** 道路最短距離；忽略箭頭的瞬時方向與傳送陣的隨機出口。 */
function distances(tiles: Tile[], start: number): number[] {
  const result = Array(tiles.length).fill(Infinity) as number[];
  result[start] = 0;
  const queue = [start];
  for (let i = 0; i < queue.length; i++) {
    for (const next of tiles[queue[i]].links) {
      if (result[next] !== Infinity) continue;
      result[next] = result[queue[i]] + 1;
      queue.push(next);
    }
  }
  return result;
}
const diameters = new WeakMap<Tile[], number>();
export function garrisonDispatch(state: GameState, lord: Lord, city: City) {
  let diameter = diameters.get(state.tiles);
  if (diameter === undefined) {
    diameter = Math.max(1, ...state.tiles.flatMap(t => distances(state.tiles, t.index).filter(Number.isFinite)));
    diameters.set(state.tiles, diameter);
  }
  const distance = distances(state.tiles, lord.position)[city.tile];
  const fee = distance === 0 ? 0 : Math.min(1000, Math.max(10, Math.round((10 + 990 * distance / diameter) / 10) * 10));
  return { distance, fee };
}

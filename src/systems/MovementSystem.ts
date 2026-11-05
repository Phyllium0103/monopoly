import type { GameState, Lord, Tile } from '../game/types';

const pick = (options: number[], random: () => number) => options[Math.floor(random() * options.length)];

/** Relative to the direction of arrival; use compass directions if there is no arrival yet. */
export function wheelDirection(tiles: Tile[], position: number, previous: number | null, destination: number): string {
  const here=tiles[position]?.pos, next=tiles[destination]?.pos, before=previous===null?null:tiles[previous]?.pos;
  if(!here||!next)return '方向未知';
  const dx=next.x-here.x,dz=next.z-here.z;
  const compass=Math.abs(dx)>=Math.abs(dz)?(dx>0?'東':'西'):(dz>0?'南':'北');
  if(!before||previous===position)return `往${compass}`;
  const fx=here.x-before.x,fz=here.z-before.z,dot=fx*dx+fz*dz,cross=fx*dz-fz*dx;
  const relative=Math.abs(dot)>Math.abs(cross)?(dot>0?'前':'後'):(cross<0?'左':'右');
  return `往${relative}（${compass}）`;
}

export function createForkDirections(tiles: Tile[], random = Math.random): Record<number, number> {
  return Object.fromEntries(tiles.filter((t) => t.links.length >= 3).map((t) => [t.index, pick(t.links, random)]));
}

/** 決定這次的出口，再替下一次路過換成不同的箭頭方向。 */
export function enterFork(state: GameState, lord: Lord, remainingSteps: number, random = Math.random): { exit: number; opposite: boolean; returning: boolean } | null {
  const tile = state.tiles[lord.position];
  if (tile.links.length < 3) return null;
  const arrow = state.forkDirections[tile.index];
  const opposite = lord.lastTile !== null && arrow === lord.lastTile;
  const returning = opposite && remainingSteps === 0;
  const exit = opposite && !returning ? pick(tile.links.filter((n) => n !== lord.lastTile), random) : arrow;
  lord.forkExit = exit;
  state.forkDirections[tile.index] = pick(tile.links.filter((n) => n !== arrow), random);
  return { exit, opposite, returning };
}

/** 道路沿原方向前进，岔路使用抵達時決定的出口。 */
export function nextMovementTile(state: GameState, lord: Lord, random = Math.random): number {
  const tile = state.tiles[lord.position];
  if(lord.lastTile===null && lord.forkExit!==null && tile.links.includes(lord.forkExit))return lord.forkExit;
  if (tile.links.length >= 3) {
    // 開局或傳送後還沒有處理這座岔路，先按當前箭頭決定出口。
    if (lord.forkExit === null) enterFork(state, lord, 1, random);
    return lord.forkExit!;
  }
  const ahead = tile.links.filter((n) => n !== lord.lastTile);
  return pick(ahead.length ? ahead : tile.links, random);
}

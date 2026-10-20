import type { LordId, Tile, TileKind } from '../game/types';
import { SELECTED_LAYOUT } from './selectedLayout';

export const CELL_SIZE = 4;
export const MAP_REVISION = 'selected-20261019-33c-47f-300r';
export const BOARD_SIDE = 280;
const origin = { x: 32.5, y: 25.5 };
export const gridPosition = (x: number, y: number) => ({ x: (x-origin.x)*CELL_SIZE, z: (y-origin.y)*CELL_SIZE });
const key = (x: number, y: number) => `${x},${y}`;
const owners: Record<string,LordId> = { xuchang:'cao', jianye:'sun', chengdu:'liu', changan:'dong' };
const kinds: Record<string,TileKind> = { secret:'realm', relic:'portal' };
const ids = new Map<string,number>(SELECTED_LAYOUT.roads.map(([x,y],i) => [key(x,y),i]));
export const BUILDING_LOTS = SELECTED_LAYOUT.objects.map(o => {
  const [x,y] = o.at;
  const frontage = o.side === 'above' ? [x,y+2] : [x-1,y];
  const tile = ids.get(key(frontage[0],frontage[1]));
  if (tile === undefined) throw new Error(`建築入口缺少道路：${o.name}`);
  const second=o.side==='above'?[x+1,y+2]:[x-1,y+1];
  const other=ids.get(key(second[0],second[1]));
  if(other===undefined)throw new Error(`建築第二入口缺少道路：${o.name}`);
  return { ...o, tile, triggerTiles:[tile,other], pos:gridPosition(x+.5,y+.5), rotation:o.side==='above'?0:-Math.PI/2 };
});
export function buildSelectedBoard() {
  const tiles: Tile[] = SELECTED_LAYOUT.roads.map(([x,y],index) => ({
    index, kind:'road', name:'道路', pos:gridPosition(x,y), cityId:null,
    links:[[x-1,y],[x+1,y],[x,y-1],[x,y+1]].map(([a,b])=>ids.get(key(a,b))).filter((v):v is number=>v!==undefined),
  }));
  // Generic categories only: roads have no individual place names.
  for(const t of tiles)if(t.links.length>=3)t.name='岔路口';
  const claimed = new Set<number>();
  const cities: {id:string;name:string;prosperity:number;owner?:LordId;tile:number}[] = [];
  for (const o of BUILDING_LOTS) {
    for(const index of o.triggerTiles){
      if(claimed.has(index))throw new Error(`建築觸發格重疊：${o.name}`);
      claimed.add(index);
      const t=tiles[index];t.kind=(kinds[o.type]??o.type) as TileKind;t.name=o.name;
      Object.assign(t,{eventAnchor:o.tile});
      if(o.type==='city')t.cityId=o.id;
    }
    if(o.type==='city') { cities.push({id:o.id,name:o.name,prosperity:o.prosperity!,owner:owners[o.id],tile:o.tile}); }
  }
  const edges: [number,number][]=[];
  for(const t of tiles) for(const n of t.links) if(n>t.index) edges.push([t.index,n]);
  return {tiles,cities,edges};
}
/** Visual progression only; economic rules continue to use the same prosperity value. */
export const cityModelLevel = (prosperity:number) => Math.max(1,Math.min(6,Math.floor((Number.isFinite(prosperity)?prosperity:0)/50)+1));

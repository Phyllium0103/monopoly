import type { FactionId, MapEdge, MapNode, TileKind } from '../game/types';
import { FACTIONS } from '../faction/Faction';
import { CITY_SEEDS, EDGE_SEEDS, REALM_SEEDS } from './MapData';

/** 決定性亂數，讓每次地圖的格子種類一致 */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const TILE_NAMES: Record<TileKind, string> = {
  road: '驛道',
  vein: '靈脈',
  market: '市集',
  danger: '兇地',
};

export class MapGraph {
  nodes = new Map<string, MapNode>();
  edges: MapEdge[] = [];
  private adj = new Map<string, { to: string; water: boolean }[]>();

  constructor() {
    for (const c of CITY_SEEDS) {
      this.addNode({ id: c.id, name: c.name, type: 'city', tile: 'road', pos: c.pos });
    }
    for (const r of REALM_SEEDS) {
      this.addNode({ id: r.id, name: r.name, type: 'realm', tile: 'road', pos: r.pos });
    }

    const rand = seeded(20260404);
    let wp = 0;
    for (const [a, b, water] of EDGE_SEEDS) {
      const na = this.nodes.get(a)!;
      const nb = this.nodes.get(b)!;
      if (water) {
        this.link(a, b, true);
        continue;
      }
      // 在較長的道路上插入格子，形成棋盤
      const len = Math.hypot(na.pos.x - nb.pos.x, na.pos.z - nb.pos.z);
      const count = Math.max(0, Math.round(len / 6) - 1);
      let prev = a;
      for (let i = 1; i <= count; i++) {
        const t = i / (count + 1);
        const r = rand();
        const tile: TileKind = r < 0.58 ? 'road' : r < 0.74 ? 'vein' : r < 0.88 ? 'market' : 'danger';
        const id = `wp${wp++}`;
        this.addNode({
          id,
          name: TILE_NAMES[tile],
          type: 'road',
          tile,
          pos: { x: na.pos.x + (nb.pos.x - na.pos.x) * t, z: na.pos.z + (nb.pos.z - na.pos.z) * t },
        });
        this.link(prev, id, false);
        prev = id;
      }
      this.link(prev, b, false);
    }
  }

  private addNode(n: MapNode) {
    this.nodes.set(n.id, n);
    this.adj.set(n.id, []);
  }

  private link(a: string, b: string, water: boolean) {
    this.edges.push({ a, b, water });
    this.adj.get(a)!.push({ to: b, water });
    this.adj.get(b)!.push({ to: a, water });
  }

  node(id: string): MapNode {
    return this.nodes.get(id)!;
  }

  neighbors(id: string) {
    return this.adj.get(id) ?? [];
  }

  /** 以擲骰步數計算可抵達的節點（Dijkstra，水路成本依勢力不同） */
  reachable(start: string, steps: number, faction: FactionId): Map<string, { cost: number; prev: string | null }> {
    const waterCost = FACTIONS[faction].waterCost;
    const best = new Map<string, { cost: number; prev: string | null }>();
    best.set(start, { cost: 0, prev: null });
    const open: string[] = [start];
    while (open.length) {
      open.sort((x, y) => best.get(x)!.cost - best.get(y)!.cost);
      const cur = open.shift()!;
      const curCost = best.get(cur)!.cost;
      for (const e of this.neighbors(cur)) {
        const c = curCost + (e.water ? waterCost : 1);
        if (c > steps) continue;
        const old = best.get(e.to);
        if (!old || c < old.cost) {
          best.set(e.to, { cost: c, prev: cur });
          if (!open.includes(e.to)) open.push(e.to);
        }
      }
    }
    return best;
  }

  pathTo(table: Map<string, { cost: number; prev: string | null }>, target: string): string[] {
    const path: string[] = [];
    let cur: string | null = target;
    while (cur) {
      path.unshift(cur);
      cur = table.get(cur)?.prev ?? null;
    }
    return path;
  }

  /** 無步數限制的最短路徑 */
  shortestPath(from: string, to: string, faction: FactionId): string[] {
    const table = this.reachable(from, 999, faction);
    return table.has(to) ? this.pathTo(table, to) : [from];
  }

  /** 經由道路（不經過其他城池）相鄰的城池 */
  adjacentCities(cityId: string): string[] {
    const result = new Set<string>();
    const seen = new Set<string>([cityId]);
    const stack = [cityId];
    while (stack.length) {
      const cur = stack.pop()!;
      for (const e of this.neighbors(cur)) {
        if (seen.has(e.to)) continue;
        seen.add(e.to);
        const n = this.node(e.to);
        if (n.type === 'city') result.add(n.id);
        else stack.push(n.id);
      }
    }
    return [...result];
  }
}

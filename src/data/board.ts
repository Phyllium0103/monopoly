import type { LordId, Tile, TileKind, Vec2 } from '../game/types';

interface CityEntry {
  kind: 'city';
  id: string;
  name: string;
  pos: Vec2;
  prosperity: number;
  owner?: LordId;
}
interface SpecialEntry {
  kind: Exclude<TileKind, 'city' | 'road'>;
  name: string;
}
type Entry = CityEntry | SpecialEntry;

const c = (id: string, name: string, x: number, z: number, prosperity: number, owner?: LordId): CityEntry => ({ kind: 'city', id, name, pos: { x, z }, prosperity, owner });
const s = (kind: SpecialEntry['kind'], name: string): SpecialEntry => ({ kind, name });

/** 環狀跑道，順時針排列。特殊建築放在前後兩城之間。 */
const RING: Entry[] = [
  c('luoyang', '洛陽', 0, -14, 90),
  s('tavern', '聽風樓'),
  c('henei', '河內', 4, -25, 50),
  c('jinyang', '晉陽', -6, -37, 55),
  s('realm', '太行洞天'),
  c('ye', '鄴城', 14, -31, 80),
  s('herb', '百草堂'),
  c('ji', '薊城', 24, -44, 55),
  c('beiping', '北平', 38, -42, 45),
  s('forge', '天工坊'),
  c('nanpi', '南皮', 34, -31, 50),
  c('pingyuan', '平原', 42, -20, 45),
  c('beihai', '北海', 52, -14, 55),
  s('library', '藏經閣'),
  c('xiapi', '下邳', 46, -3, 65),
  c('xiaopei', '小沛', 32, -9, 45),
  s('treasure', '天寶商行'),
  c('puyang', '濮陽', 22, -18, 55),
  c('chenliu', '陳留', 14, -11, 60),
  c('xuchang', '許昌', 12, -1, 100, 'cao'),
  s('beast', '萬獸園'),
  c('runan', '汝南', 20, 7, 55),
  c('shouchun', '壽春', 32, 4, 65),
  c('hefei', '合肥', 30, 14, 60),
  c('jianye', '建業', 42, 19, 100, 'sun'),
  s('tavern', '聽風樓'),
  c('wujun', '吳郡', 48, 30, 70),
  s('realm', '東海仙島'),
  c('kuaiji', '會稽', 42, 41, 55),
  s('herb', '百草堂'),
  c('chaisang', '柴桑', 22, 25, 60),
  c('guiyang', '桂陽', 12, 45, 40),
  c('changsha', '長沙', 4, 36, 60),
  s('forge', '天工坊'),
  c('lingling', '零陵', -6, 47, 40),
  c('wuling', '武陵', -16, 37, 45),
  c('jianning', '建寧', -32, 43, 40),
  s('realm', '峨眉金頂'),
  c('chengdu', '成都', -40, 21, 100, 'liu'),
  s('library', '藏經閣'),
  c('jiangzhou', '江州', -24, 23, 55),
  c('jiangling', '江陵', -8, 22, 70),
  c('xiangyang', '襄陽', -6, 11, 80),
  s('treasure', '天寶商行'),
  c('wancheng', '宛城', 0, 2, 60),
  c('hanzhong', '漢中', -26, -2, 65),
  s('beast', '萬獸園'),
  c('tianshui', '天水', -38, -13, 50),
  c('wuwei', '武威', -48, -30, 45),
  c('changan', '長安', -20, -13, 100, 'dong'),
];

export interface CitySeed {
  id: string;
  name: string;
  prosperity: number;
  owner?: LordId;
  tile: number;
}

function buildBoard() {
  // 先算出主要節點座標，特殊建築平均分布在前後兩城之間
  const positions: Vec2[] = RING.map((e) => (e.kind === 'city' ? e.pos : { x: 0, z: 0 }));
  const n = RING.length;
  for (let i = 0; i < n; i++) {
    const e = RING[i];
    if (e.kind === 'city') continue;
    let a = i - 1;
    while (RING[(a + n) % n].kind !== 'city') a--;
    let b = i + 1;
    while (RING[b % n].kind !== 'city') b++;
    const pa = positions[(a + n) % n];
    const pb = positions[b % n];
    const t = (i - a) / (b - a);
    positions[i] = { x: pa.x + (pb.x - pa.x) * t, z: pa.z + (pb.z - pa.z) * t };
  }

  const tiles: Tile[] = [];
  const cities: CitySeed[] = [];
  for (let i = 0; i < n; i++) {
    const e = RING[i];
    const p = positions[i];
    const pushTile = (kind: TileKind, name: string, pos: Vec2, cityId: string | null) => {
      tiles.push({ index: tiles.length, kind, name, pos, cityId });
      return tiles.length - 1;
    };
    if (e.kind === 'city') {
      const idx = pushTile('city', e.name, p, e.id);
      cities.push({ id: e.id, name: e.name, prosperity: e.prosperity, owner: e.owner, tile: idx });
    } else {
      pushTile(e.kind, e.name, p, null);
    }
    // 長路段補上道路格
    const next = positions[(i + 1) % n];
    const gap = Math.hypot(next.x - p.x, next.z - p.z);
    const roads = Math.floor(gap / 9);
    for (let r = 1; r <= roads; r++) {
      const t = r / (roads + 1);
      pushTile('road', '驛道', { x: p.x + (next.x - p.x) * t, z: p.z + (next.z - p.z) * t }, null);
    }
  }
  return { tiles, cities };
}

export const BOARD = buildBoard();

export const TILE_INFO: Record<TileKind, { icon: string; desc: string }> = {
  city: { icon: '🏯', desc: '城池：路過可佔領；踏入他人城池需繳過路費或開戰' },
  realm: { icon: '🌀', desc: '秘境：派遣三名武將探索五回合，可能隕落，歸來帶回寶物' },
  treasure: { icon: '💰', desc: '天寶商行：販售法器、陣法、符籙' },
  herb: { icon: '🌿', desc: '百草堂：販售各種丹藥' },
  forge: { icon: '🔨', desc: '天工坊：販售神器、寶衣' },
  library: { icon: '📜', desc: '藏經閣：販售功法' },
  beast: { icon: '🐉', desc: '萬獸園：販售靈獸，每位主公限一隻' },
  tavern: { icon: '🏮', desc: '聽風樓：招募各國尚未出仕的將領' },
  road: { icon: '🛤️', desc: '驛道：可能遇到奇遇' },
};

/** 長江 */
export const YANGTZE: Vec2[] = [
  { x: -60, z: 23 },
  { x: -48, z: 25 },
  { x: -34, z: 27 },
  { x: -20, z: 28 },
  { x: -8, z: 28 },
  { x: 4, z: 30.5 },
  { x: 14, z: 31 },
  { x: 24, z: 30 },
  { x: 34, z: 26 },
  { x: 44, z: 24.5 },
  { x: 54, z: 23.5 },
  { x: 66, z: 23 },
];

/** 黃河 */
export const YELLOW_RIVER: Vec2[] = [
  { x: -60, z: -20 },
  { x: -46, z: -20 },
  { x: -30, z: -19.5 },
  { x: -14, z: -19 },
  { x: 0, z: -19 },
  { x: 10, z: -20 },
  { x: 18, z: -23 },
  { x: 28, z: -25.5 },
  { x: 38, z: -26 },
  { x: 48, z: -25 },
  { x: 66, z: -24 },
];

export const MOUNTAIN_RANGES: { center: Vec2; spread: Vec2; count: number; height: number }[] = [
  { center: { x: -34, z: 8 }, spread: { x: 8, z: 6 }, count: 16, height: 7 }, // 秦嶺蜀道
  { center: { x: -52, z: 0 }, spread: { x: 5, z: 18 }, count: 16, height: 8 }, // 西陲
  { center: { x: 2, z: -40 }, spread: { x: 6, z: 4 }, count: 10, height: 6 }, // 太行
  { center: { x: -14, z: -2 }, spread: { x: 5, z: 4 }, count: 8, height: 4.5 }, // 伏牛
  { center: { x: -28, z: 33 }, spread: { x: 5, z: 4 }, count: 10, height: 5 }, // 巫山
  { center: { x: 26, z: 44 }, spread: { x: 8, z: 3 }, count: 10, height: 4 }, // 南嶺
  { center: { x: -50, z: 38 }, spread: { x: 5, z: 8 }, count: 10, height: 6.5 },
  { center: { x: 4, z: -50 }, spread: { x: 16, z: 3 }, count: 12, height: 5 },
];

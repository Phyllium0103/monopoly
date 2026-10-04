import type { LordId, Tile, TileKind, Vec2 } from '../game/types';

type SpecialKind = Exclude<TileKind, 'city'>;

interface NodeDef {
  id: string;
  kind: TileKind;
  name: string;
  pos: Vec2;
  prosperity?: number;
  owner?: LordId;
}

/** 路上順手放的建築或驛站，位置在前後兩個定點之間平均分布 */
interface Spec {
  kind: SpecialKind;
  name: string;
}
type PathItem = string | Spec;

const city = (id: string, name: string, x: number, z: number, prosperity: number, owner?: LordId): NodeDef => ({ id, kind: 'city', name, pos: { x, z }, prosperity, owner });
const road = (name: string): Spec => ({ kind: 'road', name });
const realm = (name: string): Spec => ({ kind: 'realm', name });
const portal = (): Spec => ({ kind: 'portal', name: '傳送陣' });
const shop = (kind: Exclude<SpecialKind, 'road' | 'realm' | 'portal'>, name: string): Spec => ({ kind, name });

/**
 * 城池：依真實地理座標（東為 +x、南為 +z）。繁榮度依東漢末年的實際盛衰，每座都不同：
 * 洛陽、成都、許都、建業、長安為天下名都；北平、武威、建寧等邊遠之地最為荒涼。
 */
const CITIES: NodeDef[] = [
  city('luoyang', '洛陽', 0, -14, 108),
  city('henei', '河內', 4, -25, 54),
  city('jinyang', '晉陽', -6, -37, 52),
  city('ye', '鄴城', 14, -31, 88),
  city('ji', '薊城', 24, -44, 44),
  city('beiping', '北平', 38, -42, 36),
  city('nanpi', '南皮', 34, -31, 56),
  city('pingyuan', '平原', 42, -20, 46),
  city('beihai', '北海', 52, -14, 62),
  city('xiapi', '下邳', 46, -3, 74),
  city('xiaopei', '小沛', 32, -9, 51),
  city('puyang', '濮陽', 22, -18, 58),
  city('chenliu', '陳留', 14, -11, 70),
  city('xuchang', '許昌', 12, -1, 96, 'cao'),
  city('runan', '汝南', 20, 7, 57),
  city('shouchun', '壽春', 32, 4, 76),
  city('hefei', '合肥', 30, 14, 64),
  city('jianye', '建業', 42, 19, 94, 'sun'),
  city('wujun', '吳郡', 48, 30, 82),
  city('kuaiji', '會稽', 42, 41, 66),
  city('chaisang', '柴桑', 22, 25, 50),
  city('guiyang', '桂陽', 12, 45, 38),
  city('changsha', '長沙', 4, 36, 68),
  city('lingling', '零陵', -6, 47, 40),
  city('wuling', '武陵', -16, 37, 37),
  city('jianning', '建寧', -32, 43, 33),
  city('chengdu', '成都', -40, 21, 100, 'liu'),
  city('jiangzhou', '江州', -24, 23, 45),
  city('jiangling', '江陵', -8, 22, 72),
  city('xiangyang', '襄陽', -6, 11, 80),
  city('wancheng', '宛城', 0, 2, 61),
  city('hanzhong', '漢中', -26, -2, 49),
  city('tianshui', '天水', -38, -13, 42),
  city('wuwei', '武威', -48, -30, 30),
  city('changan', '長安', -20, -13, 92, 'dong'),
];

/** 道路：每條由定點串到定點，中間的驛站、關隘與商店依序平均分布 */
const PATHS: PathItem[][] = [
  // 中原：洛陽居天下之中，四通八達
  ['luoyang', road('孟津'), 'henei'],
  ['luoyang', road('函谷關'), realm('華山仙境'), 'changan'],
  ['luoyang', shop('library', '藏經閣'), 'wancheng'],
  ['luoyang', road('虎牢關'), 'chenliu'],
  ['chenliu', 'xuchang'],
  ['chenliu', road('官渡'), 'puyang'],
  ['chenliu', shop('tavern', '聽風樓'), 'xiaopei'],
  ['xuchang', shop('beast', '萬獸園'), 'runan'],
  ['xuchang', shop('herb', '百草堂'), 'wancheng'],
  ['runan', shop('treasure', '天寶商行'), 'shouchun'],
  // 河北
  ['henei', road('壺關'), 'jinyang'],
  ['henei', shop('tavern', '聽風樓'), 'ye'],
  ['jinyang', realm('太行洞天'), 'ye'],
  ['ye', road('館陶'), shop('treasure', '天寶商行'), 'nanpi'],
  ['ye', road('白馬津'), shop('herb', '百草堂'), 'puyang'],
  ['nanpi', road('安平'), 'pingyuan'],
  ['nanpi', road('易京'), 'ji'],
  ['ji', road('居庸關'), portal(), 'beiping'],
  ['beiping', shop('forge', '天工坊'), 'nanpi'],
  // 山東、徐州
  ['puyang', road('濟陰'), 'xiaopei'],
  ['puyang', road('東平'), shop('forge', '天工坊'), 'pingyuan'],
  ['pingyuan', road('臨淄'), 'beihai'],
  ['beihai', shop('library', '藏經閣'), 'xiapi'],
  ['xiaopei', realm('泰山福地'), 'xiapi'],
  ['shouchun', road('淮北'), 'xiaopei'],
  // 淮南、江東
  ['shouchun', 'hefei'],
  ['hefei', road('濡須口'), 'jianye'],
  ['hefei', road('廬江'), 'chaisang'],
  ['jianye', road('廣陵'), shop('herb', '百草堂'), 'xiapi'],
  ['jianye', road('牛渚'), realm('廬山幽谷'), 'chaisang'],
  ['jianye', shop('tavern', '聽風樓'), 'wujun'],
  ['wujun', realm('東海仙島'), 'kuaiji'],
  ['kuaiji', portal(), road('鄱陽'), shop('herb', '百草堂'), road('豫章'), 'guiyang'],
  // 荊楚、江南
  ['chaisang', road('赤壁'), road('烏林'), road('巴丘'), 'jiangling'],
  ['chaisang', road('湘江'), 'changsha'],
  ['changsha', road('耒陽'), 'guiyang'],
  ['guiyang', shop('beast', '萬獸園'), road('桂水'), 'lingling'],
  ['changsha', shop('forge', '天工坊'), 'lingling'],
  ['changsha', road('洞庭'), road('沅水'), 'wuling'],
  ['lingling', road('零陵道'), 'wuling'],
  ['wuling', road('公安'), 'jiangling'],
  ['jiangling', road('長阪坡'), 'xiangyang'],
  ['wancheng', road('新野'), 'xiangyang'],
  // 巴蜀、漢中
  ['wuling', road('牂牁'), shop('treasure', '天寶商行'), 'jianning'],
  ['jianning', road('瀘水'), portal(), realm('峨眉金頂'), 'chengdu'],
  ['chengdu', shop('library', '藏經閣'), 'jiangzhou'],
  ['jiangzhou', road('夷陵'), 'jiangling'],
  ['chengdu', road('劍閣'), road('葭萌關'), road('陽平關'), 'hanzhong'],
  ['hanzhong', road('子午谷'), 'changan'],
  ['hanzhong', road('房陵'), road('上庸'), 'xiangyang'],
  // 關中、涼州
  ['hanzhong', shop('beast', '萬獸園'), road('祁山'), 'tianshui'],
  ['changan', road('街亭'), shop('tavern', '聽風樓'), 'tianshui'],
  ['tianshui', road('隴西'), portal(), 'wuwei'],
  ['wuwei', road('張掖'), road('酒泉'), 'changan'],
];

export interface CitySeed {
  id: string;
  name: string;
  prosperity: number;
  owner?: LordId;
  tile: number;
}

function buildBoard() {
  const tiles: Tile[] = [];
  const cities: CitySeed[] = [];
  const edges: [number, number][] = [];
  const indexOf = new Map<string, number>();

  const addTile = (kind: TileKind, name: string, pos: Vec2, cityId: string | null) => {
    tiles.push({ index: tiles.length, kind, name, pos, cityId, links: [] });
    return tiles.length - 1;
  };
  const link = (a: number, b: number) => {
    if (a === b || tiles[a].links.includes(b)) return;
    tiles[a].links.push(b);
    tiles[b].links.push(a);
    edges.push([a, b]);
  };

  for (const c of CITIES) {
    const idx = addTile('city', c.name, c.pos, c.id);
    indexOf.set(c.id, idx);
    cities.push({ id: c.id, name: c.name, prosperity: c.prosperity!, owner: c.owner, tile: idx });
  }

  const posOf = (id: string) => tiles[indexOf.get(id)!].pos;
  for (const path of PATHS) {
    // 定點之間的驛站平均分布在直線上
    let prev = -1;
    let anchorPos: Vec2 | null = null;
    let pending: Spec[] = [];
    for (const item of path) {
      if (typeof item !== 'string') {
        pending.push(item);
        continue;
      }
      const idx = indexOf.get(item);
      if (idx === undefined) throw new Error(`未知的地點：${item}`);
      const end = posOf(item);
      if (prev >= 0 && anchorPos) {
        let last = prev;
        pending.forEach((spec, i) => {
          const t = (i + 1) / (pending.length + 1);
          const p = { x: anchorPos!.x + (end.x - anchorPos!.x) * t, z: anchorPos!.z + (end.z - anchorPos!.z) * t };
          const mid = addTile(spec.kind, spec.name, p, null);
          link(last, mid);
          last = mid;
        });
        link(last, idx);
      }
      prev = idx;
      anchorPos = end;
      pending = [];
    }
  }
  return { tiles, cities, edges };
}

export const BOARD = buildBoard();

export const TILE_INFO: Record<TileKind, { icon: string; desc: string }> = {
  city: { icon: '🏯', desc: '城池：停在無主城池可佔領；踏入他人城池需繳過路費或開戰' },
  realm: { icon: '🌀', desc: '秘境：位於要道之上，只有六處。難度每次隨機（簡單／中等／困難），可選擇派遣人數探索，難度越高越危險，獎勵也越好' },
  treasure: { icon: '💰', desc: '天寶商行：販售法器、陣法、符籙' },
  herb: { icon: '🌿', desc: '百草堂：販售各種丹藥' },
  forge: { icon: '🔨', desc: '天工坊：販售神器、寶衣' },
  library: { icon: '📜', desc: '藏經閣：販售功法' },
  beast: { icon: '🐉', desc: '萬獸園：販售靈獸，每位主公限一隻' },
  tavern: { icon: '🏮', desc: '聽風樓：招募各國尚未出仕的將領' },
  portal: { icon: '🌌', desc: '傳送陣：位於四個角落的路上，踩到會被隨機傳送到地圖上的另一格' },
  road: { icon: '🛤️', desc: '驛道：可能遇到奇遇。遇到岔路口時會隨機轉向' },
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

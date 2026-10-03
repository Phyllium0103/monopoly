import type { Owner, Specialty, Vec2 } from '../game/types';

export interface CitySeed {
  id: string;
  name: string;
  owner: Owner;
  pos: Vec2;
  population: number;
  defense: number;
  garrison: number;
  resources: number;
  spiritEnergy: number;
  specialty: Specialty;
  capital?: boolean;
}

/** x 向東、z 向南。整張地圖約 100 x 80。 */
export const CITY_SEEDS: CitySeed[] = [
  // 晉：西北與中原之間
  { id: 'changan', name: '長安', owner: 'jin', pos: { x: -20, z: -12 }, population: 1400, defense: 90, garrison: 320, resources: 600, spiritEnergy: 70, specialty: 'qi', capital: true },
  { id: 'hedong', name: '河東', owner: 'jin', pos: { x: -8, z: -24 }, population: 900, defense: 60, garrison: 140, resources: 400, spiritEnergy: 50, specialty: 'iron' },
  { id: 'tianshui', name: '天水', owner: 'jin', pos: { x: -36, z: -16 }, population: 700, defense: 55, garrison: 120, resources: 300, spiritEnergy: 55, specialty: 'food' },
  // 魏：東北
  { id: 'yecheng', name: '鄴城', owner: 'wei', pos: { x: 14, z: -28 }, population: 1500, defense: 100, garrison: 340, resources: 650, spiritEnergy: 55, specialty: 'iron', capital: true },
  { id: 'puyang', name: '濮陽', owner: 'wei', pos: { x: 30, z: -20 }, population: 900, defense: 60, garrison: 140, resources: 400, spiritEnergy: 40, specialty: 'food' },
  { id: 'xuchang', name: '許昌', owner: 'wei', pos: { x: 16, z: -10 }, population: 1100, defense: 70, garrison: 160, resources: 500, spiritEnergy: 45, specialty: 'trade' },
  // 中原
  { id: 'luocheng', name: '洛城', owner: 'neutral', pos: { x: -2, z: -8 }, population: 1000, defense: 80, garrison: 120, resources: 500, spiritEnergy: 60, specialty: 'trade' },
  { id: 'wancheng', name: '宛城', owner: 'neutral', pos: { x: 0, z: 6 }, population: 800, defense: 50, garrison: 60, resources: 350, spiritEnergy: 45, specialty: 'food' },
  { id: 'runan', name: '汝南', owner: 'neutral', pos: { x: 16, z: 6 }, population: 750, defense: 45, garrison: 55, resources: 300, spiritEnergy: 40, specialty: 'food' },
  { id: 'shouchun', name: '壽春', owner: 'neutral', pos: { x: 32, z: 2 }, population: 850, defense: 55, garrison: 70, resources: 380, spiritEnergy: 45, specialty: 'trade' },
  { id: 'hefei', name: '合肥', owner: 'neutral', pos: { x: 26, z: 14 }, population: 700, defense: 65, garrison: 80, resources: 300, spiritEnergy: 40, specialty: 'iron' },
  { id: 'xiangyang', name: '襄陽', owner: 'neutral', pos: { x: -8, z: 14 }, population: 900, defense: 70, garrison: 90, resources: 420, spiritEnergy: 55, specialty: 'wood' },
  // 蜀：西南
  { id: 'hanzhong', name: '漢中', owner: 'shu', pos: { x: -30, z: 0 }, population: 800, defense: 70, garrison: 140, resources: 380, spiritEnergy: 65, specialty: 'wood' },
  { id: 'chengdu', name: '成都', owner: 'shu', pos: { x: -38, z: 18 }, population: 1400, defense: 90, garrison: 300, resources: 620, spiritEnergy: 80, specialty: 'qi', capital: true },
  { id: 'jiangzhou', name: '江州', owner: 'shu', pos: { x: -24, z: 24 }, population: 800, defense: 55, garrison: 130, resources: 360, spiritEnergy: 55, specialty: 'food' },
  // 荊南
  { id: 'jiangling', name: '江陵', owner: 'neutral', pos: { x: -10, z: 25 }, population: 850, defense: 60, garrison: 75, resources: 380, spiritEnergy: 50, specialty: 'wood' },
  { id: 'wuling', name: '武陵', owner: 'neutral', pos: { x: -20, z: 36 }, population: 600, defense: 40, garrison: 45, resources: 260, spiritEnergy: 60, specialty: 'qi' },
  { id: 'changsha', name: '長沙', owner: 'neutral', pos: { x: -2, z: 36 }, population: 750, defense: 50, garrison: 60, resources: 320, spiritEnergy: 50, specialty: 'food' },
  // 吳：東南
  { id: 'chaisang', name: '柴桑', owner: 'wu', pos: { x: 12, z: 25 }, population: 850, defense: 60, garrison: 140, resources: 420, spiritEnergy: 50, specialty: 'trade' },
  { id: 'jianye', name: '建業', owner: 'wu', pos: { x: 34, z: 24 }, population: 1500, defense: 90, garrison: 320, resources: 680, spiritEnergy: 60, specialty: 'trade', capital: true },
  { id: 'wujun', name: '吳郡', owner: 'wu', pos: { x: 38, z: 34 }, population: 950, defense: 60, garrison: 130, resources: 450, spiritEnergy: 50, specialty: 'food' },
  { id: 'kuaiji', name: '會稽', owner: 'neutral', pos: { x: 26, z: 40 }, population: 650, defense: 45, garrison: 50, resources: 280, spiritEnergy: 55, specialty: 'qi' },
];

export interface RealmSeed {
  id: string;
  name: string;
  pos: Vec2;
}

/** 秘境 */
export const REALM_SEEDS: RealmSeed[] = [
  { id: 'kunlun', name: '崑崙遺跡', pos: { x: -42, z: -30 } },
  { id: 'taishan', name: '泰山洞府', pos: { x: 42, z: -8 } },
  { id: 'yunmeng', name: '雲夢澤', pos: { x: 2, z: 20 } },
  { id: 'nanjiang', name: '南疆古林', pos: { x: -36, z: 38 } },
];

/** [a, b, 水路?] */
export const EDGE_SEEDS: [string, string, boolean?][] = [
  ['tianshui', 'changan'],
  ['tianshui', 'hanzhong'],
  ['tianshui', 'kunlun'],
  ['changan', 'hedong'],
  ['changan', 'luocheng'],
  ['changan', 'hanzhong'],
  ['hedong', 'yecheng'],
  ['hedong', 'luocheng'],
  ['yecheng', 'puyang'],
  ['yecheng', 'xuchang'],
  ['puyang', 'taishan'],
  ['taishan', 'shouchun'],
  ['puyang', 'xuchang'],
  ['xuchang', 'luocheng'],
  ['xuchang', 'runan'],
  ['luocheng', 'wancheng'],
  ['wancheng', 'runan'],
  ['wancheng', 'xiangyang'],
  ['runan', 'shouchun'],
  ['runan', 'hefei'],
  ['shouchun', 'hefei'],
  ['hefei', 'jianye'],
  ['hanzhong', 'chengdu'],
  ['hanzhong', 'xiangyang'],
  ['chengdu', 'jiangzhou'],
  ['chengdu', 'nanjiang'],
  ['nanjiang', 'wuling'],
  ['jiangzhou', 'wuling'],
  ['xiangyang', 'jiangling'],
  ['xiangyang', 'yunmeng'],
  ['jiangling', 'yunmeng'],
  ['yunmeng', 'chaisang'],
  ['jiangling', 'changsha'],
  ['wuling', 'changsha'],
  ['changsha', 'chaisang'],
  ['chaisang', 'hefei'],
  ['jianye', 'wujun'],
  ['wujun', 'kuaiji'],
  ['chaisang', 'kuaiji'],
  // 長江水路
  ['jiangzhou', 'jiangling', true],
  ['jiangling', 'chaisang', true],
  ['chaisang', 'jianye', true],
];

/** 長江 */
export const YANGTZE: Vec2[] = [
  { x: -52, z: 20 },
  { x: -38, z: 22 },
  { x: -24, z: 27 },
  { x: -10, z: 28.5 },
  { x: 2, z: 29 },
  { x: 12, z: 28.5 },
  { x: 24, z: 27 },
  { x: 34, z: 27.5 },
  { x: 46, z: 26 },
  { x: 56, z: 25 },
];

/** 黃河 */
export const YELLOW_RIVER: Vec2[] = [
  { x: -52, z: -22 },
  { x: -40, z: -22 },
  { x: -26, z: -19 },
  { x: -14, z: -16 },
  { x: -2, z: -17 },
  { x: 8, z: -19 },
  { x: 22, z: -15 },
  { x: 36, z: -14 },
  { x: 46, z: -13 },
  { x: 56, z: -12 },
];

/** 山脈：中心、半徑、數量 */
export const MOUNTAIN_RANGES: { center: Vec2; spread: Vec2; count: number; height: number }[] = [
  { center: { x: -36, z: 6 }, spread: { x: 8, z: 5 }, count: 16, height: 7 }, // 秦嶺蜀道
  { center: { x: -46, z: -4 }, spread: { x: 5, z: 14 }, count: 14, height: 8 }, // 西陲
  { center: { x: 2, z: -34 }, spread: { x: 6, z: 4 }, count: 10, height: 6 }, // 太行
  { center: { x: -14, z: -2 }, spread: { x: 5, z: 3 }, count: 8, height: 4.5 }, // 伏牛
  { center: { x: -30, z: 32 }, spread: { x: 5, z: 4 }, count: 10, height: 5 }, // 巫山
  { center: { x: 10, z: 42 }, spread: { x: 10, z: 3 }, count: 12, height: 4 }, // 南嶺
  { center: { x: -48, z: 32 }, spread: { x: 4, z: 8 }, count: 10, height: 6.5 },
];

import type { City } from '../game/types';

export type TerrainId = 'plains' | 'mountain' | 'plateau' | 'desert' | 'basin' | 'waterland' | 'coast' | 'hills' | 'frontier';

export interface TerrainDef {
  name: string;
  icon: string;
  /** 以下皆為加成比例，例如 0.2 = +20% */
  stones: number;
  soldiers: number;
  defense: number;
  /** 駐守武將的城池靈氣修為 */
  spirit: number;
  /** 每回合繁榮成長的增減（基本 +2） */
  growth: number;
  desc: string;
}

export const TERRAIN: Record<TerrainId, TerrainDef> = {
  plains: { name: '平原', icon: '🌾', stones: 0.2, soldiers: 0.2, defense: -0.15, spirit: 0, growth: 1, desc: '沃野千里，物產豐饒、人丁興旺，但無險可守' },
  mountain: { name: '山地', icon: '⛰️', stones: -0.25, soldiers: -0.1, defense: 0.4, spirit: 0.4, growth: -1, desc: '崇山峻嶺，易守難攻，洞天福地靈氣充沛，但交通不便' },
  plateau: { name: '高原', icon: '🏔️', stones: -0.2, soldiers: 0.3, defense: 0.15, spirit: 0.1, growth: -1, desc: '地勢高寒，民風剽悍，善出健兒' },
  desert: { name: '沙漠', icon: '🏜️', stones: -0.35, soldiers: 0.25, defense: 0.1, spirit: -0.2, growth: -1, desc: '黃沙戈壁，物產貧瘠、靈氣稀薄，卻是精騎之鄉' },
  basin: { name: '盆地', icon: '🏞️', stones: 0.25, soldiers: 0, defense: 0.2, spirit: 0.1, growth: 1, desc: '四塞之地，富庶且有天險屏障' },
  waterland: { name: '水鄉', icon: '🛶', stones: 0.35, soldiers: -0.2, defense: -0.1, spirit: 0.1, growth: 1, desc: '江河縱橫，商旅雲集，富甲一方，但不善陸戰' },
  coast: { name: '濱海', icon: '🌊', stones: 0.2, soldiers: -0.1, defense: -0.1, spirit: 0.2, growth: 0, desc: '魚鹽之利，海外仙氣東來' },
  hills: { name: '丘陵', icon: '🌲', stones: -0.1, soldiers: 0, defense: 0.15, spirit: 0.25, growth: 0, desc: '山林蒼翠，草木靈秀，宜於修行' },
  frontier: { name: '邊塞', icon: '🏯', stones: -0.25, soldiers: 0.4, defense: 0.25, spirit: -0.1, growth: -1, desc: '苦寒邊關，商旅稀少，卻是雄兵屯駐之地' },
};

/** 依真實地理為每座城池指定地貌 */
export const CITY_TERRAIN: Record<string, TerrainId> = {
  luoyang: 'basin',
  henei: 'plains',
  jinyang: 'plateau',
  ye: 'plains',
  ji: 'frontier',
  beiping: 'frontier',
  nanpi: 'plains',
  pingyuan: 'plains',
  beihai: 'coast',
  xiapi: 'plains',
  xiaopei: 'plains',
  puyang: 'plains',
  chenliu: 'plains',
  xuchang: 'plains',
  runan: 'plains',
  shouchun: 'waterland',
  hefei: 'waterland',
  jianye: 'waterland',
  wujun: 'waterland',
  kuaiji: 'coast',
  chaisang: 'waterland',
  guiyang: 'hills',
  changsha: 'hills',
  lingling: 'hills',
  wuling: 'mountain',
  jianning: 'plateau',
  chengdu: 'basin',
  jiangzhou: 'mountain',
  jiangling: 'waterland',
  xiangyang: 'waterland',
  wancheng: 'basin',
  hanzhong: 'basin',
  tianshui: 'mountain',
  wuwei: 'desert',
  changan: 'basin',
};

export function terrainOf(city: City): TerrainDef {
  return TERRAIN[CITY_TERRAIN[city.id] ?? 'plains'];
}

const pct = (v: number) => `${v > 0 ? '+' : '−'}${Math.round(Math.abs(v) * 100)}%`;

/** 地貌效果摘要，例如「靈石 +20%・士兵 +20%・城防 −15%」 */
export function terrainEffects(t: TerrainDef): string {
  const parts: string[] = [];
  if (t.stones) parts.push(`靈石 ${pct(t.stones)}`);
  if (t.soldiers) parts.push(`士兵 ${pct(t.soldiers)}`);
  if (t.defense) parts.push(`城防 ${pct(t.defense)}`);
  if (t.spirit) parts.push(`靈氣 ${pct(t.spirit)}`);
  if (t.growth) parts.push(`繁榮成長${t.growth > 0 ? '較快' : '較慢'}`);
  return parts.join('・');
}

import type { CraftStat, Equipment, Tier } from '../game/types';

export const ARMOR_GRADES = ['黃階', '玄階', '地階', '天階'] as const;
export const ARMOR_GRADE_IDS = ['huang', 'xuan', 'di', 'tian'] as const;
/** Equipment shares the grade bands with techniques and personal weapons; armor has no subgrades. */
export const ARMOR_TIERS = [0, 3, 6, 9] as const;
export const ARMOR_REALMS = [0, 2, 4, 6] as const;
const PRIMARY = [10, 20, 35, 50];
const HP = [60, 120, 200, 300];
const PRICE = [1500, 4000, 12000, 40000];
const PREMIUM_PRICE = [2500, 6000, 18000, 60000];
const ARTS: CraftStat[] = ['alchemy', 'forging', 'talisman', 'formation'];
type Bonus = 'force' | 'defense' | 'hp' | CraftStat | 'combat' | 'arts';
interface ArmorFamily { id: string; names: readonly string[]; bonus: Bonus }
export const ARMOR_FAMILIES: readonly ArmorFamily[] = [
  { id: 'nuwa', names: ['褪色的紅頭巾', '舞姬紅綾巾', '洛神流雲綾', '女媧補天綾'], bonus: 'hp' },
  { id: 'chiyou', names: ['染血的布篷', '山賊獸皮氅', '蠻王獸骨氅', '蚩尤魔神氅'], bonus: 'force' },
  { id: 'houtou', names: ['散架的竹編甲', '民兵竹編甲', '烏戈藤甲', '后土承天甲'], bonus: 'defense' },
  { id: 'shennong', names: ['燒焦的粗布衣', '藥鋪學徒衫', '華佗青囊袍', '神農百草衣'], bonus: 'alchemy' },
  { id: 'pangu', names: ['變形的舊皮鎧', '皮製鐵匠圍裙', '干將鑄魂鎧', '盤古開天鎧'], bonus: 'forging' },
  { id: 'cangjie', names: ['畫錯符文的法袍', '太平道袍', '南華天書袍', '倉頡泣鬼袍'], bonus: 'talisman' },
  { id: 'fuxi', names: ['打結的破漁網', '漁翁避雨蓑', '河圖洛書紗', '伏羲八卦紗'], bonus: 'formation' },
  { id: 'hongjun', names: ['戲班的假龍袍', '太守朝服', '真龍天子袞', '鴻鈞大道袞'], bonus: 'combat' },
  { id: 'buddha', names: ['蟲蛀的舊僧衣', '行腳百衲衣', '錦斕袈裟', '如來萬佛袈裟'], bonus: 'arts' },
];
export interface ArmorDefinition {
  id: string;
  family: string;
  grade: number;
  kind: 'armor';
  name: string;
  tier: Tier;
  force: number;
  defense: number;
  hp: number;
  craft: Equipment['craft'];
  price: number;
}
/** The complete, fixed catalog: nine families in each of four grades. */
export const ARMOR_DEFS: readonly ArmorDefinition[] = ARMOR_TIERS.flatMap((tier, grade) => ARMOR_FAMILIES.map(f => {
  const craft: Equipment['craft'] = {};
  if (ARTS.includes(f.bonus as CraftStat)) craft[f.bonus as CraftStat] = PRIMARY[grade];
  if (f.bonus === 'arts') for (const art of ARTS) craft[art] = [5, 10, 15, 30][grade];
  return {
    id: `${f.id}-${ARMOR_GRADE_IDS[grade]}`, family: f.id, grade, tier, kind: 'armor', name: f.names[grade],
    force: f.bonus === 'force' ? PRIMARY[grade] : f.bonus === 'combat' ? [5, 15, 25, 35][grade] : 0,
    defense: f.bonus === 'defense' ? PRIMARY[grade] : f.bonus === 'combat' ? [5, 15, 25, 35][grade] : 0,
    hp: f.bonus === 'hp' ? [150, 300, 450, 750][grade] : HP[grade], craft,
    price: (f.bonus === 'combat' || f.bonus === 'arts' ? PREMIUM_PRICE : PRICE)[grade],
  };
}));
export const armorGrade = (tier: Tier) => Math.floor(tier / 3);
export const armorGradeName = (tier: Tier) => ARMOR_GRADES[armorGrade(tier)];
/** Catalog order is grade first, then HP/force/defense/four arts/combat/all arts. */
export function compareArmor(a: Equipment, b: Equipment): number {
  return armorGrade(a.tier) - armorGrade(b.tier)
    || ARMOR_DEFS.findIndex(d => d.id === a.designId) - ARMOR_DEFS.findIndex(d => d.id === b.designId);
}

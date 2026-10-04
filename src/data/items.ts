import type { Beast, BeastSkill, CraftStat, Element, Equipment, Item, Technique, Tier } from '../game/types';

const GRADES = ['黃', '玄', '地', '天'];
const SUBS = ['下', '中', '上'];

/** 0=黃品下 … 11=天品上 */
export function tierName(t: Tier, unit = '品'): string {
  return `${GRADES[Math.floor(t / 3)]}${unit}${SUBS[t % 3]}`;
}

export function tierPrice(t: Tier, base = 600): number {
  return Math.round((base * Math.pow(1.55, t)) / 10) * 10;
}

/** 隨機品階：低階較常見 */
export function rollTier(maxBias = 0): Tier {
  const r = Math.pow(Math.random(), 1.8 - maxBias);
  return Math.min(11, Math.floor(r * 12));
}

const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];

// ───────────────────────── 五行 ─────────────────────────

export const ELEMENT_NAMES: Record<Element, string> = { metal: '金', wood: '木', water: '水', fire: '火', earth: '土' };
export const ELEMENT_CSS: Record<Element, string> = { metal: '#e8d27a', wood: '#5fc46a', water: '#5aa8ec', fire: '#ec6a4a', earth: '#c49a5a' };
/** a 剋 b */
const OVERCOME: Record<Element, Element> = { metal: 'wood', wood: 'earth', earth: 'water', water: 'fire', fire: 'metal' };
/** a 生 b */
const GENERATE: Record<Element, Element> = { metal: 'water', water: 'wood', wood: 'fire', fire: 'earth', earth: 'metal' };

/** 攻擊方五行對守方的傷害倍率 */
export function elementMod(a: Element | null, b: Element | null): { mult: number; text: string } {
  if (!a || !b) return { mult: 1, text: '' };
  if (OVERCOME[a] === b) return { mult: 1.35, text: `${ELEMENT_NAMES[a]}剋${ELEMENT_NAMES[b]}` };
  if (OVERCOME[b] === a) return { mult: 0.75, text: `${ELEMENT_NAMES[b]}剋${ELEMENT_NAMES[a]}` };
  if (GENERATE[a] === b) return { mult: 0.9, text: `${ELEMENT_NAMES[a]}生${ELEMENT_NAMES[b]}` };
  return { mult: 1, text: '' };
}

// ───────────────────────── 神器、寶衣 ─────────────────────────

const WEAPONS = ['青鋒劍', '寒鐵槍', '赤焰刀', '雷霆戟', '玄冰弓', '斬龍劍', '落日弓', '破軍戟', '流雲刀', '紫電劍'];
const ARMORS = ['雲紋袍', '玄武鎧', '鱗甲衣', '金蠶衣', '天蠶寶甲', '赤霞袍', '冰綃衣', '獸王甲', '紫綬仙衣', '八卦道袍'];

export function makeEquipment(uid: string, kind: 'weapon' | 'armor', tier: Tier): Equipment {
  return {
    uid,
    kind,
    name: `${tierName(tier)}・${pick(kind === 'weapon' ? WEAPONS : ARMORS)}`,
    tier,
    value: kind === 'weapon' ? 4 + tier * 5 : 3 + tier * 4,
    hp: kind === 'armor' ? 20 + tier * 25 : 0,
    price: tierPrice(tier),
  };
}

/** 裝備需要的境界：黃品凡人、玄品練氣、地品築基、天品金丹 */
export function equipRealm(tier: Tier): number {
  return Math.floor(tier / 3);
}

// ───────────────────────── 功法 ─────────────────────────

const TECHNIQUES: Record<Element, { name: string; skill: string }[]> = {
  metal: [
    { name: '庚金劍訣', skill: '萬劍歸宗' },
    { name: '太白劍經', skill: '太白貫日' },
    { name: '金剛不壞功', skill: '金剛伏魔' },
  ],
  wood: [
    { name: '青木長生功', skill: '萬木回春' },
    { name: '乙木神雷訣', skill: '青雷破空' },
    { name: '枯榮禪功', skill: '一葉枯榮' },
  ],
  water: [
    { name: '玄水真經', skill: '滄海橫流' },
    { name: '癸水天罡訣', skill: '天河倒懸' },
    { name: '寒冰掌', skill: '冰封千里' },
  ],
  fire: [
    { name: '離火焚天訣', skill: '焚天烈焰' },
    { name: '赤陽神功', skill: '大日焚身' },
    { name: '三昧真火訣', skill: '三昧真火' },
  ],
  earth: [
    { name: '厚土玄功', skill: '山崩地裂' },
    { name: '戊土鎮岳訣', skill: '五岳鎮壓' },
    { name: '不動明王經', skill: '明王怒' },
  ],
};

export function makeTechnique(uid: string, tier: Tier): Technique {
  const element = pick(Object.keys(TECHNIQUES) as Element[]);
  const t = pick(TECHNIQUES[element]);
  return {
    uid,
    name: `${tierName(tier, '階')}・${t.name}`,
    tier,
    element,
    difficulty: 1 + Math.floor(Math.random() * 5),
    power: Math.round((0.05 + tier * 0.03) * 100) / 100,
    skillName: t.skill,
    skillPower: Math.round((1.6 + tier * 0.15) * 100) / 100,
    price: tierPrice(tier, 700),
  };
}

/** 功法帶來的每回合修為：黃階 +20、玄階 +40、地階 +70、天階 +100，同階上中下品再遞增 */
export function techniqueExp(t: Technique | null): number {
  if (!t) return 0;
  return [20, 40, 70, 100][Math.floor(t.tier / 3)] + (t.tier % 3) * 5;
}

// ───────────────────────── 靈獸 ─────────────────────────

export const BEASTS: { name: string; skill: BeastSkill }[] = [
  { name: '火麒麟', skill: 'attack' },
  { name: '金翅大鵬', skill: 'attack' },
  { name: '雷鷹', skill: 'attack' },
  { name: '玄武靈龜', skill: 'shield' },
  { name: '石甲犀', skill: 'shield' },
  { name: '青鸞', skill: 'heal' },
  { name: '九色靈鹿', skill: 'heal' },
  { name: '尋寶鼠', skill: 'treasure' },
  { name: '吞金蟾', skill: 'treasure' },
  { name: '九尾狐', skill: 'treasure' },
  { name: '白虎', skill: 'buff' },
  { name: '嘯月天狼', skill: 'buff' },
];

export function beastPower(b: Beast) {
  const t = b.tier;
  return {
    attack: 30 + t * 12,
    shield: 80 + t * 40,
    heal: 0.03 + t * 0.006,
    treasure: 100 + t * 60,
    buff: 1.1 + t * 0.02,
    siege: 150 + t * 80,
  };
}

export function describeBeast(skill: BeastSkill, tier: Tier): string {
  const p = beastPower({ uid: '', name: '', tier, skill, desc: '', price: 0 });
  switch (skill) {
    case 'attack':
      return `戰鬥：每回合追擊 ${p.attack} 傷害`;
    case 'shield':
      return `戰鬥：開場護盾 ${p.shield}`;
    case 'heal':
      return `戰鬥：每回合回復 ${Math.round(p.heal * 100)}% 血量`;
    case 'treasure':
      return `尋寶：每回合尋得 ${p.treasure} 下品靈石`;
    case 'buff':
      return `戰鬥：武力 ×${p.buff.toFixed(2)}`;
  }
}

export function makeBeast(uid: string, tier: Tier): Beast {
  const b = pick(BEASTS);
  return { uid, name: `${tierName(tier, '階')}・${b.name}`, tier, skill: b.skill, desc: describeBeast(b.skill, tier), price: tierPrice(tier, 900) };
}

// ───────────────────────── 丹藥、法器、陣法、符籙 ─────────────────────────

export type ItemTarget = 'ownGeneral' | 'enemyGeneral' | 'lord' | 'tile' | 'ownCity' | 'enemyCity' | 'dice' | 'none';
export type ItemTiming = 'preroll' | 'battle' | 'both';

export interface ItemDef {
  id: string;
  name: string;
  category: '丹藥' | '陣法' | '符籙' | '法器';
  stat: CraftStat;
  /** 依品階的最低能力值 */
  min: number[];
  /** 依品階使用時消耗的體力 */
  stamina: number[];
  timing: ItemTiming;
  /** 擲骰前使用時的目標 */
  target: ItemTarget;
  /** 戰鬥中使用時的目標 */
  battleTarget?: ItemTarget;
  price: number[];
  desc: (tier: number) => string;
}

export const PILL_GRADES = ['黃品', '玄品', '地品', '天品'];
const PILL_MIN = [0, 25, 45, 65];
const PILL_STAMINA = [10, 15, 20, 25];
const PILL_PRICE = [300, 900, 2700, 8100];

export const HEAL = [0.25, 0.45, 0.7, 1];
export const STAT_UP = [3, 6, 10, 16];
export const QI_EXP = [50, 100, 200, 400];
export const ESSENCE_EXP = [150, 300, 600, 1200];
export const STAMINA_UP = [30, 50, 80, 100];
export const POISON = [0.04, 0.07, 0.1, 0.14];
/** 壯骨丹：永久血量 */
export const BONE_HP = [15, 30, 60, 120];
/** 破境丹：低階突破成功率加成，渡劫時改為天雷傷害減免 */
export const BREAK_BOOST = [0.1, 0.15, 0.2, 0.3];
/** 狂暴丹：本場擂台武力加成 */
export const RAGE_ATK = [0.15, 0.25, 0.35, 0.5];
/** 聚靈陣：全隊修為 */
export const GATHER_EXP = [40, 90, 180, 350];
/** 回春陣：全隊回復血量比例 */
export const MEND_HEAL = [0.15, 0.3, 0.45, 0.7];
/** 地脈陣：城池繁榮度 */
export const VEIN_PROSPERITY = [5, 10, 18, 30];
/** 迷蹤陣：敵將武力降低 */
export const MIST_ATK = [0.1, 0.18, 0.28, 0.4];
/** 護身符：護罩佔血量比例 */
export const SHIELD_RATIO = [0.15, 0.25, 0.4, 0.6];
/** 蓄能符：立即獲得能量 */
export const CHARGE_ENERGY = [30, 50, 75, 100];
/** 奪靈符：敵將損失體力 */
export const DRAIN_STAMINA = [25, 45, 70, 100];
/** 撒豆成兵符：士兵 */
export const SOLDIER_CALL = [400, 1200, 3000, 8000];
/** 懾魂鈴：敵將損失能量 */
export const BELL_ENERGY = [40, 60, 80, 100];
/** 乾坤圈：敵將血量比例傷害 */
export const RING_DAMAGE = [0.08, 0.14, 0.22, 0.32];
/** 聚元珠：全隊回復體力 */
export const PEARL_STAMINA = [20, 35, 50, 80];
/** 遁地梭：本回合多走的步數 */
export const SHUTTLE_STEPS = 3;

const price4 = (mult: number) => PILL_PRICE.map((p) => Math.round((p * mult) / 10) * 10);

export const ITEM_DEFS: Record<string, ItemDef> = {
  // ───── 丹藥（煉丹）─────
  heal: { id: 'heal', name: '回血丹', category: '丹藥', stat: 'alchemy', min: PILL_MIN, stamina: PILL_STAMINA, timing: 'both', target: 'ownGeneral', price: PILL_PRICE, desc: (t) => `回復 ${HEAL[t] * 100}% 血量` },
  force: { id: 'force', name: '增力丹', category: '丹藥', stat: 'alchemy', min: [10, 30, 50, 70], stamina: [12, 18, 24, 30], timing: 'both', target: 'ownGeneral', price: PILL_PRICE.map((p) => p * 2), desc: (t) => `永久武力 +${STAT_UP[t]}` },
  guard: { id: 'guard', name: '護體丹', category: '丹藥', stat: 'alchemy', min: [10, 30, 50, 70], stamina: [12, 18, 24, 30], timing: 'both', target: 'ownGeneral', price: PILL_PRICE.map((p) => p * 2), desc: (t) => `永久防禦 +${STAT_UP[t]}` },
  qi: { id: 'qi', name: '凝氣丹', category: '丹藥', stat: 'alchemy', min: [5, 25, 45, 65], stamina: PILL_STAMINA, timing: 'preroll', target: 'ownGeneral', price: PILL_PRICE.map((p) => Math.round(p * 1.2)), desc: (t) => `修為 +${QI_EXP[t]}` },
  essence: { id: 'essence', name: '真元丹', category: '丹藥', stat: 'alchemy', min: [15, 35, 55, 75], stamina: [15, 20, 26, 32], timing: 'preroll', target: 'ownGeneral', price: PILL_PRICE.map((p) => p * 3), desc: (t) => `修為 +${ESSENCE_EXP[t]}` },
  foundation: { id: 'foundation', name: '築基丹', category: '丹藥', stat: 'alchemy', min: [35], stamina: [18], timing: 'preroll', target: 'ownGeneral', price: [4500], desc: () => '練氣突破築基的成功率提升至 95%' },
  vigor: { id: 'vigor', name: '回氣丹', category: '丹藥', stat: 'alchemy', min: [0, 20, 40, 60], stamina: [5, 8, 10, 12], timing: 'both', target: 'ownGeneral', price: PILL_PRICE.map((p) => Math.round(p * 0.6)), desc: (t) => `回復 ${STAMINA_UP[t]} 體力` },
  poison: { id: 'poison', name: '斷腸毒丹', category: '丹藥', stat: 'alchemy', min: [15, 35, 55, 75], stamina: [12, 18, 24, 30], timing: 'both', target: 'enemyGeneral', battleTarget: 'enemyGeneral', price: PILL_PRICE, desc: (t) => `戰鬥中每回合扣 ${POISON[t] * 100}% 血量（3 回合）；平時直接扣 ${Math.round(POISON[t] * 250)}% 血量` },
  clearmind: { id: 'clearmind', name: '清心丹', category: '丹藥', stat: 'alchemy', min: [40], stamina: [15], timing: 'preroll', target: 'ownGeneral', price: [3500], desc: () => '化解一名武將身上的心魔' },
  bone: { id: 'bone', name: '壯骨丹', category: '丹藥', stat: 'alchemy', min: [20, 35, 55, 75], stamina: [12, 18, 24, 30], timing: 'preroll', target: 'ownGeneral', price: price4(2.2), desc: (t) => `永久血量 +${BONE_HP[t]}（基礎值，隨境界放大）` },
  breakpill: { id: 'breakpill', name: '破境丹', category: '丹藥', stat: 'alchemy', min: [30, 45, 60, 80], stamina: [15, 20, 25, 30], timing: 'preroll', target: 'ownGeneral', price: price4(3), desc: (t) => `下次低階突破成功率 +${BREAK_BOOST[t] * 100}%，或下次渡劫天雷傷害 -${BREAK_BOOST[t] * 100}%` },
  rage: { id: 'rage', name: '狂暴丹', category: '丹藥', stat: 'alchemy', min: [25, 40, 55, 75], stamina: [12, 18, 24, 30], timing: 'battle', target: 'none', battleTarget: 'ownGeneral', price: price4(1.5), desc: (t) => `戰鬥：本場擂台武力 +${RAGE_ATK[t] * 100}%` },

  // ───── 陣法（佈陣）─────
  teleport: { id: 'teleport', name: '傳送陣', category: '陣法', stat: 'formation', min: [60], stamina: [35], timing: 'preroll', target: 'tile', price: [6000], desc: () => '傳送至地圖上任一格（取代本回合擲骰）' },
  confuse: { id: 'confuse', name: '迷魂陣', category: '陣法', stat: 'formation', min: [50], stamina: [30], timing: 'preroll', target: 'lord', price: [5000], desc: () => '指定一位主公原地停留 2 回合' },
  citadel: { id: 'citadel', name: '護城大陣', category: '陣法', stat: 'formation', min: [40], stamina: [25], timing: 'preroll', target: 'ownCity', price: [4000], desc: () => '己方城池 5 回合內守軍戰力 ×1.5' },
  thunderward: { id: 'thunderward', name: '避雷陣', category: '陣法', stat: 'formation', min: [50], stamina: [30], timing: 'preroll', target: 'ownGeneral', price: [7000], desc: () => '為武將布陣護法，下次渡劫天雷傷害 -50%' },
  fiveward: { id: 'fiveward', name: '五行防禦陣', category: '陣法', stat: 'formation', min: [40], stamina: [25], timing: 'preroll', target: 'ownGeneral', price: [4500], desc: () => '下次渡劫天雷傷害 -30%（可與避雷陣疊加，最多減免 80%）' },
  illusion: { id: 'illusion', name: '幻境陣', category: '陣法', stat: 'formation', min: [70], stamina: [35], timing: 'preroll', target: 'enemyGeneral', price: [8000], desc: () => '以幻境引動心魔：下次突破成功率 -60%，或雷劫威力 ×2' },
  gather: { id: 'gather', name: '聚靈陣', category: '陣法', stat: 'formation', min: [25, 40, 60, 80], stamina: [20, 25, 32, 40], timing: 'preroll', target: 'none', price: [1500, 4000, 10500, 28000], desc: (t) => `全體隨行武將修為 +${GATHER_EXP[t]}` },
  mend: { id: 'mend', name: '回春陣', category: '陣法', stat: 'formation', min: [20, 35, 55, 75], stamina: [15, 20, 28, 36], timing: 'preroll', target: 'none', price: [1400, 3800, 10000, 26000], desc: (t) => `全體隨行武將回復 ${MEND_HEAL[t] * 100}% 血量` },
  vein: { id: 'vein', name: '地脈陣', category: '陣法', stat: 'formation', min: [25, 40, 60, 80], stamina: [18, 24, 30, 38], timing: 'preroll', target: 'ownCity', price: [1800, 5000, 13000, 32000], desc: (t) => `己方一座城池繁榮度 +${VEIN_PROSPERITY[t]}` },
  mist: { id: 'mist', name: '迷蹤陣', category: '陣法', stat: 'formation', min: [30, 45, 62, 80], stamina: [15, 22, 28, 35], timing: 'battle', target: 'none', battleTarget: 'enemyGeneral', price: [2000, 5000, 12000, 30000], desc: (t) => `戰鬥：本場擂台敵將武力 -${MIST_ATK[t] * 100}%` },

  // ───── 符籙（畫符）─────
  dice: { id: 'dice', name: '控骰符', category: '符籙', stat: 'talisman', min: [35], stamina: [18], timing: 'preroll', target: 'dice', price: [2500], desc: () => '本回合骰子點數由你決定' },
  stride: { id: 'stride', name: '縮地符', category: '符籙', stat: 'talisman', min: [25], stamina: [12], timing: 'preroll', target: 'none', price: [1500], desc: () => '本回合擲兩顆骰子' },
  thunder: { id: 'thunder', name: '天雷符', category: '符籙', stat: 'talisman', min: [55], stamina: [28], timing: 'both', target: 'enemyCity', battleTarget: 'enemyGeneral', price: [4000], desc: () => '戰鬥：天雷轟擊敵將 25% 血量；平時：敵城守軍 -30%' },
  freeze: { id: 'freeze', name: '定身符', category: '符籙', stat: 'talisman', min: [45], stamina: [22], timing: 'battle', target: 'none', battleTarget: 'enemyGeneral', price: [3500], desc: () => '戰鬥：敵將下回合無法行動' },
  ghost: { id: 'ghost', name: '五鬼搬運符', category: '符籙', stat: 'talisman', min: [65], stamina: [32], timing: 'preroll', target: 'lord', price: [6000], desc: () => '盜取指定主公 8% 靈石' },
  demon: { id: 'demon', name: '走火入魔符', category: '符籙', stat: 'talisman', min: [50], stamina: [28], timing: 'preroll', target: 'enemyGeneral', price: [5000], desc: () => '心魔干擾敵將：下次突破成功率 -30%，或雷劫威力 ×1.5' },
  siegebreak: { id: 'siegebreak', name: '破城符', category: '符籙', stat: 'talisman', min: [40], stamina: [22], timing: 'preroll', target: 'none', price: [4000], desc: () => '本回合攻城戰力 ×1.3' },
  shield: { id: 'shield', name: '護身符', category: '符籙', stat: 'talisman', min: [20, 35, 52, 70], stamina: [10, 15, 20, 26], timing: 'battle', target: 'none', battleTarget: 'ownGeneral', price: [900, 2400, 6500, 17000], desc: (t) => `戰鬥：為己方武將套上 ${SHIELD_RATIO[t] * 100}% 血量的護罩` },
  charge: { id: 'charge', name: '蓄能符', category: '符籙', stat: 'talisman', min: [25, 40, 58, 76], stamina: [10, 16, 22, 28], timing: 'battle', target: 'none', battleTarget: 'ownGeneral', price: [1000, 2800, 7500, 19000], desc: (t) => `戰鬥：立即獲得 ${CHARGE_ENERGY[t]} 點能量` },
  drain: { id: 'drain', name: '奪靈符', category: '符籙', stat: 'talisman', min: [30, 45, 60, 78], stamina: [12, 18, 24, 30], timing: 'preroll', target: 'enemyGeneral', price: [1200, 3200, 8500, 22000], desc: (t) => `敵將損失 ${DRAIN_STAMINA[t]} 體力，一時無力施展物品` },
  soldiers: { id: 'soldiers', name: '撒豆成兵符', category: '符籙', stat: 'talisman', min: [25, 40, 55, 75], stamina: [15, 20, 26, 34], timing: 'preroll', target: 'none', price: [1100, 3300, 8300, 21000], desc: (t) => `化出 ${SOLDIER_CALL[t]} 名士兵` },

  // ───── 法器（煉器）─────
  truce: { id: 'truce', name: '免戰牌', category: '法器', stat: 'forging', min: [25], stamina: [12], timing: 'preroll', target: 'none', price: [3000], desc: () => '本回合踏入敵城免繳過路費' },
  vajra: { id: 'vajra', name: '金剛罩', category: '法器', stat: 'forging', min: [45], stamina: [22], timing: 'battle', target: 'none', battleTarget: 'ownGeneral', price: [3500], desc: () => '戰鬥：為己方武將套上可吸收 30% 血量的護罩' },
  bell: { id: 'bell', name: '懾魂鈴', category: '法器', stat: 'forging', min: [25, 40, 58, 76], stamina: [10, 16, 22, 28], timing: 'battle', target: 'none', battleTarget: 'enemyGeneral', price: [900, 2500, 6800, 18000], desc: (t) => `戰鬥：敵將損失 ${BELL_ENERGY[t]} 點能量` },
  ring: { id: 'ring', name: '乾坤圈', category: '法器', stat: 'forging', min: [30, 45, 62, 80], stamina: [14, 20, 26, 34], timing: 'battle', target: 'none', battleTarget: 'enemyGeneral', price: [1500, 4200, 11000, 28000], desc: (t) => `戰鬥：擲出法圈，造成敵將 ${RING_DAMAGE[t] * 100}% 血量的傷害` },
  pearl: { id: 'pearl', name: '聚元珠', category: '法器', stat: 'forging', min: [20, 35, 50, 70], stamina: [6, 8, 10, 12], timing: 'preroll', target: 'none', price: [1000, 2800, 7600, 20000], desc: (t) => `全體隨行武將回復 ${PEARL_STAMINA[t]} 體力` },
  shuttle: { id: 'shuttle', name: '遁地梭', category: '法器', stat: 'forging', min: [30], stamina: [16], timing: 'preroll', target: 'none', price: [2200], desc: () => `本回合移動點數 +${SHUTTLE_STEPS}` },
};

export const PILL_IDS = ['heal', 'force', 'guard', 'qi', 'essence', 'foundation', 'vigor', 'poison', 'clearmind', 'bone', 'breakpill', 'rage'];
export const ARTIFACT_IDS = [
  'teleport', 'confuse', 'citadel', 'thunderward', 'fiveward', 'illusion', 'gather', 'mend', 'vein', 'mist',
  'dice', 'stride', 'thunder', 'freeze', 'ghost', 'demon', 'siegebreak', 'shield', 'charge', 'drain', 'soldiers',
  'truce', 'vajra', 'bell', 'ring', 'pearl', 'shuttle',
];
export const ITEM_CATEGORIES: ItemDef['category'][] = ['丹藥', '陣法', '符籙', '法器'];

/** 只有單一品階的物品（不加黃玄地天前綴） */
export function singleTier(defId: string): boolean {
  return ITEM_DEFS[defId].price.length === 1;
}

/** 依回合推進偏向高階的隨機品階（單一品階的物品固定為 0） */
export function rollItemTier(defId: string, bias = 0): number {
  return singleTier(defId) ? 0 : Math.min(3, Math.floor(Math.pow(Math.random(), 1.6 - bias) * 4));
}

export function itemName(defId: string, tier: number): string {
  const d = ITEM_DEFS[defId];
  return d.price.length > 1 ? `${PILL_GRADES[tier]}${d.name}` : d.name;
}

export const STAT_NAMES: Record<CraftStat | 'force' | 'defense' | 'hp', string> = {
  force: '武力',
  defense: '防禦',
  hp: '血量',
  alchemy: '煉丹',
  forging: '煉器',
  talisman: '畫符',
  formation: '佈陣',
};

/** 使用門檻：能力值與體力，例如「煉丹 ≥ 45・體力 20」 */
export function requirementOf(defId: string, tier: number): string {
  const d = ITEM_DEFS[defId];
  const i = Math.min(tier, d.min.length - 1);
  return `${STAT_NAMES[d.stat]} ≥ ${d.min[i]}・體力 ${d.stamina[i]}`;
}

/** 生成一件物品 */
export function makeItem(uid: string, defId: string, tier: number): Item {
  const t = Math.min(tier, ITEM_DEFS[defId].price.length - 1);
  return { uid, defId, tier: t, price: ITEM_DEFS[defId].price[t] };
}

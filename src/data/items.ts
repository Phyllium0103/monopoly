import type { Beast, BeastSkill, CraftStat, Element, Equipment, Technique, Tier } from '../game/types';

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

/** 每回合修為成長 */
export function techniqueSpeed(t: Technique | null): number {
  if (!t) return 3;
  return Math.max(5, 12 + t.tier * 2 - (t.difficulty - 1) * 2);
}

// ───────────────────────── 靈獸 ─────────────────────────

const BEASTS: { name: string; skill: BeastSkill }[] = [
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
export const BREAK_UP = [0.1, 0.18, 0.27, 0.4];
export const STAMINA_UP = [30, 50, 80, 100];
export const POISON = [0.04, 0.07, 0.1, 0.14];

export const ITEM_DEFS: Record<string, ItemDef> = {
  heal: { id: 'heal', name: '回血丹', category: '丹藥', stat: 'alchemy', min: PILL_MIN, stamina: PILL_STAMINA, timing: 'both', target: 'ownGeneral', price: PILL_PRICE, desc: (t) => `回復 ${HEAL[t] * 100}% 血量` },
  force: { id: 'force', name: '增力丹', category: '丹藥', stat: 'alchemy', min: PILL_MIN, stamina: PILL_STAMINA, timing: 'both', target: 'ownGeneral', price: PILL_PRICE.map((p) => p * 2), desc: (t) => `永久武力 +${STAT_UP[t]}` },
  guard: { id: 'guard', name: '護體丹', category: '丹藥', stat: 'alchemy', min: PILL_MIN, stamina: PILL_STAMINA, timing: 'both', target: 'ownGeneral', price: PILL_PRICE.map((p) => p * 2), desc: (t) => `永久防禦 +${STAT_UP[t]}` },
  breakthrough: { id: 'breakthrough', name: '破境丹', category: '丹藥', stat: 'alchemy', min: PILL_MIN, stamina: PILL_STAMINA, timing: 'preroll', target: 'ownGeneral', price: PILL_PRICE.map((p) => p * 2), desc: (t) => `下次突破機率 +${Math.round(BREAK_UP[t] * 100)}%` },
  vigor: { id: 'vigor', name: '回氣丹', category: '丹藥', stat: 'alchemy', min: PILL_MIN, stamina: [0, 0, 0, 0], timing: 'both', target: 'ownGeneral', price: PILL_PRICE.map((p) => Math.round(p * 0.6)), desc: (t) => `回復 ${STAMINA_UP[t]} 體力` },
  poison: { id: 'poison', name: '斷腸毒丹', category: '丹藥', stat: 'alchemy', min: PILL_MIN, stamina: PILL_STAMINA, timing: 'both', target: 'enemyGeneral', battleTarget: 'enemyGeneral', price: PILL_PRICE, desc: (t) => `戰鬥中每回合扣 ${POISON[t] * 100}% 血量（3 回合）；平時直接扣 ${Math.round(POISON[t] * 250)}% 血量` },

  teleport: { id: 'teleport', name: '傳送陣', category: '陣法', stat: 'formation', min: [50], stamina: [30], timing: 'preroll', target: 'tile', price: [6000], desc: () => '傳送至地圖上任一格（取代本回合擲骰）' },
  confuse: { id: 'confuse', name: '迷魂陣', category: '陣法', stat: 'formation', min: [40], stamina: [25], timing: 'preroll', target: 'lord', price: [5000], desc: () => '指定一位主公原地停留 2 回合' },
  citadel: { id: 'citadel', name: '護城大陣', category: '陣法', stat: 'formation', min: [35], stamina: [20], timing: 'preroll', target: 'ownCity', price: [4000], desc: () => '己方城池 5 回合內守軍戰力 ×1.5' },
  dice: { id: 'dice', name: '控骰符', category: '符籙', stat: 'talisman', min: [30], stamina: [15], timing: 'preroll', target: 'dice', price: [2500], desc: () => '本回合骰子點數由你決定' },
  stride: { id: 'stride', name: '縮地符', category: '符籙', stat: 'talisman', min: [20], stamina: [10], timing: 'preroll', target: 'none', price: [1500], desc: () => '本回合擲兩顆骰子' },
  thunder: { id: 'thunder', name: '天雷符', category: '符籙', stat: 'talisman', min: [50], stamina: [25], timing: 'both', target: 'enemyCity', battleTarget: 'enemyGeneral', price: [4000], desc: () => '戰鬥：天雷轟擊敵將 25% 血量；平時：敵城守軍 -30%' },
  freeze: { id: 'freeze', name: '定身符', category: '符籙', stat: 'talisman', min: [40], stamina: [20], timing: 'battle', target: 'none', battleTarget: 'enemyGeneral', price: [3500], desc: () => '戰鬥：敵將下回合無法行動' },
  ghost: { id: 'ghost', name: '五鬼搬運符', category: '符籙', stat: 'talisman', min: [60], stamina: [30], timing: 'preroll', target: 'lord', price: [6000], desc: () => '盜取指定主公 8% 靈石' },
  truce: { id: 'truce', name: '免戰牌', category: '法器', stat: 'forging', min: [20], stamina: [10], timing: 'preroll', target: 'none', price: [3000], desc: () => '本回合踏入敵城免繳過路費' },
  vajra: { id: 'vajra', name: '金剛罩', category: '法器', stat: 'forging', min: [40], stamina: [20], timing: 'battle', target: 'none', battleTarget: 'ownGeneral', price: [3500], desc: () => '戰鬥：為己方武將套上可吸收 30% 血量的護罩' },
};

export const PILL_IDS = ['heal', 'force', 'guard', 'breakthrough', 'vigor', 'poison'];
export const ARTIFACT_IDS = ['teleport', 'confuse', 'citadel', 'dice', 'stride', 'thunder', 'freeze', 'ghost', 'truce', 'vajra'];

export function itemName(defId: string, tier: number): string {
  const d = ITEM_DEFS[defId];
  return d.category === '丹藥' ? `${PILL_GRADES[tier]}${d.name}` : d.name;
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

import { ITEM_CATALOG } from './itemCatalog';
import { REALMS } from './generals';
import type { Beast, BeastSkill, CraftStat, Element, Equipment, Item, Technique, Tier } from '../game/types';

const GRADES = ['黃', '玄', '地', '天'];
const SUBS = ['下', '中', '上'];

/** 0=黃品下 … 11=天品上 */
export function tierName(t: Tier, unit = '品'): string {
  return `${GRADES[Math.floor(t / 3)]}${unit}${SUBS[t % 3]}`;
}

export function tierPrice(t: Tier, base = 500): number {
  return Math.round((base * Math.pow(1.45, t)) / 10) * 10;
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

type StatKey = 'force' | 'defense' | 'hp' | CraftStat;

export interface EquipDesign {
  id: string;
  kind: 'weapon' | 'armor';
  name: string;
  /** 各項能力占一階基準值的比例 */
  w: Partial<Record<StatKey, number>>;
}

const D = (kind: 'weapon' | 'armor', name: string, w: EquipDesign['w']): EquipDesign => ({ id: `${kind}-${name}`, kind, name, w });

/** 20 種神器與 20 種寶衣：除了武力、防禦、血量，也有煉丹、煉器、畫符、佈陣的加成 */
export const EQUIP_DESIGNS: EquipDesign[] = [
  D('weapon', '青鋒劍', { force: 1 }),
  D('weapon', '寒鐵槍', { force: 1, defense: 0.4 }),
  D('weapon', '赤焰刀', { force: 1, forging: 0.5 }),
  D('weapon', '雷霆戟', { force: 1.1 }),
  D('weapon', '玄冰弓', { force: 0.9, talisman: 0.5 }),
  D('weapon', '斬龍劍', { force: 1.15 }),
  D('weapon', '落日弓', { force: 1, defense: 0.3 }),
  D('weapon', '破軍戟', { force: 0.9, formation: 0.5 }),
  D('weapon', '流雲刀', { force: 1, hp: 0.4 }),
  D('weapon', '紫電劍', { force: 0.9, talisman: 0.5 }),
  D('weapon', '玄武盾劍', { defense: 1, force: 0.5 }),
  D('weapon', '鎮岳錘', { force: 0.8, defense: 0.7 }),
  D('weapon', '丹霞鼎', { alchemy: 1.2 }),
  D('weapon', '百草杖', { alchemy: 1, hp: 0.6 }),
  D('weapon', '八陣旗', { formation: 1.2 }),
  D('weapon', '鑄魂錘', { forging: 1.2, force: 0.3 }),
  D('weapon', '天工鑿', { forging: 1.2 }),
  D('weapon', '赤霄爐', { forging: 0.8, alchemy: 0.6 }),
  D('weapon', '神符筆', { talisman: 1.2 }),
  D('weapon', '太極羅盤', { formation: 0.9, talisman: 0.5 }),
  D('armor', '雲紋袍', { defense: 1, hp: 0.6 }),
  D('armor', '玄武鎧', { defense: 1.2, hp: 0.8 }),
  D('armor', '鱗甲衣', { defense: 1.1, force: 0.3 }),
  D('armor', '金蠶衣', { defense: 0.9, hp: 1.2 }),
  D('armor', '天蠶寶甲', { defense: 1, hp: 1 }),
  D('armor', '赤霞袍', { defense: 0.7, talisman: 0.6, hp: 0.5 }),
  D('armor', '冰綃衣', { defense: 0.8, formation: 0.5, hp: 0.5 }),
  D('armor', '獸王甲', { defense: 0.8, force: 0.6, hp: 0.6 }),
  D('armor', '紫綬仙衣', { defense: 0.6, formation: 0.8 }),
  D('armor', '八卦道袍', { defense: 0.5, formation: 1, hp: 0.4 }),
  D('armor', '丹心袍', { defense: 0.5, alchemy: 1, hp: 0.5 }),
  D('armor', '藥王衣', { alchemy: 0.8, hp: 1.2 }),
  D('armor', '鑄心甲', { defense: 0.8, forging: 0.8 }),
  D('armor', '匠神圍裙', { forging: 1, hp: 0.6 }),
  D('armor', '符籙法衣', { talisman: 1, defense: 0.4, hp: 0.4 }),
  D('armor', '太乙道袍', { formation: 0.7, talisman: 0.7 }),
  D('armor', '龍鱗戰袍', { force: 0.7, defense: 0.8, hp: 0.5 }),
  D('armor', '虎賁鎧', { force: 0.5, hp: 1, defense: 0.5 }),
  D('armor', '青鸞羽衣', { talisman: 0.7, defense: 0.6, hp: 0.4 }),
  D('armor', '九宮法衣', { formation: 0.7, defense: 0.7, hp: 0.4 }),
];

/** 一階的基準值：隨品階成長 */
const unit = (t: Tier) => ({ force: 4 + 4.5 * t, defense: 3 + 3.5 * t, hp: 40 + 40 * t, craft: 3 + 2.8 * t });

export function makeEquipment(uid: string, kind: 'weapon' | 'armor', tier: Tier, designId?: string): Equipment {
  const pool = EQUIP_DESIGNS.filter((d) => d.kind === kind);
  const d = (designId && pool.find((x) => x.id === designId)) || pick(pool);
  const u = unit(tier);
  const craft: Equipment['craft'] = {};
  for (const k of ['alchemy', 'forging', 'talisman', 'formation'] as const) if (d.w[k]) craft[k] = Math.max(1, Math.round((d.w[k] ?? 0) * u.craft));
  // 每件裝備都附帶血量：神器至少 0.4、寶衣至少 0.6 倍的基準血量
  const hpW = Math.max(d.w.hp ?? 0, kind === 'weapon' ? 0.4 : 0.6);
  const weight = Object.values({ ...d.w, hp: hpW }).reduce((s, v) => s + (v ?? 0), 0);
  return {
    uid,
    kind,
    name: `${tierName(tier)}・${d.name}`,
    tier,
    designId: d.id,
    force: Math.round((d.w.force ?? 0) * u.force),
    defense: Math.round((d.w.defense ?? 0) * u.defense),
    hp: Math.round(hpW * u.hp),
    craft,
    price: Math.round((tierPrice(tier) * (0.8 + weight * 0.2)) / 10) * 10,
  };
}

/** 裝備需要的境界：每兩階提高一個境界——黃品下、中凡人，黃品上、玄品下煉氣，……天品中、上化神 */
export function equipRealm(tier: Tier): number {
  return Math.floor(tier / 2);
}

/** 裝備的綜合評分（AI 比較用） */
export function equipScore(e: Equipment): number {
  return e.force * 2 + e.defense * 2 + e.hp / 8 + Object.values(e.craft).reduce((s, v) => s + (v ?? 0), 0) * 1.5;
}

const CRAFT_SHORT: Record<CraftStat, string> = { alchemy: '煉丹', forging: '煉器', talisman: '畫符', formation: '佈陣' };

/** 裝備的能力加成文字，例如「武力 +12、防禦 +5、畫符 +6」 */
export function equipStats(e: Equipment): string {
  const parts: string[] = [];
  if (e.force) parts.push(`武力 +${e.force}`);
  if (e.defense) parts.push(`防禦 +${e.defense}`);
  if (e.hp) parts.push(`血量 +${e.hp}`);
  for (const k of ['alchemy', 'forging', 'talisman', 'formation'] as const) if (e.craft[k]) parts.push(`${CRAFT_SHORT[k]} +${e.craft[k]}`);
  return parts.join('、');
}

/** 裝備說明：種類、品階、數值、需要境界與價值 */
export function equipDesc(e: Equipment): string {
  return `${e.kind === 'weapon' ? '神器' : '寶衣'}｜${tierName(e.tier)}｜${equipStats(e)}｜需要${REALMS[equipRealm(e.tier)]}以上｜價值 ${e.price}下品`;
}

// ───────────────────────── 功法 ─────────────────────────

/** 每個屬性 5 種功法名稱與技能：同一品階的五種功法屬性各不相同 */
const TECHNIQUES: Record<Element, { name: string; skill: string }[]> = {
  metal: [
    { name: '庚金劍訣', skill: '萬劍歸宗' },
    { name: '太白劍經', skill: '太白貫日' },
    { name: '金剛不壞功', skill: '金剛伏魔' },
    { name: '白虎斷岳訣', skill: '虎嘯金風' },
    { name: '天罡劍典', skill: '天罡鎮世' },
  ],
  wood: [
    { name: '青木長生功', skill: '萬木回春' },
    { name: '乙木神雷訣', skill: '青雷破空' },
    { name: '枯榮禪功', skill: '一葉枯榮' },
    { name: '九轉青蓮訣', skill: '青蓮化生' },
    { name: '藤甲纏龍訣', skill: '古藤縛龍' },
  ],
  water: [
    { name: '玄水真經', skill: '滄海橫流' },
    { name: '癸水天罡訣', skill: '天河倒懸' },
    { name: '寒冰掌', skill: '冰封千里' },
    { name: '北冥神功', skill: '北冥吞海' },
    { name: '洗心訣', skill: '清波滌塵' },
  ],
  fire: [
    { name: '離火焚天訣', skill: '焚天烈焰' },
    { name: '赤陽神功', skill: '大日焚身' },
    { name: '三昧真火訣', skill: '三昧真火' },
    { name: '朱雀涅槃經', skill: '浴火重生' },
    { name: '烈焰天劍訣', skill: '火雲焚野' },
  ],
  earth: [
    { name: '厚土玄功', skill: '山崩地裂' },
    { name: '戊土鎮岳訣', skill: '五岳鎮壓' },
    { name: '不動明王經', skill: '明王怒' },
    { name: '玄龜負山訣', skill: '玄龜鎮海' },
    { name: '黃沙裂地訣', skill: '黃沙漫天' },
  ],
};

/** 各屬性的偏重：金偏攻、土水偏守、火的技能更猛 */
export const ELEMENT_BIAS: Record<Element, { atk: number; def: number; skill: number }> = {
  metal: { atk: 1.15, def: 0.9, skill: 1 },
  wood: { atk: 1, def: 1, skill: 1 },
  water: { atk: 0.95, def: 1.15, skill: 1 },
  fire: { atk: 1.05, def: 0.85, skill: 1.1 },
  earth: { atk: 0.9, def: 1.3, skill: 1 },
};

export const ELEMENT_LIST: Element[] = ['metal', 'wood', 'water', 'fire', 'earth'];

/** 完整度倍率：1 星 ×0.8、3 星 ×1.0、5 星 ×1.2 */
export function completenessMult(c: number): number {
  return 0.7 + 0.1 * c;
}

/** 某品階某屬性的功法（每個品階共五種，屬性各不相同）；完整度隨機（1～5 星） */
export function makeTechnique(uid: string, tier: Tier, element?: Element): Technique {
  const el = element ?? pick(ELEMENT_LIST);
  const completeness = 1 + Math.floor(Math.random() * 5);
  const t = TECHNIQUES[el][tier % 5];
  return {
    uid,
    name: `${tierName(tier, '階')}・【${ELEMENT_NAMES[el]}】${t.name}`,
    tier,
    element: el,
    completeness,
    power: Math.round((0.05 + tier * 0.03) * completenessMult(completeness) * 100) / 100,
    skillName: t.skill,
    skillPower: Math.round((1.6 + tier * 0.15) * ELEMENT_BIAS[el].skill * completenessMult(completeness) * 100) / 100,
    price: Math.round((tierPrice(tier, 600) * completenessMult(completeness)) / 10) * 10,
  };
}

/** 五行相剋：回傳 e 剋誰、被誰剋 */
export function elementRelation(e: Element): { beats: Element; beatenBy: Element } {
  const beatenBy = (Object.keys(OVERCOME) as Element[]).find((x) => OVERCOME[x] === e)!;
  return { beats: OVERCOME[e], beatenBy };
}

/** 功法說明（可含 HTML）：屬性、相剋、能力加成、每回合修為、技能 */
export function techniqueDesc(t: Technique): string {
  const r = elementRelation(t.element);
  return `<b style="color:${ELEMENT_CSS[t.element]}">【${ELEMENT_NAMES[t.element]}】屬性</b>（剋${ELEMENT_NAMES[r.beats]}、被${ELEMENT_NAMES[r.beatenBy]}剋）｜武力 +${Math.round(t.power * ELEMENT_BIAS[t.element].atk * 100)}%、防禦 +${Math.round(t.power * 0.5 * ELEMENT_BIAS[t.element].def * 100)}%｜完整度 ${'★'.repeat(t.completeness)}${'☆'.repeat(5 - t.completeness)}｜每回合修為 +${techniqueExp(t)}｜技能「${t.skillName}」造成 ×${t.skillPower} 傷害（能量滿 100 施放）`;
}

/** 功法帶來的每回合修為：黃階 +20、玄階 +40、地階 +70、天階 +100，同階上中下品再遞增 */
export function techniqueExp(t: Technique | null): number {
  if (!t) return 0;
  return Math.round(([20, 40, 70, 100][Math.floor(t.tier / 3)] + (t.tier % 3) * 5) * completenessMult(t.completeness ?? 3));
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
  return { uid, name: `${tierName(tier, '階')}・${b.name}`, tier, skill: b.skill, desc: describeBeast(b.skill, tier), price: tierPrice(tier, 800) };
}

// ───────────────────────── 丹藥、法器、陣法、符籙 ─────────────────────────

export type ItemTarget = 'deadGeneral' | 'ownGeneral' | 'enemyGeneral' | 'lord' | 'tile' | 'ownCity' | 'enemyCity' | 'dice' | 'none';
export type ItemTiming = 'preroll' | 'battle' | 'both' | 'event';

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
  sellPrice?: number[];
  /** 相對出現權重；0 排除隨機抽取。 */
  weight: number;
  noUser?: boolean;
  desc: (tier: number) => string;
}

export const PILL_GRADES = ['黃品', '玄品', '地品', '天品'];
export const HEAL = [0.25, 0.45, 0.7, 1];
export const STAT_UP = [3, 6, 10, 15];
export const QI_EXP = [300, 600, 1200, 2400];
/** 真元丹：目前境界修為上限的比例。 */
export const ESSENCE_EXP = [0.1, 0.2, 0.3, 0.5];
export const STAMINA_UP = [30, 50, 80, 100];
export const POISON = [0.04, 0.07, 0.1, 0.15];
export const POISON_PREROLL = [0.1, 0.18, 0.25, 0.35];
export const BONE_HP = [15, 30, 60, 120];
export const BREAK_BOOST = [0.1, 0.15, 0.2, 0.3];
export const RAGE_ATK = [0.15, 0.25, 0.35, 0.5];
export const MEND_HEAL = [0.15, 0.3, 0.45, 0.7];
export const VEIN_PROSPERITY = [10, 15, 20, 30];
export const MIST_ATK = [0.1, 0.15, 0.2, 0.3];
export const SHIELD_RATIO = [0.15, 0.25, 0.4, 0.6];
export const CHARGE_ENERGY = [100];
export const SOLDIER_CALL = [2000, 4000, 6000, 8000];
export const REVIVE_HP = [0.1, 0.3, 0.5, 1];
export const REVIVE_REALM_LOSS = [10, 3, 1, 0];
export const SACRIFICE_LOSS = [0.1, 0.15, 0.2, 0.3];
export const BOWL_GAIN = [0.05, 0.1, 0.15, 0.2];
export const BOW_DAMAGE = [0.2, 0.3, 0.4, 0.5];
export const BLOOD_LIFESTEAL = [0.1, 0.15, 0.2, 0.3];
export const RING_TURNS = [1, 2, 3, 4];
export const ITEM_DEFS: Record<string, ItemDef> = Object.fromEntries(ITEM_CATALOG.map(d => [d.id, {
  ...d, min: [...d.min], stamina: [...d.stamina], price: [...d.price], sellPrice: [...d.sellPrice],
  desc: (tier: number) => d.effects[Math.max(0, Math.min(tier, d.effects.length - 1))],
}]));
export const PILL_IDS = Object.keys(ITEM_DEFS).filter(id => ITEM_DEFS[id].category === '丹藥');
export const ARTIFACT_IDS = Object.keys(ITEM_DEFS).filter(id => ITEM_DEFS[id].category !== '丹藥');

export const ITEM_CATEGORIES: ItemDef['category'][] = ['丹藥', '陣法', '符籙', '法器'];

/** 相同物品的各品階共用種類權重；空池／全部權重為0時不抽物品。 */
export function rollItemId(pool: readonly string[] = Object.keys(ITEM_DEFS)): string | null {
  const eligible=[...new Set(pool)].map(id=>({id,weight:ITEM_DEFS[id]?.weight??0})).filter(d=>Number.isFinite(d.weight)&&d.weight>0);
  if (!eligible.length) return null;
  // 正規化避免極大合法權重相加溢位。
  const scale=Math.max(...eligible.map(d=>d.weight));
  let r=Math.random()*eligible.reduce((sum,d)=>sum+d.weight/scale,0);
  for (const d of eligible) { r-=d.weight/scale; if (r<0) return d.id; }
  return eligible[eligible.length-1].id;
}


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
  if (d.noUser) return '事件觸發，直接使用，不消耗武將體力';
  const i = Math.min(tier, d.min.length - 1);
  return `${STAT_NAMES[d.stat]} ≥ ${d.min[i]}・體力 ${d.stamina[i]}`;
}

/** 生成一件物品 */
export function makeItem(uid: string, defId: string, tier: number): Item {
  const t = Math.min(tier, ITEM_DEFS[defId].price.length - 1);
  return { uid, defId, tier: t, price: ITEM_DEFS[defId].price[t] };
}

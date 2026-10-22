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

// ───────────────────────── 寶衣 ─────────────────────────

type StatKey = 'force' | 'defense' | 'hp' | CraftStat;

export interface EquipDesign {
  id: string;
  kind: 'armor';
  name: string;
  /** 各項能力占一階基準值的比例 */
  w: Partial<Record<StatKey, number>>;
}

const D = (kind: 'armor', name: string, w: EquipDesign['w']): EquipDesign => ({ id: `${kind}-${name}`, kind, name, w });

/** 20 種寶衣：除了武力、防禦、血量，也有煉丹、煉器、畫符、佈陣的加成 */
export const EQUIP_DESIGNS: EquipDesign[] = [
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

export function makeEquipment(uid: string, kind: 'armor', tier: Tier, designId?: string): Equipment {
  const pool = EQUIP_DESIGNS.filter((d) => d.kind === kind);
  const d = (designId && pool.find((x) => x.id === designId)) || pick(pool);
  const u = unit(tier);
  const craft: Equipment['craft'] = {};
  for (const k of ['alchemy', 'forging', 'talisman', 'formation'] as const) if (d.w[k]) craft[k] = Math.max(1, Math.round((d.w[k] ?? 0) * u.craft));
  // 每件裝備都附帶血量：寶衣至少 0.6 倍的基準血量
  const hpW = Math.max(d.w.hp ?? 0, 0.6);
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
/** withValue 為 false 時不顯示價值（商店另有標價，不必重複） */
export function equipDesc(e: Equipment, withValue = true): string {
  if (e.fixedGeneralId) return `專屬武器｜${e.name.split('・')[0]}｜無視防禦 ${Math.round((e.penetration ?? 0) * 100)}%<br>固定持有，可使用材料升階至天階。`;
  return `寶衣｜${tierName(e.tier)}｜${equipStats(e)}<br>需要${REALMS[equipRealm(e.tier)]}以上${withValue ? `｜價值 ${e.price}下品` : ''}`;
}

// ───────────────────────── 功法 ─────────────────────────

/** 五行功法：黃、玄、地、天各一種；技能名稱即功法名稱 */
const ELEMENT_TECHNIQUES: Record<Element, [string, string, string, string]> = {
  metal: ['庚金劍訣', '辟邪神雷', '九轉暗金身', '神劍御雷真訣'],
  wood: ['長春功', '青元劍訣', '草木皆兵訣', '青天化龍訣'],
  water: ['玄冰訣', '寒門養念訣', '龍象化海經', '水澤國度'],
  fire: ['離火訣', '焚天火焰刀', '焚香玉冊', '太陽真經'],
  earth: ['人山訣', '元磁神光', '源天書', '大荒蕪經'],
};

/** 技藝功法：只有地階與天階，沒有五行 */
const CRAFT_TECHNIQUES: Record<CraftStat, [string, string]> = {
  alchemy: ['紫氣馭鼎功', '太上丹經'],
  forging: ['大衍訣', '暗器百解'],
  talisman: ['銀蝌文', '金篆文'],
  formation: ['組字秘', '禁制本源'],
};
export const CRAFT_LIST: CraftStat[] = ['alchemy', 'forging', 'talisman', 'formation'];
export const CRAFT_CSS = '#d9c7f0';

export const ELEMENT_LIST: Element[] = ['metal', 'wood', 'water', 'fire', 'earth'];

/** 技能倍率（黃階下品 … 天階上品） */
const SKILL_POWER = [1.8, 1.9, 2.0, 2.3, 2.4, 2.5, 2.8, 2.9, 3.0, 3.3, 3.4, 3.5];
/** 價格（中品，黃階下品 … 天階上品）；技藝功法比照同品階 */
const TECHNIQUE_PRICE = [6, 9, 12, 20, 25, 40, 60, 75, 100, 150, 250, 400];
/** 同一階的下、中、上品再加的比例 */
const SUB_SPEED = [0, 0.04, 0.08];
const SUB_FORCE = [0, 0.02, 0.05];
const SUB_KEEP = [0, 0.02, 0.05];
/** 技藝功法最低品階：地階下品 */
export const CRAFT_MIN_TIER = 6;

const major = (t: Technique) => Math.floor(t.tier / 3);
const minor = (t: Technique) => t.tier % 3;

/** 修練速度加成：五行 +10/20/30/40%，技藝 +30/40%（地／天）；下中上品再 +0/4/8% */
export function techniqueSpeed(t: Technique | null): number {
  if (!t) return 0;
  const base = t.art ? [0.3, 0.4][Math.max(0, major(t) - 2)] : [0.1, 0.2, 0.3, 0.4][major(t)];
  return Math.round((base + SUB_SPEED[minor(t)]) * 100) / 100;
}

/** 武力加成（只有五行功法）：+5/10/20/35%，下中上品再 +0/2/5% */
export function techniqueForce(t: Technique | null): number {
  if (!t || t.art) return 0;
  return Math.round(([0.05, 0.1, 0.2, 0.35][major(t)] + SUB_FORCE[minor(t)]) * 100) / 100;
}

/** 技藝功法對應的道具：煉丹→丹藥、煉器→法器、畫符→符籙、佈陣→陣法 */
export const CRAFT_ITEM: Record<CraftStat, '丹藥' | '陣法' | '符籙' | '法器'> = { alchemy: '丹藥', forging: '法器', talisman: '符籙', formation: '陣法' };

/** 技藝功法：使用對應道具時不消耗的機率 +5/10%（地／天），下中上品再 +0/2/5%；給 category 時只算該類道具 */
export function techniqueKeep(t: Technique | null, category?: string): number {
  if (!t?.art || (category !== undefined && CRAFT_ITEM[t.art] !== category)) return 0;
  return Math.round(([0.05, 0.1][Math.max(0, major(t) - 2)] + SUB_KEEP[minor(t)]) * 100) / 100;
}

/** 技能倍率依品階 */
export function techniqueSkillPower(t: Technique): number {
  return SKILL_POWER[Math.max(0, Math.min(11, t.tier))];
}

/** 功法本名（不含品階）；技能名稱與功法名稱相同 */
export function techniqueBaseName(t: Technique): string {
  if (t.art) return CRAFT_TECHNIQUES[t.art][Math.max(0, major(t) - 2)];
  return t.element ? ELEMENT_TECHNIQUES[t.element][major(t)] : t.skillName;
}

/** 功法顯示的五行或技藝類別 */
export function techniqueTag(t: Technique): { text: string; css: string } {
  if (t.art) return { text: STAT_NAMES[t.art], css: CRAFT_CSS };
  return t.element ? { text: ELEMENT_NAMES[t.element], css: ELEMENT_CSS[t.element] } : { text: '無', css: CRAFT_CSS };
}

/**
 * 某品階的功法。kind 可指定五行或技藝；省略時隨機——地階以上五行與四種技藝一起抽。
 * 技藝功法只有地階、天階，指定更低品階時會提升到地階下品。
 */
export function makeTechnique(uid: string, tier: Tier, kind?: Element | CraftStat): Technique {
  const pool: (Element | CraftStat)[] = tier >= CRAFT_MIN_TIER ? [...ELEMENT_LIST, ...CRAFT_LIST] : ELEMENT_LIST;
  const k = kind ?? pick(pool);
  const art = (CRAFT_LIST as string[]).includes(k) ? (k as CraftStat) : undefined;
  const element = art ? null : (k as Element);
  const finalTier = (art ? Math.max(CRAFT_MIN_TIER, tier) : tier) as Tier;
  const t: Technique = { uid, name: '', tier: finalTier, element, art, power: 0, skillName: '', skillPower: 0, price: 0 };
  const base = techniqueBaseName(t);
  const tag = techniqueTag(t);
  return {
    ...t,
    name: `${tierName(finalTier, '階')}・【${tag.text}】${base}`,
    power: techniqueForce(t),
    skillName: base,
    skillPower: techniqueSkillPower(t),
    price: TECHNIQUE_PRICE[finalTier] * 100,
  };
}

/** 五行相剋：回傳 e 剋誰、被誰剋 */
export function elementRelation(e: Element): { beats: Element; beatenBy: Element } {
  const beatenBy = (Object.keys(OVERCOME) as Element[]).find((x) => OVERCOME[x] === e)!;
  return { beats: OVERCOME[e], beatenBy };
}

/** 功法說明（可含 HTML）：屬性或技藝、修練速度、武力、技能 */
export function techniqueDesc(t: Technique): string {
  const tag = techniqueTag(t);
  const head = t.element
    ? (() => {
      const r = elementRelation(t.element);
      return `<b style="color:${tag.css}">【${tag.text}】屬性</b>（剋${ELEMENT_NAMES[r.beats]}、被${ELEMENT_NAMES[r.beatenBy]}剋）`;
    })()
    : `<b style="color:${tag.css}">【${tag.text}】功法</b>（無五行）`;
  const parts = [`修練速度 +${Math.round(techniqueSpeed(t) * 100)}%`];
  if (techniqueForce(t)) parts.push(`武力 +${Math.round(techniqueForce(t) * 100)}%`);
  if (t.art) parts.push(`使用${CRAFT_ITEM[t.art]}時 ${Math.round(techniqueKeep(t) * 100)}% 不消耗`);
  return `${head}｜${parts.join('、')}<br>技能「${techniqueBaseName(t)}」造成 ×${techniqueSkillPower(t)} 傷害（能量滿 100 施放）`;
}

// ───────────────────────── 靈獸 ─────────────────────────

export const BEASTS: { name: string; skill: BeastSkill }[] = [
  { name: '火麒麟', skill: 'attack' },
  { name: '金翅大鵬', skill: 'attack' },
  { name: '雷鷹', skill: 'attack' },
  { name: '玄武靈龜', skill: 'shield' },
  { name: '石甲犀', skill: 'shield' },
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

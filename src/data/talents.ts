import type { GameState, General, Lord } from '../game/types';
import type { PassiveFx } from './passives';
import { REALMS } from './generals';

/**
 * 天賦樹：每位主公一棵，名下武將突破境界時替隊伍累積天賦點。
 * 征戰、修行的效果疊進隊伍每名武將的被動（fx）；治世與城池類效果由主公一次讀取，不隨駐將人數重複累加。
 */
export type TalentTree = 'govern' | 'war' | 'cultivate';

export const TALENT_TREES: { id: TalentTree; name: string; icon: string }[] = [
  { id: 'govern', name: '治世', icon: '🏮' },
  { id: 'war', name: '征戰', icon: '⚔️' },
  { id: 'cultivate', name: '修行', icon: '☯️' },
];

/** 主公層級的效果（數值皆為比例，capitalMining 為顆數） */
export interface LordTalentFx {
  /** 名下城池繁榮成長 */
  growth?: number;
  /** 名下城池靈石收入 */
  stones?: number;
  /** 名下城池士兵收入 */
  soldiers?: number;
  /** 名下城池過路費 */
  toll?: number;
  /** 每擁有一座城，名下城池過路費再提高 */
  tollPerCity?: number;
  /** 商行購物折扣（不含招募與復活） */
  shop?: number;
  /** 主公繳納的過路費減免 */
  tollPaid?: number;
  /** 領取靈脈靈石 */
  vein?: number;
  /** 佔領無主城池的安撫費減免 */
  occupy?: number;
  /** 首都每回合挖礦額外顆數 */
  capitalMining?: number;
  /** 名下城池守城戰力 */
  cityDefense?: number;
  /** 過路費之戰獲勝時，另向城主奪取過路費的比例 */
  plunder?: number;
}

export interface TalentNode {
  id: string;
  tree: TalentTree;
  name: string;
  /** 1–6 層，6 為頂層 */
  row: number;
  /** 0–4 欄 */
  col: number;
  max: number;
  /** 前置節點：任一已學即可 */
  requires: string[];
  /** 每級效果 */
  lord?: LordTalentFx;
  general?: PassiveFx;
  /** 與 effectText 的「每級」數值搭配顯示 */
  text: string;
}

const node = (tree: TalentTree, id: string, name: string, row: number, col: number, max: number, requires: string[], text: string, fx: { lord?: LordTalentFx; general?: PassiveFx }): TalentNode =>
  ({ id, tree, name, row, col, max, requires, text, ...fx });

const KEEP = (v: number): PassiveFx => ({ keepPill: v, keepArtifact: v, keepTalisman: v, keepFormation: v });

export const TALENTS: TalentNode[] = [
  // ───────── 治世 ─────────
  node('govern', 'g_reclaim', '墾荒', 1, 0, 3, [], '名下城池繁榮成長 +2%', { lord: { growth: 0.02 } }),
  node('govern', 'g_wealth', '聚財', 1, 2, 3, [], '名下城池靈石收入 +1%', { lord: { stones: 0.01 } }),
  node('govern', 'g_farm', '屯田', 1, 4, 3, [], '名下城池士兵收入 +2%', { lord: { soldiers: 0.02 } }),
  node('govern', 'g_tariff', '關稅', 2, 1, 3, ['g_reclaim', 'g_wealth'], '名下城池過路費 +1%', { lord: { toll: 0.01 } }),
  node('govern', 'g_thrift', '節用', 2, 3, 3, ['g_wealth', 'g_farm'], '商行購物 −1%', { lord: { shop: 0.01 } }),
  node('govern', 'g_vein', '靈脈', 3, 0, 3, ['g_tariff'], '領取靈脈靈石 +3%', { lord: { vein: 0.03 } }),
  node('govern', 'g_trade', '通商', 3, 2, 3, ['g_tariff', 'g_thrift'], '主公繳納過路費 −2%', { lord: { tollPaid: 0.02 } }),
  node('govern', 'g_pacify', '懷柔', 3, 4, 1, ['g_thrift'], '佔領無主城池的安撫費 −8%', { lord: { occupy: 0.08 } }),
  node('govern', 'g_rich', '富庶', 4, 1, 3, ['g_vein', 'g_trade'], '名下城池繁榮成長 +4%', { lord: { growth: 0.04 } }),
  node('govern', 'g_mine', '礦監', 4, 3, 1, ['g_trade', 'g_pacify'], '首都每回合挖礦 +1 顆', { lord: { capitalMining: 1 } }),
  node('govern', 'g_treasury', '富國', 5, 1, 3, ['g_rich'], '名下城池靈石收入 +3%', { lord: { stones: 0.03 } }),
  node('govern', 'g_levy', '重稅', 5, 3, 3, ['g_mine'], '名下城池過路費 +3%', { lord: { toll: 0.03 } }),
  node('govern', 'g_heaven', '天府之國', 6, 1, 1, ['g_treasury'], '名下城池繁榮成長 +25%', { lord: { growth: 0.25 } }),
  node('govern', 'g_market', '商通九州', 6, 3, 1, ['g_levy'], '每擁有一座城，名下城池過路費 +1%', { lord: { tollPerCity: 0.01 } }),

  // ───────── 征戰 ─────────
  node('war', 'w_force', '武力', 1, 0, 3, [], '武力 +1%', { general: { atk: 0.01 } }),
  node('war', 'w_guard', '防禦', 1, 2, 3, [], '防禦 +1%', { general: { def: 0.01 } }),
  node('war', 'w_vigor', '血量', 1, 4, 3, [], '血量 +1%', { general: { hp: 0.01 } }),
  node('war', 'w_crit', '爆擊', 2, 1, 3, ['w_force', 'w_guard'], '爆擊機率 +0.5%', { general: { crit: 0.005 } }),
  node('war', 'w_troops', '統兵', 2, 3, 3, ['w_guard', 'w_vigor'], '作戰時兵力 +1%', { general: { troops: 0.01 } }),
  node('war', 'w_combo', '連擊', 3, 0, 3, ['w_crit'], '擂台攻擊 1% 機率連擊', { general: { doubleStrike: 0.01 } }),
  node('war', 'w_drain', '吸血', 3, 2, 3, ['w_crit', 'w_troops'], '傷害吸血 +1%', { general: { lifesteal: 0.01 } }),
  node('war', 'w_plunder', '掠陣', 3, 4, 1, ['w_troops'], '過路費之戰獲勝時，另奪走過路費的 5%', { lord: { plunder: 0.05 } }),
  node('war', 'w_siege', '破陣', 4, 1, 3, ['w_combo', 'w_drain'], '攻城統率 +3%', { general: { siegeLead: 0.03 } }),
  node('war', 'w_hold', '堅守', 4, 3, 3, ['w_drain', 'w_plunder'], '名下城池守城戰力 +3%', { lord: { cityDefense: 0.03 } }),
  node('war', 'w_skill', '神技', 5, 1, 3, ['w_siege'], '功法技能傷害 +4%', { general: { skillDmg: 0.04 } }),
  node('war', 'w_rage', '背水', 5, 3, 1, ['w_hold'], '血量低於一半時傷害 +10%', { general: { rage: 0.1 } }),
  node('war', 'w_peerless', '萬夫莫敵', 6, 1, 1, ['w_skill'], '擂台傷害 +10%・擂台開場能量 +20%', { general: { duelDmg: 0.1, energyStart: 20 } }),
  node('war', 'w_fortress', '固若金湯', 6, 3, 1, ['w_rage'], '名下城池守城戰力 +15%', { lord: { cityDefense: 0.15 } }),

  // ───────── 修行 ─────────
  node('cultivate', 'c_breath', '吐納', 1, 1, 3, [], '修為獲得 +2%', { general: { exp: 0.02 } }),
  node('cultivate', 'c_insight', '悟性', 1, 3, 3, [], '低階突破成功率 +1%', { general: { breakBonus: 0.01 } }),
  node('cultivate', 'c_alchemy', '丹心', 2, 0, 3, ['c_breath'], '煉丹 +1', { general: { craft: { alchemy: 1 } } }),
  node('cultivate', 'c_forging', '器魂', 2, 1, 3, ['c_breath'], '煉器 +1', { general: { craft: { forging: 1 } } }),
  node('cultivate', 'c_talisman', '符意', 2, 3, 3, ['c_insight'], '畫符 +1', { general: { craft: { talisman: 1 } } }),
  node('cultivate', 'c_formation', '陣理', 2, 4, 3, ['c_insight'], '佈陣 +1', { general: { craft: { formation: 1 } } }),
  node('cultivate', 'c_safe', '秘境護體', 3, 0, 3, ['c_alchemy', 'c_forging'], '秘境隕落率 −2%', { general: { realmSafety: 0.02 } }),
  node('cultivate', 'c_ward', '避劫', 3, 2, 3, ['c_forging', 'c_talisman'], '雷劫傷害 −2%', { general: { tribulation: 0.02 } }),
  node('cultivate', 'c_thrift', '惜物', 4, 1, 3, ['c_safe', 'c_ward'], '使用物品時 2% 機率不消耗', { general: KEEP(0.02) }),
  node('cultivate', 'c_garrison', '駐城修練', 4, 3, 3, ['c_ward'], '駐城修練修為 +5%', { general: { garrisonExp: 0.05 } }),
  node('cultivate', 'c_enlight', '頓悟', 5, 1, 3, ['c_thrift'], '修為獲得 +4%', { general: { exp: 0.04 } }),
  node('cultivate', 'c_master', '技藝精通', 5, 3, 3, ['c_garrison'], '四項技藝 +3%', { general: { craftPct: 0.03 } }),
  node('cultivate', 'c_unity', '天人合一', 6, 1, 1, ['c_enlight'], '雷劫傷害 −15%・低階突破失敗不損修為', { general: { tribulation: 0.15, keepExpOnFail: true } }),
  node('cultivate', 'c_artisan', '大匠之心', 6, 3, 1, ['c_master'], '四項技藝 +8%', { general: { craftPct: 0.08 } }),
];

export const TALENT_BY_ID: Record<string, TalentNode> = Object.fromEntries(TALENTS.map((n) => [n.id, n]));
/** 以外部輸入查節點（擋掉 constructor 之類的原型屬性） */
export const talentNode = (id: unknown): TalentNode | undefined => typeof id === 'string' && Object.hasOwn(TALENT_BY_ID, id) ? TALENT_BY_ID[id] : undefined;

/** 各層需要在同一棵樹「較低層」投入的點數 */
export const ROW_POINTS = [0, 0, 4, 8, 12, 16, 20];
/** 各層需要隊伍曾達到的境界（3 金丹、5 化神、7 合體） */
export const ROW_REALM = [0, 0, 0, 3, 3, 5, 7];
/** 從化神起，每次突破替隊伍帶來 2 點 */
export const DOUBLE_POINT_REALM = 5;

export const TALENT_REFUND_ITEM = 'talentrefund';
export const TALENT_RESET_ITEM = 'talentreset';

/** 突破到 realm 時獲得的天賦點 */
export function talentPointsFor(realm: number): number {
  return realm <= 0 ? 0 : realm >= DOUBLE_POINT_REALM ? 2 : 1;
}

const ranksOf = (lord: Lord): Record<string, number> => (lord.talents ??= {});

export function talentRank(lord: Lord, id: string): number {
  return lord.talents?.[id] ?? 0;
}

/** 已投入的總點數 */
export function talentSpent(lord: Lord, tree?: TalentTree): number {
  return Object.entries(lord.talents ?? {}).reduce((s, [id, r]) => s + (!tree || TALENT_BY_ID[id]?.tree === tree ? r : 0), 0);
}

/** 隊伍曾達到的最高境界（含目前名下武將） */
export function teamRealm(state: GameState, lord: Lord): number {
  let best = lord.talentRealm ?? 0;
  for (const g of Object.values(state.generals)) if (g.owner === lord.id && g.status !== 'dead' && !g.ghostSourceId) best = Math.max(best, g.realm);
  return best;
}

const lowerSpent = (ranks: Record<string, number>, n: TalentNode) =>
  Object.entries(ranks).reduce((s, [id, r]) => { const o = TALENT_BY_ID[id]; return s + (o && o.tree === n.tree && o.row < n.row ? r : 0); }, 0);

/** 單一節點在這組配點下是否成立（不檢查境界門檻） */
function nodeHolds(ranks: Record<string, number>, n: TalentNode): string | null {
  if (n.requires.length && !n.requires.some((id) => (ranks[id] ?? 0) > 0)) return `需先學會${n.requires.map((id) => TALENT_BY_ID[id].name).join('或')}`;
  if (lowerSpent(ranks, n) < ROW_POINTS[n.row]) return `需在${treeName(n.tree)}較低層投入 ${ROW_POINTS[n.row]} 點`;
  if (n.row === 6 && TALENTS.some((o) => o.tree === n.tree && o.row === 6 && o.id !== n.id && (ranks[o.id] ?? 0) > 0)) return '頂層天賦只能二選一';
  return null;
}

const treeName = (t: TalentTree) => TALENT_TREES.find((x) => x.id === t)!.name;

/** 學下一級還缺的所有條件（介面逐行列出）；空陣列表示可學 */
export function talentBlockers(state: GameState, lord: Lord, id: string): string[] {
  const n = talentNode(id);
  if (!n) return ['沒有這項天賦'];
  const ranks = lord.talents ?? {};
  if ((ranks[id] ?? 0) >= n.max) return ['已達最高等級'];
  const out: string[] = [];
  if (n.requires.length && !n.requires.some((r) => (ranks[r] ?? 0) > 0)) out.push(`需先學會${n.requires.map((r) => TALENT_BY_ID[r].name).join('或')}`);
  if (lowerSpent(ranks, n) < ROW_POINTS[n.row]) out.push(`需在${treeName(n.tree)}較低層投入 ${ROW_POINTS[n.row]} 點（目前 ${lowerSpent(ranks, n)} 點）`);
  if (teamRealm(state, lord) < ROW_REALM[n.row]) out.push(`隊伍需有武將達到${REALMS[ROW_REALM[n.row]]}`);
  if (n.row === 6 && TALENTS.some((o) => o.tree === n.tree && o.row === 6 && o.id !== n.id && (ranks[o.id] ?? 0) > 0)) out.push('頂層天賦只能二選一');
  if ((lord.talentPoints ?? 0) < 1) out.push('天賦點不足');
  return out;
}

export function canLearnTalent(state: GameState, lord: Lord, id: string): { ok: boolean; reason: string } {
  const why = talentBlockers(state, lord, id);
  return { ok: !why.length, reason: why[0] ?? '' };
}

export function learnTalent(state: GameState, lord: Lord, id: string): boolean {
  if (!canLearnTalent(state, lord, id).ok) return false;
  const ranks = ranksOf(lord);
  ranks[id] = (ranks[id] ?? 0) + 1;
  lord.talentPoints = (lord.talentPoints ?? 0) - 1;
  return true;
}

/** 忘塵丹：退一級後其他已學節點仍須成立 */
export function canRefundTalent(lord: Lord, id: string): { ok: boolean; reason: string } {
  const n = talentNode(id);
  if (!n || talentRank(lord, id) < 1) return { ok: false, reason: '尚未學習這項天賦' };
  if (!lord.items.some((i) => i.defId === TALENT_REFUND_ITEM)) return { ok: false, reason: '需要忘塵丹' };
  const ranks = { ...lord.talents, [id]: talentRank(lord, id) - 1 };
  if (!ranks[id]) delete ranks[id];
  const broken = Object.keys(ranks).map((k) => TALENT_BY_ID[k]).find((o) => o && nodeHolds(ranks, o));
  return broken ? { ok: false, reason: `${broken.name}依賴這一級，請先退${broken.name}` } : { ok: true, reason: '' };
}

const consume = (lord: Lord, defId: string) => { lord.items.splice(lord.items.findIndex((i) => i.defId === defId), 1); };

export function refundTalent(lord: Lord, id: string): boolean {
  if (!canRefundTalent(lord, id).ok) return false;
  consume(lord, TALENT_REFUND_ITEM);
  const ranks = ranksOf(lord);
  if (--ranks[id] <= 0) delete ranks[id];
  lord.talentPoints = (lord.talentPoints ?? 0) + 1;
  return true;
}

export function canResetTalents(lord: Lord): { ok: boolean; reason: string } {
  if (!talentSpent(lord)) return { ok: false, reason: '尚未投入天賦點' };
  if (!lord.items.some((i) => i.defId === TALENT_RESET_ITEM)) return { ok: false, reason: '需要輪迴丹' };
  return { ok: true, reason: '' };
}

/** 輪迴丹：全部歸零、點數返還 */
export function resetTalents(lord: Lord): boolean {
  if (!canResetTalents(lord).ok) return false;
  consume(lord, TALENT_RESET_ITEM);
  lord.talentPoints = (lord.talentPoints ?? 0) + talentSpent(lord);
  lord.talents = {};
  return true;
}

/** 突破後替隊伍記點：只有超過這名武將到過的最高境界才給，兵解重練、轉手都不會重複得點 */
export function awardBreakthrough(state: GameState | undefined, g: General) {
  const peak = g.peakRealm ?? g.realm - 1;
  if (g.realm <= peak) return;
  g.peakRealm = g.realm;
  const lord = state && g.owner ? state.lords[g.owner] : undefined;
  if (!lord || g.ghostSourceId) return;
  let gained = 0;
  for (let r = peak + 1; r <= g.realm; r++) gained += talentPointsFor(r);
  lord.talentPoints = (lord.talentPoints ?? 0) + gained;
  lord.talentRealm = Math.max(lord.talentRealm ?? 0, g.realm);
}

const add = (into: Record<string, unknown>, from: Record<string, unknown>, rank: number) => {
  for (const [k, v] of Object.entries(from)) {
    if (typeof v === 'number') into[k] = ((into[k] as number | undefined) ?? 0) + v * rank;
    else if (typeof v === 'boolean') into[k] = into[k] || v;
    else if (v && typeof v === 'object') add(((into[k] as Record<string, unknown>) ??= {}), v as Record<string, unknown>, rank);
  }
};

/** 主公層級的天賦效果 */
export function lordTalentFx(lord: Lord | undefined): LordTalentFx {
  const out: Record<string, unknown> = {};
  for (const [id, r] of Object.entries(lord?.talents ?? {})) { const n = TALENT_BY_ID[id]; if (n?.lord && r > 0) add(out, n.lord as Record<string, unknown>, r); }
  return out as LordTalentFx;
}

/** 隊伍每名武將共享的天賦效果 */
export function generalTalentFx(lord: Lord | undefined): PassiveFx {
  const out: Record<string, unknown> = {};
  for (const [id, r] of Object.entries(lord?.talents ?? {})) { const n = TALENT_BY_ID[id]; if (n?.general && r > 0) add(out, n.general as Record<string, unknown>, r); }
  return out as PassiveFx;
}

/** 合併天賦效果到武將被動（數值相加、旗標取或）；base 會被改寫，craft 先複製以免動到被動表 */
export function mergeFx(base: PassiveFx, extra: PassiveFx): PassiveFx {
  if (base.craft && extra.craft) base.craft = { ...base.craft };
  add(base as Record<string, unknown>, extra as Record<string, unknown>, 1);
  return base;
}

/** 舊存檔補上天賦欄位：已達到的境界視為已記點，並依名下武將回推應得點數 */
export function ensureTalentState(state: GameState) {
  for (const g of Object.values(state.generals)) g.peakRealm ??= g.realm;
  for (const lord of Object.values(state.lords)) {
    lord.talents ??= {};
    if (lord.talentPoints !== undefined) continue;
    const own = Object.values(state.generals).filter((g) => g.owner === lord.id && !g.ghostSourceId);
    lord.talentPoints = own.reduce((s, g) => { let p = 0; for (let r = 1; r <= g.realm; r++) p += talentPointsFor(r); return s + p; }, 0);
    lord.talentRealm = Math.max(0, ...own.map((g) => g.realm));
  }
}

import type { GameState, General, Lord } from '../game/types';
import { joinLord, killGeneral, nextUid } from '../game/GameState';
import { addExp, craft, levelUp, power, totalCraft } from './GeneralSystem';
import { REALMS } from '../data/generals';
import { WORLD } from './WorldMods';
import { PILL_IDS, itemName, makeBeast, makeEquipment, makeItem, makeTechnique, tierName } from '../data/items';
import { fx } from '../data/passives';
import { traitOf } from '../faction/Faction';
import type { Expedition } from '../game/types';

export interface RealmLevel {
  name: string;
  icon: string;
  /** 寶物品階加成 */
  tier: number;
  /** 修為倍率 */
  exp: number;
}

/** 秘境難度以境界命名（煉氣到渡劫），由玩家選擇；難度看的是境界，不是戰力 */
export const REALM_LEVELS: RealmLevel[] = [
  { name: '煉氣', icon: '🌱', tier: -1, exp: 0.7 },
  { name: '築基', icon: '🌿', tier: 0, exp: 1 },
  { name: '金丹', icon: '🍃', tier: 1, exp: 1.3 },
  { name: '元嬰', icon: '🔥', tier: 2, exp: 1.7 },
  { name: '化神', icon: '⚡', tier: 3, exp: 2.2 },
  { name: '煉虛', icon: '🌪️', tier: 4, exp: 2.8 },
  { name: '合體', icon: '🌋', tier: 5, exp: 3.5 },
  { name: '大乘', icon: '☄️', tier: 6, exp: 4.3 },
  { name: '渡劫', icon: '💀', tier: 7, exp: 5.5 },
];

export const REALM_MIN_PARTY = 1;
export const REALM_MAX_PARTY = 5;
/** 境界相同的秘境歷時 3 回合；最短 1、最長 9 回合 */
export const REALM_BASE_TURNS = 3;

/** 難度對應的境界編號（煉氣 = 1） */
export function levelRealm(level: number): number {
  return level + 1;
}

/** 隊伍的平均境界（四捨五入） */
export function partyRealm(team: General[]): number {
  return Math.round(team.reduce((s, g) => s + g.realm, 0) / Math.max(1, team.length));
}

/** 歷時：難度比隊伍境界高 n 級就多 2n 回合（至多 9），低 n 級就少 n 回合（至少 1）；境界相同為 3 回合 */
export function realmTurns(level: number, team: General[]): number {
  const gap = levelRealm(level) - partyRealm(team);
  return gap > 0 ? Math.min(9, REALM_BASE_TURNS + gap * 2) : Math.max(1, REALM_BASE_TURNS + gap);
}

/** 獎勵份數 2～5：難度越高越多，四人以上再多一份 */
export function realmRolls(level: number, partySize: number): number {
  return Math.min(5, 2 + Math.floor(level / 3) + (partySize >= 4 ? 1 : 0));
}

/** 個別死亡機率：看個人境界與秘境難度的差距，不看戰力；人越多越安全 */
export function deathChance(g: General, team: General[], level = 1): number {
  const gap = levelRealm(level) - g.realm;
  const base = { '-3': 0.02, '-2': 0.03, '-1': 0.05, '0': 0.1, '1': 0.22, '2': 0.38, '3': 0.55, '4': 0.75 }[String(Math.max(-3, Math.min(4, gap))) as '0'];
  const sizeFactor = 1.25 - 0.1 * team.length;
  return Math.max(0.01, Math.min(0.9, base * sizeFactor * (1 - (fx(g).realmSafety ?? 0) - (traitOf(g.owner).realmSafety ?? 0))));
}

export function dispatch(lord: Lord, team: General[], realmName: string, level = 1) {
  for (const g of team) g.status = 'realm';
  lord.expeditions.push({ generalIds: team.map((g) => g.id), turnsLeft: realmTurns(level, team), realmName, level, blessed: WORLD.realmBlessed });
}

export interface RealmOutcome {
  realmName: string;
  icon: string;
  dead: General[];
  survivors: General[];
  reward: string | null;
  /** 歸來總結 */
  summary: string;
  /** 奇遇：修為獲得與頓悟突破 */
  insights: string[];
}

/** 依隊伍屬性決定獎勵種類與品階 */
function grantReward(state: GameState, lord: Lord, team: General[], all: General[], bonus = 0): string {
  const score = all.reduce((s, g) => s + power(g) + totalCraft(g) * 0.5, 0);
  const tier = Math.max(0, Math.min(11, Math.floor(score / 450) + Math.floor(Math.random() * 3) - 1 + bonus));
  const sum = (f: (g: General) => number) => team.reduce((s, g) => s + f(g), 0);
  const weights: [string, number][] = [
    ['weapon', sum((g) => g.base.force)],
    ['armor', sum((g) => g.base.defense)],
    ['pill', sum((g) => craft(g, 'alchemy')) * 1.2],
    ['technique', sum((g) => craft(g, 'talisman') + craft(g, 'formation')) * 0.6],
    ['beast', lord.beast ? 0 : 60 * team.length],
  ];
  let r = Math.random() * weights.reduce((s, w) => s + w[1], 0);
  let kind = weights[0][0];
  for (const [k, w] of weights) {
    r -= w;
    if (r <= 0) {
      kind = k;
      break;
    }
  }
  const uid = (p: string) => nextUid(state, p);
  switch (kind) {
    case 'weapon':
    case 'armor': {
      const e = makeEquipment(uid('e'), kind, tier);
      lord.gear.push(e);
      return `${kind === 'weapon' ? '神器' : '寶衣'}「${e.name}」`;
    }
    case 'pill': {
      const defId = PILL_IDS[Math.floor(Math.random() * PILL_IDS.length)];
      const pt = Math.min(3, Math.floor(tier / 3));
      const count = 2;
      const pills = Array.from({ length: count }, () => makeItem(uid('i'), defId, pt));
      lord.items.push(...pills);
      return `丹藥「${itemName(defId, pills[0].tier)}」×${count}`;
    }
    case 'technique': {
      const t = makeTechnique(uid('t'), tier);
      lord.scrolls.push(t);
      return `功法「${t.name}」`;
    }
    default: {
      const b = makeBeast(uid('b'), tier);
      lord.beast = b;
      return `靈獸「${b.name}」（${tierName(tier, '階')}）`;
    }
  }
}

/** 秘境：逐人判定生死，生還者得修為與寶物 */
async function resolveExploration(state: GameState, lord: Lord, ex: Expedition, team: General[], protect?: (g: General) => Promise<boolean>): Promise<RealmOutcome> {
  const dead: General[] = [];
  const survivors: General[] = [];
  const insights: string[] = [];
  const score = team.reduce((s, g) => s + power(g), 0);
  for (const g of team) {
    const risk = deathChance(g, team, ex.level) * (ex.blessed ? 0.5 : 1);
    if (Math.random() < risk && !(protect && await protect(g))) {
      killGeneral(state, g);
      dead.push(g);
      continue;
    }
    joinLord(state, lord.id, g);
    survivors.push(g);
    const gain = addExp(g, (200 + score / 6 + Math.random() * 300) * REALM_LEVELS[ex.level].exp);
    if (g.realm < 2 && Math.random() < 0.15) {
      levelUp(g);
      insights.push(`${g.name}於秘境頓悟，直接突破至【${REALMS[g.realm]}】！`);
    } else insights.push(`${g.name}修為 +${gain}`);
  }
  const bonus = (ex.blessed ? 2 : 0) + REALM_LEVELS[ex.level].tier;
  const rewards = survivors.length ? Array.from({ length: realmRolls(ex.level, team.length) }, () => grantReward(state, lord, survivors, team, bonus)) : [];
  const reward = rewards.length ? rewards.join('、') : null;
  const summary = `${ex.realmName}（${REALM_LEVELS[ex.level].name}）探索歸來。${dead.length ? `${dead.map((g) => g.name).join('、')}不幸隕落。` : '全員平安。'}${reward ? `帶回${reward}！` : '一無所獲。'}`;
  return { realmName: ex.realmName, icon: '🌀', dead, survivors, reward, summary, insights };
}

/** 回合開始時推進秘境倒數，時間到就結算 */
export async function advanceExpeditions(state: GameState, lord: Lord, protect?: (g: General) => Promise<boolean>): Promise<RealmOutcome[]> {
  const outcomes: RealmOutcome[] = [];
  for (const ex of lord.expeditions) ex.turnsLeft--;
  const done = lord.expeditions.filter((e) => e.turnsLeft <= 0);
  lord.expeditions = lord.expeditions.filter((e) => e.turnsLeft > 0);
  for (const ex of done) {
    const team = ex.generalIds.map((id) => state.generals[id]);
    outcomes.push(await resolveExploration(state, lord, ex, team, protect));
  }
  return outcomes;
}

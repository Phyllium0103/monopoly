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
  turns: number;
  /** 隕落機率倍率 */
  risk: number;
  /** 寶物品階加成 */
  tier: number;
  /** 修為倍率 */
  exp: number;
  /** 基本寶物份數 */
  rolls: number;
}

/** 秘境難度：以境界命名，由玩家選擇。越高階歷時越久、越兇險，獎勵也越稀有 */
export const REALM_LEVELS: RealmLevel[] = [
  { name: '煉氣', icon: '🌱', turns: 3, risk: 0.4, tier: -1, exp: 0.7, rolls: 1 },
  { name: '築基', icon: '🌿', turns: 4, risk: 0.65, tier: 0, exp: 1, rolls: 1 },
  { name: '金丹', icon: '🍃', turns: 5, risk: 0.95, tier: 1, exp: 1.3, rolls: 1 },
  { name: '元嬰', icon: '🔥', turns: 6, risk: 1.4, tier: 2, exp: 1.7, rolls: 1 },
  { name: '化神', icon: '⚡', turns: 7, risk: 1.9, tier: 3, exp: 2.2, rolls: 2 },
  { name: '煉虛', icon: '🌪️', turns: 8, risk: 2.5, tier: 4, exp: 2.8, rolls: 2 },
  { name: '合體', icon: '🌋', turns: 9, risk: 3.2, tier: 5, exp: 3.5, rolls: 2 },
  { name: '大乘', icon: '☄️', turns: 10, risk: 4, tier: 6, exp: 4.3, rolls: 3 },
  { name: '渡劫', icon: '💀', turns: 12, risk: 5, tier: 7, exp: 5.5, rolls: 3 },
];

export const REALM_MIN_PARTY = 1;
export const REALM_MAX_PARTY = 5;

/** 人多寶物多：四人以上多得一份 */
export function realmRolls(level: number, partySize: number): number {
  return REALM_LEVELS[level].rolls + (partySize >= 4 ? 1 : 0);
}

/** 個別死亡機率：自身越強越低，隊伍越強也越低 */
export function deathChance(g: General, team: General[], level = 1): number {
  const teamPower = team.reduce((s, x) => s + power(x), 0);
  const own = Math.max(0.03, 0.4 - power(g) / 2500);
  const teamFactor = Math.max(0.6, Math.min(1.2, 1.3 - teamPower / 4000));
  return Math.max(0.02, Math.min(0.9, own * teamFactor * REALM_LEVELS[level].risk * (1 - (fx(g).realmSafety ?? 0) - (traitOf(g.owner).realmSafety ?? 0))));
}

export function dispatch(lord: Lord, team: General[], realmName: string, level = 1) {
  for (const g of team) g.status = 'realm';
  lord.expeditions.push({ generalIds: team.map((g) => g.id), turnsLeft: REALM_LEVELS[level].turns, realmName, level, blessed: WORLD.realmBlessed });
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
function resolveExploration(state: GameState, lord: Lord, ex: Expedition, team: General[]): RealmOutcome {
  const dead: General[] = [];
  const survivors: General[] = [];
  const insights: string[] = [];
  const score = team.reduce((s, g) => s + power(g), 0);
  for (const g of team) {
    const risk = deathChance(g, team, ex.level) * (ex.blessed ? 0.5 : 1);
    if (Math.random() < risk) {
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
export function advanceExpeditions(state: GameState, lord: Lord): RealmOutcome[] {
  const outcomes: RealmOutcome[] = [];
  for (const ex of lord.expeditions) ex.turnsLeft--;
  const done = lord.expeditions.filter((e) => e.turnsLeft <= 0);
  lord.expeditions = lord.expeditions.filter((e) => e.turnsLeft > 0);
  for (const ex of done) {
    const team = ex.generalIds.map((id) => state.generals[id]);
    outcomes.push(resolveExploration(state, lord, ex, team));
  }
  return outcomes;
}

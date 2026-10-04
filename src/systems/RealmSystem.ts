import type { GameState, General, Lord } from '../game/types';
import { joinLord, killGeneral, nextUid } from '../game/GameState';
import { addExp, craft, levelUp, power, totalCraft } from './GeneralSystem';
import { REALMS } from '../data/generals';
import { WORLD } from './WorldMods';
import { PILL_IDS, itemName, makeBeast, makeEquipment, makeItem, makeTechnique, tierName } from '../data/items';
import { fx } from '../data/passives';
import type { Expedition } from '../game/types';

export const REALM_TURNS = 5;

/** 個別死亡機率：自身越強越低，隊伍越強也越低 */
export function deathChance(g: General, team: General[]): number {
  const teamPower = team.reduce((s, x) => s + power(x), 0);
  const own = Math.max(0.03, 0.4 - power(g) / 2500);
  const teamFactor = Math.max(0.6, Math.min(1.2, 1.3 - teamPower / 4000));
  return Math.max(0.02, Math.min(0.45, own * teamFactor * (1 - (fx(g).realmSafety ?? 0))));
}

export function dispatch(lord: Lord, team: General[], realmName: string) {
  for (const g of team) g.status = 'realm';
  lord.expeditions.push({ generalIds: team.map((g) => g.id), turnsLeft: REALM_TURNS, realmName, blessed: WORLD.realmBlessed });
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
    const risk = deathChance(g, team) * (ex.blessed ? 0.5 : 1);
    if (Math.random() < risk) {
      killGeneral(state, g);
      dead.push(g);
      continue;
    }
    joinLord(state, lord.id, g);
    survivors.push(g);
    const gain = addExp(g, 200 + score / 6 + Math.random() * 300);
    if (g.realm < 2 && Math.random() < 0.15) {
      levelUp(g);
      insights.push(`${g.name}於秘境頓悟，直接突破至【${REALMS[g.realm]}】！`);
    } else insights.push(`${g.name}修為 +${gain}`);
  }
  const reward = survivors.length ? grantReward(state, lord, survivors, team, ex.blessed ? 2 : 0) : null;
  const summary = `${ex.realmName}探索歸來。${dead.length ? `${dead.map((g) => g.name).join('、')}不幸隕落。` : '全員平安。'}${reward ? `帶回${reward}！` : '一無所獲。'}`;
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

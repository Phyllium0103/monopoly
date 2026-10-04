import type { GameState, General, Lord } from '../game/types';
import { joinLord, nextUid } from '../game/GameState';
import { addExp, craft, levelUp, power, totalCraft } from './GeneralSystem';
import { REALMS } from '../data/generals';
import { ITEM_DEFS, PILL_IDS, itemName, makeBeast, makeEquipment, makeTechnique, tierName } from '../data/items';

export const REALM_TURNS = 5;

/** 個別死亡機率：自身越強越低，隊伍越強也越低 */
export function deathChance(g: General, team: General[]): number {
  const teamPower = team.reduce((s, x) => s + power(x), 0);
  const own = Math.max(0.03, 0.4 - power(g) / 2500);
  const teamFactor = Math.max(0.6, Math.min(1.2, 1.3 - teamPower / 4000));
  return Math.max(0.02, Math.min(0.45, own * teamFactor));
}

export function dispatch(lord: Lord, team: General[], realmName: string) {
  for (const g of team) g.status = 'realm';
  lord.expeditions.push({ generalIds: team.map((g) => g.id), turnsLeft: REALM_TURNS, realmName });
}

export interface RealmOutcome {
  realmName: string;
  dead: General[];
  survivors: General[];
  reward: string | null;
  /** 奇遇：修為獲得與頓悟突破 */
  insights: string[];
}

/** 依隊伍屬性決定獎勵種類與品階 */
function grantReward(state: GameState, lord: Lord, team: General[], all: General[]): string {
  const score = all.reduce((s, g) => s + power(g) + totalCraft(g) * 0.5, 0);
  const tier = Math.max(0, Math.min(11, Math.floor(score / 450) + Math.floor(Math.random() * 3) - 1));
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
      for (let i = 0; i < count; i++) lord.items.push({ uid: uid('i'), defId, tier: pt, price: ITEM_DEFS[defId].price[pt] });
      return `丹藥「${itemName(defId, pt)}」×${count}`;
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

/** 回合開始時推進秘境倒數，時間到就結算 */
export function advanceExpeditions(state: GameState, lord: Lord): RealmOutcome[] {
  const outcomes: RealmOutcome[] = [];
  for (const ex of lord.expeditions) ex.turnsLeft--;
  const done = lord.expeditions.filter((e) => e.turnsLeft <= 0);
  lord.expeditions = lord.expeditions.filter((e) => e.turnsLeft > 0);
  for (const ex of done) {
    const team = ex.generalIds.map((id) => state.generals[id]);
    const dead: General[] = [];
    const survivors: General[] = [];
    const insights: string[] = [];
    const score = team.reduce((s, g) => s + power(g), 0);
    for (const g of team) {
      if (Math.random() < deathChance(g, team)) {
        g.status = 'dead';
        g.owner = null;
        dead.push(g);
        continue;
      }
      joinLord(state, lord.id, g);
      survivors.push(g);
      // 奇遇：巨量修為，低階者有機會當場頓悟突破
      const gain = addExp(g, 200 + score / 6 + Math.random() * 300);
      if (g.realm < 2 && Math.random() < 0.15) {
        levelUp(g);
        insights.push(`${g.name}於秘境頓悟，直接突破至【${REALMS[g.realm]}】！`);
      } else insights.push(`${g.name}修為 +${gain}`);
    }
    const reward = survivors.length ? grantReward(state, lord, survivors, team) : null;
    outcomes.push({ realmName: ex.realmName, dead, survivors, reward, insights });
  }
  return outcomes;
}

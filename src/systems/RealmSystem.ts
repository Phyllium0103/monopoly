import type { Expedition, GameState, General, Lord } from '../game/types';
import { citiesOf, joinLord, nextUid } from '../game/GameState';
import { addExp, attack, craft, defense, expCap, levelUp, maxHp, needsTribulation, power, totalCraft } from './GeneralSystem';
import { REALMS } from '../data/generals';
import { PORT_CITIES } from '../data/board';
import { WORLD } from './WorldMods';
import { ITEM_DEFS, PILL_IDS, itemName, makeBeast, makeEquipment, makeTechnique, tierName } from '../data/items';
import { fmtStones } from '../game/Currency';

export const REALM_TURNS = 5;
export const TRADE_TURNS = 4;
export const ISLAND_TURNS = 6;
export const ISLANDS = ['蓬萊', '方丈', '瀛洲'];

/** 個別死亡機率：自身越強越低，隊伍越強也越低 */
export function deathChance(g: General, team: General[]): number {
  const teamPower = team.reduce((s, x) => s + power(x), 0);
  const own = Math.max(0.03, 0.4 - power(g) / 2500);
  const teamFactor = Math.max(0.6, Math.min(1.2, 1.3 - teamPower / 4000));
  return Math.max(0.02, Math.min(0.45, own * teamFactor));
}

/** 尋訪仙山比秘境兇險一半 */
export function islandDeathChance(g: General, team: General[]): number {
  return Math.min(0.6, deathChance(g, team) * 1.5);
}

export function dispatch(lord: Lord, team: General[], realmName: string) {
  for (const g of team) g.status = 'realm';
  lord.expeditions.push({ kind: 'realm', generalIds: team.map((g) => g.id), turnsLeft: REALM_TURNS, realmName, blessed: WORLD.realmBlessed });
}

// ───────────────────────── 港口出海 ─────────────────────────

/** 停在港口城池，或擁有任一港口城池，就能出海 */
export function canVoyage(state: GameState, lord: Lord): boolean {
  const t = state.tiles[lord.position];
  if (t.kind === 'city' && PORT_CITIES.has(t.cityId!)) return true;
  return citiesOf(state, lord.id).some((c) => PORT_CITIES.has(c.id));
}

/** 經商能力：隊伍中煉器與煉丹的最佳平均 */
export function tradeSkill(team: General[]): number {
  return Math.max(0, ...team.map((g) => (craft(g, 'forging') + craft(g, 'alchemy')) / 2));
}

/** 預估獲利倍率（未計入隨機） */
export function tradeMultiplier(team: General[]): number {
  return 1.3 + tradeSkill(team) / 150;
}

/** 遇到海盜的機率：隊伍武力越高越安全 */
export function pirateChance(team: General[]): number {
  return Math.max(0.05, 0.3 - team.reduce((s, g) => s + attack(g), 0) / 1200);
}

export const SHIPWRECK_CHANCE = 0.06;

export function launchTrade(lord: Lord, team: General[], invest: number) {
  lord.stones -= invest;
  for (const g of team) g.status = 'realm';
  lord.expeditions.push({ kind: 'trade', generalIds: team.map((g) => g.id), turnsLeft: TRADE_TURNS, realmName: '海外貿易', invest });
}

export function launchIsland(lord: Lord, team: General[]) {
  for (const g of team) g.status = 'realm';
  const island = ISLANDS[Math.floor(Math.random() * ISLANDS.length)];
  lord.expeditions.push({ kind: 'island', generalIds: team.map((g) => g.id), turnsLeft: ISLAND_TURNS, realmName: `${island}仙山` });
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
      const pt = ITEM_DEFS[defId].price.length === 1 ? 0 : Math.min(3, Math.floor(tier / 3));
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

function killGeneral(g: General) {
  g.status = 'dead';
  g.owner = null;
}

/** 秘境與仙山：逐人判定生死，生還者得修為與寶物 */
function resolveExploration(state: GameState, lord: Lord, ex: Expedition, team: General[], island: boolean): RealmOutcome {
  const dead: General[] = [];
  const survivors: General[] = [];
  const insights: string[] = [];
  const score = team.reduce((s, g) => s + power(g), 0);
  for (const g of team) {
    const risk = island ? islandDeathChance(g, team) : deathChance(g, team) * (ex.blessed ? 0.5 : 1);
    if (Math.random() < risk) {
      killGeneral(g);
      dead.push(g);
      continue;
    }
    joinLord(state, lord.id, g);
    survivors.push(g);
    if (island) {
      // 仙緣：修為大增；低階直接突破，高階由仙人護法（下次渡劫減傷）
      const gain = addExp(g, 500 + score / 4 + Math.random() * 700);
      if (Math.random() < 0.3) {
        if (!needsTribulation(g) && g.realm < REALMS.length - 1) {
          levelUp(g);
          insights.push(`${g.name}得仙人點化，直接突破至【${REALMS[g.realm]}】！`);
        } else {
          g.exp = Math.max(g.exp, expCap(g) === Infinity ? g.exp : expCap(g));
          g.ward = Math.min(0.8, g.ward + 0.5);
          insights.push(`${g.name}得仙人點化，修為圓滿，下次渡劫有仙人護法（減傷 50%）！`);
        }
      } else insights.push(`${g.name}修為 +${gain}`);
    } else {
      const gain = addExp(g, 200 + score / 6 + Math.random() * 300);
      if (g.realm < 2 && Math.random() < 0.15) {
        levelUp(g);
        insights.push(`${g.name}於秘境頓悟，直接突破至【${REALMS[g.realm]}】！`);
      } else insights.push(`${g.name}修為 +${gain}`);
    }
  }
  let reward: string | null = null;
  if (survivors.length) {
    reward = grantReward(state, lord, survivors, team, island ? 3 : ex.blessed ? 2 : 0);
    if (island) reward += `、${grantReward(state, lord, survivors, team, 3)}`;
  }
  const verb = island ? '尋訪歸來' : '探索歸來';
  const summary = `${ex.realmName}${verb}。${dead.length ? `${dead.map((g) => g.name).join('、')}不幸隕落。` : '全員平安。'}${reward ? `帶回${reward}！` : '一無所獲。'}`;
  return { realmName: ex.realmName, icon: island ? '🏝️' : '🌀', dead, survivors, reward, summary, insights };
}

/** 海外貿易：成功帶回本金 × 倍率；遇海盜血本無歸；船難可能折將 */
function resolveTrade(state: GameState, lord: Lord, ex: Expedition, team: General[]): RealmOutcome {
  const invest = ex.invest ?? 0;
  const dead: General[] = [];
  const insights: string[] = [];
  let summary: string;
  const r = Math.random();
  if (r < SHIPWRECK_CHANCE) {
    for (const g of team) {
      const d = defense(g);
      if (Math.random() < 0.3 * (1 - d / (d + 300))) {
        killGeneral(g);
        dead.push(g);
      }
    }
    summary = `商船遭遇風暴沉沒，${fmtStones(invest)} 貨款付諸東流。${dead.length ? `${dead.map((g) => g.name).join('、')}葬身大海。` : '眾將僥倖生還。'}`;
  } else if (r < SHIPWRECK_CHANCE + pirateChance(team)) {
    for (const g of team) g.hp = Math.max(1, Math.round(g.hp - maxHp(g) * 0.3));
    summary = `商船遭海盜洗劫，${fmtStones(invest)} 貨款全數被奪，眾將負傷而回。`;
  } else {
    const mult = tradeMultiplier(team) + (Math.random() * 0.5 - 0.2);
    const income = Math.round(invest * mult);
    lord.stones += income;
    for (const g of team) insights.push(`${g.name}修為 +${addExp(g, 100)}`);
    summary = `商隊滿載而歸！投入 ${fmtStones(invest)}，帶回 ${fmtStones(income)}（×${mult.toFixed(2)}）。`;
  }
  const survivors = team.filter((g) => g.status !== 'dead');
  for (const g of survivors) joinLord(state, lord.id, g);
  return { realmName: ex.realmName, icon: '⛵', dead, survivors, reward: null, summary, insights };
}

/** 回合開始時推進秘境與出海倒數，時間到就結算 */
export function advanceExpeditions(state: GameState, lord: Lord): RealmOutcome[] {
  const outcomes: RealmOutcome[] = [];
  for (const ex of lord.expeditions) ex.turnsLeft--;
  const done = lord.expeditions.filter((e) => e.turnsLeft <= 0);
  lord.expeditions = lord.expeditions.filter((e) => e.turnsLeft > 0);
  for (const ex of done) {
    const team = ex.generalIds.map((id) => state.generals[id]);
    if (ex.kind === 'trade') outcomes.push(resolveTrade(state, lord, ex, team));
    else outcomes.push(resolveExploration(state, lord, ex, team, ex.kind === 'island'));
  }
  return outcomes;
}

import type { GameState, Lord } from './types';
import { citiesOf, generalsOf } from './GameState';
import { cityIncome } from '../systems/CitySystem';
import { addExp, inBottleneck, passiveExp, recover } from '../systems/GeneralSystem';
import { advanceExpeditions, type RealmOutcome } from '../systems/RealmSystem';
import { ITEM_DEFS, PILL_IDS, beastPower } from '../data/items';
import { nextUid } from './GameState';
import { fmtStones } from './Currency';

export interface TurnReport {
  lines: { text: string; kind: 'good' | 'bad' | 'info' }[];
  realms: RealmOutcome[];
  /** 本回合新進入瓶頸、可以突破的將領 */
  bottlenecks: string[];
}

/** 主公回合開始：城池收入、繁榮成長、將領修煉與回復、秘境結算、靈獸尋寶 */
export function startTurn(state: GameState, lord: Lord): TurnReport {
  const report: TurnReport = { lines: [], realms: [], bottlenecks: [] };
  let stones = 0;
  let soldiers = 0;
  for (const city of citiesOf(state, lord.id)) {
    const inc = cityIncome(city);
    stones += inc.stones;
    soldiers += inc.soldiers;
    city.prosperity = Math.min(200, city.prosperity + 2);
    if (city.shieldTurns > 0) city.shieldTurns--;
  }
  lord.stones += stones;
  lord.soldiers += soldiers;
  if (stones) report.lines.push({ text: `城池收入 ${fmtStones(stones)}、士兵 +${soldiers}`, kind: 'good' });

  if (lord.beast?.skill === 'treasure') {
    const found = beastPower(lord.beast).treasure;
    lord.stones += found;
    let text = `${lord.beast.name}尋得 ${fmtStones(found)}`;
    if (lord.beast.name.includes('九尾狐') && Math.random() < 0.15) {
      const defId = PILL_IDS[Math.floor(Math.random() * PILL_IDS.length)];
      lord.items.push({ uid: nextUid(state, 'i'), defId, tier: 0, price: ITEM_DEFS[defId].price[0] });
      text += `，還叼回一顆丹藥`;
    }
    report.lines.push({ text, kind: 'good' });
  }

  // 周天吐納：秘境中的將領不吸納靈氣
  let gained = 0;
  for (const g of generalsOf(state, lord.id)) {
    recover(g);
    if (g.status === 'realm') continue;
    const was = inBottleneck(g);
    gained += addExp(g, passiveExp(g, g.cityId ? state.cities[g.cityId] : null));
    if (!was && inBottleneck(g)) report.bottlenecks.push(g.id);
  }
  if (gained) report.lines.push({ text: `眾將周天吐納，修為共 +${gained}`, kind: 'info' });
  for (const id of report.bottlenecks) report.lines.push({ text: `${state.generals[id].name}修為圓滿，進入瓶頸，可在武將名冊嘗試突破。`, kind: 'good' });

  report.realms = advanceExpeditions(state, lord);
  lord.tollFree = false;
  lord.siegeBoost = 1;
  lord.doubleDice = false;
  lord.fixedDice = null;
  return report;
}

/** 推進到下一位存活的主公；回傳是否進入新的一輪 */
export function advance(state: GameState): boolean {
  let newRound = false;
  for (let i = 0; i < state.order.length; i++) {
    state.turn++;
    if (state.turn >= state.order.length) {
      state.turn = 0;
      state.round++;
      newRound = true;
    }
    if (state.lords[state.order[state.turn]].alive) break;
  }
  return newRound;
}

export function aliveLords(state: GameState): Lord[] {
  return Object.values(state.lords).filter((l) => l.alive);
}

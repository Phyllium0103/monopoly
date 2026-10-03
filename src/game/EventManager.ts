import type { Character, GameState } from './types';
import { FACTIONS } from '../faction/Faction';
import { citiesOf } from './GameState';
import { gainCultivation } from '../systems/CultivationSystem';
import { addResources, formatGain } from '../systems/EconomySystem';

export interface EventChoice {
  label: string;
  /** 執行選項並回傳結果文字 */
  resolve: () => string;
}

export interface EventInstance {
  title: string;
  text: string;
  icon: string;
  choices: EventChoice[];
}

interface Ctx {
  state: GameState;
  hero: Character;
  mult: number;
}

interface EventDef {
  id: string;
  title: string;
  icon: string;
  weight: number;
  when?: (ctx: Ctx) => boolean;
  build: (ctx: Ctx) => { text: string; choices?: EventChoice[] };
}

const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const ok = (resolve: () => string = () => ''): EventChoice[] => [{ label: '確定', resolve }];

const EVENTS: EventDef[] = [
  {
    id: 'qiTide',
    title: '靈氣潮汐',
    icon: '🌊',
    weight: 10,
    build: ({ state }) => {
      state.qiTideTurn = state.turn;
      return { text: '天地靈氣突然增加。\n\n本回合所有修煉效果 +30%。' };
    },
  },
  {
    id: 'refugees',
    title: '流民',
    icon: '👥',
    weight: 10,
    when: ({ state }) => citiesOf(state, state.player).length > 0,
    build: ({ state, mult }) => {
      const city = pick(citiesOf(state, state.player));
      const n = Math.round(100 * mult);
      city.population += n;
      return { text: `大量流民進入${city.name}。\n\n人口 +${n}。` };
    },
  },
  {
    id: 'beast',
    title: '妖獸襲城',
    icon: '🐉',
    weight: 8,
    when: ({ state }) => citiesOf(state, state.player).length > 0,
    build: ({ state, mult }) => {
      const city = pick(citiesOf(state, state.player));
      // 晉的天機可預警，減輕災害
      const n = Math.round(20 / mult);
      city.defense = Math.max(10, city.defense - n);
      return { text: `妖獸攻擊${city.name}。\n\n城防 -${n}。` };
    },
  },
  {
    id: 'cave',
    title: '古代洞府',
    icon: '🏔️',
    weight: 9,
    build: ({ state, hero, mult }) => ({
      text: `${hero.name}在途中發現一處古代修士洞府，石門上禁制猶存。\n\n是否探索？`,
      choices: [
        {
          label: '探索',
          resolve: () => {
            if (Math.random() < 0.65) {
              const r = gainCultivation(hero, 300 * mult);
              const qi = Math.round(50 * mult);
              state.factions[state.player].resources.qi += qi;
              return `${hero.name}得到前人傳承！修為 +${r.gained}，靈氣 +${qi}。${r.brokeThrough ? ` ✦ 突破至【${r.newRealm}】！` : ''}`;
            }
            const loss = Math.round(hero.troops * 0.2);
            hero.troops -= loss;
            return `洞府禁制發動！${hero.name}的部隊折損 ${loss} 人。`;
          },
        },
        { label: '離開', resolve: () => `${hero.name}謹慎地離開了洞府。` },
      ],
    }),
  },
  {
    id: 'caravan',
    title: '行商過境',
    icon: '🐫',
    weight: 9,
    build: ({ state, mult }) => {
      const gain = { stones: Math.round(120 * mult) };
      addResources(state.factions[state.player].resources, gain);
      return { text: `一支西域商隊途經，向宗門獻上厚禮。\n\n${formatGain(gain)}。` };
    },
  },
  {
    id: 'harvest',
    title: '五穀豐登',
    icon: '🌾',
    weight: 8,
    build: ({ state, mult }) => {
      const gain = { food: Math.round(200 * mult) };
      addResources(state.factions[state.player].resources, gain);
      return { text: `風調雨順，各地豐收。\n\n${formatGain(gain)}。` };
    },
  },
  {
    id: 'bandits',
    title: '山賊劫道',
    icon: '🗡️',
    weight: 7,
    build: ({ state, hero, mult }) => {
      if (hero.troops > 20) {
        const loss = Math.round(15 / mult);
        hero.troops -= loss;
        return { text: `${hero.name}遭遇山賊伏擊，雖擊退敵人，部隊折損 ${loss} 人。` };
      }
      const food = Math.min(state.factions[state.player].resources.food, Math.round(60 / mult));
      state.factions[state.player].resources.food -= food;
      return { text: `${hero.name}遭遇山賊，被劫走糧草 ${food}。` };
    },
  },
  {
    id: 'wanderer',
    title: '散修投奔',
    icon: '🧘',
    weight: 8,
    build: ({ state, mult }) => {
      const n = Math.round(2 * mult);
      state.factions[state.player].disciples[0] += n;
      return { text: `${n} 名散修仰慕宗門威名，前來投奔。\n\n弟子 +${n}。` };
    },
  },
  {
    id: 'meteor',
    title: '天降隕鐵',
    icon: '☄️',
    weight: 6,
    build: ({ state, mult }) => {
      const gain = { iron: Math.round(80 * mult), wood: Math.round(40 * mult) };
      addResources(state.factions[state.player].resources, gain);
      return { text: `夜空劃過流星，墜落於附近山谷。\n\n${formatGain(gain)}。` };
    },
  },
  {
    id: 'enlighten',
    title: '頓悟',
    icon: '💫',
    weight: 6,
    build: ({ hero, mult }) => {
      const r = gainCultivation(hero, 160 * mult);
      return { text: `${hero.name}觀雲海翻騰，心有所悟。\n\n修為 +${r.gained}。${r.brokeThrough ? `\n✦ 突破至【${r.newRealm}】！` : ''}` };
    },
  },
];

export class EventManager {
  /** 移動後依勢力機率觸發隨機事件 */
  maybeTrigger(state: GameState, hero: Character, forced = false): EventInstance | null {
    const def = FACTIONS[state.player];
    if (!forced && Math.random() > def.eventChance) return null;
    return this.trigger(state, hero);
  }

  trigger(state: GameState, hero: Character): EventInstance {
    const ctx: Ctx = { state, hero, mult: FACTIONS[state.player].eventPower };
    const pool = EVENTS.filter((e) => !e.when || e.when(ctx));
    let r = Math.random() * pool.reduce((s, e) => s + e.weight, 0);
    let chosen = pool[0];
    for (const e of pool) {
      r -= e.weight;
      if (r <= 0) {
        chosen = e;
        break;
      }
    }
    const built = chosen.build(ctx);
    return { title: chosen.title, icon: chosen.icon, text: built.text, choices: built.choices ?? ok() };
  }

  /** 秘境探索：高風險高回報 */
  exploreRealm(state: GameState, hero: Character, realmName: string): EventInstance {
    const mult = FACTIONS[state.player].eventPower;
    const fs = state.factions[state.player];
    const roll = Math.random();
    let text: string;
    if (roll < 0.4) {
      const r = gainCultivation(hero, (350 + Math.random() * 300) * mult);
      text = `${hero.name}深入${realmName}，於上古遺跡中參悟道法。\n\n修為 +${r.gained}。${r.brokeThrough ? `\n✦ 突破至【${r.newRealm}】！` : ''}`;
    } else if (roll < 0.7) {
      const gain = { stones: Math.round(250 * mult), qi: Math.round(60 * mult) };
      addResources(fs.resources, gain);
      text = `${hero.name}在${realmName}尋得前人寶庫。\n\n${formatGain(gain)}。`;
    } else if (roll < 0.85) {
      hero.attack += 6;
      hero.defense += 4;
      text = `${hero.name}在${realmName}取得一件上品法器！\n\n攻擊 +6、防禦 +4。`;
    } else {
      const loss = Math.round(hero.troops * 0.3);
      hero.troops -= loss;
      text = `${realmName}中的守護妖獸甦醒！${hero.name}奮戰脫身，部隊折損 ${loss} 人。`;
    }
    return { title: `探索・${realmName}`, icon: '🌀', text, choices: ok() };
  }

  /** 踩到特殊格子時的效果 */
  tileEffect(state: GameState, hero: Character, tile: string): string | null {
    const fs = state.factions[state.player];
    const mult = FACTIONS[state.player].eventPower;
    if (tile === 'vein') {
      const qi = Math.round(25 * mult);
      fs.resources.qi += qi;
      const r = gainCultivation(hero, 60 * mult);
      return `${hero.name}踏上靈脈，靈氣 +${qi}，修為 +${r.gained}。${r.brokeThrough ? ` ✦ 突破至【${r.newRealm}】！` : ''}`;
    }
    if (tile === 'market') {
      const s = Math.round(60 * mult);
      fs.resources.stones += s;
      return `${hero.name}途經市集，交易獲得靈石 +${s}。`;
    }
    return null;
  }
}

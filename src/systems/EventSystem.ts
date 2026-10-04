import type { Element, GameState, General, Lord, LordId } from '../game/types';
import { citiesOf, freeGenerals, generalsOf, nextUid } from '../game/GameState';
import { aliveLords } from '../game/TurnManager';
import { cityIncomeOf, totalAssets } from './CitySystem';
import { addExp, inBottleneck, maxHp } from './GeneralSystem';
import { ELEMENT_NAMES, PILL_IDS, itemName, makeBeast, makeEquipment, makeItem, makeTechnique, techniqueExp } from '../data/items';
import { CITY_TERRAIN } from '../data/terrain';
import { REALMS } from '../data/generals';
import { LORDS } from '../faction/Faction';
import { fmtStones } from '../game/Currency';
import type { Offer } from './ShopSystem';
import { WORLD } from './WorldMods';

export { WORLD };

export type EventCategory = 'economy' | 'cultivation' | 'politics' | 'disaster';

export interface WorldEventDef {
  id: string;
  name: string;
  icon: string;
  category: EventCategory;
  desc: string;
  /** 持續輪數；沒有則為立即生效 */
  duration?: number;
}

/** 每 5 輪抽一次的九州風雲 */
export const EVENT_INTERVAL = 5;
/** 災難類事件第 20 輪之後才會出現 */
export const DISASTER_AFTER = 20;

export const WORLD_EVENTS: WorldEventDef[] = [
  { id: 'merchant', name: '旅行商人', icon: '🐫', category: 'economy', desc: '一支西域商隊停在地圖上的某個定點，不限時。第一位走到那裡的主公可用 7 折購買地階、天階的稀有貨品，交易後商隊便會離開。' },
  { id: 'windfall', name: '天降橫財', icon: '💰', category: 'economy', desc: '天降靈石雨，每位主公都得到一筆靈石，越窮的拿越多。' },
  { id: 'harvest', name: '五穀豐登', icon: '🌾', category: 'economy', desc: '風調雨順，各主公額外獲得一輪城池收入，所有城池繁榮 +10。' },
  { id: 'auction', name: '天寶拍賣會', icon: '🔨', category: 'economy', desc: '拍賣一件天階寶物，四位主公各自秘密出價，價高者得。' },
  { id: 'qiSurge', name: '靈力爆發', icon: '✨', category: 'cultivation', duration: 5, desc: '天地靈氣暴漲，接下來 5 輪所有修為獲得 ×2。' },
  { id: 'heavenFavor', name: '天道垂青', icon: '⚡', category: 'cultivation', duration: 3, desc: '天道垂青，接下來 3 輪渡劫天雷傷害 -40%、低階突破成功率 +15%。' },
  { id: 'elementTide', name: '五行輪轉', icon: '🔥', category: 'cultivation', duration: 5, desc: '五行之一當令 5 輪，修習該屬性功法的武將在擂台上傷害 +30%。' },
  { id: 'ancientRealm', name: '上古秘境現世', icon: '🌀', category: 'cultivation', duration: 5, desc: '上古秘境現世 5 輪，期間派入秘境的武將隕落率減半、帶回的寶物品階更高。' },
  { id: 'immortals', name: '仙人出山', icon: '🧙', category: 'cultivation', desc: '左慈、于吉、華佗、管輅四位方外高人現身聽風樓，能力極高但身價不菲。' },
  { id: 'edict', name: '天子詔令', icon: '📜', category: 'politics', desc: '天子下詔：總資產最高的主公上繳一成靈石，平分給其他主公。' },
  { id: 'alliance', name: '群雄會盟', icon: '🤝', category: 'politics', duration: 3, desc: '群雄會盟 3 輪：過路費減半，且不能發起任何戰鬥。' },
  { id: 'beastTide', name: '妖獸潮', icon: '🐉', category: 'disaster', desc: '妖獸成群襲城，所有城池守軍 -15%；擁有靈獸的主公可由靈獸護城，免除損失。' },
  { id: 'quake', name: '天災地動', icon: '🌋', category: 'disaster', desc: '天崩地裂，隨機 3 座有主城池繁榮 -20。' },
  { id: 'bandits', name: '黃巾餘黨', icon: '🏴', category: 'disaster', duration: 5, desc: '黃巾餘黨盤踞 4 處驛道 5 輪，停在賊窩要繳買路錢，否則損兵。' },
  { id: 'shuffle', name: '乾坤大挪移', icon: '☯', category: 'disaster', desc: '天機錯亂，所有主公的位置隨機互換。' },
  { id: 'demonTrial', name: '心魔劫', icon: '😈', category: 'disaster', desc: '心魔劫降臨，所有處於瓶頸的武將都染上一層心魔。' },
  { id: 'tradeBoom', name: '商路暢通', icon: '🛒', category: 'economy', duration: 4, desc: '絲路與運河舟車不絕，接下來 4 輪所有城池的靈石收入 ×1.3。' },
  { id: 'armory', name: '兵器庫開啟', icon: '🗡️', category: 'economy', desc: '舊朝兵器庫被打開，每位主公分得一件黃階至玄階的神器或寶衣。' },
  { id: 'spiritTide', name: '靈潮湧動', icon: '🌊', category: 'cultivation', duration: 5, desc: '地底靈脈潮汐翻湧，接下來 5 輪駐守城池閉關修煉的武將，修為再 ×1.5。' },
  { id: 'meteor', name: '隕星墜落', icon: '☄️', category: 'cultivation', desc: '流星墜入人間，星髓入藥：每位主公得到兩顆玄品至地品的丹藥。' },
  { id: 'debate', name: '論道大會', icon: '☯️', category: 'cultivation', desc: '各路修士雲集論道，每位主公所有隨行武將修為 +120。' },
  { id: 'refugees', name: '流民歸附', icon: '🚶', category: 'politics', desc: '亂世流民扶老攜幼投奔明主：每位主公按城池數增加士兵，無城者也有 500 人來投。' },
  { id: 'summon', name: '招賢令', icon: '📯', category: 'politics', duration: 3, desc: '天下求賢若渴，接下來 3 輪聽風樓的招募價格五折。' },
  { id: 'locust', name: '蝗災', icon: '🦗', category: 'disaster', duration: 3, desc: '飛蝗蔽日，接下來 3 輪所有城池的靈石收入 ×0.6。' },
  { id: 'plague', name: '瘟疫', icon: '☠️', category: 'disaster', desc: '大疫流行，所有主公士兵 -8%，隨行武將損失 15% 血量（至少留 1 點）。' },
  { id: 'flood', name: '洪水', icon: '🌧️', category: 'disaster', desc: '大水氾濫，水鄉與濱海的有主城池繁榮 -12、守軍 -10%。' },
  { id: 'mutiny', name: '軍中兵變', icon: '🔥', category: 'disaster', desc: '糧餉不繼，兵多將驕：士兵最多的主公，一成半的兵卒嘩變逃散。' },
  { id: 'raiders', name: '盜賊洗劫', icon: '🥷', category: 'disaster', desc: '江洋大盜覬覦巨富，靈石最多的主公庫房被劫走 8%（至多 3 上品）。' },
];

export function eventDef(id: string): WorldEventDef {
  return WORLD_EVENTS.find((e) => e.id === id)!;
}


export function isActive(state: GameState, id: string): boolean {
  return state.events.some((e) => e.id === id);
}

export function syncWorldMods(state: GameState) {
  WORLD.expMult = isActive(state, 'qiSurge') ? 2 : 1;
  WORLD.boltMult = isActive(state, 'heavenFavor') ? 0.6 : 1;
  WORLD.breakBonus = isActive(state, 'heavenFavor') ? 0.15 : 0;
  WORLD.element = isActive(state, 'elementTide') ? state.favoredElement : null;
  WORLD.tollMult = isActive(state, 'alliance') ? 0.5 : 1;
  WORLD.noBattle = isActive(state, 'alliance');
  WORLD.realmBlessed = isActive(state, 'ancientRealm');
  WORLD.incomeMult = (isActive(state, 'tradeBoom') ? 1.3 : 1) * (isActive(state, 'locust') ? 0.6 : 1);
  WORLD.seclusionMult = isActive(state, 'spiritTide') ? 1.5 : 1;
  WORLD.recruitMult = isActive(state, 'summon') ? 0.5 : 1;
}

/** 新的一輪開始：持續事件倒數，到期移除 */
export function tickWorldEvents(state: GameState): string[] {
  const ended: string[] = [];
  for (const e of state.events) e.roundsLeft--;
  for (const e of state.events.filter((x) => x.roundsLeft <= 0)) {
    ended.push(`${e.icon} ${e.name}結束了。`);
    if (e.id === 'bandits') state.banditTiles = [];
    if (e.id === 'elementTide') state.favoredElement = null;
  }
  state.events = state.events.filter((x) => x.roundsLeft > 0);
  syncWorldMods(state);
  return ended;
}

/** 抽選本次事件：災難第 20 輪後才出現，盡量不重複 */
export function pickWorldEvent(state: GameState): WorldEventDef {
  let pool = WORLD_EVENTS.filter((e) => e.category !== 'disaster' || state.round > DISASTER_AFTER);
  pool = pool.filter((e) => !isActive(state, e.id) && !(e.id === 'merchant' && state.merchantTile !== null));
  const fresh = pool.filter((e) => !state.usedEvents.includes(e.id));
  if (fresh.length) pool = fresh;
  // 第 20 輪後提高災難出現機率
  const weight = (e: WorldEventDef) => (e.category === 'disaster' ? 1.5 : 1);
  let r = Math.random() * pool.reduce((s, e) => s + weight(e), 0);
  for (const e of pool) {
    r -= weight(e);
    if (r <= 0) return e;
  }
  return pool[pool.length - 1];
}

const shuffle = <T,>(arr: T[]): T[] => arr.map((v) => [Math.random(), v] as const).sort((a, b) => a[0] - b[0]).map((x) => x[1]);

/** 立即或開始事件，回傳要公告的細節 */
export function applyWorldEvent(state: GameState, def: WorldEventDef): string[] {
  state.usedEvents.push(def.id);
  const lines: string[] = [];
  if (def.duration) state.events.push({ id: def.id, name: def.name, icon: def.icon, roundsLeft: def.duration });
  const alive = aliveLords(state);
  switch (def.id) {
    case 'merchant': {
      const candidates = state.tiles.filter((t) => t.kind === 'road' || t.kind === 'city');
      const tile = candidates[Math.floor(Math.random() * candidates.length)];
      state.merchantTile = tile.index;
      lines.push(`商隊落腳於「${tile.name}」，第一位走到那裡的主公可以向他們買東西。`);
      break;
    }
    case 'windfall': {
      const ranked = [...alive].sort((a, b) => totalAssets(state, a.id).total - totalAssets(state, b.id).total);
      const mults = [2, 1.5, 1, 0.5];
      ranked.forEach((l, i) => {
        const n = Math.round(6000 * mults[Math.min(i, 3)]);
        l.stones += n;
        lines.push(`${LORDS[l.id].name} 得 ${fmtStones(n)}`);
      });
      break;
    }
    case 'harvest':
      for (const l of alive) {
        let n = 0;
        for (const c of citiesOf(state, l.id)) {
          n += cityIncomeOf(state, c).stones;
          c.prosperity = Math.min(200, c.prosperity + 10);
        }
        l.stones += n;
        if (n) lines.push(`${LORDS[l.id].name} 額外收入 ${fmtStones(n)}`);
      }
      break;
    case 'elementTide': {
      const els = Object.keys(ELEMENT_NAMES) as Element[];
      state.favoredElement = els[Math.floor(Math.random() * els.length)];
      lines.push(`本次當令：【${ELEMENT_NAMES[state.favoredElement]}】`);
      break;
    }
    case 'immortals':
      for (const g of makeImmortals()) {
        if (!state.generals[g.id]) state.generals[g.id] = g;
      }
      lines.push('四位仙人已在聽風樓等候有緣人。');
      break;
    case 'edict': {
      const richest = [...alive].sort((a, b) => totalAssets(state, b.id).total - totalAssets(state, a.id).total)[0];
      const tax = Math.round(richest.stones * 0.1);
      richest.stones -= tax;
      const others = alive.filter((l) => l.id !== richest.id);
      for (const l of others) l.stones += Math.floor(tax / others.length);
      lines.push(`${LORDS[richest.id].name}上繳 ${fmtStones(tax)}，由其他主公平分。`);
      break;
    }
    case 'beastTide':
      for (const l of alive) {
        if (l.beast) {
          lines.push(`${LORDS[l.id].name}的${l.beast.name}擊退妖獸，城池無損。`);
          continue;
        }
        let lost = 0;
        for (const c of citiesOf(state, l.id)) {
          const n = Math.round(c.garrisonSoldiers * 0.15);
          c.garrisonSoldiers -= n;
          lost += n;
        }
        if (lost) lines.push(`${LORDS[l.id].name}各城守軍共折損 ${lost}。`);
      }
      break;
    case 'quake': {
      const owned = shuffle(Object.values(state.cities).filter((c) => c.owner !== 'neutral')).slice(0, 3);
      for (const c of owned) {
        c.prosperity = Math.max(20, c.prosperity - 20);
        lines.push(`${c.name}（${LORDS[c.owner as LordId].name}）繁榮 -20`);
      }
      if (!owned.length) lines.push('所幸天下尚無城池受災。');
      break;
    }
    case 'bandits': {
      const occupied = new Set(alive.map((l) => l.position));
      state.banditTiles = shuffle(state.tiles.filter((t) => t.kind === 'road' && !occupied.has(t.index)).map((t) => t.index)).slice(0, 4);
      lines.push(`賊窩出現在 ${state.banditTiles.map((i) => state.tiles[i].name + `（第 ${i} 格）`).join('、')}。`);
      break;
    }
    case 'shuffle': {
      const positions = shuffle(alive.map((l) => l.position));
      alive.forEach((l, i) => (l.position = positions[i]));
      lines.push(alive.map((l) => `${LORDS[l.id].name} → ${state.tiles[l.position].name}`).join('、'));
      break;
    }
    case 'demonTrial': {
      let n = 0;
      for (const g of Object.values(state.generals)) {
        if (g.owner && g.status !== 'dead' && inBottleneck(g)) {
          g.demon = Math.max(g.demon, 1);
          n++;
        }
      }
      lines.push(n ? `共 ${n} 名瓶頸中的武將心魔滋生。` : '所幸無人正處瓶頸。');
      break;
    }
    case 'armory':
      for (const l of alive) {
        const e = makeEquipment(nextUid(state, 'e'), Math.random() < 0.5 ? 'weapon' : 'armor', Math.floor(Math.random() * 6));
        l.gear.push(e);
        lines.push(`${LORDS[l.id].name} 得 ${e.kind === 'weapon' ? '神器' : '寶衣'}「${e.name}」`);
      }
      break;
    case 'meteor':
      for (const l of alive) {
        const names: string[] = [];
        for (let i = 0; i < 2; i++) {
          const defId = PILL_IDS[Math.floor(Math.random() * PILL_IDS.length)];
          const item = makeItem(nextUid(state, 'i'), defId, 1 + Math.floor(Math.random() * 2));
          l.items.push(item);
          names.push(itemName(item.defId, item.tier));
        }
        lines.push(`${LORDS[l.id].name} 得 ${names.join('、')}`);
      }
      break;
    case 'debate':
      for (const l of alive) {
        const total = freeGenerals(state, l.id).reduce((s, g) => s + addExp(g, 120), 0);
        lines.push(`${LORDS[l.id].name}的隨行武將共增加修為 ${total}`);
      }
      break;
    case 'refugees':
      for (const l of alive) {
        const n = Math.max(500, citiesOf(state, l.id).length * 300);
        l.soldiers += n;
        lines.push(`${LORDS[l.id].name} 得流民兵 ${n}`);
      }
      break;
    case 'plague':
      for (const l of alive) {
        const lost = Math.round(l.soldiers * 0.08);
        l.soldiers -= lost;
        for (const g of generalsOf(state, l.id)) if (g.status !== 'realm') g.hp = Math.max(1, g.hp - Math.round(maxHp(g) * 0.15));
        lines.push(`${LORDS[l.id].name}折損士兵 ${lost}，眾將染疾`);
      }
      break;
    case 'flood': {
      let n = 0;
      for (const c of Object.values(state.cities)) {
        if (c.owner === 'neutral' || !['waterland', 'coast'].includes(CITY_TERRAIN[c.id])) continue;
        c.prosperity = Math.max(20, c.prosperity - 12);
        c.garrisonSoldiers -= Math.round(c.garrisonSoldiers * 0.1);
        lines.push(`${c.name}（${LORDS[c.owner as LordId].name}）遭洪水所困，繁榮 -12`);
        n++;
      }
      if (!n) lines.push('所幸水鄉濱海之地尚無有主城池。');
      break;
    }
    case 'mutiny': {
      const richest = [...alive].sort((a, b) => b.soldiers - a.soldiers)[0];
      const lost = Math.round(richest.soldiers * 0.15);
      richest.soldiers -= lost;
      lines.push(`${LORDS[richest.id].name}軍中嘩變，${lost} 名士兵逃散。`);
      break;
    }
    case 'raiders': {
      const richest = [...alive].sort((a, b) => b.stones - a.stones)[0];
      const lost = Math.min(30000, Math.round(richest.stones * 0.08));
      richest.stones -= lost;
      lines.push(`${LORDS[richest.id].name}被盜走 ${fmtStones(lost)}。`);
      break;
    }
  }
  syncWorldMods(state);
  return lines;
}

// ───────────────────────── 仙人出山 ─────────────────────────

function makeImmortals(): General[] {
  const seeds: [string, string, number[], number][] = [
    ['zuoci', '左慈', [45, 70, 520, 80, 70, 99, 90], 3],
    ['yuji', '于吉', [38, 66, 480, 88, 62, 97, 85], 3],
    ['huatuo', '華佗', [30, 62, 460, 99, 78, 70, 60], 2],
    ['guanlu', '管輅', [36, 62, 460, 70, 62, 90, 99], 3],
  ];
  return seeds.map(([id, name, s, realm]) => {
    const g: General = {
      id,
      name,
      origin: 'immortal',
      owner: null,
      base: { force: s[0], defense: s[1], hp: s[2], alchemy: s[3], forging: s[4], talisman: s[5], formation: s[6] },
      realm,
      exp: 0,
      aptitude: 'heaven',
      failedRound: 0,
      foundation: false,
      demon: 0,
      ward: 0,
      breakBoost: 0,
      secluded: false,
      hp: 0,
      stamina: 100,
      bonusForce: 0,
      bonusDefense: 0,
      weapon: null,
      armor: null,
      technique: null,
      status: 'free',
      cityId: null,
    };
    g.hp = maxHp(g);
    return g;
  });
}

// ───────────────────────── 旅行商人 ─────────────────────────

/** 商隊貨品：地階、天階，7 折 */
export function merchantStock(state: GameState): Offer[] {
  const uid = (p: string) => nextUid(state, p);
  const high = () => 6 + Math.floor(Math.random() * 6);
  const off = (n: number) => Math.round((n * 0.7) / 10) * 10;
  const out: Offer[] = [];
  for (let i = 0; i < 2; i++) {
    const e = makeEquipment(uid('e'), i === 0 ? 'weapon' : 'armor', high());
    out.push({ kind: 'equipment', equipment: e, label: e.name, sub: `${e.kind === 'weapon' ? `神器｜武力 +${e.value}` : `寶衣｜防禦 +${e.value}、血量 +${e.hp}`}｜需${REALMS[Math.floor(e.tier / 3)]}`, price: off(e.price) });
  }
  const t = makeTechnique(uid('t'), high());
  out.push({ kind: 'technique', technique: t, label: t.name, sub: `${ELEMENT_NAMES[t.element]}屬性｜能力 +${Math.round(t.power * 100)}%｜每回合修為 +${techniqueExp(t)}`, price: off(t.price) });
  const b = makeBeast(uid('b'), high());
  out.push({ kind: 'beast', beast: b, label: b.name, sub: b.desc, price: off(b.price) });
  for (const defId of ['essence', 'thunderward']) {
    const tier = defId === 'essence' ? 3 : 0;
    const price = defId === 'essence' ? 24300 : 7000;
    out.push({ kind: 'item', item: { uid: uid('i'), defId, tier, price }, label: defId === 'essence' ? '天品真元丹' : '避雷陣', sub: defId === 'essence' ? '修為 +1200' : '下次渡劫天雷傷害 -50%', price: off(price) });
  }
  return out;
}

// ───────────────────────── 黃巾賊窩 ─────────────────────────

export function banditToll(state: GameState): number {
  return 1500 + state.round * 100;
}

// ───────────────────────── 天寶拍賣會 ─────────────────────────

/** 拍品：一件天階寶物 */
export function auctionLot(state: GameState): Offer {
  const uid = (p: string) => nextUid(state, p);
  const tier = 9 + Math.floor(Math.random() * 3);
  const r = Math.random();
  if (r < 0.3) {
    const e = makeEquipment(uid('e'), Math.random() < 0.5 ? 'weapon' : 'armor', tier);
    return { kind: 'equipment', equipment: e, label: e.name, sub: e.kind === 'weapon' ? `天階神器｜武力 +${e.value}｜需金丹` : `天階寶衣｜防禦 +${e.value}、血量 +${e.hp}｜需金丹`, price: e.price };
  }
  if (r < 0.65) {
    const t = makeTechnique(uid('t'), tier);
    return { kind: 'technique', technique: t, label: t.name, sub: `天階功法｜${ELEMENT_NAMES[t.element]}屬性｜能力 +${Math.round(t.power * 100)}%｜每回合修為 +${techniqueExp(t)}`, price: t.price };
  }
  const b = makeBeast(uid('b'), tier);
  return { kind: 'beast', beast: b, label: b.name, sub: `天階靈獸｜${b.desc}`, price: b.price };
}

/** 電腦的秘密出價 */
export function aiBid(state: GameState, lord: Lord, lot: Offer): number {
  let want = 0.8;
  if (lot.kind === 'beast') want = !lord.beast ? 1 : lord.beast.tier < lot.beast.tier ? 0.7 : 0.1;
  if (lot.kind === 'technique') want = generalsOf(state, lord.id).some((g) => !g.technique) ? 1 : 0.4;
  if (lot.kind === 'equipment') want = generalsOf(state, lord.id).some((g) => g.realm >= 3) ? 1 : 0.5;
  const budget = Math.max(0, lord.stones - 6000);
  const bid = Math.min(budget, lot.price * want * (0.4 + Math.random() * 0.7));
  return Math.max(0, Math.round(bid / 100) * 100);
}

export interface AuctionResult {
  winner: LordId | null;
  price: number;
  bids: { id: LordId; bid: number }[];
}

/** 價高者得、付自己的出價；同價隨機 */
export function resolveAuction(state: GameState, lot: Offer, bids: { id: LordId; bid: number }[]): AuctionResult {
  const valid = bids.filter((b) => b.bid > 0 && state.lords[b.id].stones >= b.bid);
  if (!valid.length) return { winner: null, price: 0, bids };
  const top = Math.max(...valid.map((b) => b.bid));
  const tied = valid.filter((b) => b.bid === top);
  const w = tied[Math.floor(Math.random() * tied.length)];
  const lord = state.lords[w.id];
  lord.stones -= w.bid;
  if (lot.kind === 'equipment') lord.gear.push(lot.equipment);
  else if (lot.kind === 'technique') lord.scrolls.push(lot.technique);
  else if (lot.kind === 'beast') lord.beast = lot.beast;
  return { winner: w.id, price: w.bid, bids };
}

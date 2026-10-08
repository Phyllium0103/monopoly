import { aiUpgradeWeapons } from './MaterialSystem';
import { fx } from '../data/passives';
import { immortalWinner } from './VictorySystem';
import type { City, CraftStat, GameState, General, Item, Lord } from '../game/types';
import { PARTY_LIMIT, abandonIfEmpty, citiesOf, deployable, freeGenerals, generalsOf, sectGenerals } from '../game/GameState';
import { attack, canLearn, learn, attemptBreak, boltCount, boltDamage, breakChance, canAttemptBreak, craft, defense, expCap, inBottleneck, maxHp, needsTribulation, power, tribulation } from './GeneralSystem';
import { MIN_GARRISON, eliminate, recruitCost, visitingToll, garrisonPower, occupyCost, totalAssets } from './CitySystem';
import { REALMS } from '../data/generals';
import { equipRealm, equipScore } from '../data/items';
import { canUse, def, usePreroll, type PrerollTarget } from './ItemSystem';
import { CONTEST_SOLDIERS, canDuel, siegeAllowed, siegeAttack, type BattleKind } from './BattleSystem';
import type { Offer } from './ShopSystem';
import { REALM_LEVELS, deathChance } from './RealmSystem';

/** 各陣營電腦的打法：同樣的判斷流程，門檻不同，表現出不同個性 */
export interface AiStyle {
  /** 攻城：我方攻擊力要達到守城戰力的幾倍才出手（越小越好戰） */
  siegeRatio: number;
  /** 單挑：評分要高出對方幾倍才挑戰 */
  duelRatio: number;
  /** 技藝比試：能力值要高出對方幾倍才比 */
  craftRatio: number;
  /** 佔領城池後至少保留的靈石 */
  occupyReserve: number;
  /** 只剩一名武將時，願意佔領的最低繁榮度 */
  occupyMinProsperity: number;
  /** 商店保留的備用金、略過購買的機率 */
  shopReserve: number;
  shopSkip: number;
  /** 武將人數上限內優先招募 */
  recruitCap: number;
  /** 秘境：出發機率與可接受的平均隕落率 */
  realmChance: number;
  realmRisk: number;
  /** 隨行士兵低於此數就補兵 */
  soldierFloor: number;
  /** 商店偏好的物品（優先購買） */
  likes: string[];
}

export const AI_STYLES: Record<Lord['id'], AiStyle> = {
  // 曹操：重修煉與丹藥，穩健出手
  cao: { siegeRatio: 1.3, duelRatio: 1.15, craftRatio: 1.2, occupyReserve: 8000, occupyMinProsperity: 50, shopReserve: 6000, shopSkip: 0.2, recruitCap: 15, realmChance: 0.8, realmRisk: 0.15, soldierFloor: 8000, likes: ['qi', 'essence', 'foundation', 'breakpill', 'bone'] },
  // 劉備：廣佔城池、經營為本，不輕易攻城
  liu: { siegeRatio: 1.6, duelRatio: 1.2, craftRatio: 1.25, occupyReserve: 4000, occupyMinProsperity: 35, shopReserve: 5000, shopSkip: 0.3, recruitCap: 16, realmChance: 0.7, realmRisk: 0.15, soldierFloor: 8000, likes: ['soldiers', 'vein', 'mend', 'heal'] },
  // 孫權：守成，保守出擊、秘境挑安全的、留足備用金與守備
  sun: { siegeRatio: 1.9, duelRatio: 1.25, craftRatio: 1.3, occupyReserve: 10000, occupyMinProsperity: 55, shopReserve: 9000, shopSkip: 0.35, recruitCap: 14, realmChance: 0.7, realmRisk: 0.1, soldierFloor: 12000, likes: ['citadel', 'truce', 'thunderward', 'fiveward', 'siegebreak'] },
  // 董卓：好戰，優勢不大也敢打，大量徵兵，常去秘境練兵
  dong: { siegeRatio: 1.1, duelRatio: 1.05, craftRatio: 1.15, occupyReserve: 6000, occupyMinProsperity: 40, shopReserve: 4000, shopSkip: 0.25, recruitCap: 15, realmChance: 0.55, realmRisk: 0.2, soldierFloor: 15000, likes: ['force', 'guard', 'demon', 'siegebreak', 'stride'] },
};

export interface ItemHooks { use?: (lord: Lord, item: Item, user: General, target: PrerollTarget) => Promise<string>; protect?: (g: General) => Promise<boolean>; }
/** 擲骰前：療傷、換裝、學功法、補兵 */
export async function aiPreroll(state: GameState, lord: Lord, hooks: ItemHooks = {}): Promise<string[]> {
  const upgrades = aiUpgradeWeapons(state, lord);
  if (lord.itemsLocked) return upgrades;
  const apply = (item: Item, user: General, target: PrerollTarget) => hooks.use ? hooks.use(lord,item,user,target) : Promise.resolve(usePreroll(state,lord,item,user,target));
  const logs: string[] = [...upgrades];
  const gens = generalsOf(state, lord.id).filter((g) => g.status !== 'realm' && !g.ghostSourceId);
  const style = AI_STYLES[lord.id];

  // 自動裝備最好的寶衣
  for (const kind of ['armor'] as const) {
    const pool = lord.gear.filter((e) => e.kind === kind).sort((a, b) => equipScore(b) - equipScore(a));
    for (const e of pool) {
      const candidates = gens
        .filter((g) => g.realm >= equipRealm(e.tier) && (g[kind] ? equipScore(g[kind]!) : -1) < equipScore(e))
        .sort((a, b) => b.base.defense - a.base.defense);
      const g = candidates[0];
      if (!g) continue;
      const old = g[kind];
      g[kind] = e;
      lord.gear = lord.gear.filter((x) => x.uid !== e.uid);
      if (old) lord.gear.push(old);
      if (kind === 'armor') g.hp = Math.min(g.hp, maxHp(g));
      logs.push(`${g.name}換上「${e.name}」`);
    }
  }
  // 學功法
  for (const s of [...lord.scrolls].sort((a, b) => b.tier - a.tier)) {
    const g = gens.filter((x) => canLearn(x, s).ok).sort((a, b) => power(b) - power(a))[0];
    if (!g) continue;
    learn(lord, g, s);
    logs.push(`${g.name}習得「${s.name}」`);
  }
  // 吃回血丹
  for (const g of gens.filter((x) => x.hp < maxHp(x) * 0.4)) {
    const pill = lord.items.find((i) => i.defId === 'heal');
    const user = pill && gens.find((u) => u.status === 'free' && canUse(pill, u).ok);
    if (pill && user) logs.push(await apply(pill, user, { general: g }));
  }
  // 永久增益丹藥直接吃
  const strongest = [...gens].sort((a, b) => power(b) - power(a));
  for (const pill of lord.items.filter((i) => ['force', 'guard'].includes(i.defId))) {
    const user = gens.find((u) => u.status === 'free' && canUse(pill, u).ok);
    if (user && strongest[0]) logs.push(await apply(pill, user, { general: strongest[0] }));
  }
  // 修為丹藥給未達瓶頸的強將
  for (const pill of lord.items.filter((i) => i.defId === 'qi' || i.defId === 'essence')) {
    const user = gens.find((u) => u.status === 'free' && canUse(pill, u).ok);
    const target = strongest.find((g) => !inBottleneck(g));
    if (user && target) logs.push(await apply(pill, user, { general: target }));
  }
  // 壯骨丹給最強的將領，清心丹化解心魔
  for (const pill of lord.items.filter((i) => i.defId === 'bone')) {
    const user = gens.find((u) => u.status === 'free' && canUse(pill, u).ok);
    if (user && strongest[0]) logs.push(await apply(pill, user, { general: strongest[0] }));
  }
  for (const g of gens.filter((x) => x.demon > 0)) {
    const pill = lord.items.find((i) => i.defId === 'clearmind');
    const user = pill && gens.find((u) => u.status === 'free' && canUse(pill, u).ok);
    if (pill && user) logs.push(await apply(pill, user, { general: g }));
  }
  // 靈根丹：給戰力最強的非天靈根武將
  for (const pill of lord.items.filter((i) => i.defId === 'rootup1' || i.defId === 'rootup2')) {
    const user = gens.find((u) => u.status === 'free' && canUse(pill, u).ok);
    const target = strongest.find((g) => g.aptitude !== 'heaven');
    if (user && target) logs.push(await apply(pill, user, { general: target }));
  }
  // 還魂丹：復活戰力最強的亡者
  const revivePill = lord.items.find((i) => i.defId === 'revive');
  const deadBest = Object.values(state.generals).filter((g) => g.status === 'dead').sort((a, b) => power(b) - power(a))[0];
  const reviver = revivePill && gens.find((u) => u.status === 'free' && canUse(revivePill, u).ok);
  if (revivePill && reviver && deadBest) logs.push(await apply(revivePill, reviver, { general: deadBest }));
  // 群體陣法與法器：回春陣與新增法器、撒豆成兵符、地脈陣
  const party = freeGenerals(state, lord.id);
  const useGroup = async (defId: string, target: PrerollTarget = {}) => {
    const item = lord.items.find((i) => i.defId === defId);
    const user = item && gens.find((u) => u.status === 'free' && canUse(item, u).ok);
    if (item && user) logs.push(await apply(item, user, target));
  };
  if (party.filter((g) => g.hp < maxHp(g) * 0.7).length >= 2) await useGroup('mend');
  if (lord.soldiers < style.soldierFloor) await useGroup('soldiers');
  const best = citiesOf(state, lord.id).sort((a, b) => b.prosperity - a.prosperity)[0];
  if (best && best.prosperity < 190) await useGroup('vein', { city: best });
  for (const id of ['bowl','bag','breath','wheel']) await useGroup(id);
  logs.push(...await aiBreakthroughs(state, lord, hooks));
  if (!lord.alive || immortalWinner(state)) return logs;
  // 守軍充足的城池讓駐將閉關
  for (const g of gens.filter((x) => x.status === 'garrison')) g.secluded = state.cities[g.cityId!].garrisonSoldiers >= 2500;
  // 心魔干擾：對敵方瓶頸中的最強將領出手
  const curse = lord.items.find((i) => i.defId === 'demon' || i.defId === 'illusion');
  const curser = curse && gens.find((u) => u.status === 'free' && canUse(curse, u).ok);
  if (curse && curser) {
    const victim = Object.values(state.generals)
      .filter((g) => g.owner && g.owner !== lord.id && g.status !== 'realm' && g.status !== 'dead' && inBottleneck(g) && !g.demon)
      .sort((a, b) => b.realm - a.realm)[0];
    if (victim) logs.push(await apply(curse, curser, { general: victim }));
  }
  for (const item of [...lord.items].filter(i=>['ghost','move','poison','bow','lock','freeze','confuse','confusing','rootdown','sacrifice','graft','citadel','seven'].includes(i.defId))) {
    if(state.over || !lord.alive)break;
    const user=freeGenerals(state,lord.id).find(g=>canUse(item,g).ok);if (!user) continue;
    // 妨礙類物品對準威脅最大的對手：總資產最高的優先，條件不符再換下一位
    const enemies=Object.values(state.lords).filter(l=>l.alive&&l.id!==lord.id).sort((x,y)=>totalAssets(state,y.id).total-totalAssets(state,x.id).total);
    const usable=(v: Lord): boolean => {
      const t=def(item).target;
      if (t==='lord') {
        if (['poison','bow'].includes(item.defId)&&!freeGenerals(state,v.id).length) return false;
        if (item.defId==='move'&&!v.items.length) return false;
        return true;
      }
      if (t==='enemyGeneral') return generalsOf(state,v.id).some(g=>g.status!=='realm');
      if (t==='enemyCity') return citiesOf(state,v.id).length>0;
      return true;
    };
    const victim=enemies.find(usable);if (!victim) continue;
    let target: PrerollTarget={};
    if (def(item).target==='lord') {
      target={lord:victim,tile:Math.floor(Math.random()*state.tiles.length)};
    } else if (def(item).target==='enemyGeneral') {
      const g=generalsOf(state,victim.id).filter(g=>g.status!=='realm').sort((a,b)=>power(b)-power(a))[0];if(!g)continue;target={general:g};
    } else if (def(item).target==='enemyCity') {
      const city=citiesOf(state,victim.id).sort((a,b)=>b.prosperity-a.prosperity)[0],ownCity=citiesOf(state,lord.id).sort((a,b)=>a.prosperity-b.prosperity)[0];
      if(!city||item.defId==='graft'&&(!ownCity||ownCity.prosperity>=city.prosperity))continue;target={city,ownCity};
    } else if (def(item).target==='ownCity') {
      const city=citiesOf(state,lord.id)[0];if(!city)continue;target={city};
    } else if (def(item).target==='ownGeneral') {
      const g=strongest.find(g=>g.owner===lord.id&&g.status!=='dead'&&g.status!=='realm'&&g.realm>=2&&!g.sevenLife);if(!g)continue;target={general:g};
    }
    logs.push(await apply(item,user,target));
  }
  if(state.over || !lord.alive)return logs;
  // 有交易需求時可用自用停留物品再次觸發商店。
  if(!lord.stunned && lord.forcedTile===null && !lord.stayThisTurn && lord.stones>style.shopReserve+3000 && ['tavern','forge','library','treasure','herb','beast'].includes(state.tiles[lord.position].kind) && Math.random()<.25) {
    const stay=lord.items.find(i=>['cushion','prison'].includes(i.defId));
    const user=stay&&freeGenerals(state,lord.id).find(g=>canUse(stay,g).ok);
    if(stay&&user)logs.push(await apply(stay,user,{}));
  }
  // 縮地符
  const stride = lord.items.find((i) => i.defId === 'stride');
  const strideUser = stride && gens.find((u) => u.status === 'free' && canUse(stride, u).ok);
  if (stride && strideUser && Math.random() < 0.4) logs.push(await apply(stride, strideUser, {}));
  // 補兵
  if (lord.soldiers < style.soldierFloor && lord.stones > 10000) {
    const n = 2000;
    lord.stones -= recruitCost(lord.id, n);
    lord.soldiers += n;
    logs.push(`徵兵 ${n}`);
  }
  return logs;
}

/** 瓶頸中的將領嘗試突破：低階看成功率，雷劫要先療傷、佈陣，有把握撐過才渡 */
export async function aiBreakthroughs(state: GameState, lord: Lord, hooks: ItemHooks = {}): Promise<string[]> {
  const apply = (item: Item, user: General, target: PrerollTarget) => hooks.use ? hooks.use(lord,item,user,target) : Promise.resolve(usePreroll(state,lord,item,user,target));
  const logs: string[] = [];
  const gens = generalsOf(state, lord.id).filter((g) => g.status !== 'realm');
  for (const g of gens) {
    if (!canAttemptBreak(g, state.round).ok) continue;
    const helper = async (defId: string) => {
      const item = lord.items.find((i) => i.defId === defId);
      const user = item && gens.find((u) => u.status === 'free' && canUse(item, u).ok);
      if (item && user) logs.push(await apply(item, user, { general: g }));
    };
    if (!needsTribulation(g)) {
      if (g.realm === 1 && !g.foundation) await helper('foundation');
      if (breakChance(g) < 0.5 && !g.foundation) continue;
      const ok = attemptBreak(g, state.round);
      logs.push(ok ? `✦ ${g.name}突破至【${REALMS[g.realm]}】！` : `${g.name}突破失敗，修為受損。`);
      continue;
    }
    // 雷劫：先回血、佈陣
    if (g.hp < maxHp(g) * 0.9) await helper('heal');
    if (boltDamage(g) * boltCount(g) > g.hp * 0.8) await helper('breakpill');
    if (boltDamage(g) * boltCount(g) > g.hp * 0.8) await helper('thunderward');
    if (boltDamage(g) * boltCount(g) > g.hp * 0.8) await helper('fiveward');
    if (!fx(g).tribulationSuccess && boltDamage(g) * boltCount(g) * 1.1 > g.hp) continue;
    const cityId = g.cityId;
    const r = await tribulation(g, hooks.protect ? () => hooks.protect!(g) : undefined);
    if (r.fate === 'death' && cityId) {
      state.cities[cityId].garrisonGenerals = state.cities[cityId].garrisonGenerals.filter((id) => id !== g.id);
      if (abandonIfEmpty(state, cityId)) logs.push(`🏚️ ${state.cities[cityId].name}失去所有駐將，成為空城。`);
    }
    if (r.fate === 'death' && g.isLord) {
      logs.push(`⚡ ${g.name}渡劫失敗，身死道消……主公陣亡，敗北出局！`);
      eliminate(state, lord);
      return logs;
    }
    if (r.success) logs.push(`⚡ ${g.name}渡過 ${r.bolts.length} 道天雷，突破至【${REALMS[g.realm]}】！`);
    if (r.success && g.isLord && immortalWinner(state)) return logs;
    else if (!r.success) logs.push(r.fate === 'death' ? `⚡ ${g.name}渡劫失敗，身死道消……` : r.fate === 'saved' ? `⚡ ${g.name}渡劫失敗，滿血復生，保留境界。` : `⚡ ${g.name}渡劫失敗，兵解重修，跌回凡人。`);
  }
  return logs;
}

/** 在自己的城池：從宗門補滿隨行武將 */
export function aiManageSect(state: GameState, lord: Lord): string[] {
  const party = freeGenerals(state, lord.id);
  const sect = sectGenerals(state, lord.id).sort((a, b) => power(b) - power(a));
  const moved: string[] = [];
  for (const g of sect) {
    if (party.length + moved.length >= PARTY_LIMIT) break;
    g.status = 'free';
    moved.push(g.name);
  }
  return moved.length ? [`從宗門召回${moved.join('、')}隨行`] : [];
}

/** 停在無主城池：是否佔領 */
export function aiOccupy(state: GameState, lord: Lord, city: City): { generalId: string; soldiers: number } | null {
  const free = deployable(state, lord.id);
  if (!free.length || lord.soldiers < MIN_GARRISON) return null;
  // 保留一筆備用金應付過路費
  const style = AI_STYLES[lord.id];
  if (lord.stones - occupyCost(city) < style.occupyReserve) return null;
  // 只剩一名武將時，只為較繁榮的城池出手
  if (free.length === 1 && city.prosperity < style.occupyMinProsperity) return null;
  const g = [...free].sort((a, b) => power(a) - power(b))[0];
  const soldiers = Math.max(MIN_GARRISON, Math.min(lord.soldiers - 5000, Math.round(city.prosperity * 30)));
  if (soldiers < MIN_GARRISON || soldiers > lord.soldiers) return null;
  return { generalId: g.id, soldiers };
}

export interface AiBattleChoice {
  kind: BattleKind | 'pay';
  generals: General[];
}


/** 踏入敵城：繳費或選擇最有把握的戰鬥 */
export function aiEnemyCity(state: GameState, lord: Lord, city: City): AiBattleChoice {
  const free = freeGenerals(state, lord.id).filter((g) => g.hp > maxHp(g) * 0.3);
  if (!free.length) return { kind: 'pay', generals: [] };
  const owner = state.lords[city.owner as Lord['id']];
  const defenders = defenderPool(state, city);
  const cost = visitingToll(state, city, lord);
  const style = AI_STYLES[lord.id];

  // 攻城：明顯優勢才打
  const team = [...free].sort((a, b) => attack(b) - attack(a)).slice(0, 3);
  if (siegeAllowed(state.round) && siegeAttack(lord, team) > garrisonPower(state, city) * style.siegeRatio && free.length >= 2) return { kind: 'siege', generals: team };

  // 每座城固定開放單挑
  const only = city.contest;
  const best = [...free].filter(canDuel).sort((a, b) => duelScore(b) - duelScore(a))[0];
  const bestDef = [...defenders].filter(canDuel).sort((a, b) => duelScore(b) - duelScore(a))[0];
  if (best && (!bestDef || duelScore(best) > duelScore(bestDef) * style.duelRatio)) return { kind: 'duel', generals: [best] };

  // 技藝比試（雙方各需 500 兵維持秩序）
  for (const stat of lord.soldiers >= CONTEST_SOLDIERS ? [only] : []) {
    const me = [...free].sort((a, b) => craft(b, stat) - craft(a, stat))[0];
    const them = [...defenders].sort((a, b) => craft(b, stat) - craft(a, stat))[0];
    if (them && craft(me, stat) > craft(them, stat) * style.craftRatio) return { kind: stat, generals: [me] };
  }
  // 付得起就付
  if (lord.stones >= cost * 2 || !owner) return { kind: 'pay', generals: [] };
  return { kind: 'pay', generals: [] };
}

function duelScore(g: General): number {
  return attack(g) * Math.sqrt(g.hp) + defense(g) * 3;
}

/** 守方可出戰的將領：只有派駐在該城的駐將 */
export function defenderPool(state: GameState, city: City): General[] {
  if (city.owner === 'neutral') return [];
  return city.garrisonGenerals.map((id) => state.generals[id]);
}

export function aiDefender(state: GameState, city: City, kind: BattleKind): General | null {
  const pool = defenderPool(state, city);
  if (!pool.length) return null;
  if (kind === 'duel') return [...pool].filter(canDuel).sort((a, b) => duelScore(b) - duelScore(a))[0] ?? null;
  const stat = kind as CraftStat;
  return [...pool].sort((a, b) => craft(b, stat) - craft(a, stat))[0];
}

/** 商店：保留一筆備用金，挑一件買；將領不足時優先招募 */
export function aiShop(state: GameState, lord: Lord, offers: Offer[]): Offer | null {
  const style = AI_STYLES[lord.id];
  const reserve = style.shopReserve;
  const affordable = offers.filter((o) => o.price <= lord.stones - reserve);
  if (!affordable.length) return null;
  const revives = affordable.filter((o) => o.kind === 'revive' && o.price < lord.stones * 0.5);
  if (revives.length && generalsOf(state, lord.id).length < style.recruitCap) return revives.sort((a, b) => b.price - a.price)[0];
  const recruits = affordable.filter((o) => o.kind === 'general');
  if (recruits.length && generalsOf(state, lord.id).length < style.recruitCap) return recruits.sort((a, b) => a.price - b.price)[0];
  const want = affordable.filter((o) => {
    if (o.kind === 'beast') return !lord.beast || lord.beast.tier < o.beast.tier;
    if (o.kind === 'item') {
      if (['realmkey', 'realmescape'].includes(o.item.defId)) return deployable(state, lord.id).length > 0 && !lord.items.some(i => i.defId === o.item.defId);
      // 有將領快要渡劫時，優先買護法陣
      if (['thunderward', 'fiveward'].includes(o.item.defId)) return generalsOf(state, lord.id).some((g) => g.realm >= 2 && g.exp >= expCap(g) * 0.6);
      return def(o.item).category === '丹藥' || ['cushion', 'prison', 'stride', 'truce', 'citadel', 'siegebreak', 'demon', 'mend', 'vein', 'soldiers', 'shuttle'].includes(o.item.defId);
    }
    return true;
  });
  if (!want.length || Math.random() < style.shopSkip) return null;
  // 先挑陣營偏好的物品，沒有再挑最貴的
  const liked = want.filter((o) => o.kind === 'item' && style.likes.includes(o.item.defId));
  return (liked.length ? liked : want).sort((a, b) => b.price - a.price)[0];
}

/** 秘境：有空閒武將時，挑風險可接受的最高難度派遣 */
export function aiRealm(state: GameState, lord: Lord): { team: General[]; level: number } | null {
  if (lord.itemsLocked > 0 || !lord.items.some(i => i.defId === 'realmkey')) return null;
  const free = deployable(state, lord.id).sort((a, b) => b.realm - a.realm || power(b) - power(a));
  const style = AI_STYLES[lord.id];
  if (!free.length || Math.random() > style.realmChance) return null;
  const team = free.slice(0, Math.min(4, free.length));
  for (let level = REALM_LEVELS.length - 1; level >= 0; level--) {
    const risk = team.reduce((s, g) => s + deathChance(g, team, level), 0) / team.length;
    if (risk < style.realmRisk) return { team, level };
  }
  return null;
}

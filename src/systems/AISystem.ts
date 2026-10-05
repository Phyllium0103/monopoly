import { immortalWinner } from './VictorySystem';
import type { City, CraftStat, GameState, General, Lord } from '../game/types';
import { PARTY_LIMIT, abandonIfEmpty, citiesOf, deployable, freeGenerals, generalsOf, sectGenerals } from '../game/GameState';
import { attack, canLearn, learn, attemptBreak, boltCount, boltDamage, breakChance, canAttemptBreak, craft, defense, expCap, inBottleneck, maxHp, needsTribulation, power, tribulation } from './GeneralSystem';
import { MIN_GARRISON, eliminate, recruitCost, cityToll, garrisonPower, occupyCost } from './CitySystem';
import { REALMS } from '../data/generals';
import { equipRealm, equipScore } from '../data/items';
import { canUse, def, usePreroll, type PrerollTarget } from './ItemSystem';
import { CONTEST_SOLDIERS, canDuel, siegeAllowed, siegeAttack, type BattleKind } from './BattleSystem';
import type { Offer } from './ShopSystem';
import { REALM_LEVELS, deathChance } from './RealmSystem';

/** 擲骰前：療傷、換裝、學功法、補兵 */
export function aiPreroll(state: GameState, lord: Lord): string[] {
  const logs: string[] = [];
  const gens = generalsOf(state, lord.id).filter((g) => g.status !== 'realm');

  // 自動裝備最好的神器、寶衣
  for (const kind of ['weapon', 'armor'] as const) {
    const pool = lord.gear.filter((e) => e.kind === kind).sort((a, b) => equipScore(b) - equipScore(a));
    for (const e of pool) {
      const candidates = gens
        .filter((g) => g.realm >= equipRealm(e.tier) && (g[kind] ? equipScore(g[kind]!) : -1) < equipScore(e))
        .sort((a, b) => (kind === 'weapon' ? b.base.force - a.base.force : b.base.defense - a.base.defense));
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
    const user = pill && gens.find((u) => canUse(pill, u).ok);
    if (pill && user) logs.push(usePreroll(state, lord, pill, user, { general: g }));
  }
  // 永久增益丹藥直接吃
  const strongest = [...gens].sort((a, b) => power(b) - power(a));
  for (const pill of lord.items.filter((i) => ['force', 'guard'].includes(i.defId))) {
    const user = gens.find((u) => canUse(pill, u).ok);
    if (user && strongest[0]) logs.push(usePreroll(state, lord, pill, user, { general: strongest[0] }));
  }
  // 修為丹藥給未達瓶頸的強將
  for (const pill of lord.items.filter((i) => i.defId === 'qi' || i.defId === 'essence')) {
    const user = gens.find((u) => canUse(pill, u).ok);
    const target = strongest.find((g) => !inBottleneck(g));
    if (user && target) logs.push(usePreroll(state, lord, pill, user, { general: target }));
  }
  // 壯骨丹給最強的將領，清心丹化解心魔
  for (const pill of lord.items.filter((i) => i.defId === 'bone')) {
    const user = gens.find((u) => canUse(pill, u).ok);
    if (user && strongest[0]) logs.push(usePreroll(state, lord, pill, user, { general: strongest[0] }));
  }
  for (const g of gens.filter((x) => x.demon > 0)) {
    const pill = lord.items.find((i) => i.defId === 'clearmind');
    const user = pill && gens.find((u) => canUse(pill, u).ok);
    if (pill && user) logs.push(usePreroll(state, lord, pill, user, { general: g }));
  }
  // 靈根丹：給戰力最強的非天靈根武將
  for (const pill of lord.items.filter((i) => i.defId === 'rootup1' || i.defId === 'rootup2')) {
    const user = gens.find((u) => canUse(pill, u).ok);
    const target = strongest.find((g) => g.aptitude !== 'heaven');
    if (user && target) logs.push(usePreroll(state, lord, pill, user, { general: target }));
  }
  // 還魂丹：復活戰力最強的亡者
  const revivePill = lord.items.find((i) => i.defId === 'revive');
  const deadBest = Object.values(state.generals).filter((g) => g.status === 'dead').sort((a, b) => power(b) - power(a))[0];
  const reviver = revivePill && gens.find((u) => canUse(revivePill, u).ok);
  if (revivePill && reviver && deadBest) logs.push(usePreroll(state, lord, revivePill, reviver, { general: deadBest }));
  // 群體陣法與法器：聚靈陣、回春陣、聚元珠、撒豆成兵符、地脈陣
  const party = freeGenerals(state, lord.id);
  const useGroup = (defId: string, target: PrerollTarget = {}) => {
    const item = lord.items.find((i) => i.defId === defId);
    const user = item && gens.find((u) => u.status === 'free' && canUse(item, u).ok);
    if (item && user) logs.push(usePreroll(state, lord, item, user, target));
  };
  if (party.length >= 3 && party.some((g) => !inBottleneck(g))) useGroup('gather');
  if (party.filter((g) => g.hp < maxHp(g) * 0.7).length >= 2) useGroup('mend');
  if (party.length && party.reduce((s, g) => s + g.stamina, 0) / party.length < 55) useGroup('pearl');
  if (lord.soldiers < 8000) useGroup('soldiers');
  const best = citiesOf(state, lord.id).sort((a, b) => b.prosperity - a.prosperity)[0];
  if (best && best.prosperity < 190) useGroup('vein', { city: best });
  logs.push(...aiBreakthroughs(state, lord));
  if (immortalWinner(state)) return logs;
  // 守軍充足的城池讓駐將閉關
  for (const g of gens.filter((x) => x.status === 'garrison')) g.secluded = state.cities[g.cityId!].garrisonSoldiers >= 2500;
  // 心魔干擾：對敵方瓶頸中的最強將領出手
  const curse = lord.items.find((i) => i.defId === 'demon' || i.defId === 'illusion');
  const curser = curse && gens.find((u) => canUse(curse, u).ok);
  if (curse && curser) {
    const victim = Object.values(state.generals)
      .filter((g) => g.owner && g.owner !== lord.id && g.status !== 'realm' && g.status !== 'dead' && inBottleneck(g) && !g.demon)
      .sort((a, b) => b.realm - a.realm)[0];
    if (victim) logs.push(usePreroll(state, lord, curse, curser, { general: victim }));
  }
  // 縮地符
  const stride = lord.items.find((i) => i.defId === 'stride');
  const strideUser = stride && gens.find((u) => u.status === 'free' && canUse(stride, u).ok);
  if (stride && strideUser && Math.random() < 0.4) logs.push(usePreroll(state, lord, stride, strideUser, {}));
  // 補兵
  if (lord.soldiers < 8000 && lord.stones > 10000) {
    const n = 2000;
    lord.stones -= recruitCost(lord.id, n);
    lord.soldiers += n;
    logs.push(`徵兵 ${n}`);
  }
  return logs;
}

/** 瓶頸中的將領嘗試突破：低階看成功率，雷劫要先療傷、佈陣，有把握撐過才渡 */
export function aiBreakthroughs(state: GameState, lord: Lord): string[] {
  const logs: string[] = [];
  const gens = generalsOf(state, lord.id).filter((g) => g.status !== 'realm');
  for (const g of gens) {
    if (!canAttemptBreak(g, state.round).ok) continue;
    const helper = (defId: string) => {
      const item = lord.items.find((i) => i.defId === defId);
      const user = item && gens.find((u) => u.status !== 'sect' && canUse(item, u).ok);
      if (item && user) logs.push(usePreroll(state, lord, item, user, { general: g }));
    };
    if (!needsTribulation(g)) {
      if (g.realm === 1 && !g.foundation) helper('foundation');
      if (breakChance(g) < 0.8) helper('breakpill');
      if (breakChance(g) < 0.5 && !g.foundation) continue;
      const ok = attemptBreak(g, state.round);
      logs.push(ok ? `✦ ${g.name}突破至【${REALMS[g.realm]}】！` : `${g.name}突破失敗，修為受損。`);
      continue;
    }
    // 雷劫：先回血、佈陣
    if (g.hp < maxHp(g) * 0.9) helper('heal');
    if (boltDamage(g) * boltCount(g) > g.hp * 0.8) helper('breakpill');
    if (boltDamage(g) * boltCount(g) > g.hp * 0.8) helper('thunderward');
    if (boltDamage(g) * boltCount(g) > g.hp * 0.8) helper('fiveward');
    if (boltDamage(g) * boltCount(g) * 1.1 > g.hp) continue;
    const cityId = g.cityId;
    const r = tribulation(g);
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
    else if (!r.success) logs.push(r.fate === 'death' ? `⚡ ${g.name}渡劫失敗，身死道消……` : `⚡ ${g.name}渡劫失敗，兵解重修，跌回凡人。`);
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
  if (lord.stones - occupyCost(city) < 8000) return null;
  // 只剩一名武將時，只為較繁榮的城池出手
  if (free.length === 1 && city.prosperity < 50) return null;
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
  const cost = cityToll(state, city);

  // 攻城：明顯優勢才打
  const team = [...free].sort((a, b) => attack(b) - attack(a)).slice(0, 3);
  if (siegeAllowed(state.round) && siegeAttack(lord, team) > garrisonPower(state, city) * 1.3 && free.length >= 2) return { kind: 'siege', generals: team };

  // 每座城固定開放單挑
  const only = city.contest;
  const best = [...free].filter(canDuel).sort((a, b) => duelScore(b) - duelScore(a))[0];
  const bestDef = [...defenders].filter(canDuel).sort((a, b) => duelScore(b) - duelScore(a))[0];
  if (best && (!bestDef || duelScore(best) > duelScore(bestDef) * 1.15)) return { kind: 'duel', generals: [best] };

  // 技藝比試（雙方各需 500 兵維持秩序）
  for (const stat of lord.soldiers >= CONTEST_SOLDIERS ? [only] : []) {
    const me = [...free].sort((a, b) => craft(b, stat) - craft(a, stat))[0];
    const them = [...defenders].sort((a, b) => craft(b, stat) - craft(a, stat))[0];
    if (them && craft(me, stat) > craft(them, stat) * 1.25) return { kind: stat, generals: [me] };
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
  const reserve = 6000;
  const affordable = offers.filter((o) => o.price <= lord.stones - reserve);
  if (!affordable.length) return null;
  const revives = affordable.filter((o) => o.kind === 'revive' && o.price < lord.stones * 0.5);
  if (revives.length && generalsOf(state, lord.id).length < 14) return revives.sort((a, b) => b.price - a.price)[0];
  const recruits = affordable.filter((o) => o.kind === 'general');
  if (recruits.length && generalsOf(state, lord.id).length < 14) return recruits.sort((a, b) => a.price - b.price)[0];
  const want = affordable.filter((o) => {
    if (o.kind === 'beast') return !lord.beast || lord.beast.tier < o.beast.tier;
    if (o.kind === 'item') {
      // 有將領快要渡劫時，優先買護法陣
      if (['thunderward', 'fiveward'].includes(o.item.defId)) return generalsOf(state, lord.id).some((g) => g.realm >= 2 && g.exp >= expCap(g) * 0.6);
      return def(o.item).category === '丹藥' || ['stride', 'truce', 'citadel', 'siegebreak', 'demon', 'gather', 'mend', 'vein', 'soldiers', 'pearl', 'shuttle'].includes(o.item.defId);
    }
    return true;
  });
  if (!want.length || Math.random() < 0.3) return null;
  return want.sort((a, b) => b.price - a.price)[0];
}

/** 秘境：有空閒武將時，挑風險可接受的最高難度派遣 */
export function aiRealm(state: GameState, lord: Lord): { team: General[]; level: number } | null {
  const free = deployable(state, lord.id).sort((a, b) => b.realm - a.realm || power(b) - power(a));
  if (!free.length || Math.random() > 0.7) return null;
  const team = free.slice(0, Math.min(4, free.length));
  for (let level = REALM_LEVELS.length - 1; level >= 0; level--) {
    const risk = team.reduce((s, g) => s + deathChance(g, team, level), 0) / team.length;
    if (risk < 0.15) return { team, level };
  }
  return null;
}

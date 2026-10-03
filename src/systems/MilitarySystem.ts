import type { Character, City, FactionId, GameState } from '../game/types';
import { FACTIONS, ownerName } from '../faction/Faction';
import { heroPower, troopCapacity } from '../character/Character';
import { canAfford, pay, scaleCost, type Cost } from './EconomySystem';
import { disciplePower } from './RecruitmentSystem';
import { citiesOf } from '../game/GameState';

export function troopCost(faction: FactionId, amount: number): Cost {
  const units = amount / 50;
  return {
    ...scaleCost({ food: 60 * units }, FACTIONS[faction].foodCost),
    stones: 30 * units,
    iron: 10 * units,
  };
}

export function recruitTroops(state: GameState, hero: Character, amount: number): { ok: boolean; message: string } {
  const fs = state.factions[hero.faction];
  const room = troopCapacity(hero) - hero.troops;
  const n = Math.min(amount, room);
  if (n <= 0) return { ok: false, message: `${hero.name}的兵力已達上限（${troopCapacity(hero)}）。` };
  const cost = troopCost(hero.faction, n);
  if (!canAfford(fs.resources, cost)) return { ok: false, message: '資源不足，無法招募軍隊。' };
  pay(fs.resources, cost);
  hero.troops += n;
  return { ok: true, message: `${hero.name}招募軍隊 +${n}，現有 ${hero.troops}/${troopCapacity(hero)}。` };
}

export function heroesAt(state: GameState, nodeId: string, faction: FactionId): Character[] {
  return state.characters.filter((c) => c.position === nodeId && c.faction === faction);
}

/** 進攻戰力 = 角色戰力 + 軍隊 + 弟子支援 */
export function attackStrength(state: GameState, faction: FactionId, nodeId: string): number {
  const heroes = heroesAt(state, nodeId, faction);
  const heroSum = heroes.reduce((s, h) => s + heroPower(h) + h.troops, 0);
  return Math.round(heroSum + disciplePower(state.factions[faction]) * 0.5);
}

/** 守方戰力 = 城防 + 守軍 + 駐守角色 */
export function defenseStrength(state: GameState, city: City): number {
  const mult = city.owner === 'neutral' ? 1 : FACTIONS[city.owner].cityDefense;
  let total = city.defense * 2 * mult + city.garrison;
  if (city.owner !== 'neutral') {
    for (const h of heroesAt(state, city.id, city.owner)) total += heroPower(h) + h.troops;
  }
  return Math.round(total);
}

export interface BattleResult {
  win: boolean;
  attack: number;
  defense: number;
  roll: number;
  message: string;
  loot: number;
}

/** 簡化攻城：不做即時戰鬥，只比較數值 + 隨機因素 */
export function siege(state: GameState, faction: FactionId, city: City): BattleResult {
  const base = attackStrength(state, faction, city.id);
  const roll = 0.85 + Math.random() * 0.3;
  const attack = Math.round(base * roll);
  const defense = defenseStrength(state, city);
  const attackers = heroesAt(state, city.id, faction);
  const prevOwner = city.owner;
  const fs = state.factions[faction];
  const verb = prevOwner === 'neutral' ? '佔領' : '攻打';

  if (attack > defense) {
    const lossRatio = Math.min(0.6, Math.max(0.08, (defense / attack) * 0.45));
    for (const h of attackers) h.troops = Math.max(0, Math.round(h.troops * (1 - lossRatio)));

    // 守城角色撤回本國
    if (prevOwner !== 'neutral') {
      const retreat = citiesOf(state, prevOwner).filter((c) => c.id !== city.id);
      const dest = retreat.find((c) => c.capital) ?? retreat[0];
      for (const h of heroesAt(state, city.id, prevOwner)) {
        h.troops = Math.round(h.troops * 0.5);
        if (dest) h.position = dest.id;
      }
    }

    const loot = Math.round(city.resources * (prevOwner === 'neutral' ? 0.2 : 0.4));
    fs.resources.stones += loot;
    city.owner = faction;
    city.garrison = 40;
    city.defense = Math.max(30, Math.round(city.defense * 0.85));
    return {
      win: true,
      attack,
      defense,
      roll,
      loot,
      message: `${verb}${city.name}成功！（戰力 ${attack} vs ${defense}）${prevOwner !== 'neutral' ? `自${ownerName(prevOwner)}手中奪得城池，` : ''}繳獲靈石 ${loot}。`,
    };
  }

  for (const h of attackers) h.troops = Math.round(h.troops * 0.6);
  city.garrison = Math.max(10, Math.round(city.garrison - attack * 0.25));
  return { win: false, attack, defense, roll, loot: 0, message: `${verb}${city.name}失敗……（戰力 ${attack} vs ${defense}）軍隊折損四成。` };
}

export const FORMATION_COST: Cost = { qi: 40 };

/** 晉：天機陣，削弱敵城（不消耗主要行動，冷卻 3 回合） */
export function castFormation(state: GameState, city: City): { ok: boolean; message: string } {
  const fs = state.factions[state.player];
  if (fs.formationCooldown > 0) return { ok: false, message: `天機陣冷卻中（${fs.formationCooldown} 回合）。` };
  if (!canAfford(fs.resources, FORMATION_COST)) return { ok: false, message: '靈氣不足。' };
  pay(fs.resources, FORMATION_COST);
  const mult = FACTIONS[state.player].eventPower;
  const dDef = Math.round(city.defense * 0.25 * mult);
  const dGar = Math.round(city.garrison * 0.25 * mult);
  city.defense -= dDef;
  city.garrison -= dGar;
  fs.formationCooldown = 3;
  return { ok: true, message: `天機陣啟動！${city.name}城防 -${dDef}，守軍 -${dGar}。` };
}

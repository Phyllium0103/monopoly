import type { FactionId, GameState } from '../game/types';
import { FACTIONS, FACTION_IDS } from '../faction/Faction';
import { heroPower, troopCapacity } from '../character/Character';
import type { MapGraph } from '../world/MapGraph';
import { citiesOf, heroesOf } from '../game/GameState';
import { defenseStrength, siege } from './MilitarySystem';
import { disciplePower } from './RecruitmentSystem';
import { gainCultivation } from './CultivationSystem';

export interface NpcReport {
  messages: string[];
  moves: { heroId: string; path: string[] }[];
  captured: { id: string; from: string }[];
}

/**
 * 簡易 NPC：只使用簡單規則
 * 1. 補充兵力、招募弟子
 * 2. 角色自動修煉
 * 3. 擇一相鄰城池進攻（優先無主城池）
 */
export function runNpcTurn(state: GameState, map: MapGraph): NpcReport {
  const report: NpcReport = { messages: [], moves: [], captured: [] };

  for (const f of FACTION_IDS) {
    if (f === state.player) continue;
    const fs = state.factions[f];
    const heroes = heroesOf(state, f);
    const owned = citiesOf(state, f);

    // 補兵
    for (const h of heroes) {
      const room = troopCapacity(h) - h.troops;
      const n = Math.min(room, 50);
      if (n > 0 && fs.resources.food >= 60 && fs.resources.stones >= 30) {
        fs.resources.food -= 60;
        fs.resources.stones -= 30;
        h.troops += n;
      }
      gainCultivation(h, (35 + Math.random() * 45) * FACTIONS[f].cultivation);
    }
    if (fs.resources.stones > 300) {
      fs.resources.stones -= 100;
      fs.disciples[0] += 1;
    }
    if (owned.length && Math.random() < 0.3 && fs.resources.stones > 200) {
      const c = owned[Math.floor(Math.random() * owned.length)];
      fs.resources.stones -= 80;
      c.defense += 10;
    }

    // 盈餘靈石用於補強守軍
    if (owned.length && fs.resources.stones > 450) {
      const spend = fs.resources.stones - 450;
      fs.resources.stones -= spend;
      const c = owned[Math.floor(Math.random() * owned.length)];
      c.garrison += Math.round(spend * 0.4);
    }

    if (!owned.length || !heroes.length) continue;
    if (Math.random() > 0.55) continue;

    // 找出相鄰目標
    const targets = new Set<string>();
    for (const c of owned) for (const id of map.adjacentCities(c.id)) targets.add(id);
    const candidates = [...targets]
      .map((id) => state.cities[id])
      .filter((c) => c.owner !== f)
      .filter((c) => {
        if (c.owner === 'neutral') return true;
        if (c.owner === state.player) return state.turn >= 8 && Math.random() < 0.35;
        return state.turn >= 5 && Math.random() < 0.4;
      })
      .sort((a, b) => defenseStrength(state, a) - defenseStrength(state, b));
    const target = candidates[0];
    if (!target) continue;

    const army = [...heroes].sort((a, b) => heroPower(b) + b.troops - (heroPower(a) + a.troops))[0];
    const est = heroPower(army) + army.troops + disciplePower(fs) * 0.5;
    if (est < defenseStrength(state, target) * 1.05) continue;

    const path = map.shortestPath(army.position, target.id, f);
    army.position = target.id;
    report.moves.push({ heroId: army.id, path });
    const from = target.owner;
    const result = siege(state, f, target);
    const name = FACTIONS[f].name;
    if (result.win) {
      report.captured.push({ id: target.id, from });
      report.messages.push(`【${name}】${army.name}攻下了${target.name}。`);
    } else {
      report.messages.push(`【${name}】${army.name}進攻${target.name}未果。`);
      const home = owned.find((c) => c.capital) ?? owned[0];
      const back = map.shortestPath(target.id, home.id, f);
      army.position = home.id;
      report.moves.push({ heroId: army.id, path: back });
    }
  }
  return report;
}

export function factionScore(state: GameState, f: FactionId) {
  const cities = citiesOf(state, f).length;
  const heroes = heroesOf(state, f);
  const troops = heroes.reduce((s, h) => s + h.troops, 0);
  const cultivation = heroes.reduce((s, h) => s + h.cultivation, 0);
  const stones = Math.round(state.factions[f].resources.stones);
  return { cities, troops, cultivation, stones, total: cities * 100 + stones + troops * 2 + cultivation };
}

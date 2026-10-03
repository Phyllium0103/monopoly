import type { Character, FactionId, Role } from '../game/types';
import { FACTIONS } from '../faction/Faction';

export const REALMS = ['練氣', '築基', '金丹', '元嬰', '化神'] as const;
/** 突破至下一境界所需的累積修為 */
export const REALM_THRESHOLDS = [0, 500, 1500, 4000, 9000];
export const REALM_POWER = [1, 1.4, 2, 2.8, 4];

export function realmName(level: number): string {
  return REALMS[Math.min(level, REALMS.length - 1)];
}

export function realmForCultivation(cultivation: number): number {
  let lv = 0;
  for (let i = 0; i < REALM_THRESHOLDS.length; i++) if (cultivation >= REALM_THRESHOLDS[i]) lv = i;
  return lv;
}

export function nextThreshold(level: number): number | null {
  return level + 1 < REALM_THRESHOLDS.length ? REALM_THRESHOLDS[level + 1] : null;
}

export function heroPower(c: Character): number {
  return Math.round((c.attack + c.defense * 0.5) * REALM_POWER[c.level] * FACTIONS[c.faction].heroPower);
}

export function troopCapacity(c: Character): number {
  return Math.round((200 + c.level * 100) * FACTIONS[c.faction].troopCapacity);
}

interface HeroSeed {
  id: string;
  name: string;
  role: Role;
  attack: number;
  defense: number;
  cultivation: number;
  loyalty: number;
}

export const HERO_SEEDS: Record<FactionId, HeroSeed[]> = {
  wei: [
    { id: 'caocao', name: '曹操', role: '主公', attack: 76, defense: 82, cultivation: 400, loyalty: 100 },
    { id: 'xiahoudun', name: '夏侯惇', role: '武將', attack: 88, defense: 74, cultivation: 200, loyalty: 98 },
    { id: 'zhangliao', name: '張遼', role: '武將', attack: 90, defense: 70, cultivation: 300, loyalty: 90 },
  ],
  shu: [
    { id: 'liubei', name: '劉備', role: '主公', attack: 74, defense: 80, cultivation: 450, loyalty: 100 },
    { id: 'guanyu', name: '關羽', role: '武將', attack: 97, defense: 76, cultivation: 700, loyalty: 100 },
    { id: 'zhangfei', name: '張飛', role: '武將', attack: 95, defense: 68, cultivation: 600, loyalty: 100 },
  ],
  wu: [
    { id: 'sunquan', name: '孫權', role: '主公', attack: 70, defense: 78, cultivation: 300, loyalty: 100 },
    { id: 'zhouyu', name: '周瑜', role: '軍師', attack: 80, defense: 70, cultivation: 450, loyalty: 95 },
    { id: 'taishici', name: '太史慈', role: '武將', attack: 89, defense: 72, cultivation: 250, loyalty: 88 },
  ],
  jin: [
    { id: 'simayi', name: '司馬懿', role: '軍師', attack: 74, defense: 90, cultivation: 500, loyalty: 100 },
    { id: 'dengai', name: '鄧艾', role: '武將', attack: 86, defense: 75, cultivation: 250, loyalty: 92 },
    { id: 'wangjun', name: '王濬', role: '修士', attack: 80, defense: 72, cultivation: 200, loyalty: 90 },
  ],
};

export function createCharacter(seed: HeroSeed, faction: FactionId, position: string): Character {
  const c: Character = {
    id: seed.id,
    name: seed.name,
    faction,
    role: seed.role,
    level: realmForCultivation(seed.cultivation),
    cultivation: seed.cultivation,
    attack: seed.attack,
    defense: seed.defense,
    loyalty: seed.loyalty,
    troops: 0,
    position,
    moved: false,
    acted: false,
  };
  c.troops = Math.round(troopCapacity(c) * 0.5);
  return c;
}

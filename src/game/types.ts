export type FactionId = 'wei' | 'shu' | 'wu' | 'jin';
export type Owner = FactionId | 'neutral';

export interface Vec2 {
  x: number;
  z: number;
}

export interface Resources {
  stones: number; // 靈石
  food: number; // 糧草
  wood: number; // 木材
  iron: number; // 鐵礦
  qi: number; // 靈氣
}

export type ResourceKey = keyof Resources;

export type Specialty = 'food' | 'wood' | 'iron' | 'qi' | 'trade';

export interface City {
  id: string;
  name: string;
  owner: Owner;
  population: number;
  defense: number;
  garrison: number;
  resources: number;
  spiritEnergy: number;
  specialty: Specialty;
  capital: boolean;
  /** 本回合尚可招募的弟子數 */
  recruitable: number;
  position: Vec2;
}

export type Role = '主公' | '武將' | '軍師' | '修士';

export interface Character {
  id: string;
  name: string;
  faction: FactionId;
  role: Role;
  /** 境界索引 0=練氣 … 4=化神 */
  level: number;
  cultivation: number;
  attack: number;
  defense: number;
  loyalty: number;
  troops: number;
  /** 所在節點 id */
  position: string;
  moved: boolean;
  acted: boolean;
}

export interface FactionState {
  id: FactionId;
  isPlayer: boolean;
  resources: Resources;
  /** 各境界弟子數量，索引同境界 */
  disciples: number[];
  /** 天機陣冷卻（晉） */
  formationCooldown: number;
}

export interface GameState {
  turn: number;
  maxTurns: number;
  player: FactionId;
  factions: Record<FactionId, FactionState>;
  cities: Record<string, City>;
  characters: Character[];
  /** 靈氣潮汐生效的回合 */
  qiTideTurn: number;
  over: boolean;
}

export type NodeType = 'city' | 'road' | 'realm';
export type TileKind = 'road' | 'vein' | 'market' | 'danger';

export interface MapNode {
  id: string;
  name: string;
  type: NodeType;
  tile: TileKind;
  pos: Vec2;
}

export interface MapEdge {
  a: string;
  b: string;
  water: boolean;
}

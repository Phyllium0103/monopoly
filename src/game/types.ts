export type LordId = 'cao' | 'sun' | 'liu' | 'dong';
export type Owner = LordId | 'neutral';
export type Element = 'metal' | 'wood' | 'water' | 'fire' | 'earth';

export interface Vec2 {
  x: number;
  z: number;
}

/** 將領基礎能力 */
export interface Stats {
  force: number; // 武力
  defense: number; // 防禦
  hp: number; // 血量
  alchemy: number; // 煉丹
  forging: number; // 煉器
  talisman: number; // 畫符
  formation: number; // 佈陣
}

export type CraftStat = 'alchemy' | 'forging' | 'talisman' | 'formation';

/** 品階：0=黃品下 … 11=天品上 */
export type Tier = number;

export interface Equipment {
  uid: string;
  kind: 'weapon' | 'armor';
  name: string;
  tier: Tier;
  /** 神器加武力；寶衣加防禦 */
  value: number;
  hp: number;
  price: number;
}

export interface Technique {
  uid: string;
  name: string;
  tier: Tier;
  element: Element;
  /** 修煉難度 1–5 */
  difficulty: number;
  /** 能力加成比例 */
  power: number;
  skillName: string;
  skillPower: number;
  price: number;
}

export type BeastSkill = 'attack' | 'shield' | 'heal' | 'treasure' | 'buff';

export interface Beast {
  uid: string;
  name: string;
  tier: Tier;
  skill: BeastSkill;
  desc: string;
  price: number;
}

/** 丹藥與天寶商行的法器、陣法、符籙 */
export interface Item {
  uid: string;
  defId: string;
  /** 丹藥品階 0–3（黃玄地天）；法器固定 0 */
  tier: number;
  price: number;
}

export type GeneralStatus = 'free' | 'garrison' | 'realm' | 'dead';

export interface General {
  id: string;
  name: string;
  origin: LordId;
  owner: LordId | null;
  base: Stats;
  realm: number;
  exp: number;
  /** 破境丹累積的突破機率加成 */
  breakBonus: number;
  hp: number;
  stamina: number;
  bonusForce: number;
  bonusDefense: number;
  weapon: Equipment | null;
  armor: Equipment | null;
  technique: Technique | null;
  status: GeneralStatus;
  /** 駐守中的城池 id */
  cityId: string | null;
}

export interface Expedition {
  generalIds: string[];
  turnsLeft: number;
  realmName: string;
}

export interface Lord {
  id: LordId;
  isPlayer: boolean;
  alive: boolean;
  /** 靈石，以下品為單位儲存 */
  stones: number;
  soldiers: number;
  position: number;
  /** 迷魂陣：剩餘停留回合 */
  stunned: number;
  tollFree: boolean;
  doubleDice: boolean;
  fixedDice: number | null;
  items: Item[];
  gear: Equipment[];
  scrolls: Technique[];
  beast: Beast | null;
  expeditions: Expedition[];
  rank: number;
}

export interface City {
  id: string;
  name: string;
  tile: number;
  owner: Owner;
  prosperity: number;
  capital: boolean;
  garrisonGeneral: string | null;
  garrisonSoldiers: number;
  /** 護城大陣剩餘回合 */
  shieldTurns: number;
}

export type TileKind = 'city' | 'realm' | 'treasure' | 'herb' | 'forge' | 'library' | 'beast' | 'tavern' | 'road';

export interface Tile {
  index: number;
  kind: TileKind;
  name: string;
  pos: Vec2;
  cityId: string | null;
}

export interface GameState {
  round: number;
  maxRounds: number;
  order: LordId[];
  turn: number;
  player: LordId;
  lords: Record<LordId, Lord>;
  generals: Record<string, General>;
  cities: Record<string, City>;
  tiles: Tile[];
  over: boolean;
  uid: number;
}

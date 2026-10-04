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

/** free=隨行、sect=留在宗門、garrison=駐守城池、realm=秘境中 */
export type GeneralStatus = 'free' | 'sect' | 'garrison' | 'realm' | 'dead';

/** 靈根：天靈根修煉快、偽靈根靠戰鬥成長 */
export type Aptitude = 'heaven' | 'earth' | 'pseudo';

export interface General {
  id: string;
  name: string;
  /** 所屬國；immortal 為仙人出山事件的方外高人 */
  origin: LordId | 'immortal';
  owner: LordId | null;
  base: Stats;
  realm: number;
  exp: number;
  aptitude: Aptitude;
  /** 上次低階突破失敗的回合（同一輪不能再試） */
  failedRound: number;
  /** 已服築基丹 */
  foundation: boolean;
  /** 心魔層數：降低突破率、加重雷劫 */
  demon: number;
  /** 避雷陣等護法：雷劫傷害減免比例 */
  ward: number;
  /** 駐守城池時閉關修煉 */
  secluded: boolean;
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
  /** realm=秘境、trade=海外貿易、island=尋訪仙山 */
  kind: 'realm' | 'trade' | 'island';
  generalIds: string[];
  turnsLeft: number;
  realmName: string;
  /** 上古秘境現世期間派遣：死亡率減半、獎勵更好 */
  blessed?: boolean;
  /** 海外貿易投入的靈石 */
  invest?: number;
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
  /** 破城符：本回合攻城戰力加成 */
  siegeBoost: number;
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
  /** 進行中的九州風雲 */
  events: ActiveEvent[];
  /** 本局已發生過的事件 */
  usedEvents: string[];
  merchantTile: number | null;
  banditTiles: number[];
  favoredElement: Element | null;
}

export interface ActiveEvent {
  id: string;
  name: string;
  icon: string;
  roundsLeft: number;
}

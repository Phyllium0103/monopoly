import type { MaterialGroup } from '../data/weaponCatalog';

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

/** 實際成交價；未購入的獎勵保留空值。 */
export interface PurchasedAsset { purchasePrice?: number; }

export interface Equipment extends PurchasedAsset {
  uid: string;
  kind: 'weapon' | 'armor';
  name: string;
  tier: Tier;
  /** 款式編號（見 EQUIP_DESIGNS） */
  designId: string;
  /** 專屬武器不可卸下、更換或出售。 */
  fixedGeneralId?: string;
  penetration?: number;
  force: number;
  defense: number;
  hp: number;
  /** 煉丹、煉器、畫符、佈陣加成 */
  craft: Partial<Record<CraftStat, number>>;
  price: number;
}

export interface Technique extends PurchasedAsset {
  uid: string;
  name: string;
  tier: Tier;
  element: Element;
  /** 能力加成比例 */
  power: number;
  skillName: string;
  skillPower: number;
  price: number;
}

export type BeastSkill = 'attack' | 'shield' | 'treasure' | 'buff';

export interface Beast extends PurchasedAsset {
  uid: string;
  name: string;
  tier: Tier;
  skill: BeastSkill;
  desc: string;
  price: number;
}

/** 丹藥與天寶商行的法器、陣法、符籙 */
export interface Item extends PurchasedAsset {
  uid: string;
  defId: string;
  /** 丹藥品階 0–3（黃玄地天）；法器固定 0 */
  tier: number;
  price: number;
}

/** free=隨行、sect=留在宗門、garrison=駐守城池、realm=秘境中 */
export type GeneralStatus = 'free' | 'sect' | 'garrison' | 'realm' | 'dead';

/** 靈根決定修煉速度與可修習的功法五行 */
export type Aptitude = 'waste' | Element | 'heaven';

export interface General {
  ghostSourceId?: string;
  ghostTurns?: number;
  ghostReadyTurn?: number;
  /** 下次可全隊清修／抵消物品的主公自身回合序號。 */
  seclusionReadyTurn?: number;
  itemBlockReadyTurn?: number;
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
  /** 引雷丹：下次雷劫傷害減免 */
  breakBoost: number;
  /** 七星續命陣：下一次渡劫死亡時復生 */
  sevenLife: boolean;
  /** 死亡前所屬的主公（百草堂復活時分「自己的亡將」與「其他主公的亡將」） */
  lastOwner: LordId | null;
  /** 主公本人：可出戰，但不能駐守城池、不會戰死、不能被變賣 */
  isLord: boolean;
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
  /** 秘境難度（對應 REALM_LEVELS） */
  level: number;
  generalIds: string[];
  turnsLeft: number;
  realmName: string;
  /** 上古秘境現世期間派遣：死亡率減半、獎勵更好 */
  blessed?: boolean;
}

export interface Lord {
  personalTurn?: number;
  clearCultivationTurns?: number;
  id: LordId;
  isPlayer: boolean;
  alive: boolean;
  /** 靈石，以下品為單位儲存 */
  stones: number;
  soldiers: number;
  position: number;
  /** 上一格：辨識進入岔路的方向；傳送後歸零 */
  lastTile: number | null;
  /** 本次經過岔路決定的出口；停下時保留到下回合 */
  forkExit: number | null;
  /** 本回合已領過的靈脈（每輪每位主公只領一次） */
  veinsTapped: number[];
  /** 定身符／鎖仙陣：下次擲骰時的剩餘停留回合 */
  stunned: number;
  tollFree: boolean;
  tollFreeTurns: number;
  itemsLocked: number;
  forcedTile: number | null;
  /** 自用停留物品：本回合擲骰時停在原地。 */
  stayThisTurn?: boolean;
  /** 每位主公僅能保留一名聽風樓武將；每次鎖定累乘價格。 */
  /** 聽風樓鎖定保留的武將（可同時鎖定多位） */
  tavernLocked?: string[];
  tavernPriceMultipliers?: Record<string, number>;
  moveMultiplier: number;
  forkChoice: boolean;
  /** 破城符：本回合攻城戰力加成 */
  siegeBoost: number;
  doubleDice: boolean;
  fixedDice: number | null;
  /** 遁地梭：本回合移動點數加成 */
  bonusSteps: number;
  materials: Record<MaterialGroup, [number, number, number]>;
  items: Item[];
  gear: Equipment[];
  scrolls: Technique[];
  beast: Beast | null;
  expeditions: Expedition[];
  rank: number;
}

/** 城池指定的技藝比試；每座城固定開放擂台戰 */
export type ContestKind = CraftStat;

export interface City {
  id: string;
  name: string;
  tile: number;
  owner: Owner;
  prosperity: number;
  capital: boolean;
  /** 每回合挖掘的最低階材料；佔領時選擇。 */
  mining: MaterialGroup | null;
  /** 駐守的武將（最多 3 人） */
  garrisonGenerals: string[];
  garrisonSoldiers: number;
  /** 四項技藝中指定一種比試（佔領時由主公選擇） */
  contest: ContestKind;
  /** 護城大陣剩餘回合 */
  shieldTurns: number;
}

export type TileKind = 'city' | 'realm' | 'treasure' | 'herb' | 'forge' | 'library' | 'beast' | 'tavern' | 'road' | 'portal' | 'vein' | 'casino';

export interface Tile {
  index: number;
  kind: TileKind;
  name: string;
  pos: Vec2;
  cityId: string | null;
  /** 相鄰的格子（道路雙向相通，岔路依箭頭決定出口） */
  links: number[];
}

export interface GameState {
  round: number;
  /** 最大回合數；null 為無盡模式（直到只剩一位主公沒破產） */
  maxRounds: number | null;
  order: LordId[];
  turn: number;
  player: LordId;
  lords: Record<LordId, Lord>;
  generals: Record<string, General>;
  cities: Record<string, City>;
  tiles: Tile[];
  /** 每座岔路的箭頭所指的相鄰格 */
  forkDirections: Record<number, number>;
  over: boolean;
  /** 真仙勝利優先於資產排名。 */
  winner: LordId | null;
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

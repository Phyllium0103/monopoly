import type { LordId } from '../game/types';
import type { ContestResult, DuelEvent, SiegeResult } from '../systems/BattleSystem';
import type { TribulationResult } from '../systems/GeneralSystem';
import type { CasinoResult } from '../systems/CasinoSystem';
import type { DuelSnapshot } from './snapshots';

export type LogKind = 'info' | 'good' | 'bad' | 'ai' | 'turn';

/**
 * 引擎產生的畫面效果。單機時直接播放；伺服器上逐一記錄成 ViewEvent，
 * 傳給每位玩家的瀏覽器依序播放。所有參數都是可序列化的資料（武將、城池用 id）。
 */
export interface EngineView {
  log(text: string, kind?: LogKind): void;
  /** to：只給某位主公看；省略則所有人 */
  toast(text: string, to?: LordId): void;
  /** 重新整理畫面（地圖標籤、上方資訊、行動列） */
  refresh(): void;
  syncCities(): void;
  setEventMarkers(): void;
  beam(lord: LordId, color?: number): void;
  capture(tile: number, lord: LordId): void;
  /** 輪到某位主公：鏡頭對準 */
  focusTurn(lord: LordId): void;
  hideLord(lord: LordId): void;
  /** 瞬間移到某格（九州風雲洗牌等） */
  placeLord(lord: LordId, tile: number): void;
  /** 傳送：光柱、移到新格、鏡頭跟上 */
  teleport(lord: LordId, tile: number): Promise<void>;
  /** 走一步 */
  moveStep(lord: LordId, from: number, to: number): Promise<void>;
  rollDice(lord: LordId, values: number[], bonus: number, multiplier: number): Promise<void>;
  wait(ms: number): Promise<void>;
  /** 電腦回合的行動摘要 */
  beginReport(lord: LordId): void;
  restartReport(lord: LordId): void;
  endReport(lord: LordId, round: number): Promise<void>;
  contest(r: ContestResult, aGeneral: string, aLord: LordId, bGeneral: string, bLord: LordId): Promise<void>;
  siege(r: SiegeResult, team: string[], attacker: LordId, cityId: string, defenders: string[], defender: LordId): Promise<void>;
  tribulation(generalId: string, owner: LordId, r: TribulationResult, startHp: number, startMax: number): Promise<void>;
  duelStart(d: DuelSnapshot, title: string): void;
  duelEvents(d: DuelSnapshot, events: DuelEvent[]): Promise<void>;
  duelEnd(d: DuelSnapshot): Promise<void>;
  casino(lord: LordId, r: CasinoResult): Promise<void>;
  /** 對所有人（to 為 null）或某位主公的通知視窗 */
  notice(to: LordId | null, title: string, text: string, icon: string, button: string): Promise<void>;
  gameOver(reason: string): Promise<void>;
}

/** 伺服器記錄下來、傳給瀏覽器重播的畫面事件 */
export type ViewEvent = { [K in keyof EngineView]: { t: K; a: Parameters<EngineView[K]> } }[keyof EngineView];

/** 記錄所有畫面效果（伺服器用）；live 為 false 時代表正在重播已送出的部分，不重複記錄 */
export class RecordingView implements EngineView {
  events: ViewEvent[] = [];
  live = true;
  private push(e: ViewEvent) {
    if (this.live) this.events.push(JSON.parse(JSON.stringify(e)) as ViewEvent);
  }
  log(...a: Parameters<EngineView['log']>) { this.push({ t: 'log', a }); }
  toast(...a: Parameters<EngineView['toast']>) { this.push({ t: 'toast', a }); }
  refresh() {}
  syncCities() { this.push({ t: 'syncCities', a: [] }); }
  setEventMarkers() { this.push({ t: 'setEventMarkers', a: [] }); }
  beam(...a: Parameters<EngineView['beam']>) { this.push({ t: 'beam', a }); }
  capture(...a: Parameters<EngineView['capture']>) { this.push({ t: 'capture', a }); }
  focusTurn(...a: Parameters<EngineView['focusTurn']>) { this.push({ t: 'focusTurn', a }); }
  hideLord(...a: Parameters<EngineView['hideLord']>) { this.push({ t: 'hideLord', a }); }
  placeLord(...a: Parameters<EngineView['placeLord']>) { this.push({ t: 'placeLord', a }); }
  async teleport(...a: Parameters<EngineView['teleport']>) { this.push({ t: 'teleport', a }); }
  async moveStep(...a: Parameters<EngineView['moveStep']>) { this.push({ t: 'moveStep', a }); }
  async rollDice(...a: Parameters<EngineView['rollDice']>) { this.push({ t: 'rollDice', a }); }
  async wait() {}
  beginReport(...a: Parameters<EngineView['beginReport']>) { this.push({ t: 'beginReport', a }); }
  restartReport(...a: Parameters<EngineView['restartReport']>) { this.push({ t: 'restartReport', a }); }
  async endReport(...a: Parameters<EngineView['endReport']>) { this.push({ t: 'endReport', a }); }
  async contest(...a: Parameters<EngineView['contest']>) { this.push({ t: 'contest', a }); }
  async siege(...a: Parameters<EngineView['siege']>) { this.push({ t: 'siege', a }); }
  async tribulation(...a: Parameters<EngineView['tribulation']>) { this.push({ t: 'tribulation', a }); }
  duelStart(...a: Parameters<EngineView['duelStart']>) { this.push({ t: 'duelStart', a }); }
  async duelEvents(...a: Parameters<EngineView['duelEvents']>) { this.push({ t: 'duelEvents', a }); }
  async duelEnd(...a: Parameters<EngineView['duelEnd']>) { this.push({ t: 'duelEnd', a }); }
  async casino(...a: Parameters<EngineView['casino']>) { this.push({ t: 'casino', a }); }
  async notice(...a: Parameters<EngineView['notice']>) { this.push({ t: 'notice', a }); }
  async gameOver(...a: Parameters<EngineView['gameOver']>) { this.push({ t: 'gameOver', a }); }
}

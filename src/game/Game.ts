import { MATERIAL_GROUPS, MATERIAL_NAMES } from '../data/weaponCatalog';
import { materialIncome } from '../systems/MaterialSystem';
import { abilityUsers } from '../systems/GeneralAbilities';
import { sectDispatchFee } from '../systems/SectSystem';
import * as THREE from 'three';
import type { GameState, General, Lord, LordId } from './types';
import { DEFAULT_ROUNDS, citiesOf, createGameState, currentLord, garrisonOf, generalsOf, nextUid } from './GameState';
import { fmtProsperity, fmtStones } from './Currency';
import { SceneManager } from '../scene/SceneManager';
import { World } from '../world/World';
import { CharacterSprite } from '../character/CharacterSprite';
import { LORDS, LORD_IDS, ownerCss, ownerName } from '../faction/Faction';
import { GameUI, type ActionButton } from '../ui/GameUI';
import { Dialog } from '../ui/Dialog';
import { preloadArt } from '../ui/Icons';
import { GeneralsView } from '../ui/GeneralsView';
import { BattleView } from '../ui/BattleView';
import { ShopPanel } from '../ui/ShopView';
import { CasinoPanel } from '../ui/CasinoView';
import { HelpView } from '../ui/HelpView';
import { RankView } from '../ui/RankView';
import { LordView } from '../ui/LordView';
import { showEndScreen, showStartScreen } from '../ui/Screens';
import { ITEM_DEFS, STAT_NAMES, makeBeast, makeEquipment, makeItem, makeTechnique } from '../data/items';
import { TILE_INFO } from '../data/board';
import { terrainEffects, terrainOf } from '../data/terrain';
import { RANK_METRICS, cityIncomeOf, cityRanks, cityToll, garrisonPower, recruitCost, toll } from '../systems/CitySystem';
import { canAttemptBreak, maxHp, maxStamina, power } from '../systems/GeneralSystem';
import { realmTag } from '../ui/GeneralInfo';
import { bindPassiveState } from '../data/passives';
import { Engine } from '../engine/Engine';
import { previewAt, type PrerollAction, type Prompt, type RosterAction } from '../engine/prompts';
import type { EngineView, LogKind, ViewEvent } from '../engine/view';
import type { DuelSnapshot } from '../engine/snapshots';
import type { Side } from '../systems/BattleSystem';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 等待本機玩家回答的抉擇（整備、選格子由行動列與地圖處理） */
interface ActivePrompt {
  lord: LordId;
  prompt: Prompt;
  resolve: (answer: unknown) => void;
}

/**
 * 遊戲畫面：3D 地圖、動畫、行動列與輸入。
 * 單機時在本機執行遊戲引擎；多人時只播放伺服器送來的事件，並把本機玩家的抉擇送回伺服器。
 */
export class Game {
  private sm: SceneManager;
  private world: World;
  private ui: GameUI;
  private dialog: Dialog;
  private generalsView: GeneralsView;
  private battleView: BattleView;
  private shop: ShopPanel;
  private casino: CasinoPanel;
  private help: HelpView;
  private rankView: RankView;
  private lordView: LordView;
  private state!: GameState;
  private engine: Engine | null = null;
  private sprites = new Map<LordId, CharacterSprite>();
  /** 本機玩家操控的主公 */
  private me: LordId = 'cao';
  /** 多人模式：抉擇送往伺服器，畫面由伺服器事件驅動 */
  private online: { onExit: () => void } | null = null;
  /** 單機：隨時開啟宗門調度時暫停遊戲 */
  private dispatchTask: Promise<void> | null = null;
  private token = 0;
  private hoverTile: number | null = null;
  private mouse = { x: 0, y: 0 };
  private active: ActivePrompt | null = null;
  /** 電腦託管中（單機） */
  private autoPlay = false;
  /** 本局的畫面效果實作，交給引擎使用 */
  readonly view: EngineView;

  constructor(
    sceneRoot: HTMLElement,
    private uiRoot: HTMLElement,
  ) {
    this.sm = new SceneManager(sceneRoot);
    this.world = new World(this.sm.scene, this.sm.animator);
    this.ui = new GameUI(uiRoot);
    this.dialog = new Dialog(uiRoot);
    this.generalsView = new GeneralsView(uiRoot);
    this.battleView = new BattleView(uiRoot);
    this.shop = new ShopPanel(this.dialog);
    this.casino = new CasinoPanel(this.dialog);
    this.help = new HelpView(uiRoot);
    this.rankView = new RankView(uiRoot);
    this.lordView = new LordView(uiRoot);
    this.lordView.facingText = (id) => this.facingText(this.state.lords[id]);
    this.ui.onLord = (id) => this.lordView.open(this.state, id);
    this.ui.onHelp = () => this.help.open();
    this.ui.onRank = () => this.rankView.open(this.state);
    this.ui.onAuto = () => this.toggleAuto();
    this.ui.onCheat = () => this.cheat();
    this.rankView.onFocus = (cityId) => {
      const city = this.state.cities[cityId];
      this.sm.cameraController.focus(this.world.tilePosition(city.tile));
      this.hoverTile = city.tile;
      this.refresh();
    };
    this.view = this.createView();

    this.sm.setPickables(this.world.pickables);
    this.sm.onUpdate((dt, time) => {
      this.world.update(dt);
      for (const s of this.sprites.values()) s.update(dt, time);
    });
    this.sm.onPick = (o) => this.handlePick(o);
    this.sm.onHover = (o, e) => {
      this.mouse = { x: e.clientX, y: e.clientY };
      this.handleHover(o);
    };
    // 右鍵拖曳是平移視角；只有「沒有拖曳的右鍵點擊」才算取消選格
    const canvas = this.sm.renderer.domElement;
    let rightDown: { x: number; y: number } | null = null;
    let rightDragged = false;
    canvas.addEventListener('pointerdown', (e) => {
      if (e.button === 2) { rightDown = { x: e.clientX, y: e.clientY }; rightDragged = false; }
    });
    canvas.addEventListener('pointermove', (e) => {
      if (rightDown && Math.hypot(e.clientX - rightDown.x, e.clientY - rightDown.y) > 5) rightDragged = true;
    });
    canvas.addEventListener('contextmenu', () => {
      if (!rightDragged && this.active?.prompt.kind === 'tile') this.answer(null);
      rightDown = null;
      rightDragged = false;
    });
    this.ui.onSpeed = (s) => (this.sm.timeScale = this.dispatchTask ? 0 : s);

    window.addEventListener('keydown', (e) => {
      if (!this.state || this.state.over || this.dialog.isOpen || this.dispatchTask) return;
      if ((e.key === ' ' || e.key === 'Enter') && (e.target as HTMLElement)?.tagName === 'BUTTON') e.preventDefault();
      if (e.key === ' ' && this.active?.prompt.kind === 'preroll') {
        e.preventDefault();
        this.answer({ type: 'roll' } satisfies PrerollAction);
      }
      if (e.key === 'Escape' && this.active?.prompt.kind === 'tile') this.answer(null);
    });
    this.sm.start();
  }

  private get speed() {
    return this.ui.speed;
  }

  /** 本機玩家目前是否由電腦託管 */
  private get auto() {
    return !this.online && this.autoPlay;
  }

  showStart() {
    this.ui.hide();
    showStartScreen(this.uiRoot, (id, rounds) => this.start(id, rounds), () => this.help.open());
  }

  // ───────────────────────── 開局 ─────────────────────────

  /** 單機開局 */
  start(player: LordId, maxRounds: number | null = DEFAULT_ROUNDS) {
    this.reset();
    this.me = player;
    this.setupBoard(createGameState(player, maxRounds));
    this.ui.log(`天地靈氣復甦，${LORDS[player].name}起兵逐鹿天下！${maxRounds === null ? '（無盡模式：主公真仙或最後存活者獲勝）' : `（${maxRounds} 輪後比總資產）`}`, 'turn');
    this.ui.log('擲骰沿道路前進，岔路依箭頭走並換方向；逆向停在岔路，下回合返回，途經岔路則隨機轉向：停在無主城池才能派將佔領，踏入他人城池須繳過路費或開戰。', 'info');
    const engine = new Engine(this.state, {
      view: this.view,
      send: (lord, p) => this.promptUI(lord, p),
      isAuto: (id) => this.autoPlay && id === this.me,
      multiplayer: false,
      onSpectate: () => {
        this.ui.speed = 4;
        this.sm.timeScale = 4;
      },
    });
    this.engine = engine;
    void engine.run();
  }

  /** 清掉上一局的引擎、視窗與棋子 */
  private reset() {
    this.token++;
    this.engine?.stop();
    this.engine = null;
    this.online = null;
    this.autoPlay = false;
    this.ui.auto = false;
    this.active = null;
    this.dispatchTask = null;
    this.shop.close();
    this.casino.close();
    this.battleView.closeAll();
    this.generalsView.close();
    this.dialog.close();
    for (const s of this.sprites.values()) s.dispose();
    this.sprites.clear();
  }

  /** 依遊戲狀態擺好地圖、城池與主公棋子 */
  private setupBoard(state: GameState) {
    this.state = state;
    bindPassiveState(state);
    this.world.clearHighlights();
    this.world.setEventMarkers(state.merchantTile, state.banditTiles);
    this.world.syncCities(state);
    for (const s of this.sprites.values()) s.dispose();
    this.sprites.clear();
    for (const id of LORD_IDS) {
      const s = new CharacterSprite({ id, name: LORDS[id].name, lord: id, role: '主公' });
      this.sm.scene.add(s.group);
      this.sprites.set(id, s);
      s.setGroundPosition(this.slotPosition(id, state.lords[id].position));
      s.group.visible = state.lords[id].alive;
    }
    this.sm.setPickables([...this.world.pickables, ...[...this.sprites.values()].map((s) => s.group)]);
    this.ui.reset();
    this.ui.show();
    // 背景預先載入圖片，避免之後打開名冊、商店時圖片才一張張慢慢冒出來
    preloadArt(Object.values(state.generals).filter((g) => g.owner === this.me).map((g) => g.id));
    this.refresh();
  }

  private restart() {
    const online = this.online;
    this.reset();
    this.ui.hide();
    if (online) online.onExit();
    else this.showStart();
  }

  // ───────────────────────── 多人：由伺服器驅動 ─────────────────────────

  /** 進入多人對局：me 為本機玩家的主公 */
  startOnline(state: GameState, me: LordId, onExit: () => void) {
    this.reset();
    this.me = me;
    this.online = { onExit };
    this.setupBoard(state);
  }

  /** 換上伺服器最新的完整狀態（重連或補資料時）；棋子直接放到正確位置 */
  syncOnlineState(state: GameState) {
    if (!this.online) return;
    const prev = this.state;
    this.state = state;
    bindPassiveState(state);
    for (const id of LORD_IDS) {
      const s = this.sprites.get(id);
      if (!s) continue;
      if (!prev || prev.lords[id].position !== state.lords[id].position) s.setGroundPosition(this.slotPosition(id, state.lords[id].position));
      s.group.visible = state.lords[id].alive;
    }
    this.world.syncCities(state);
    this.world.setEventMarkers(state.merchantTile, state.banditTiles);
    this.generalsView.refresh(state, state.lords[this.me]);
    this.refresh();
  }

  /** 依序播放伺服器送來的畫面事件 */
  async playEvents(events: ViewEvent[]) {
    for (const e of events) {
      const fn = this.view[e.t] as (...a: unknown[]) => unknown;
      await fn.apply(this.view, e.a as unknown[]);
    }
  }

  /** 伺服器要本機玩家回答的抉擇 */
  answerRemote(lord: LordId, prompt: Prompt): Promise<unknown> {
    return this.promptUI(lord, prompt);
  }

  /** 取消正在等待的抉擇（例如伺服器已由電腦代打） */
  cancelPrompt() {
    if (this.active) {
      this.active = null;
      this.world.clearHighlights();
    }
    this.shop.close();
    this.casino.close();
    this.refresh();
  }

  /** 多人：顯示等待誰行動 */
  setWaiting(text: string | null) {
    this.waitingText = text;
    this.refresh();
  }
  private waitingText: string | null = null;

  // ───────────────────────── 畫面效果（引擎呼叫） ─────────────────────────

  private createView(): EngineView {
    const sprite = (id: LordId) => this.sprites.get(id)!;
    const involved = (...ids: LordId[]) => ids.includes(this.me) && !this.auto;
    const general = (id: string): General => this.state.generals[id];
    return {
      log: (text: string, kind: LogKind = 'info') => this.ui.log(text, kind),
      toast: (text: string, to?: LordId) => {
        if (!to || to === this.me) this.ui.toast(text);
      },
      refresh: () => this.refresh(),
      syncCities: () => this.world.syncCities(this.state),
      setEventMarkers: () => this.world.setEventMarkers(this.state.merchantTile, this.state.banditTiles),
      beam: (lord: LordId, color?: number) => this.world.beamEffect(sprite(lord).group.position, color),
      capture: (tile: number, lord: LordId) => this.world.captureEffect(tile, LORDS[lord].color),
      focusTurn: (lord: LordId) => {
        const s = sprite(lord);
        for (const x of this.sprites.values()) x.setSelected(x === s);
        this.sm.cameraController.focus(s.group.position);
      },
      hideLord: (lord: LordId) => {
        sprite(lord).group.visible = false;
      },
      placeLord: (lord: LordId, tile: number) => {
        const s = sprite(lord);
        this.world.beamEffect(s.group.position, 0xc9a0ff);
        s.setGroundPosition(this.slotPosition(lord, tile));
        this.world.beamEffect(s.group.position, 0xc9a0ff);
      },
      teleport: async (lord: LordId, tile: number) => {
        const s = sprite(lord);
        this.world.beamEffect(s.group.position, 0xc9a0ff);
        await this.view.wait(500);
        s.setGroundPosition(this.slotPosition(lord, tile));
        this.world.beamEffect(s.group.position, 0xc9a0ff);
        this.sm.cameraController.focus(s.group.position);
        await this.view.wait(500);
      },
      moveStep: async (lord: LordId, _from: number, to: number) => {
        const s = sprite(lord);
        await s.moveAlong([s.group.position.clone(), this.slotPosition(lord, to)], this.sm.animator, (p) => this.sm.cameraController.follow(p));
      },
      rollDice: (_lord: LordId, values: number[], bonus: number, multiplier: number) => this.ui.rollDice(values, bonus, multiplier),
      wait: async (ms: number) => {
        if (ms > 0) await sleep(ms / this.speed);
        if (this.dispatchTask) await this.dispatchTask;
      },
      beginReport: () => this.ui.beginReport(),
      restartReport: () => this.ui.restartReport(),
      endReport: async (lord: LordId, round: number) => {
        const lines = this.ui.endReport();
        // 電腦託管時不彈出結果，免得高倍速下畫面一直被蓋住、按不到取消託管（結果仍可在天下紀事看到）
        if (this.auto) return;
        await this.ui.showReport(`${LORDS[lord].name}・第 ${round} 輪行動結果`, LORDS[lord].css, lines, Math.min(6000, 2000 + lines.length * 600) / this.speed);
      },
      contest: async (r, a, aLord, b, bLord) => {
        if (!involved(aLord, bLord)) return;
        await this.battleView.showContest(r, general(a), aLord, general(b), bLord, aLord === this.me ? 'a' : 'b');
      },
      siege: async (r, team, attacker, cityId, defenders, defender) => {
        if (!involved(attacker, defender)) return;
        await this.battleView.showSiege(r, team.map(general), attacker, this.state.cities[cityId], defenders.map(general), attacker === this.me);
      },
      tribulation: async (generalId, owner, r, startHp, startMax) => {
        if (owner !== this.me) return;
        await this.battleView.showTribulation(general(generalId).name, r, startHp, startMax, () => this.speed);
      },
      duelStart: (d: DuelSnapshot, title: string) => {
        const side = this.duelSide(d);
        if (!side || this.auto) return;
        this.battleView.duelOpen(d, { a: general(d.a.generalId), b: general(d.b.generalId) }, title, side);
      },
      duelEvents: async (d, events) => {
        if (this.battleView.duelActive) await this.battleView.duelPlay(d, events, () => this.speed);
      },
      duelEnd: async (d) => {
        if (this.battleView.duelActive) await this.battleView.duelFinish(d);
      },
      casino: async (lord, r) => {
        if (lord !== this.me) return;
        await this.casino.reveal(r, this.state.lords[lord].stones, () => this.speed);
      },
      notice: async (to, title, text, icon, button) => {
        if (to === null ? !this.state.lords[this.me].alive || this.auto : to !== this.me) return;
        await this.dialog.message(title, text, icon, button);
      },
      gameOver: async (reason: string) => {
        this.generalsView.close();
        this.active = null;
        this.refresh();
        await this.dialog.message('天下大勢已定', reason, '📜', '查看結算');
        showEndScreen(this.uiRoot, this.state, reason, () => this.restart(), this.online ? '返回大廳' : '重新開始', this.me);
      },
    };
  }

  /** 本機玩家在這場擂台是哪一方 */
  private duelSide(d: DuelSnapshot): Side | null {
    if (d.a.lord === this.me) return 'a';
    if (d.b.lord === this.me) return 'b';
    return null;
  }

  // ───────────────────────── 抉擇介面 ─────────────────────────

  /** 顯示抉擇並回傳玩家的回答（單機由引擎呼叫；多人由伺服器的待答抉擇呼叫） */
  private promptUI(lord: LordId, p: Prompt): Promise<unknown> {
    if (p.kind !== 'shop') this.shop.close();
    switch (p.kind) {
      case 'choose':
        return this.dialog.choose(p.title, p.text, p.choices.map((c, i) => ({ ...c, value: i })), p.cancel, p.icon);
      case 'pickMany':
        return this.dialog.pickMany(p.title, p.text, p.choices.map((c, i) => ({ ...c, value: i })), p.min, p.max, p.confirm);
      case 'slider':
        return this.dialog.slider(p.title, p.text, { min: p.min, max: p.max, step: p.step, initial: p.initial, unit: p.unit, confirm: p.confirm, preview: p.previews ? (v) => previewAt(p, v) : undefined }, p.icon);
      case 'confirm':
        return this.dialog.confirm(p.title, p.text, p.yes, p.no, p.icon);
      case 'message':
        return this.dialog.message(p.title, p.text, p.icon, p.button).then(() => null);
      case 'shop':
        return this.shop.ask(this.state.lords[lord], p.shop);
      case 'casino':
        return this.casino.bet(this.state.lords[lord]);
      case 'bid':
        return this.bidUI(this.state.lords[lord], p.lot);
      case 'duel':
        if (!this.battleView.duelActive) this.battleView.duelOpen(p.duel, { a: this.state.generals[p.duel.a.generalId], b: this.state.generals[p.duel.b.generalId] }, '⚔️ 擂台戰', p.side);
        return this.battleView.duelAsk(p.duel, p.side);
      case 'roster':
        return this.generalsView.ask(this.state, this.state.lords[lord]);
      case 'preroll':
      case 'tile':
        return new Promise((resolve) => {
          this.active = { lord, prompt: p, resolve };
          if (p.kind === 'tile') this.world.showHighlights(this.state.tiles.filter((t) => p.allowCasino || t.kind !== 'casino').map((t) => t.index), 0xc9a0ff);
          else this.ui.toast(`第 ${this.state.round} 輪・你的回合`);
          this.refresh();
        });
    }
  }

  /** 回答行動列或地圖上的抉擇 */
  private answer(a: unknown) {
    const act = this.active;
    if (!act) return;
    this.active = null;
    this.world.clearHighlights();
    act.resolve(a);
    this.refresh();
  }

  /** 拍賣會：密封出價；回傳 0 表示放棄 */
  private bidUI(lord: Lord, lot: { label: string; sub: string; price: number }): Promise<number> {
    return this.dialog.custom<number>('🔨 天寶拍賣會・密封出價', (body, done) => {
      let bid = 0;
      const set = (v: number) => {
        bid = Math.max(0, Math.min(lord.stones, Math.round(v / 100) * 100));
        render();
      };
      const button = (parent: Element, label: string, cls: string, fn: () => void, disabled = false) => {
        const b = document.createElement('button');
        b.className = `btn ${cls}`;
        b.textContent = label;
        b.disabled = disabled;
        b.onclick = fn;
        parent.appendChild(b);
      };
      const render = () => {
        body.innerHTML = `
          <div class="lot"><b>${lot.label}</b><small>${lot.sub}</small><small>市價約 ${fmtStones(lot.price)}</small></div>
          <p class="dialog-text">各位主公各自秘密出價，價高者得，得標者支付自己的出價。<br>持有靈石：${fmtStones(lord.stones)}</p>
          <div class="bid-box"><div class="bid-amount">${bid ? fmtStones(bid) : '尚未出價'}</div><div class="bid-row steps"></div><div class="bid-row quick"></div></div>
          <div class="dialog-buttons"></div>`;
        const steps = body.querySelector('.steps')!;
        for (const d of [-10000, -1000, 1000, 10000]) button(steps, `${d > 0 ? '+' : '−'}${fmtStones(Math.abs(d))}`, 'mini', () => set(bid + d));
        const quick = body.querySelector('.quick')!;
        button(quick, '市價', 'mini', () => set(lot.price));
        button(quick, '一半家產', 'mini', () => set(lord.stones / 2));
        button(quick, '傾家蕩產', 'mini', () => set(lord.stones));
        const actions = body.querySelector('.dialog-buttons')!;
        button(actions, '密封出價', 'primary', () => done(bid), bid <= 0);
        button(actions, '放棄', '', () => done(0));
      };
      render();
    }, false, () => 0);
  }

  // ───────────────────────── 單機專屬 ─────────────────────────

  /** 測試按鈕：大量靈石與士兵，以及所有物品、裝備、功法、靈獸 */
  private cheat() {
    if (this.online || !this.state) return;
    const lord = this.state.lords[this.me];
    if (!lord.alive) return;
    lord.stones += 100_000_000;
    lord.soldiers += 100_000;
    for (const k of MATERIAL_GROUPS) lord.materials[k] = lord.materials[k].map(n => n + 1000) as [number, number, number];
    for (const [defId, d] of Object.entries(ITEM_DEFS)) for (let t = 0; t < d.price.length; t++) lord.items.push(makeItem(nextUid(this.state, 'i'), defId, t));
    for (let tier = 0; tier < 12; tier++) {
      lord.gear.push(makeEquipment(nextUid(this.state, 'e'), 'armor', tier));
      lord.scrolls.push(makeTechnique(nextUid(this.state, 't'), tier));
    }
    lord.beast = makeBeast(nextUid(this.state, 'b'), 11);
    for (const g of generalsOf(this.state, lord.id)) {
      g.hp = maxHp(g);
      g.stamina = maxStamina(g);
    }
    this.ui.log('🧪 測試：獲得 100 極品靈石、10 萬士兵，以及所有丹藥、陣法、符籙、法器（各階）、各階寶衣與功法、天階靈獸，以及十八種升階材料各 1000 顆。', 'good');
    this.ui.toast('🧪 測試：已獲得大量靈石與所有物品');
    this.refresh();
  }

  /** 切換電腦託管：開啟後玩家的回合由電腦代打 */
  private toggleAuto() {
    if (this.online || this.dispatchTask || !this.state) return;
    this.autoPlay = !this.autoPlay;
    this.ui.auto = this.autoPlay;
    this.ui.log(this.autoPlay ? '🤖 開啟電腦託管，由電腦代為行動。' : '🤖 取消託管，下一個回合起由你操作。', 'turn');
    // 正在等玩家整備：由電腦接手當前回合
    if (this.autoPlay && this.active?.prompt.kind === 'preroll') this.answer({ type: 'auto' } satisfies PrerollAction);
    this.refresh();
  }

  /** 單機：任何時候都能調度宗門，期間遊戲暫停 */
  private async openSect(lord: Lord) {
    if (!this.engine || this.state.over || !lord.alive || this.autoPlay || this.dispatchTask) return;
    if (this.dialog.isOpen || this.battleView.isOpen) {
      this.ui.toast('請先完成目前的視窗，再調度宗門');
      return;
    }
    this.sm.timeScale = 0;
    const task = this.engine.manageSect(lord);
    this.dispatchTask = task;
    this.refresh();
    try { await task; }
    finally {
      this.dispatchTask = null;
      this.sm.timeScale = this.speed;
      this.refresh();
    }
  }

  /** 名冊：整備階段交給引擎處理；其他時候只能查看（單機可學功法、自廢修為） */
  private openRoster() {
    const lord = this.state.lords[this.me];
    if (this.active?.prompt.kind === 'preroll') return this.answer({ type: 'roster' } satisfies PrerollAction);
    const engine = this.online ? null : this.engine;
    void this.generalsView.open(this.state, lord, { manage: false, free: !!engine }, engine ? (a: RosterAction) => {
      if (a.type !== 'learn' && a.type !== 'abolish') return;
      const g = this.state.generals[a.generalId];
      if (g) void engine.rosterAction(lord, a.type, g).then(() => this.generalsView.refresh(this.state, lord));
    } : null).then(() => this.refresh());
  }

  // ───────────────────────── 地圖與棋子 ─────────────────────────

  private slotPosition(id: LordId, tile: number): THREE.Vector3 {
    const t = this.state.tiles[tile];
    const p = this.world.tilePosition(tile);
    const i = LORD_IDS.indexOf(id);
    const big = t.kind !== 'road';
    const ox = (i % 2 === 0 ? -1 : 1) * (big ? 1.1 : 0.75);
    const oz = (i < 2 ? 1 : -0.2) * (big ? 1 : 0.7) + (big ? 2.2 : 0.4);
    const x = p.x + ox;
    const z = p.z + oz;
    return new THREE.Vector3(x, this.world.ground(x, z) + (t.kind === 'road' ? 0.25 : 0.05), z);
  }

  private facingText(lord: Lord): string {
    const t = this.state.tiles[lord.position];
    if (lord.forkExit !== null) return `${lord.forkExit === lord.lastTile ? '下回合返回' : '下次前進往'}${this.state.tiles[lord.forkExit].name}`;
    if (t.links.length >= 3) return `依岔路箭頭往${this.state.tiles[this.state.forkDirections[t.index]].name}`;
    if (lord.lastTile === null) return '尚未出發（方向隨機）';
    const ahead = t.links.filter((n) => n !== lord.lastTile);
    if (!ahead.length) return `回頭往${this.state.tiles[lord.lastTile].name}`;
    return `朝向${this.state.tiles[ahead[0]].name}`;
  }

  /** 更新地圖上各主公面向的箭頭 */
  private updateFacing() {
    LORD_IDS.forEach((id, i) => {
      const l = this.state.lords[id];
      if (!l.alive || l.lastTile === null) {
        this.world.setFacing(id, LORDS[id].color, l.position, null, i);
        return;
      }
      const from = this.state.tiles[l.forkExit !== null ? l.position : l.lastTile].pos;
      const to = this.state.tiles[l.forkExit ?? l.position].pos;
      this.world.setFacing(id, LORDS[id].color, l.position, { x: to.x - from.x, z: to.z - from.z }, i);
    });
  }

  // ───────────────────────── 輸入 ─────────────────────────

  private tileOf(o: THREE.Object3D | null): number | null {
    if (!o) return null;
    if (o.userData.tile !== undefined) return o.userData.tile;
    if (o.userData.lordId) return this.state.lords[o.userData.lordId as LordId].position;
    return null;
  }

  private handlePick(o: THREE.Object3D | null) {
    if (!this.state) return;
    const tile = this.tileOf(o);
    if (tile === null) return;
    const act = this.active;
    if (act?.prompt.kind === 'tile') {
      // 迷魂不能把對手送進乾坤骰閣
      if (!act.prompt.allowCasino && this.state.tiles[tile].kind === 'casino') this.ui.toast('迷魂不能指定乾坤骰閣');
      else this.answer(tile);
      return;
    }
    this.hoverTile = tile;
    this.refresh();
  }

  private handleHover(o: THREE.Object3D | null) {
    if (!this.state) return;
    const tile = this.tileOf(o);
    this.world.setHover(tile);
    if (tile === null) {
      this.ui.showTooltip(null);
      return;
    }
    const t = this.state.tiles[tile];
    let text = `<b>${TILE_INFO[t.kind].icon} ${t.name}</b>`;
    if (t.kind === 'city') {
      const c = this.state.cities[t.cityId!];
      text += `（${ownerName(c.owner)}）<br>${terrainOf(c).icon} ${terrainOf(c).name}・${terrainEffects(terrainOf(c))}<br>繁榮 ${fmtProsperity(c.prosperity)}（第 ${cityRanks(this.state, c.id).prosperity} 名）${c.owner === 'neutral' ? '' : `・過路費 ${fmtStones(cityToll(this.state, c))}`}`;
    } else text += `<br>${TILE_INFO[t.kind].desc}`;
    if (t.links.length >= 3) text += `<br>➜ 岔路箭頭：往${this.state.tiles[this.state.forkDirections[tile]].name}`;
    text += `<br><span class="tt-links">通往：${t.links.map((n) => this.state.tiles[n].name).join('、') || '不與道路相連（經由傳送陣或指定傳送抵達）'}</span>`;
    const act = this.active;
    if (act?.prompt.kind === 'tile') text += !act.prompt.allowCasino && t.kind === 'casino' ? '<br><span class="tt-move">✖ 無法傳送至此</span>' : '<br><span class="tt-move">▶ 點擊傳送至此</span>';
    this.ui.showTooltip(text, this.mouse.x, this.mouse.y);
  }

  // ───────────────────────── 畫面 ─────────────────────────

  private tileInfoHtml(index: number): string {
    const t = this.state.tiles[index];
    const here = LORD_IDS.filter((id) => this.state.lords[id].alive && this.state.lords[id].position === index);
    const fork = t.links.length >= 3 ? `<div class="ip-row">➜ 岔路箭頭：往${this.state.tiles[this.state.forkDirections[index]].name}</div>` : '';
    const people = here.length ? `<div class="ip-row">此地：${here.map((id) => `<span style="color:${LORDS[id].css}">${LORDS[id].name}</span><small>（${this.facingText(this.state.lords[id])}）</small>`).join('、')}</div>` : '';
    const linkText = `${t.links.map((n) => `${TILE_INFO[this.state.tiles[n].kind].icon}${this.state.tiles[n].name}`).join('、') || '不與道路相連'}${t.links.length >= 3 ? '（岔路口）' : ''}`;
    const links = `<div class="ip-row ip-links" title="通往：${linkText}">通往：${linkText}</div>`;
    if (t.kind !== 'city') return `<div class="ip-head"><b>${TILE_INFO[t.kind].icon} ${t.name}</b></div><div class="ip-row">${TILE_INFO[t.kind].desc}</div>${links}${fork}${people}`;
    const c = this.state.cities[t.cityId!];
    const gens = garrisonOf(this.state, c);
    const inc = cityIncomeOf(this.state, c);
    const ranks = cityRanks(this.state, c.id);
    return `
      <div class="ip-head" style="--fc:${ownerCss(c.owner)}"><b>${c.capital ? '★ ' : ''}${c.name}</b><span>${ownerName(c.owner)}</span></div>
      <table>
        <tr><td>地貌</td><td title="${terrainOf(c).desc}｜${terrainEffects(terrainOf(c))}">${terrainOf(c).icon} ${terrainOf(c).name}</td></tr>
        <tr><td>繁榮度</td><td title="全圖第 ${ranks.prosperity} / ${Object.keys(this.state.cities).length} 名">${fmtProsperity(c.prosperity)}<small class="terrain-fx">第 ${ranks.prosperity} 名</small></td></tr>
        <tr><td>過路費</td><td>${c.owner === 'neutral' ? `佔領後約 ${fmtStones(toll(c))}` : fmtStones(cityToll(this.state, c))}</td></tr>
        <tr><td>每回合</td><td title="${RANK_METRICS.filter((m) => m.id === 'stones' || m.id === 'soldiers').map((m) => `${m.name}第 ${ranks[m.id]} 名`).join('・')}">${fmtStones(inc.stones)}・兵 +${inc.soldiers}</td></tr>
        <tr><td>挖掘</td><td>${c.mining ? `${MATERIAL_NAMES[c.mining][0]}・每個自身回合 ${materialIncome(c)} 顆` : '佔領時指定基礎材料'}</td></tr>
        <tr><td>駐將</td><td>${gens.length ? gens.map((g) => `${g.name} ${realmTag(g.realm)} 戰力 ${power(g)}`).join('<br>') : '無'}</td></tr>
        <tr><td>比試</td><td>擂台戰（固定）＋${STAT_NAMES[c.contest]}比試</td></tr>
        <tr><td>守軍</td><td>${c.garrisonSoldiers}${c.shieldTurns ? `・護城大陣 ${c.shieldTurns}` : ''}</td></tr>
        ${c.owner !== 'neutral' ? `<tr><td>守城戰力</td><td title="全圖第 ${ranks.defense} 名">${garrisonPower(this.state, c)}<small class="terrain-fx">第 ${ranks.defense} 名</small></td></tr>` : ''}
      </table>${links}${fork}${people}`;
  }

  private refresh() {
    if (!this.state) return;
    this.ui.renderTop(this.state);
    this.world.syncForkArrows(this.state);
    this.updateFacing();
    const player = this.state.lords[this.me];
    const current = currentLord(this.state);
    const preroll = this.active?.prompt.kind === 'preroll';
    const pickTile = this.active?.prompt.kind === 'tile';
    const buttons: ActionButton[] = [];
    let hint: string;
    let fullHint = '';
    const ready = generalsOf(this.state, player.id).filter((g) => canAttemptBreak(g, this.state.round).ok).length;
    const roster: ActionButton = {
      label: '👥 武將',
      sub: ready ? `✨ ${ready} 人可突破` : undefined,
      highlight: ready > 0,
      onClick: () => this.openRoster(),
    };
    const act = (a: PrerollAction) => () => this.answer(a);

    if (this.state.over) hint = '天下已定';
    else if (this.auto && player.alive) {
      hint = current.id === player.id ? '🤖 電腦託管中，正在代為行動……（可按上方「託管中」取消）' : `${LORDS[current.id].name}行動中……（電腦託管中）`;
      buttons.push(roster);
    }
    else if (!player.alive) hint = `觀戰中・${LORDS[current.id].name}行動中……`;
    else if (preroll) {
      hint = '擲骰前可先整備；擲完骰、處理完事件，回合自動結束';
      fullHint = '擲骰前可先使用物品、合成材料、徵兵或整備武將（宗門每人 10 下品，自己的城池或空城免費；調度駐軍在主公所在城池免費）；擲完骰、處理完落地事件，回合就會自動結束';
      buttons.push(
        { label: '✨ 方外神通', sub: '製物・起死回生・冤魂召喚', disabled: !abilityUsers(this.state, player).length, onClick: act({ type: 'abilities' }) },
        { label: '🎒 使用物品', sub: `${player.items.length} 件`, onClick: act({ type: 'items' }) },
        { label: '⛏️ 材料合成', sub: `${MATERIAL_GROUPS.reduce((n, k) => n + player.materials[k].reduce((a, b) => a + b, 0), 0)} 顆`, onClick: act({ type: 'materials' }) },
        { label: '⚔️ 徵兵', sub: `${(recruitCost(player.id, 100) / 100).toFixed(2).replace(/\.?0+$/, '')}/名`, onClick: act({ type: 'recruit' }) },
        { label: '🏯 調度駐軍', sub: '依距離收費・一次付費可操作到關閉', disabled: !citiesOf(this.state, player.id).length, onClick: act({ type: 'garrison' }) },
        roster,
      );
    } else if (pickTile) {
      hint = '傳送陣：點選地圖上任一格（右鍵或 Esc 取消）';
      buttons.push({ label: '✖ 取消', onClick: () => this.answer(null) });
    } else if (this.waitingText) {
      hint = this.waitingText;
      buttons.push(roster);
    } else {
      hint = current.id === player.id ? '……' : `${LORDS[current.id].name}行動中……`;
      buttons.push(roster);
    }
    // 宗門：單機任何時候可調度；多人只能在自己的整備階段
    if (!this.state.over && player.alive && !this.auto && (!this.online || preroll)) buttons.push({
      label: '🏛️ 宗門', sub: sectDispatchFee(this.state, player) === 0 ? '免費調度' : '10 下品／人',
      disabled: !!this.dispatchTask || (!preroll && (this.dialog.isOpen || this.battleView.isOpen)),
      onClick: () => (preroll ? this.answer({ type: 'sect' } satisfies PrerollAction) : void this.openSect(player)),
    });
    if (this.dispatchTask) for (const button of buttons) button.disabled = true;
    this.ui.renderActions(buttons, hint, fullHint);
    // 擲骰：右側偏下的大圓鈕
    if (!this.state.over && !this.dispatchTask && player.alive && preroll && !this.auto) this.ui.showRoll(() => this.answer({ type: 'roll' } satisfies PrerollAction));
    else this.ui.hideRoll();

    this.ui.renderInfo(this.tileInfoHtml(this.hoverTile ?? player.position));
    this.hoverTile = null;
  }
}

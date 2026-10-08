import { MATERIAL_GROUPS, MATERIAL_NAMES, type MaterialGroup } from '../data/weaponCatalog';
import { materialIncome, materialsText, synthesize } from '../systems/MaterialSystem';
import { tournamentBracket, tournamentWinner, grantTournamentPrize } from '../systems/TournamentSystem';
import { abilityUsers, abilityReady, abilityTargets, useGeneralAbility, seclusionUser, startSeclusion, itemBlockUser, triggerItemBlock } from '../systems/GeneralAbilities';
import { garrisonDispatch } from '../systems/GarrisonSystem';
import { immortalWinner } from '../systems/VictorySystem';
import * as THREE from 'three';
import type { City, CraftStat, General, GameState, Item, Lord, LordId } from './types';
import type { ContestKind } from './types';
import { DEFAULT_ROUNDS, GARRISON_LIMIT, abandonIfEmpty, deployable, PARTY_LIMIT, citiesOf, garrisonOf, createGameState, currentLord, freeGenerals, generalsOf, joinLord, killGeneral, nextUid, sectGenerals } from './GameState';
import { advance, aliveLords, startTurn } from './TurnManager';
import { fmtProsperity, fmtStones } from './Currency';
import { SceneManager } from '../scene/SceneManager';
import { World } from '../world/World';
import { CharacterSprite } from '../character/CharacterSprite';
import { LORDS, LORD_IDS, originCss, ownerCss, ownerName } from '../faction/Faction';
import { GameUI, type ActionButton } from '../ui/GameUI';
import { Dialog, facts, type Choice } from '../ui/Dialog';
import { portraitUrl, preloadArt } from '../ui/Icons';
import { GeneralsView } from '../ui/GeneralsView';
import { BattleView } from '../ui/BattleView';
import { openShop } from '../ui/ShopView';
import { HelpView } from '../ui/HelpView';
import { RankView } from '../ui/RankView';
import { LordView } from '../ui/LordView';
import { showEndScreen, showStartScreen } from '../ui/Screens';
import { REALMS } from '../data/generals';
import { fxText, passiveOf, fx, lordHas } from '../data/passives';
import { ELEMENT_NAMES, ITEM_DEFS, STAT_NAMES, makeBeast, makeEquipment, makeItem, makeTechnique } from '../data/items';
import { TILE_INFO } from '../data/board';
import { terrainEffects, terrainOf } from '../data/terrain';
import { GARRISON_STRENGTH, MIN_GARRISON, RANK_METRICS, canOccupy, cityIncome, cityIncomeOf, cityRanks, cityToll, visitingToll, citySaleValue, eliminate, recruitCost, veinStones, garrisonPower, occupy, occupyCost, pay, sellCity, sellGeneral, toll } from '../systems/CitySystem';
import { generalSaleValue, BREAK_FAIL_HP, boltRange, attack, attemptBreak, battleExp, breakChance, canAttemptBreak, craft, defense, inBottleneck, maxHp, maxStamina, needsTribulation, power, qiDeviation, tribulation } from '../systems/GeneralSystem';
import { BATTLE_NAMES, CONTEST_SOLDIERS, Duel, SIEGE_START_ROUND, SURRENDER_HP, WOUNDED_HP, WOUNDED_REDUCE, canDuel, craftContest, siege, siegeAllowed, siegeAttack, type BattleKind, type DuelEvent, type Side } from '../systems/BattleSystem';
import { chooseCategorizedItem } from '../ui/ItemUI';
import { generalInfo, itemTargetInfo, itemUserInfo, sortUsers } from '../ui/GeneralInfo';
import { canUse, consumeItem, def, nameOf, useInDuel, usableIn, usePreroll, type PrerollTarget } from '../systems/ItemSystem';
import { buy, makeStock, beginShopVisit, refreshShop, SHOP_REFRESH_COSTS, type Offer, type ShopKind } from '../systems/ShopSystem';
import { REALM_LEVELS, REALM_MAX_PARTY, REALM_MIN_PARTY, deathChance, dispatch, partyRealm, realmRolls, realmTurns } from '../systems/RealmSystem';
import { aiDefender, aiEnemyCity, aiManageSect, aiOccupy, aiPreroll, aiRealm, aiShop, defenderPool } from '../systems/AISystem';
import { enterFork, nextMovementTile } from '../systems/MovementSystem';
import { rollRoadEvent } from '../systems/RoadEvents';
import { EVENT_INTERVAL, IMMORTAL_INTERVAL, TOURNAMENT_INTERVAL, eventDef, aiBid, applyWorldEvent, auctionLot, banditToll, pickWorldEvent, resolveAuction, syncWorldMods, tickWorldEvents } from '../systems/EventSystem';

type Phase = 'idle' | 'preroll' | 'busy' | 'pickTile';
type RollChoice = { type: 'roll' } | { type: 'teleport'; tile: number };

const CRAFTS: CraftStat[] = ['alchemy', 'forging', 'talisman', 'formation'];
/** 選將時顯示的被動效果 */
const pv = (g: General) => `<br><span class="sub-passive">【${passiveOf(g).name}】${fxText(passiveOf(g).fx)}</span>`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class Game {
  private sm: SceneManager;
  private world: World;
  private ui: GameUI;
  private dialog: Dialog;
  private generalsView: GeneralsView;
  private battleView: BattleView;
  private help: HelpView;
  private rankView: RankView;
  private lordView: LordView;
  private state!: GameState;
  private sprites = new Map<LordId, CharacterSprite>();
  private garrisonTask: Promise<void> | null = null;
  private phase: Phase = 'idle';
  private token = 0;
  private hoverTile: number | null = null;
  private mouse = { x: 0, y: 0 };
  private rollResolver: ((c: RollChoice) => void) | null = null;
  private tileResolver: ((t: number | null) => void) | null = null;
  /** 本回合開始時新進入瓶頸的武將，玩家回合開始時提示 */
  private pendingBreak: string[] = [];
  /** 電腦託管中 */
  private autoPlay = false;

  constructor(
    sceneRoot: HTMLElement,
    private uiRoot: HTMLElement,
  ) {
    this.sm = new SceneManager(sceneRoot);
    this.world = new World(this.sm.scene, this.sm.animator);
    this.ui = new GameUI(uiRoot);
    this.dialog = new Dialog(uiRoot);
    this.generalsView = new GeneralsView(uiRoot, this.dialog, (g) => this.breakthroughFlow(g), () => this.canManage());
    this.battleView = new BattleView(uiRoot);
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
      if (!rightDragged) this.tileResolver?.(null);
      rightDown = null;
      rightDragged = false;
    });
    this.ui.onSpeed = (s) => (this.sm.timeScale = this.garrisonTask ? 0 : s);

    window.addEventListener('keydown', (e) => {
      if (!this.state || this.state.over || this.dialog.isOpen) return;
      if ((e.key === ' ' || e.key === 'Enter') && (e.target as HTMLElement)?.tagName === 'BUTTON') e.preventDefault();
      if (e.key === ' ' && this.phase === 'preroll') {
        e.preventDefault();
        this.rollResolver?.({ type: 'roll' });
      }
      if (e.key === 'Escape' && this.phase === 'pickTile') this.tileResolver?.(null);
    });
    this.sm.start();
  }

  /** 真人操作中的主公：玩家且沒有開啟託管 */
  private human(l: Lord) {
    return l.isPlayer && !this.autoPlay;
  }

  /** 測試按鈕：大量靈石與士兵，以及所有物品、裝備、功法、靈獸 */
  private cheat() {
    const lord = this.state.lords[this.state.player];
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
  private async toggleAuto() {
    this.autoPlay = !this.autoPlay;
    this.ui.auto = this.autoPlay;
    this.ui.log(this.autoPlay ? '🤖 開啟電腦託管，由電腦代為行動。' : '🤖 取消託管，下一個回合起由你操作。', 'turn');
    const player = this.state.lords[this.state.player];
    // 正在等玩家操作：由電腦接手當前回合
    if (this.autoPlay && player.alive && currentLord(this.state).id === player.id) {
      if (this.phase === 'preroll') {
        for (const msg of await aiPreroll(this.state, player, this.itemHooks())) this.ui.log(`${LORDS[player.id].name}：${msg}`, 'ai');
        this.world.syncCities(this.state);
        this.rollResolver?.({ type: 'roll' });
      }
    }
    this.refresh();
    if (immortalWinner(this.state)) void this.checkEnd();
  }

  private get speed() {
    return this.ui.speed;
  }

  private async waitForDispatch() {
    if (this.garrisonTask) await this.garrisonTask;
  }

  private async wait(ms: number) {
    await sleep(ms / this.speed);
    await this.waitForDispatch();
  }

  private async openGarrison(selectedCity?: City, free = false) {
    if (!this.state || this.state.over || this.garrisonTask) return;
    const lord = this.state.lords[this.state.player];
    if (!lord.alive || !citiesOf(this.state, lord.id).length) {
      this.ui.toast('沒有可調度的城池');
      return;
    }
    if (this.dialog.isOpen || this.battleView.isOpen) {
      this.ui.toast('請先完成目前的視窗，再調兵');
      return;
    }
    this.sm.timeScale = 0;
    const task = this.manageGarrison(lord, selectedCity, free);
    this.garrisonTask = task;
    try { await task; }
    finally {
      this.garrisonTask = null;
      this.sm.timeScale = this.speed;
      this.refresh();
    }
  }

  showStart() {
    this.ui.hide();
    showStartScreen(this.uiRoot, (id, rounds) => this.start(id, rounds), () => this.help.open());
  }

  // ───────────────────────── 開局 ─────────────────────────

  start(player: LordId, maxRounds: number | null = DEFAULT_ROUNDS) {
    this.token++;
    this.autoPlay = false;
    this.ui.auto = false;
    this.state = createGameState(player, maxRounds);
    this.world.clearHighlights();
    syncWorldMods(this.state);
    this.world.setEventMarkers(null, []);
    this.world.syncCities(this.state);
    for (const s of this.sprites.values()) s.dispose();
    this.sprites.clear();
    for (const id of LORD_IDS) {
      const s = new CharacterSprite({ id, name: LORDS[id].name, lord: id, role: '主公' });
      this.sm.scene.add(s.group);
      this.sprites.set(id, s);
      s.setGroundPosition(this.slotPosition(id, this.state.lords[id].position));
    }
    this.sm.setPickables([...this.world.pickables, ...[...this.sprites.values()].map((s) => s.group)]);
    this.ui.reset();
    this.ui.show();
    // 背景預先載入圖片，避免之後打開名冊、商店時圖片才一張張慢慢冒出來
    preloadArt(
      Object.values(this.state.generals).filter((g) => g.owner === player).map((g) => g.id),
      Object.keys(this.state.generals),
    );
    this.ui.log(`天地靈氣復甦，${LORDS[player].name}起兵逐鹿天下！${maxRounds === null ? '（無盡模式：主公真仙或最後存活者獲勝）' : `（${maxRounds} 輪後比總資產）`}`, 'turn');
    this.ui.log('擲骰沿道路前進，岔路依箭頭走並換方向；逆向停在岔路，下回合返回，途經岔路則隨機轉向：停在無主城池才能派將佔領，踏入他人城池須繳過路費或開戰。', 'info');
    void this.loop(this.token);
  }

  private restart() {
    this.token++;
    this.ui.hide();
    for (const s of this.sprites.values()) s.dispose();
    this.sprites.clear();
    this.showStart();
  }

  private async loop(token: number) {
    while (token === this.token && !this.state.over) {
      await this.waitForDispatch();
      if (token !== this.token || this.state.over) return;
      const lord = currentLord(this.state);
      if (lord.alive) {
        if (!this.human(lord)) this.ui.beginReport();
        await this.takeTurn(lord);
        if (lord.tollFreeTurns > 0) lord.tollFreeTurns--;
        if (lord.clearCultivationTurns) lord.clearCultivationTurns--;
        lord.tollFree = lord.tollFreeTurns > 0;
        if (!this.state.over && !this.human(lord)) await this.showTurnReport(lord, token);
      }
      await this.waitForDispatch();
      if (token !== this.token || this.state.over) return;
      if (await this.checkEnd()) return;
      const completedRound=!this.state.order.slice(this.state.turn+1).some(id=>this.state.lords[id].alive);
      if (completedRound && this.state.round%TOURNAMENT_INTERVAL===0) {
        await this.runTournament();
        if (token!==this.token || await this.checkEnd()) return;
      }
      const newRound = advance(this.state);
      if (newRound) {
        if (this.state.maxRounds !== null && this.state.round > this.state.maxRounds) {
          this.state.round = this.state.maxRounds;
          await this.endGame(`${this.state.maxRounds} 輪已至，依總資產論英雄。`);
          return;
        }
        this.ui.log(`── 第 ${this.state.round} 輪 ──`, 'turn');
        await this.newRoundEvents();
        if (token !== this.token || this.state.over) return;
      }
    }
  }

  /** 電腦行動完畢：把這回合的結果顯示在畫面上，停一會兒讓玩家看清楚 */
  private async showTurnReport(lord: Lord, token: number) {
    const lines = this.ui.endReport();
    if (token !== this.token) return;
    // 電腦託管時不彈出結果，免得高倍速下畫面一直被蓋住、按不到取消託管（結果仍可在天下紀事看到）
    if (this.autoPlay) return;
    await this.ui.showReport(`${LORDS[lord.id].name}・第 ${this.state.round} 輪行動結果`, LORDS[lord.id].css, lines, Math.min(6000, 2000 + lines.length * 600) / this.speed);
  }

  private async checkEnd(): Promise<boolean> {
    if (this.state.over) return true;
    const winner = immortalWinner(this.state);
    if (winner) {
      this.state.winner = winner;
      await this.endGame(`${LORDS[winner].name}晉入真仙，立即贏得遊戲！`);
      return true;
    }
    const alive = aliveLords(this.state);
    if (alive.length <= 1) {
      await this.endGame(alive.length ? `${LORDS[alive[0].id].name}令群雄破產，一統天下！` : '群雄盡皆破產。');
      return true;
    }
    return false;
  }

  private async endGame(reason: string) {
    await this.waitForDispatch();
    if (this.state.over) return;
    this.generalsView.close();
    this.state.over = true;
    this.phase = 'idle';
    this.rollResolver?.({ type: 'roll' });
    this.refresh();
    await this.dialog.message('天下大勢已定', reason, '📜', '查看結算');
    showEndScreen(this.uiRoot, this.state, reason, () => this.restart());
  }

  // ───────────────────────── 回合 ─────────────────────────

  private async takeTurn(lord: Lord) {
    const name = LORDS[lord.id].name;
    this.phase = 'busy';
    const sprite = this.sprites.get(lord.id)!;
    for (const s of this.sprites.values()) s.setSelected(s === sprite);
    this.sm.cameraController.focus(sprite.group.position);
    this.refresh();

    // 首都在首次收入前選定；託管與電腦由 startTurn 自動安排。
    if (this.human(lord)) for (const city of citiesOf(this.state, lord.id)) {
      if (!city.mining) await this.chooseMining(lord, city, true);
    }
    let clearThisTurn=false;
    const seclusion=seclusionUser(this.state,lord);
    if (!lord.stunned && lord.forcedTile===null && seclusion && !(lord.clearCultivationTurns??0)) {
      clearThisTurn=this.human(lord) ? await this.dialog.confirm('管寧：全隊清修？','啟動當回合放棄全部主動行動，隨行隊伍（含主公）修為獲得 +100%，持續五個自身回合；使用後冷卻十個自身回合。','開始清修','正常行動') : Math.random()<.15;
      if (clearThisTurn) startSeclusion(lord,seclusion);
    }
    const report = await startTurn(this.state, lord, (g) => this.protectDeath(g), async (owner, ex, team, endangered) => {
      if (!this.human(owner)) return true;
      return this.dialog.confirm('破界遁空符：全隊撤離？',
        `${ex.realmName}中，${endangered.map(g => g.name).join('、')}觸發隕落風險。\n消耗一張符可讓本次 ${team.length} 名武將全部平安撤離；境界與修為不變，整趟無獎勵。若不使用，按原規則結算死亡與獎勵（不死圖騰仍可另行選擇）。`,
        '消耗一張・全隊撤離', '不使用・繼續結算', '🌀');
    });
    this.ui.log(`<b style="color:${LORDS[lord.id].css}">【${name}】</b>的回合`, 'turn');
    for (const l of report.lines) this.ui.log(`${name}：${l.text}`, this.human(lord) ? l.kind : 'ai');
    if (this.human(lord)) this.pendingBreak = report.bottlenecks;
    for (const r of report.realms) {
      const text = r.summary;
      this.ui.log(`${name}：${r.icon} ${text}`, r.dead.length ? 'bad' : 'good');
      for (const line of r.insights) this.ui.log(`${name}：${line}`, this.human(lord) ? 'good' : 'ai');
      if (this.human(lord)) await this.dialog.message(`${r.realmName}・歸來`, `${text}${r.insights.length ? `\n\n${r.insights.join('\n')}` : ''}`, r.icon);
    }
    this.refresh();

    if (clearThisTurn) {this.ui.log(name+'全隊清修，本回合不採取主動行動。','good');await this.wait(700);return;}
    if (this.human(lord)) await this.playerTurn(lord);
    else {
      for(const g of abilityUsers(this.state,lord)) if(abilityReady(this.state,lord,g).ok) {
        const target=abilityTargets(this.state,lord,g).sort((a,b)=>power(b)-power(a))[0];
        if(fx(g).produceCategory || target) this.ui.log(useGeneralAbility(this.state,lord,g,target),'ai');
      }
      await this.aiTurn(lord);
    }
  }

  private async playerTurn(lord: Lord) {
    this.phase = 'preroll';
    this.refresh();
    this.ui.toast(`第 ${this.state.round} 輪・你的回合`);
    await this.announceBreakthroughs(lord);
    if (this.state.over) return;
    const choice = await new Promise<RollChoice>((r) => (this.rollResolver = r));
    this.rollResolver = null;
    await this.waitForDispatch();
    if (this.state.over || await this.checkEnd()) return;
    this.phase = 'busy';
    this.refresh();
    if (choice.type === 'teleport' && !lord.stunned && lord.forcedTile===null && !lord.stayThisTurn) await this.teleport(lord, choice.tile);
    else await this.resolveDiceMovement(lord);
    if (!lord.alive || this.state.over) return;
    // 落地處理完畢就直接結束回合
    this.phase = 'busy';
    this.refresh();
  }

  /** 有武將修為圓滿時，提示玩家前往突破 */
  private async announceBreakthroughs(lord: Lord) {
    const ids = this.pendingBreak.filter((id) => canAttemptBreak(this.state.generals[id], this.state.round).ok);
    this.pendingBreak = [];
    if (!ids.length) return;
    const names = ids.map((id) => this.state.generals[id].name).join('、');
    const go = await this.dialog.confirm(
      '✨ 修為圓滿，可以突破了！',
      `${names}修為已滿，進入瓶頸。\n到「武將名冊」就能嘗試突破（金丹以上要渡雷劫），現在前往嗎？`,
      '前往突破',
      '稍後再說',
      '✨',
    );
    if (go) await this.generalsView.open(this.state, lord);
    this.refresh();
  }

  private async aiTurn(lord: Lord) {
    await this.wait(350);
    const logs = await aiPreroll(this.state, lord, this.itemHooks());
    for (const msg of logs) this.ui.log(`${LORDS[lord.id].name}：${msg}`, msg.includes('⚡') || msg.includes('✦') ? 'turn' : 'ai');
    if (logs.some((m) => m.includes('突破至'))) this.world.beamEffect(this.sprites.get(lord.id)!.group.position);
    this.world.syncCities(this.state);
    this.refresh();
    if (!lord.alive) {
      // 渡劫身死的主公：敗北出局
      this.sprites.get(lord.id)!.group.visible = false;
      this.world.syncCities(this.state);
      this.refresh();
      return;
    }
    if (await this.checkEnd()) return;
    await this.resolveDiceMovement(lord);
    if (lord.alive && this.canSwapSect(lord)) for (const msg of aiManageSect(this.state, lord)) this.ui.log(`${LORDS[lord.id].name}：${msg}`, 'ai');
    await this.wait(300);
  }

  /** 移動限制在擲骰時結算；零步與指定落點都走一般落地事件流程。 */
  private async resolveDiceMovement(lord: Lord) {
    const steps=await this.rollDice(lord);
    if(lord.stunned>0) {
      lord.stunned--; lord.stayThisTurn=false;
      this.ui.log(LORDS[lord.id].name+'受定身／鎖仙效果所困，本次擲骰原地停留。','bad');
      try { await this.land(lord,lord.position); }
      finally { if(lord.itemsLocked>0)lord.itemsLocked--; }
    } else if(lord.forcedTile!==null) {
      const tile=lord.forcedTile;lord.forcedTile=null;lord.stayThisTurn=false;
      this.ui.log(LORDS[lord.id].name+'受迷魂效果引導，本次擲骰強制前往'+this.state.tiles[tile].name+'。','bad');
      await this.teleport(lord,tile);
    } else if(lord.stayThisTurn) {
      lord.stayThisTurn=false;
      this.ui.log(LORDS[lord.id].name+'使用停留物品，本次擲骰原地停留。','info');
      await this.land(lord,lord.position);
    } else await this.moveLord(lord,steps);
  }

  private async rollDice(lord: Lord): Promise<number> {
    const draw=()=>Array.from({length:lord.doubleDice?2:1},()=>1+Math.floor(Math.random()*6));
    let values=lord.fixedDice ? [lord.fixedDice] : draw();
    if (!lord.fixedDice && lordHas(lord.id,'divination')) {
      const candidates=Array.from({length:3},draw);
      const exclude=this.human(lord) ? await this.dialog.choose('管輅：卜問前路','排除一個候選步數，從另外兩個隨機決定。取消則隨機排除。',candidates.map((v,i)=>({label:'候選 '+(i+1)+'：'+v.reduce((a,b)=>a+b,0)+' 點',value:i}))) : candidates.reduce((best,v,i)=>v.reduce((a,b)=>a+b,0)<candidates[best].reduce((a,b)=>a+b,0)?i:best,0);
      const excluded=exclude??Math.floor(Math.random()*3);
      const remaining=candidates.filter((_,i)=>i!==excluded);
      values=remaining[Math.floor(Math.random()*remaining.length)];
    }
    await this.ui.rollDice(values, lord.bonusSteps, lord.moveMultiplier);
    await this.waitForDispatch();
    const dice = values.reduce((a, b) => a + b, 0);
    const sum = (dice + lord.bonusSteps) * lord.moveMultiplier;
    this.ui.log(`${LORDS[lord.id].name}擲出 ${dice} 點${lord.bonusSteps ? `，遁地梭加成 +${lord.bonusSteps}，共走 ${sum} 步` : ''}。`, this.human(lord) ? 'info' : 'ai');
    if (lord.moveMultiplier > 1) this.ui.log('遁地梭生效，本回合共走 ' + sum + ' 步。', 'info');
    return sum;
  }

  // ───────────────────────── 移動 ─────────────────────────

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

  private async moveLord(lord: Lord, steps: number) {
    const sprite = this.sprites.get(lord.id)!;
    for (let i = 1; i <= steps; i++) {
      await this.waitForDispatch();
      if (this.state.over) return;
      const here = lord.position;
      await this.chooseWheelDirection(lord);
      const next = nextMovementTile(this.state, lord);
      this.world.syncForkArrows(this.state);
      await sprite.moveAlong([sprite.group.position.clone(), this.slotPosition(lord.id, next)], this.sm.animator, (p) => this.sm.cameraController.follow(p));
      await this.waitForDispatch();
      if (this.state.over) return;
      lord.lastTile = here;
      lord.position = next;
      lord.forkExit = null;
      const route = enterFork(this.state, lord, steps - i);
      const choseExit = await this.chooseWheelDirection(lord);
      if (route && !choseExit) {
        const tileName = this.state.tiles[next].name;
        const destination = this.state.tiles[route.exit].name;
        const message = route.returning
          ? `逆向停在「${tileName}」，下回合返回「${destination}」。`
          : route.opposite
            ? `逆向經過「${tileName}」，隨機轉向「${destination}」。`
            : `抵達「${tileName}」，依箭頭往「${destination}」；岔路箭頭已換方向。`;
        this.ui.log(`${LORDS[lord.id].name}：${message}`, this.human(lord) ? 'info' : 'ai');
      }
      this.passVein(lord, next);
      this.refresh();
      if (!lord.alive) return;
    }
    if (!this.human(lord)) {
      this.ui.restartReport();
      this.ui.log(`${LORDS[lord.id].name}停在「${this.state.tiles[lord.position].name}」。`, 'ai');
    }
    await this.land(lord, lord.position);
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

  /** 路過靈脈：不用停下，依主公本人的境界獲得靈石，每輪每位主公只領一次 */
  private passVein(lord: Lord, tile: number) {
    if (this.state.tiles[tile].kind !== 'vein' || lord.veinsTapped.includes(tile)) return;
    lord.veinsTapped.push(tile);
    const lordGen = generalsOf(this.state, lord.id).find((g) => g.isLord);
    const n = veinStones(lordGen?.realm ?? 0);
    lord.stones += n;
    this.ui.log(`${LORDS[lord.id].name}路過靈脈，汲取靈氣化為 ${fmtStones(n)}（主公境界：${REALMS[lordGen?.realm ?? 0]}）。`, this.human(lord) ? 'good' : 'ai');
    if (this.human(lord)) this.ui.toast(`💎 路過靈脈：+${fmtStones(n)}`);
    this.world.beamEffect(this.sprites.get(lord.id)!.group.position, 0x7ae8ff);
  }

  private async teleport(lord: Lord, tile: number) {
    const sprite = this.sprites.get(lord.id)!;
    this.world.beamEffect(sprite.group.position, 0xc9a0ff);
    await this.wait(500);
    lord.position = tile;
    lord.lastTile = null;
    lord.forkExit = null;
    sprite.setGroundPosition(this.slotPosition(lord.id, tile));
    this.world.beamEffect(sprite.group.position, 0xc9a0ff);
    this.sm.cameraController.focus(sprite.group.position);
    await this.wait(500);
    await this.land(lord, tile);
  }

  /** 踩到角落的傳送陣：隨機傳送到任一格（不會落在傳送陣上） */
  private async landPortal(lord: Lord) {
    const here = lord.position;
    const dests = this.state.tiles.filter((t) => t.kind !== 'portal' && t.index !== here);
    const dest = dests[Math.floor(Math.random() * dests.length)];
    this.ui.log(`${LORDS[lord.id].name}踏入傳送陣，被送到「${dest.name}」！`, this.human(lord) ? 'good' : 'ai');
    if (this.human(lord)) this.ui.toast(`傳送陣！被送到「${dest.name}」`);
    await this.teleport(lord, dest.index);
  }

  private async land(lord: Lord, tile: number) {
    await this.waitForDispatch();
    if (this.state.over) return;
    const t = this.state.tiles[tile];
    this.refresh();
    if (tile === this.state.merchantTile) {
      this.ui.log(`${LORDS[lord.id].name}遇上旅行商人，商隊交易後離開了。`, lord.isPlayer ? 'good' : 'ai');
      await this.landShop(lord, 'merchant');
      this.state.merchantTile = null;
      this.world.setEventMarkers(null, this.state.banditTiles);
    }
    if (this.state.banditTiles.includes(tile)) await this.banditEvent(lord);
    if (!lord.alive) return;
    switch (t.kind) {
      case 'city':
        return this.landCity(lord, this.state.cities[t.cityId!]);
      case 'realm':
        return this.landRealm(lord, t.name);
      case 'vein':
        return this.passVein(lord,tile);
      case 'portal':
        return this.landPortal(lord);
      case 'road':
        return this.roadEvent(lord, t.name);
      default:
        return this.landShop(lord, t.kind);
    }
  }

  // ───────────────────────── 城池 ─────────────────────────

  private async landCity(lord: Lord, city: City) {
    const name = LORDS[lord.id].name;
    if (city.owner === 'neutral') {
      if (!canOccupy(this.state, lord, city)) {
        if (this.human(lord)) this.ui.toast(`佔領${city.name}需要 ${fmtStones(occupyCost(city))}、一名隨行武將與至少 ${MIN_GARRISON} 士兵`);
        return;
      }
      if (this.human(lord)) await this.playerOccupy(lord, city);
      else this.aiTryOccupy(lord, city);
      return;
    }
    if (city.owner === lord.id) {
      if (this.human(lord)) this.ui.toast(`回到${city.name}，可在「調度駐軍」增派守軍`);
      else if (lord.soldiers > 1200) {
        city.garrisonSoldiers += 300;
        lord.soldiers -= 300;
        this.ui.log(`${name}：增派 300 士兵駐守${city.name}`, 'ai');
      }
      return;
    }
    // 他人城池
    const owner = this.state.lords[city.owner];
    const fee = visitingToll(this.state, city, lord);
    const truce = lord.items.find(i => i.defId === 'truce');
    if (!lord.tollFree && truce && !lord.itemsLocked && (!this.human(lord) || await this.dialog.confirm('免戰牌：免繳過路費？','踏入'+city.name+'，過路費 '+fmtStones(fee)+'。','使用免戰牌','繼續選擇'))) {
      consumeItem(lord,truce);this.ui.log(name+'使用免戰牌，免繳'+city.name+'過路費。','good');return;
    }
    if (lord.tollFree) {
      this.ui.log(`${name}斂息隱行，免繳${city.name}過路費。`, this.human(lord) ? 'good' : 'ai');
      this.ui.toast('斂息符生效，免繳過路費');
      return;
    }
    for (;;) {
      const choice = this.human(lord) ? await this.playerEnemyCityChoice(lord, city, fee) : aiEnemyCity(this.state, lord, city);
      if (choice.kind === 'pay') {
        await this.payToll(lord, owner, fee, city, false);
        return;
      }
      const kind = choice.kind;
      if (!this.human(lord)) this.ui.log(`${name}向${LORDS[owner.id].name}的${city.name}發起【${BATTLE_NAMES[kind]}】！`, 'ai');
      const win = await this.fight(lord, city, kind, choice.generals);
      // 中途取消：回到選擇介面，不會自動付錢
      if (win === null) continue;
      if (win === 'draw') {
        this.ui.log(`${name}與${LORDS[owner.id].name}的守將戰成平手，免繳${city.name}過路費。`, this.human(lord) ? 'good' : 'ai');
        if (this.human(lord)) this.ui.toast('平手！免繳過路費');
        return;
      }
      if (this.human(lord)) this.ui.log(`${name}向${LORDS[owner.id].name}的${city.name}發起【${BATTLE_NAMES[kind]}】！`, 'info');
      if (!lord.alive) return;
      if (win) {
        if (kind !== 'siege') this.ui.log(`${name}${BATTLE_NAMES[kind]}獲勝，免繳過路費！`, this.human(lord) ? 'good' : 'ai');
      } else {
        this.ui.log(`${name}${BATTLE_NAMES[kind]}落敗，須付雙倍過路費。`, this.human(lord) ? 'bad' : 'ai');
        await this.payToll(lord, owner, fee * 2, city, true);
      }
      return;
    }
  }

  /** 割地賠款：自己挑選要變賣的城池或隨行武將，直到湊足金額；兩者都賣光就破產 */
  private async raiseFunds(lord: Lord, amount: number) {
    type Sale = { kind: 'city'; city: City } | { kind: 'general'; general: General };
    while (lord.stones < amount) {
      const cities = citiesOf(this.state, lord.id).sort((x, y) => x.prosperity - y.prosperity);
      const party = deployable(this.state, lord.id);
      if (!cities.length && !party.length) return;
      const choices: Choice<Sale>[] = [
        ...cities.map((c) => ({
          label: `🏯 ${c.capital ? '★ ' : ''}${c.name}`,
          sub: `繁榮 ${fmtProsperity(c.prosperity)}・守軍 ${c.garrisonSoldiers}・駐將 ${c.garrisonGenerals.length} 人｜可得 ${fmtStones(citySaleValue(c))}`,
          value: { kind: 'city', city: c } as Sale,
          color: LORDS[lord.id].css,
        })),
        ...party.map((g) => ({
          label: `🧑 ${g.name}（${REALMS[g.realm]}）`, icon: portraitUrl(g),
          sub: `戰力 ${power(g)}｜身價 ${fmtStones(generalSaleValue(g))}｜賣出後自動卸下裝備，離開進入聽風樓${pv(g)}`,
          value: { kind: 'general', general: g } as Sale,
          color: '#c99a2e',
        })),
      ];
      const sale = await this.dialog.choose(
        '💸 靈石不足，必須割地賠款',
        `需要支付 ${fmtStones(amount)}，持有 ${fmtStones(lord.stones)}，還差 ${fmtStones(amount - lord.stones)}。\n請選擇要變賣的城池或隨行武將；城池與隨行武將都賣光仍湊不齊，就會破產出局！`,
        choices,
        null,
        '💸',
      );
      if (!sale) continue;
      if (sale.kind === 'city') {
        const value = sellCity(this.state, lord, sale.city);
        this.ui.log(`${LORDS[lord.id].name}變賣城池「${sale.city.name}」，得 ${fmtStones(value)}。`, 'bad');
        this.world.syncCities(this.state);
      } else {
        const value = sellGeneral(lord, sale.general);
        this.ui.log(`${LORDS[lord.id].name}賣掉隨行武將${sale.general.name}（裝備已卸下），得 ${fmtStones(value)}。`, 'bad');
      }
      this.refresh();
    }
  }

  private async payToll(lord: Lord, owner: Lord, amount: number, city: City, doubled: boolean) {
    // 玩家靈石不足時，自己選擇要變賣哪些城池
    if (this.human(lord) && lord.stones < amount) await this.raiseFunds(lord, amount);
    const r = pay(this.state, lord, amount, owner);
    for (const n of r.notes) this.ui.log(`${LORDS[lord.id].name}${n}`, 'bad');
    const kind = this.human(lord) ? 'bad' : this.human(owner) ? 'good' : 'ai';
    this.ui.log(`${LORDS[lord.id].name}向${LORDS[owner.id].name}繳納${city.name}${doubled ? '雙倍' : ''}過路費 ${fmtStones(r.paid)}。`, kind);
    if (this.human(lord) || this.human(owner)) this.ui.toast(`${LORDS[lord.id].name}繳納過路費 ${fmtStones(r.paid)}`);
    this.world.syncCities(this.state);
    if (r.bankrupt) await this.onBankrupt(lord);
    this.refresh();
  }

  private async onBankrupt(lord: Lord, death?: string) {
    if (lord.alive) eliminate(this.state, lord);
    this.sprites.get(lord.id)!.group.visible = false;
    this.world.syncCities(this.state);
    this.ui.log(death ? `💀 ${death}，${LORDS[lord.id].name}敗北出局！麾下將領四散，城池回歸無主。` : `💀 ${LORDS[lord.id].name}靈石耗盡，破產出局！麾下將領四散，城池回歸無主。`, 'bad');
    this.refresh();
    if (!lord.isPlayer) {
      await this.wait(600);
      return;
    }
    if (aliveLords(this.state).length <= 1) return;
    const watch = await this.dialog.confirm(death ? '主公陣亡，你輸了' : '你已破產出局', `${death ? `${death}，主公一死，大勢已去。` : '靈石耗盡，宗門解散。'}
要觀看其他主公爭到最後，還是直接結算？`, '觀戰到底', '直接結算', '💀');
    if (watch) {
      this.ui.speed = 4;
      this.sm.timeScale = 4;
    } else {
      await this.endGame(death ? `${death}。` : `${LORDS[lord.id].name}破產出局。`);
    }
  }

  private aiTryOccupy(lord: Lord, city: City) {
    const d = aiOccupy(this.state, lord, city);
    if (!d) return;
    occupy(this.state, lord, city, d.generalId, d.soldiers, occupyCost(city));
    this.world.syncCities(this.state);
    this.world.captureEffect(city.tile, LORDS[lord.id].color);
    this.ui.log(`${LORDS[lord.id].name}派${this.state.generals[d.generalId].name}率 ${d.soldiers} 兵佔領${city.name}。`, 'ai');
    this.refresh();
  }

  /** 佔領後從四項技藝中指定一種比試；每座城固定開放擂台戰 */
  private async chooseContest(city: City) {
    const kinds: { value: ContestKind; label: string; sub: string }[] = [
      ...(['alchemy', 'forging', 'talisman', 'formation'] as const).map((k) => ({ value: k as ContestKind, label: `🔥 ${STAT_NAMES[k]}比試`, sub: `比拼${STAT_NAMES[k]}能力值；適合${STAT_NAMES[k]}高的駐將` })),
    ];
    const gens = garrisonOf(this.state, city);
    // 推薦：駐將中最擅長的那一項技藝，排在最前面
    const best = (k: CraftStat) => Math.max(0, ...gens.map((g) => craft(g, k)));
    const recommended = gens.length ? (['alchemy', 'forging', 'talisman', 'formation'] as const).reduce((a, b) => (best(b) > best(a) ? b : a)) : null;
    kinds.sort((x, y) => Number(y.value === recommended) - Number(x.value === recommended));
    const picked = await this.dialog.choose(
      `🏯 ${city.name}・指定技藝比試`,
      `擂台戰固定開放。請從煉丹、煉器、畫符、佈陣中指定一種比試，供之後的挑戰者選擇。` +
        facts(gens.length ? gens.map((g) => [g.name, `武力 ${attack(g)}｜煉丹 ${craft(g, 'alchemy')}｜煉器 ${craft(g, 'forging')}｜畫符 ${craft(g, 'talisman')}｜佈陣 ${craft(g, 'formation')}`] as [string, string]) : [['駐將', '無']]),
      kinds.map((k) => ({ label: k.label + (k.value === recommended ? '（推薦）' : ''), sub: k.sub, value: k.value })),
      null,
      '🏯',
    );
    if (picked) city.contest = picked;
  }

  private async playerOccupy(lord: Lord, city: City) {
    const inc = cityIncome(city);
    const free = deployable(this.state, lord.id);
    const choices: Choice<string>[] = free.map((g) => ({ label: g.name, icon: portraitUrl(g), sub: `${generalInfo(g)}${pv(g)}`, value: g.id, color: originCss(g.origin) }));
    for (;;) {
      const gids = await this.dialog.pickMany(
        `抵達${city.name}・是否佔領？`,
        facts([
          ['佔領費', `<b>${fmtStones(occupyCost(city))}</b>（持有 ${fmtStones(lord.stones)}）`],
          ['地貌', `${terrainOf(city).icon} ${terrainOf(city).name}・${terrainEffects(terrainOf(city))}`],
          ['繁榮度', fmtProsperity(city.prosperity)],
          ['每回合收入', `${fmtStones(inc.stones)}、士兵 +${inc.soldiers}`],
          ['佔領後過路費', fmtStones(toll(city, citiesOf(this.state, lord.id).length + 1))],
        ]) + `請選擇駐守武將（1–${GARRISON_LIMIT} 人，駐將越多守城越強）：`,
        choices,
        1,
        Math.min(GARRISON_LIMIT, free.length),
        '佔領',
      );
      if (!gids) return;
      const soldiers = await this.dialog.slider(
        `派多少士兵駐守${city.name}？`,
        `目前隨行士兵 ${lord.soldiers}。一名守軍約等於十五名隨行士兵，守軍越多越難攻破；留在身邊的士兵可用於攻城。`,
        {
          min: MIN_GARRISON,
          max: lord.soldiers,
          step: 100,
          initial: Math.min(lord.soldiers, Math.max(MIN_GARRISON, Math.round(city.prosperity * 30))),
          unit: ' 名',
          confirm: '派駐',
          preview: (v) => `守軍戰力約 ${v * GARRISON_STRENGTH}（未計駐將與地貌）・留在身邊 ${lord.soldiers - v} 名`,
        },
        '🏯',
      );
      if (!soldiers) continue;
      occupy(this.state, lord, city, gids, soldiers, occupyCost(city));
      this.world.syncCities(this.state);
      this.world.captureEffect(city.tile, LORDS[lord.id].color);
      this.ui.log(`支付 ${fmtStones(occupyCost(city))}，派${gids.map((id) => this.state.generals[id].name).join('、')}率 ${soldiers} 兵佔領${city.name}！`, 'good');
      this.ui.toast(`佔領${city.name}！`);
      await this.chooseContest(city);
      await this.chooseMining(lord, city, true);
      this.refresh();
      return;
    }
  }

  private async playerEnemyCityChoice(lord: Lord, city: City, fee: number): Promise<{ kind: BattleKind | 'pay'; generals: General[] }> {
    const free = freeGenerals(this.state, lord.id);
    const fighters = free.filter(canDuel);
    const owner = LORDS[city.owner as LordId].name;
    const guards = garrisonOf(this.state, city);
    const noGen = '沒有可出戰的隨行武將';
    const noDuel = `沒有血量達 ${Math.round(SURRENDER_HP * 100)}% 以上的隨行武將`;
    const choices: Choice<BattleKind | 'pay'>[] = [
      { label: '💰 繳納過路費', sub: `支付 ${fmtStones(fee)} 後離開`, value: 'pay' },
      { label: '⚔️ 擂台戰（固定開放）', sub: `雙方各派一將單挑，能量滿可施放功法。血量低於 ${Math.round(WOUNDED_HP * 100)}% 減傷 ${Math.round(WOUNDED_REDUCE * 100)}%，低於 ${Math.round(SURRENDER_HP * 100)}% 認輸；被一擊打到歸零則戰死`, value: 'duel', disabled: !fighters.length, reason: free.length ? noDuel : noGen },
      ...CRAFTS.map((s) => ({
        label: `🔥 ${STAT_NAMES[s]}比試${city.contest === s ? '（本城指定）' : ''}`,
        sub: `比拼${STAT_NAMES[s]}，我方最高 ${Math.max(0, ...free.map((g) => craft(g, s)))}｜雙方各出 ${CONTEST_SOLDIERS} 兵，敗方全滅`,
        value: s as BattleKind,
        disabled: city.contest !== s || !free.length || lord.soldiers < CONTEST_SOLDIERS,
        reason: city.contest !== s ? `本城指定比試為【${STAT_NAMES[city.contest]}】` : !free.length ? noGen : `需 ${CONTEST_SOLDIERS} 兵維持秩序`,
      })),
      {
        label: '🏯 攻城戰',
        sub: `最多三將 + 未派遣的 ${lord.soldiers} 兵；勝則奪城，敗則士兵全滅｜我方約 ${siegeAttack(lord, [...free].sort((a, b) => attack(b) - attack(a)).slice(0, 3))} vs 守方約 ${garrisonPower(this.state, city)}`,
        value: 'siege',
        disabled: !siegeAllowed(this.state.round) || !free.length || lord.soldiers <= 0,
        reason: !siegeAllowed(this.state.round) ? `前 ${SIEGE_START_ROUND - 1} 輪不能攻城，第 ${SIEGE_START_ROUND} 輪起開放` : !free.length ? noGen : '沒有士兵',
      },
    ];
    const kind = await this.dialog.choose(
      `踏入${owner}的${city.name}`,
      facts([
        ['過路費', `<b>${fmtStones(fee)}</b>（戰敗付雙倍 ${fmtStones(fee * 2)}）`],
        ['守軍', `${city.garrisonSoldiers} 名`],
        ...(guards.length ? guards.map((g) => ['駐將', `${g.name}・${generalInfo(g)}`] as [string, string]) : [['駐將', '無'] as [string, string]]),
        ...(fee * 2 > lord.stones ? [['⚠️ 警告', '雙倍過路費超過你持有的靈石，戰敗將先變賣城池，再不夠則隨行武將離開抵債，只剩主公一人時破產！', 'warn'] as [string, string, 'warn']] : []),
      ]) + '選擇繳費，或發起戰鬥：',
      choices,
      null,
      '⚔️',
    );
    return { kind: kind ?? 'pay', generals: [] };
  }

  // ───────────────────────── 戰鬥 ─────────────────────────

  /** 回傳攻方是否獲勝；玩家中途取消（還沒開打）回傳 null，由呼叫端回到選擇介面 */
  private async fight(attacker: Lord, city: City, kind: BattleKind, preset: General[]): Promise<boolean | null | 'draw'> {
    const defender = this.state.lords[city.owner as LordId];
    const involved = this.human(attacker) || this.human(defender);
    if (kind === 'siege') return this.runSiege(attacker, city, preset);

    // 攻方武將
    let atkGen: General | null = preset[0] ?? null;
    if (this.human(attacker)) {
      const pool = freeGenerals(this.state, attacker.id).filter((g) => kind !== 'duel' || canDuel(g));
      if (!pool.length) return false;
      atkGen = await this.pickGeneral(`派誰出戰${BATTLE_NAMES[kind]}？`, pool, kind, true);
      if (!atkGen) return null;
    }
    if (!atkGen) return false;

    // 擂台與技藝比試：守方可保留城池而退讓，攻方不提供脫逃。
    const defensePool = defenderPool(this.state, city).filter(g => kind !== 'duel' || canDuel(g));
    const best = [...defensePool].sort((a,b) => kind === 'duel' ? power(b)-power(a) : craft(b,kind as CraftStat)-craft(a,kind as CraftStat))[0];
    const attackScore = kind === 'duel' ? power(atkGen) : craft(atkGen,kind as CraftStat);
    const defenseScore = best ? (kind === 'duel' ? power(best) : craft(best,kind as CraftStat)) : 0;
    let flee = false;
    let defGen: General | null = null;
    let defPicked = false;
    if (this.human(defender)) for (;;) {
      const decision = await this.dialog.choose(
        `${LORDS[attacker.id].name}挑戰${city.name}【${BATTLE_NAMES[kind]}】`,
        `敵將 ${atkGen.name}：${generalInfo(atkGen)}<br><br>臨陣脫逃會直接判負，保留城池、駐將與其餘守軍。守軍四分之一（${Math.floor(city.garrisonSoldiers/4)} 人）加入敵方，對方免繳過路費。`,
        [
          { label: '迎戰・選擇應戰武將', value: 'fight', sub: defensePool.map(g=>`${g.name}：${generalInfo(g)}`).join('<br><br>') || '沒有可應戰武將，將不戰而敗' },
          { label: '臨陣脫逃', value: 'flee', sub: `保留${city.name}，${Math.floor(city.garrisonSoldiers/4)} 名守軍倒戈` },
        ], null, '⚔️',
      );
      flee = decision === 'flee';
      if (flee) break;
      // 選擇應戰武將；按「返回」回到迎戰／脫逃的選擇
      if (!defensePool.length) { defPicked = true; break; }
      const picked = await this.pickGeneral(`${LORDS[attacker.id].name}的${atkGen.name}挑戰${city.name}【${BATTLE_NAMES[kind]}】，派誰應戰？`, defensePool, kind, true, '返回');
      if (picked) { defGen = picked; defPicked = true; break; }
    } else flee = attackScore > defenseScore*1.8 && Math.random()<0.5;
    if (flee) {
      const joined = Math.floor(city.garrisonSoldiers/4);
      city.garrisonSoldiers -= joined;
      attacker.soldiers += joined;
      this.ui.log(`${LORDS[defender.id].name}在${city.name}【${BATTLE_NAMES[kind]}】臨陣脫逃，${joined} 名守軍加入${LORDS[attacker.id].name}；城池與駐將保留，攻方免繳過路費。`, this.human(defender) ? 'bad' : involved ? 'good' : 'ai');
      this.world.syncCities(this.state);
      this.refresh();
      return true;
    }

    // 守方武將（玩家已在上面選好）
    if (!defPicked) defGen = aiDefender(this.state, city, kind);
    if (!defGen) {
      this.ui.log(`${city.name}無人應戰，${atkGen.name}不戰而勝。`, 'info');
      return true;
    }

    if (kind === 'duel') {
      const duel = new Duel(attacker, atkGen, defender, defGen);
      let winner: Side | 'draw';
      if (involved) {
        const playerSide: Side = this.human(attacker) ? 'a' : 'b';
        const playerLord = this.human(attacker) ? attacker : defender;
        winner = await this.battleView.runDuel(duel, playerSide, () => this.speed, (side) => this.useItemInDuel(duel, side, playerLord), (side) => this.aiBattleItem(duel, side, side === 'a' ? attacker : defender));
      } else {
        while (!duel.over) {
          const aItems=this.aiBattleItem(duel,'a',attacker), bItems=duel.over?null:this.aiBattleItem(duel,'b',defender);
          if (aItems) duel.afterItem(aItems);
          if (bItems) duel.afterItem(bItems);
          if (!duel.over) duel.round({a:aItems?'none':duel.aiAction('a'),b:bItems?'none':duel.aiAction('b')});
        }
        duel.finish();winner=duel.draw?'draw':duel.winner!;
      }
      if (winner === 'draw') {
        // 平手：雙方都獲得歷練，過路費一筆勾銷
        const g1 = battleExp(atkGen, null);
        const g2 = battleExp(defGen, null);
        this.ui.log(`擂台戰：${atkGen.name} vs ${defGen.name}，戰成平手！雙方各得歷練（修為 +${g1} / +${g2}），免繳過路費。`, involved ? 'info' : 'ai');
        for (const f of [duel.a, duel.b]) if (f.hp <= 0) await this.onGeneralSlain(f.general, involved, f.itemsSealed);
        return 'draw';
      }
      const w = winner === 'a' ? atkGen : defGen;
      const l = winner === 'a' ? defGen : atkGen;
      const dead = duel.slainGeneral();
      const gain = battleExp(w, dead ? null : l);
      const verdict = dead ? `（${l.name}戰死）` : duel.surrendered ? `（${l.name}認輸）` : '';
      this.ui.log(`擂台戰：${atkGen.name} vs ${defGen.name}，${w.name}勝出${verdict}，生死歷練修為 +${gain}。`, involved ? 'info' : 'ai');
      if (dead) await this.onGeneralSlain(dead, involved, duel.fighter(dead.id === atkGen.id ? 'a' : 'b').itemsSealed);
      return winner === 'a';
    }

    const stat = kind as CraftStat;
    if (city.garrisonSoldiers < CONTEST_SOLDIERS) {
      this.ui.log(`${city.name}守軍不足 ${CONTEST_SOLDIERS}，無法維持鬥法秩序，${atkGen.name}不戰而勝。`, involved ? 'info' : 'ai');
      return true;
    }
    const r = craftContest(atkGen, defGen, stat, attacker, city);
    if (involved) await this.battleView.showContest(r, atkGen, attacker.id, defGen, defender.id, this.human(attacker) ? 'a' : 'b');
    const gain = battleExp(r.winner === 'a' ? atkGen : defGen, r.winner === 'a' ? defGen : atkGen);
    this.ui.log(
      `${STAT_NAMES[stat]}比試：${atkGen.name} ${r.aScore} vs ${defGen.name} ${r.bScore}。攻方折兵 ${r.aLoss}、守軍折損 ${r.bLoss}，勝者修為 +${gain}。`,
      involved ? 'info' : 'ai',
    );
    this.world.syncCities(this.state);
    return r.winner === 'a';
  }

  /** 擂台或擲骰前物品致死，共用護法、清理與主公敗北流程。 */
  private async onGeneralSlain(g: General, involved: boolean, sealed = false, cause = '戰死擂台') {
    if (!sealed && await this.protectDeath(g)) { this.refresh(); return; }
    const owner = g.owner;
    const abandoned = killGeneral(this.state, g);
    this.world.syncCities(this.state);
    if (abandoned) this.ui.log(`🏚️ ${this.state.cities[abandoned].name}失去所有駐將，成為空城，守軍離去。`, 'bad');
    this.ui.log(`💀 ${g.name}${cause}，從此除名！`, owner === this.state.player ? 'bad' : involved ? 'good' : 'ai');
    if (involved) this.ui.toast(`${g.name}${cause}`);
    this.refresh();
    // 主公戰死，等於敗北
    if (g.isLord && owner) await this.onBankrupt(this.state.lords[owner], `${g.name}${cause}，主公陣亡`);
  }

  private async runSiege(attacker: Lord, city: City, preset: General[]): Promise<boolean | null> {
    const defender = this.state.lords[city.owner as LordId];
    let team = preset;
    let sentSoldiers = attacker.soldiers;
    if (this.human(attacker)) {
      const pool = freeGenerals(this.state, attacker.id);
      for (;;) {
        const picked = await this.dialog.pickMany(
          `攻打${city.name}・選擇出征武將`,
          `最多派遣三名武將；選好武將後，可自行決定出兵數量。\n戰敗則出征的士兵全滅；勝方也會折損，雙方越接近折損越多。\n一名守軍約等於十五名隨行士兵；武將武力越高，統率加成越大。守方約 ${garrisonPower(this.state, city)}。`,
          pool.map((g) => ({ label: g.name, icon: portraitUrl(g), sub: `${generalInfo(g)}${pv(g)}`, value: g })),
          1,
          3,
          '出征',
        );
        if (!picked) return null;
        team = picked;
        const sent = await this.dialog.slider(
          `攻打${city.name}・出兵多少？`,
          `目前隨行士兵 ${attacker.soldiers}。出征的士兵戰敗會全滅，留在身邊的不受影響。`,
          {
            min: Math.min(100, attacker.soldiers),
            max: attacker.soldiers,
            step: 100,
            unit: ' 名',
            confirm: '出征',
            preview: (v) => {
              const mine = siegeAttack(attacker, team, v);
              const theirs = garrisonPower(this.state, city);
              return `我方約 <b>${mine}</b> vs 守方約 <b>${theirs}</b>（${mine > theirs * 1.15 ? '勝算大' : mine > theirs * 0.85 ? '勢均力敵' : '勝算小'}）・留守 ${attacker.soldiers - v} 名`;
            },
          },
          '🏯',
        );
        if (!sent) continue;
        sentSoldiers = sent;
        break;
      }
    }
    const oldGenerals = garrisonOf(this.state, city);
    const involved = this.human(attacker) || this.human(defender);

    // 攻城雙方必須迎戰，不提供臨陣脫逃。
    const r = siege(this.state, attacker, team, city, sentSoldiers);
    if (involved) await this.battleView.showSiege(r, team, attacker.id, city, oldGenerals, this.human(attacker));
    this.ui.log(`攻城戰：${LORDS[attacker.id].name} ${r.attack} vs ${city.name} ${r.defense}，${r.win ? '城破！' : '攻城失敗。'}`, involved ? 'info' : 'ai');
    if (!r.win) {
      for (const og of oldGenerals) this.ui.log(`${og.name}守城有功，修為 +${battleExp(og, team[0])}。`, involved ? 'info' : 'ai');
      return false;
    }
    for (const g of team) battleExp(g, oldGenerals[0] ?? null);

    // 奪城：原駐將退回主公身邊（閉關中則走火入魔），攻方派將駐守
    for (const og of oldGenerals) {
      if (og.secluded) {
        qiDeviation(og);
        this.ui.log(`${og.name}閉關被打斷，走火入魔！重傷並損失一半修為。`, this.human(defender) ? 'bad' : involved ? 'good' : 'ai');
      }
      joinLord(this.state, defender.id, og);
    }
    city.garrisonGenerals = [];
    const weakest = [...team].filter((x) => !x.isLord && !fx(x).fixedParty && !x.ghostSourceId).sort((a, b) => power(a) - power(b))[0] ?? deployable(this.state, attacker.id)[0];
    let gids = weakest ? [weakest.id] : [];
    let soldiers = Math.min(attacker.soldiers, Math.max(MIN_GARRISON, Math.round(attacker.soldiers * 0.4)));
    if (this.human(attacker)) {
      const cand = deployable(this.state, attacker.id);
      if (cand.length) {
        const picked = await this.dialog.pickMany(`攻下${city.name}！派誰駐守？`, `最多 ${GARRISON_LIMIT} 人，駐將越多守城越強。（主公本人不能駐守）`, cand.map((x) => ({ label: x.name, icon: portraitUrl(x), sub: `${generalInfo(x)}${pv(x)}`, value: x.id })), 1, Math.min(GARRISON_LIMIT, cand.length), '駐守');
        if (picked) gids = picked;
      } else gids = [];
      if (attacker.soldiers > 0) {
        const s = await this.dialog.slider(
          `派多少士兵駐守${city.name}？`,
          `目前士兵 ${attacker.soldiers}。`,
          {
            min: Math.min(MIN_GARRISON, attacker.soldiers),
            max: attacker.soldiers,
            step: 100,
            initial: Math.min(attacker.soldiers, Math.max(MIN_GARRISON, Math.round(attacker.soldiers * 0.4))),
            unit: ' 名',
            confirm: '派駐',
            preview: (v) => `守軍戰力約 ${v * GARRISON_STRENGTH}（未計駐將與地貌）・留在身邊 ${attacker.soldiers - v} 名`,
          },
          '🏯',
        );
        soldiers = s ?? Math.min(MIN_GARRISON, attacker.soldiers);
      } else soldiers = 0;
    }
    occupy(this.state, attacker, city, gids, Math.max(0, soldiers));
    if (!gids.length) {
      abandonIfEmpty(this.state, city.id);
      this.world.syncCities(this.state);
      this.ui.log(`${LORDS[attacker.id].name}攻破${city.name}，卻無將可派駐，城池淪為空城。`, this.human(attacker) ? 'bad' : 'ai');
      this.refresh();
      return true;
    }
    this.world.syncCities(this.state);
    this.world.captureEffect(city.tile, LORDS[attacker.id].color);
    if (this.human(attacker)) {
      await this.chooseContest(city);
      await this.chooseMining(attacker, city, true);
    }
    this.ui.log(`${LORDS[attacker.id].name}奪下${city.name}，由${gids.length ? gids.map((id) => this.state.generals[id].name).join('、') : '（無駐將）'}駐守。`, this.human(attacker) ? 'good' : this.human(defender) ? 'bad' : 'ai');
    this.refresh();
    return true;
  }

  private pickGeneral(title: string, pool: General[], kind: BattleKind, cancelable = true, cancelLabel = '取消'): Promise<General | null> {
    const risky = (g: General) => (kind === 'duel' && g.isLord ? '・⚠️主公戰死即敗北' : '') + (kind === 'duel' && g.hp < maxHp(g) * WOUNDED_HP ? '・⚠️血量偏低，易戰死' : '');
    const stat = kind === 'duel' || kind === 'siege' ? null : (kind as CraftStat);
    return this.dialog.choose(
      title,
      '',
      // 只列與這場比試有關的數值（含被動）；技藝比試依該能力值由高到低，擂台依戰力
      [...pool].sort((x, y) => (stat ? craft(y, stat) - craft(x, stat) : power(y) - power(x))).map((g) => ({
        label: g.name, icon: portraitUrl(g),
        sub: stat
          ? `<b>${STAT_NAMES[stat]} ${craft(g, stat)}</b>・${REALMS[g.realm]}${pv(g)}`
          : kind === 'duel'
            ? `${REALMS[g.realm]}｜血量 ${g.hp}/${maxHp(g)}・戰力 ${power(g)}<br>武力 ${attack(g)}・防禦 ${defense(g)}${risky(g)}${g.technique ? `・${g.technique.name}` : ''}${pv(g)}`
            : `戰力 ${power(g)}・武力 ${attack(g)}${pv(g)}`,
        value: g,
        color: originCss(g.origin),
      })),
      cancelable ? cancelLabel : null,
    );
  }

  /** 戰鬥中使用物品：選物品 → 選使用的武將 → 生效 */
  private async useItemInDuel(duel: Duel, side: Side, lord: Lord): Promise<DuelEvent[] | null> {
    if (lord.itemsLocked > 0 || duel.fighter(side).itemsSealed) { this.ui.toast('目前不能使用物品'); return null; }
    const items = lord.items.filter((i) => usableIn(i, 'battle'));
    if (!items.length) {
      this.ui.toast('沒有可在戰鬥中使用的物品');
      return null;
    }
    const selection = { category: null as string | null };
    for (;;) {
      const item = await chooseCategorizedItem(this.dialog, items, selection);
      if (!item) return null;
      const fighter = duel.fighter(side).general;
      const users = [fighter, ...freeGenerals(this.state, lord.id).filter((g) => g.id !== fighter.id)];
      const user = await this.dialog.choose(
        `由誰使用${nameOf(item)}？`,
        '使用物品會消耗該武將的體力，能力值須達到門檻。',
        sortUsers(users, item).map((g) => {
          const c = canUse(item, g);
          return { label: g.name, icon: portraitUrl(g), sub: itemUserInfo(g, item), value: g, disabled: !c.ok, reason: c.reason };
        }),
      );
      if (!user) continue;
      return useInDuel(duel, side, lord, item, user);
    }
  }

  // ───────────────────────── 秘境、商店、驛道 ─────────────────────────

  private async landRealm(lord: Lord, realmName: string) {
    if (!lord.items.some(i => i.defId === 'realmkey') || lord.itemsLocked > 0) {
      if (this.human(lord)) await this.dialog.message('秘境入口', lord.itemsLocked > 0 ? '目前不能使用物品，無法消耗秘境遺鑰。' : `探索${realmName}需消耗一把秘境遺鑰，可在天寶商行購買（3000 下品靈石）。`, '🌀');
      return;
    }
    const free = deployable(this.state, lord.id);
    if (!free.length) {
      if (this.human(lord)) this.ui.toast(`探索${realmName}需要至少一名隨行武將`);
      return;
    }
    let team: General[] | null = null;
    let level = 0;
    if (this.human(lord)) {
      // 選難度 → 選人 → 確認；任何一步按取消都回到上一步重新選擇
      const best = [...free].sort((x, y) => y.realm - x.realm || power(y) - power(x)).slice(0, 3);
      for (;;) {
        const picked = await this.dialog.choose(
          `🌀 ${realmName}・選擇難度`,
          facts([
            ['難度', '以境界命名，看的是境界，不是戰力'],
            ['比隊伍高', '歷時越久（最長 9 回合）、越兇險'],
            ['比隊伍低', '歷時越短（最短 1 回合）、越安全'],
            ['境界相同', '歷時 3 回合'],
            ['獎勵', '2～5 份寶物'],
            ['入場', '出發時消耗一把秘境遺鑰，全隊共用'],
            ['保命', '有人隕落時，可消耗一張破界遁空符讓全隊無獎勵撤離'],
          ]) + `以下依你境界最高的三人估計。接著選擇派遣人數（${REALM_MIN_PARTY}–${REALM_MAX_PARTY} 人）。`,
          REALM_LEVELS.map((l, i) => ({
            label: `${l.icon} ${l.name}秘境`,
            sub: `歷時約 ${realmTurns(i, best)} 回合・平均隕落率約 ${Math.round((best.reduce((sum, g) => sum + deathChance(g, best, i), 0) / best.length) * 100)}%<br>寶物品階 ${l.tier >= 0 ? '+' : ''}${l.tier}・修為 ×${l.exp}・寶物 ${realmRolls(i, 3)}～${realmRolls(i, 4)} 份`,
            value: i,
          })),
          '取消',
          '🌀',
        );
        if (picked === null) return;
        level = picked;
        const L = REALM_LEVELS[level];
        let chosen: General[] | null = null;
        for (;;) {
          chosen = await this.dialog.pickMany(
            `🌀 ${realmName}（${L.name}秘境）・選擇武將`,
            `選 ${REALM_MIN_PARTY}–${REALM_MAX_PARTY} 人；歷時依隊伍平均境界而定，人越多個別隕落率越低，四人以上多得一份寶物。按取消可回到難度選擇。`,
            free.map((g) => ({ label: g.name, icon: portraitUrl(g), sub: `${REALMS[g.realm]}・單獨隕落率約 ${Math.round(deathChance(g, [g], level) * 100)}%${pv(g)}`, value: g })),
            REALM_MIN_PARTY,
            REALM_MAX_PARTY,
            '下一步',
          );
          if (!chosen) break;
          const ok = await this.dialog.confirm(
            `🌀 確認進入${realmName}（${L.name}秘境）`,
            `隊伍：${chosen.map((g) => `${g.name}（${REALMS[g.realm]}，隕落率約 ${Math.round(deathChance(g, chosen!, level) * 100)}%）`).join('、')}\n歷時 <b>${realmTurns(level, chosen)}</b> 回合（隊伍平均境界：${REALMS[partyRealm(chosen)]}）・寶物 <b>${realmRolls(level, chosen.length)}</b> 份。`,
            '消耗一把遺鑰・出發',
            '重新選人',
            '🌀',
          );
          if (ok) break;
        }
        if (chosen) {
          team = chosen;
          break;
        }
      }
    } else {
      const plan = aiRealm(this.state, lord);
      team = plan?.team ?? null;
      level = plan?.level ?? 0;
    }
    if (!team) return;
    dispatch(lord, team, realmName, level);
    this.ui.log(`${LORDS[lord.id].name}消耗一把秘境遺鑰，派遣${team.map((g) => g.name).join('、')}進入${realmName}（${REALM_LEVELS[level].name}秘境，${realmTurns(level, team)} 回合）。`, this.human(lord) ? 'good' : 'ai');
    this.refresh();
  }

  private async landShop(lord: Lord, kind: ShopKind) {
    const offers = makeStock(this.state, lord, kind);
    if (this.human(lord)) {
      await openShop(this.dialog, this.state, lord, kind, offers, (msg) => {
        this.ui.log(msg, 'good');
        this.refresh();
      });
      return;
    }
    const limit=kind==='tavern' && lordHas(lord.id,'recruitLimit') ? 2 : 1;
    const visit=beginShopVisit(this.state,lord,kind,offers);
    for(let purchased=0;purchased<limit;) {
      const pick=aiShop(this.state,lord,visit.offers.filter(o=>o.kind!=='general'||!o.general.owner));
      if(!pick){
        const cost=SHOP_REFRESH_COSTS[visit.refreshes];
        // 電腦只在沒有合適貨品且付費後仍留足備用金時刷新。
        if(cost===undefined||!visit.offers.length||lord.stones<cost+8000) break;
        const r=refreshShop(this.state,lord,visit);if(!r.ok)break;
        this.ui.log(r.message,'ai');continue;
      }
      const result=buy(this.state,lord,pick);if(!result.ok)break;
      purchased++;this.ui.log(result.message,'ai');
    }
    this.refresh();
  }

  /** 停在驛道：可能遇到奇遇，有些要玩家抉擇 */
  private async roadEvent(lord: Lord, place: string) {
    const ev = rollRoadEvent(this.state, lord, place);
    if (!ev) return;
    const name = LORDS[lord.id].name;
    let result: string;
    if (ev.options) {
      let idx: number;
      if (this.human(lord)) {
        const picked = await this.dialog.choose(
          `${ev.icon} ${ev.title}`,
          ev.story,
          ev.options.map((o, i) => ({ label: o.label, sub: o.sub, value: i, disabled: o.disabled, reason: o.reason })),
          null,
          ev.icon,
        );
        idx = picked ?? ev.options.length - 1;
      } else {
        const ok = ev.options.findIndex((o) => !o.disabled);
        idx = ok >= 0 ? ok : ev.options.length - 1;
      }
      result = ev.options[idx].apply();
    } else result = ev.apply!();
    this.ui.log(`${name}：${ev.icon} ${ev.title}――${result}`, this.human(lord) ? (ev.tone === 'bad' ? 'bad' : 'good') : 'ai');
    this.refresh();
    if (this.human(lord)) await this.dialog.message(`${ev.icon} ${ev.title}`, ev.options ? result : `${ev.story}\n\n${result}`, ev.icon);
  }

  // ───────────────────────── 玩家擲骰前操作 ─────────────────────────

  private async generalAbilities(lord: Lord) {
    for (;;) {
      const user=await this.dialog.choose('方外神通','隨行人物可在整備期間使用，不限所在位置。製物／起死回生耗 100 體力，冤魂召喚每五個自身回合一次。',abilityUsers(this.state,lord).map(g=>{const r=abilityReady(this.state,lord,g);return {label:g.name,sub:passiveOf(g).effectText,value:g,disabled:!r.ok,reason:r.reason};}));
      if(!user)break;
      let target:General|undefined;
      if(!fx(user).produceCategory) {
        const selected=await this.dialog.choose(fx(user).reviveAbility?'起死回生：選擇我方亡將':'召喚冤魂：選擇亡將','取消返回神通列表。',abilityTargets(this.state,lord,user).map(g=>({label:g.name,sub:REALMS[g.realm]+'・修為 '+g.exp,value:g})),'返回');
        if(!selected)continue;target=selected;
      }
      this.ui.log(useGeneralAbility(this.state,lord,user,target),'good');this.refresh();
    }
    this.refresh();
  }

  private async useItemPreroll(lord: Lord) {
    if (lord.itemsLocked > 0) { this.ui.toast('目前不能使用物品'); return; }
    const items = lord.items.filter((i) => usableIn(i, 'preroll') && (!['teleport','cloud','cushion','prison'].includes(i.defId) || (!lord.stunned && lord.forcedTile===null && !lord.stayThisTurn)));
    if (!items.length) {
      this.ui.toast('沒有可在擲骰前使用的物品');
      return;
    }
    const selection = { category: null as string | null };
    for (;;) {
      const item = await chooseCategorizedItem(this.dialog, items, selection);
      if (!item) return;
      for (;;) {
        const user = await this.dialog.choose(
          `由誰使用${nameOf(item)}？`,
          '只有隨行武將可以使用物品；取消返回物品清單。',
          sortUsers(freeGenerals(this.state, lord.id), item).map((g) => {
            const c = canUse(item, g);
            return { label: g.name, icon: portraitUrl(g), sub: itemUserInfo(g, item), value: g, disabled: !c.ok, reason: c.reason };
          }),
        );
        if (!user) break;
        const target = await this.pickItemTarget(lord, item.defId);
        if (!target) continue;
        const msg = await this.usePrerollWithReaction(lord, item, user, target);
        this.ui.log(msg, 'good');
        this.ui.toast(msg);
        if (item.defId === 'transmission' && target.city) await this.openGarrison(target.city, true);
        this.world.syncCities(this.state);
        this.refresh();
        if (['teleport', 'cloud'].includes(item.defId) && target.tile !== undefined) this.rollResolver?.({ type: 'teleport', tile: target.tile });
        return;
      }
    }
  }

  private async pickItemTarget(lord: Lord, defId: string): Promise<PrerollTarget | null> {
    const d = ITEM_DEFS[defId], others = aliveLords(this.state).filter(l => l.id !== lord.id);
    for (;;) {
      if (d.target === 'deadGeneral' || d.target === 'ownGeneral' || d.target === 'enemyGeneral') {
        const pool = d.target === 'deadGeneral' ? Object.values(this.state.generals).filter(g => g.status === 'dead')
          : d.target === 'ownGeneral' ? generalsOf(this.state, lord.id).filter(g => g.status !== 'realm')
          : others.flatMap(l => generalsOf(this.state, l.id).filter(g => g.status !== 'realm'));
        const eligible = pool.filter(g => defId !== 'five' || !['waste','heaven'].includes(g.aptitude));
        // 這個物品真的派得上用場的武將排前面（例如療傷丹先列出受傷的人）
        const useful = (g: General): boolean => {
          if (['heal', 'mend'].includes(defId)) return g.hp < maxHp(g);
          if (['qi', 'essence'].includes(defId)) return !inBottleneck(g);
          if (defId === 'clearmind') return g.demon > 0;
          if (['demon', 'illusion'].includes(defId)) return inBottleneck(g) && !g.demon;
          if (defId === 'foundation') return !g.foundation;
          if (defId === 'vigor') return g.stamina < maxStamina(g);
          if (['rootup1', 'rootup2'].includes(defId)) return g.aptitude !== 'heaven';
          return true;
        };
        eligible.sort((x, y) => Number(useful(y)) - Number(useful(x)) || power(y) - power(x));
        if (!eligible.length) { this.ui.toast('沒有符合條件的目標武將'); return null; }
        const g = await this.dialog.choose('選擇生效的武將', defId === 'five' ? '僅能選擇五行靈根武將。' : '', eligible.map(x => ({ label: x.name, icon: portraitUrl(x), sub: itemTargetInfo(x, defId), value: x, color: originCss(x.origin) })));
        if (!g) return null;
        if (defId === 'five') {
          const element = await this.dialog.choose('選擇新的靈根', '不相容功法會卸回原主公行囊。', (['metal','wood','water','fire','earth'] as const).map(value => ({ label: ELEMENT_NAMES[value] + '靈根', value })), '返回選武將');
          if (!element) continue;
          return {general:g,element};
        }
        return {general:g};
      }
      if (d.target === 'lord') {
        const candidates = others.filter(l => !['poison','bow'].includes(defId) || freeGenerals(this.state,l.id).length > 0).filter(l => defId !== 'move' || l.items.length > 0);
        if (!candidates.length) { this.ui.toast('沒有符合條件的目標主公'); return null; }
        const victim = await this.dialog.choose('選擇目標主公', '', candidates.map(value => ({label:LORDS[value.id].name,sub:'靈石 '+fmtStones(value.stones,true),value,color:LORDS[value.id].css})));
        if (!victim) return null;
        if (['confuse','confusing'].includes(defId)) {
          const destination = await this.pickItemTarget(lord,'teleport');
          if (!destination) continue;
          return {lord:victim,tile:destination.tile};
        }
        return {lord:victim};
      }
      if (d.target === 'ownCity' || d.target === 'enemyCity') {
        const own = citiesOf(this.state,lord.id);
        if (defId === 'graft' && !own.length) {this.ui.toast('沒有己方城池可交換');return null;}
        const pool = d.target === 'ownCity' ? own : others.flatMap(l => citiesOf(this.state,l.id));
        if (!pool.length) {this.ui.toast('沒有可選擇的城池');return null;}
        const city = await this.dialog.choose('選擇城池','',pool.map(value=>({label:value.name+'（'+ownerName(value.owner)+'）',sub:'守軍 '+value.garrisonSoldiers,value,color:ownerCss(value.owner)})));
        if (!city) return null;
        if (defId === 'graft') {
          const ownCity = await this.dialog.choose('選擇交換的己方城池','所有權與軍隊交換，地點與繁榮度保留。',own.map(value=>({label:value.name,sub:'守軍 '+value.garrisonSoldiers,value})), '返回選敵城');
          if (!ownCity) continue;
          return {city,ownCity};
        }
        return {city};
      }
      if (d.target === 'dice') {const dice=await this.dialog.choose('控骰符：選擇點數','',[1,2,3,4,5,6].map(value=>({label:value+' 點',value})));return dice?{dice}:null;}
      if (d.target === 'tile') {
        this.phase='pickTile';this.world.showHighlights(this.state.tiles.map(t=>t.index),0xc9a0ff);this.refresh();
        const tile=await new Promise<number|null>(resolve=>this.tileResolver=resolve);
        this.tileResolver=null;this.world.clearHighlights();this.phase='preroll';this.refresh();
        return tile === null ? null : {tile};
      }
      return {};
    }
  }

  private aiBattleItem(duel: Duel, side: Side, lord: Lord): DuelEvent[] | null {
    const fighter=duel.fighter(side), foe=duel.other(side);
    if (fighter.itemsSealed || lord.itemsLocked || duel.over) return null;
    const items=lord.items.filter(i=>usableIn(i,'battle'));
    const users=[fighter.general,...freeGenerals(this.state,lord.id).filter(g=>g.id!==fighter.general.id)];
    const item=items.find(i=>users.some(g=>canUse(i,g).ok) && (
      i.defId==='heal' ? fighter.hp<fighter.maxHp*.6 :
      i.defId==='charge' ? !!fighter.general.technique && fighter.energy<50 :
      i.defId==='blood' ? !fighter.itemLifesteal :
      i.defId==='drain' ? !foe.itemsSealed :
      i.defId==='poison' ? !foe.poison :
      i.defId==='ring' ? !foe.frozen :
      ['shield','vajra'].includes(i.defId) ? fighter.shield<fighter.maxHp*.2 :
      i.defId==='invert' ? foe.atk+foe.def>fighter.atk+fighter.def :
      ['rage','mist'].includes(i.defId)));
    if (!item) return null;
    return useInDuel(duel,side,lord,item,users.find(g=>canUse(item,g).ok)!);
  }

  private itemHooks() {
    return {use: (lord: Lord, item: Item, user: General, target: PrerollTarget) => this.usePrerollWithReaction(lord,item,user,target), protect: (g: General) => this.protectDeath(g)};
  }

  private async usePrerollWithReaction(lord: Lord, item: Item, user: General, target: PrerollTarget): Promise<string> {
    const victim = target.lord ?? (target.general?.isLord && target.general.owner ? this.state.lords[target.general.owner] : undefined);
    const guardian=victim&&victim.id!==lord.id?itemBlockUser(this.state,victim):undefined;
    let blocked=!!guardian;
    if (!blocked && victim && victim.id !== lord.id && !victim.itemsLocked) {
      const card=victim.items.find(i=>i.defId==='substitute');
      const users=card?freeGenerals(this.state,victim.id).filter(g=>canUse(card,g).ok):[];
      if (card && users.length) {
        if (!this.human(victim)) {consumeItem(victim,card,users[0]);blocked=true;}
        else for (;;) {
          if (!await this.dialog.confirm('替身符：抵消敵方物品？',LORDS[lord.id].name+'對你使用'+nameOf(item)+'。','使用替身符','承受效果')) break;
          const defender=await this.dialog.choose('由誰使用替身符？','取消返回確認。',users.map(value=>({label:value.name,sub:'體力 '+value.stamina,value})), '返回');
          if (!defender) continue;
          consumeItem(victim,card,defender);blocked=true;break;
        }
      }
    }
    const result=await usePreroll(this.state,lord,item,user,target,blocked,async g=>{
      if(await this.protectDeath(g))return true;
      await this.onGeneralSlain(g,this.human(lord)||g.owner===this.state.player,true,'遭物品擊殺');
      return false;
    });
    if(guardian&&victim){triggerItemBlock(victim,guardian);this.ui.log('左慈擲杯戲曹，敵方非戰鬥物品失效，護法冷卻五個自身回合。','good');}
    return result;
  }

  private async protectDeath(g: General): Promise<boolean> {
    if (!g.owner) return false;
    const lord=this.state.lords[g.owner],card=lord.items.find(i=>i.defId==='totem');
    if (!lord.alive || lord.itemsLocked || !card) return false;
    if (this.human(lord) && !await this.dialog.confirm('不死圖騰：免疫死亡？',g.name+'即將死亡。使用後回復滿血，保留境界、修為、所屬與功法。','使用圖騰','不使用')) return false;
    consumeItem(lord,card);g.hp=maxHp(g);
    this.ui.log(g.name+'的不死圖騰生效，滿血復生。','good');return true;
  }

  private async chooseWheelDirection(lord: Lord): Promise<boolean> {
    const tile=this.state.tiles[lord.position];
    if (!lord.forkChoice || tile.links.length<3) return false;
    if (lord.forkExit === null) enterFork(this.state,lord,1);
    const exit=this.human(lord) ? await this.dialog.choose('風火輪：選擇岔路方向',tile.name,tile.links.map(value=>({label:this.state.tiles[value].name,value})),null) : tile.links[Math.floor(Math.random()*tile.links.length)];
    lord.forkExit=exit!;lord.forkChoice=false;
    this.ui.log(LORDS[lord.id].name+'使用風火輪，選擇前往'+this.state.tiles[exit!].name+'。','info');return true;
  }

  private async recruitSoldiers(lord: Lord) {
    const most = Math.floor(lord.stones / recruitCost(lord.id, 1) / 100) * 100;
    if (most < 100) {
      this.ui.toast('靈石不足，至少要能徵召 100 名士兵');
      return;
    }
    const n = await this.dialog.slider(
      '⚔️ 徵兵',
      `每名士兵 ${(recruitCost(lord.id, 100) / 100).toFixed(2).replace(/\.?0+$/, '')} 下品靈石。目前士兵 ${lord.soldiers}，靈石 ${fmtStones(lord.stones)}。`,
      { min: 100, max: most, step: 100, initial: Math.min(2000, most), unit: ' 名', confirm: '徵召', preview: (v) => `花費 ${fmtStones(recruitCost(lord.id, v))}，徵兵後士兵 ${lord.soldiers + v}` },
      '⚔️',
    );
    if (!n) return;
    lord.stones -= recruitCost(lord.id, n);
    lord.soldiers += n;
    this.ui.log(`徵召 ${n} 名士兵。`, 'good');
    this.refresh();
  }

  /** 挖掘設定在佔領時免費指定，之後由已付費的城池調度視窗更換。 */
  private async chooseMining(lord: Lord, city: City, required = false) {
    if (city.owner !== lord.id) return;
    const group = await this.dialog.choose<MaterialGroup>(
      `${city.name}・挖掘材料`,
      `每個自身回合收入 ${materialIncome(city)} 顆（繁榮度 ${fmtProsperity(city.prosperity)} ÷ 20，四捨五入）。只能挖掘基礎材料；高階材料需在擲骰前以 10：1 合成。`,
      MATERIAL_GROUPS.map(k => ({ label: MATERIAL_NAMES[k][0] + (city.mining === k ? '（目前）' : ''), sub: `進化：${MATERIAL_NAMES[k][1]} → ${MATERIAL_NAMES[k][2]}`, value: k })),
      required ? null : '返回調度', '⛏️',
    );
    if (!group || city.owner !== lord.id) return;
    city.mining = group;
    this.ui.log(`⛏️ ${city.name}改為挖掘${MATERIAL_NAMES[group][0]}，每個自身回合收入 ${materialIncome(city)} 顆。`, this.human(lord) ? 'good' : 'ai');
    this.refresh();
  }

  private async materialsFlow(lord: Lord) {
    if (!this.canManage() || this.dialog.isOpen) return;
    for (;;) {
      const selected = await this.dialog.choose(
        '⛏️ 材料與合成',
        materialsText(lord) + '<br><br>城池挖掘提供基礎材料；更換種類請使用「調度駐軍」。每 10 顆合成下一階 1 顆；武器在「武將」名冊升階。',
        MATERIAL_GROUPS.flatMap(group => [0, 1].map(stage => ({
          label: `${MATERIAL_NAMES[group][stage]} → ${MATERIAL_NAMES[group][stage + 1]}`,
          sub: `10：1・可合成 ${Math.floor(lord.materials[group][stage] / 10)} 顆`,
          disabled: lord.materials[group][stage] < 10, reason: '材料不足 10 顆', value: { group, stage },
        }))), '關閉', '⛏️',
      );
      if (!selected) return;
      const {group, stage} = selected;
      const count = await this.dialog.slider('合成多少顆？', `每顆消耗 10 顆${MATERIAL_NAMES[group][stage]}，獲得${MATERIAL_NAMES[group][stage + 1]}。`, {
        min: 1, max: Math.floor(lord.materials[group][stage] / 10), step: 1, initial: 1, unit: ' 顆', confirm: '合成',
        preview: n => `消耗 ${n * 10} 顆，獲得 ${n} 顆；剩餘 ${lord.materials[group][stage] - n * 10} 顆原材料。`,
      }, '⛏️');
      if (count === null) continue;
      if (!this.canManage()) return;
      this.ui.log(synthesize(lord, group, stage, count), 'good');
      this.refresh();
    }
  }

  private async manageGarrison(lord: Lord, selectedCity?: City, freeDispatch = false) {
    const cities = citiesOf(this.state, lord.id);
    if (!cities.length) {
      this.ui.toast('你還沒有城池');
      return;
    }
    for (;;) {
      const city = selectedCity ?? await this.dialog.choose(
        '🏯 調度駐軍',
        '依道路最短距離收費：10 下品～10 中品。付費後可不限次調整該城，直到關閉；操作期間遊戲暫停。',
        cities.map((c) => ({ label: c.name, disabled: lord.stones < garrisonDispatch(this.state, lord, c).fee, reason: '靈石不足', sub: `距離 ${garrisonDispatch(this.state, lord, c).distance} 格・調遣費 ${fmtStones(garrisonDispatch(this.state, lord, c).fee)}・駐將 ${c.garrisonGenerals.length ? garrisonOf(this.state, c).map((g) => g.name).join('、') : '無'}（${c.garrisonGenerals.length}/${GARRISON_LIMIT}）・守軍 ${c.garrisonSoldiers}・繁榮 ${fmtProsperity(c.prosperity)}`, value: c })),
      );
      if (!city) return;
      const fee = freeDispatch ? 0 : garrisonDispatch(this.state, lord, city).fee;
      if (!freeDispatch && !await this.dialog.confirm(`開啟${city.name}調度`, `支付 ${fmtStones(fee)}，即可不限次調整此城，直到關閉。關閉後重新開啟會再收費。`, '付費調度', '返回選城', '🏯')) continue;
      if (city.owner !== lord.id || lord.stones < fee) return;
      lord.stones -= fee;
      this.ui.log(`🏯 ${city.name}調遣費：${fmtStones(fee)}；本次視窗不限次調整。`, 'info');
      this.refresh();
      for (;;) {
        const free = deployable(this.state, lord.id);
        const action = await this.dialog.choose(`調度${city.name}`, `已付費 ${fmtStones(fee)}・本次操作不再收費。守軍 ${city.garrisonSoldiers}・隨行士兵 ${lord.soldiers}`, [
          { label: '增派士兵', sub: `從隨行士兵調入（目前 ${lord.soldiers}）`, value: 'add', disabled: lord.soldiers < 100, reason: '士兵不足' },
          { label: '撤回士兵', sub: `至少保留 ${MIN_GARRISON} 守軍`, value: 'remove', disabled: city.garrisonSoldiers - MIN_GARRISON < 100, reason: '守軍已達下限' },
          { label: '更換挖掘材料', sub: `${city.mining ? MATERIAL_NAMES[city.mining][0] : '尚未指定'}・每個自身回合 ${materialIncome(city)} 顆`, value: 'mining' },
          { label: '調整駐將', sub: `最多 ${GARRISON_LIMIT} 人：從隨行武將派駐，或撤回駐將`, value: 'swap', disabled: !free.length && !city.garrisonGenerals.length, reason: '沒有隨行武將，也沒有駐將' },
        ], '關閉調度');
        if (!action) break;
        if (action === 'add' || action === 'remove') {
          const max = action === 'add' ? lord.soldiers : city.garrisonSoldiers - MIN_GARRISON;
          const n = await this.dialog.slider(
            action === 'add' ? `增派多少士兵駐守${city.name}？` : `從${city.name}撤回多少士兵？`,
            `守軍 ${city.garrisonSoldiers}・隨行士兵 ${lord.soldiers}`,
            {
              min: Math.min(100, max),
              max,
              step: 100,
              unit: ' 名',
              confirm: action === 'add' ? '增派' : '撤回',
              preview: (v) => (action === 'add' ? `守軍將達 ${city.garrisonSoldiers + v}` : `守軍將剩 ${city.garrisonSoldiers - v}`),
            },
            '🏯',
          );
          if (!n) continue;
          const sign = action === 'add' ? 1 : -1;
          city.garrisonSoldiers += n * sign;
          lord.soldiers -= n * sign;
        } else if (action === 'mining') {
          await this.chooseMining(lord, city);
        } else if (action === 'swap') {
          for (;;) {
            const on = garrisonOf(this.state, city);
            const party = deployable(this.state, lord.id);
            const g = await this.dialog.choose(
              `🏯 ${city.name}・調整駐將（${on.length}/${GARRISON_LIMIT}）`,
              '點選駐將可撤回，點選隨行武將可派駐。',
              [
                ...on.map((x) => ({ label: `▼ 撤回 ${x.name}`, icon: portraitUrl(x), sub: `駐守中｜${generalInfo(x)}${pv(x)}`, value: x, color: '#c99a2e', disabled: on.length <= 1, reason: '城池至少要有一名駐將' })),
                ...party.map((x) => ({ label: `▲ 派駐 ${x.name}`, icon: portraitUrl(x), sub: `隨行｜${generalInfo(x)}${pv(x)}`, value: x, disabled: on.length >= GARRISON_LIMIT, reason: `已滿 ${GARRISON_LIMIT} 人`, color: '#5aa8ec' })),
              ],
              '完成',
            );
            if (!g) break;
            if (g.status === 'garrison') {
              city.garrisonGenerals = city.garrisonGenerals.filter((id) => id !== g.id);
              joinLord(this.state, lord.id, g);
            } else {
              g.status = 'garrison';
              g.cityId = city.id;
              city.garrisonGenerals.push(g.id);
            }
          }
        }
        this.world.syncCities(this.state);
        this.refresh();
      }
      return;
    }
  }

  // ───────────────────────── 九州風雲 ─────────────────────────

  /** 新的一輪：持續事件倒數；每 5 輪抽一場九州風雲 */
  private async newRoundEvents() {
    for (const msg of tickWorldEvents(this.state)) this.ui.log(msg, 'info');
    this.world.setEventMarkers(this.state.merchantTile, this.state.banditTiles);
    if (this.state.round%IMMORTAL_INTERVAL===0) {
      const def=eventDef('immortals'),lines=applyWorldEvent(this.state,def);
      this.ui.log(`【固定活動】${def.icon} ${def.name}：${lines.join(' ')}`,'turn');
      if (this.state.lords[this.state.player].alive&&!this.autoPlay) await this.dialog.message(def.name,lines.join('\n'),'🧙');
      this.refresh();
    }
    if (this.state.round % EVENT_INTERVAL !== 0) return;

    const def = pickWorldEvent(this.state);
    const before = new Map(LORD_IDS.map((id) => [id, this.state.lords[id].position]));
    const lines = applyWorldEvent(this.state, def);
    const playerAlive = this.state.lords[this.state.player].alive;
    this.ui.log(`【九州風雲】${def.icon} ${def.name}：${def.desc}`, 'turn');
    for (const l of lines) this.ui.log(l, 'info');
    this.ui.toast(`九州風雲・${def.icon} ${def.name}`);

    if (def.id === 'shuffle') {
      for (const id of LORD_IDS) {
        const lord = this.state.lords[id];
        if (!lord.alive || before.get(id) === lord.position) continue;
        const sprite = this.sprites.get(id)!;
        this.world.beamEffect(sprite.group.position, 0xc9a0ff);
        sprite.setGroundPosition(this.slotPosition(id, lord.position));
        this.world.beamEffect(sprite.group.position, 0xc9a0ff);
      }
    }
    this.world.setEventMarkers(this.state.merchantTile, this.state.banditTiles);
    this.world.syncCities(this.state);
    this.refresh();

    if (playerAlive && !this.autoPlay) {
      const extra = def.duration ? `\n\n（持續 ${def.duration} 輪）` : '';
      await this.dialog.message(`九州風雲・${def.name}`, `${def.desc}${lines.length ? `\n\n${lines.join('\n')}` : ''}${extra}`, def.icon, def.id === 'auction' ? '參加拍賣' : '知道了');
    }
    if (def.id === 'auction') await this.runAuction();
  }

  /** Every completed twentieth round, independent of the random world event draw. */
  private async runTournament() {
    const lords=aliveLords(this.state);
    if (lords.length<2) return;
    const bracket=tournamentBracket(lords);
    this.phase='busy';this.refresh();
    const announce=`第 ${this.state.round} 輪九州比武大會開始！隨機分組，半決賽與決賽可重選隨行武將；不會戰死，血量與體力不會自動回復。`;
    this.ui.log('🏆 '+announce,'turn');
    const pairs=Array.from({length:bracket.length/2},(_,i)=>`${LORDS[bracket[i*2]!.id].name} vs ${bracket[i*2+1]?LORDS[bracket[i*2+1]!.id].name:'輪空'}`);
    if (this.state.lords[this.state.player].alive && !this.autoPlay) await this.dialog.message('九州比武大會',announce+'\n\n'+pairs.join('\n'),'🏆');
    let champion:Lord|null;
    if (lords.length===2) champion=await this.tournamentMatch(bracket[0]!,bracket[1]!,'決賽');
    else {
      const finalists:(Lord|null)[]=[];
      for (let i=0;i<bracket.length;i+=2) {
        const a=bracket[i],b=bracket[i+1];
        finalists.push(a&&b?await this.tournamentMatch(a,b,'半決賽'):a??b);
      }
      const [a,b]=finalists;
      champion=a&&b?await this.tournamentMatch(a,b,'決賽'):a??b??null;
    }
    if (!champion) {this.ui.log('九州比武大會無人完成參賽，本屆沒有冠軍。','info');return;}
    const prize=grantTournamentPrize(this.state,champion);
    const result=`${LORDS[champion.id].name}奪得冠軍，獲得天階上品獎勵「${prize.label}」！`;
    this.ui.log('🏆 '+result,champion.id===this.state.player?'good':'info');this.refresh();
    if (this.state.lords[this.state.player].alive&&!this.autoPlay) await this.dialog.message('九州比武大會・冠軍',result+'\n\n'+prize.sub,'🏆');
  }

  private async tournamentGeneral(lord:Lord,stage:string):Promise<General|null> {
    const pool=freeGenerals(this.state,lord.id).filter(canDuel);
    if (!pool.length) return null;
    if (!this.human(lord)) return [...pool].sort((a,b)=>power(b)*(b.hp/maxHp(b))-power(a)*(a.hp/maxHp(a)))[0];
    return this.dialog.choose(`九州比武大會・${stage}：派誰出戰？`,'可與上一場派同一人或換人。血量與體力沿用現況；不會戰死，取消視為棄權。',pool.map(g=>({label:g.name,sub:`${generalInfo(g)}${pv(g)}`,value:g})),'棄權');
  }

  private async tournamentMatch(a:Lord,b:Lord,stage:string):Promise<Lord|null> {
    await this.waitForDispatch();
    const ag=await this.tournamentGeneral(a,stage),bg=await this.tournamentGeneral(b,stage);
    if (!ag||!bg) {
      const winner=ag?a:bg?b:null;
      this.ui.log(`🏆 ${stage}：${winner?LORDS[winner.id].name+'因對手無人應戰或棄權而晉級':'雙方無人應戰或棄權'}。`,'info');
      return winner;
    }
    const duel=new Duel(a,ag,b,bg,true);
    const involved=this.human(a)||this.human(b);
    if (involved) {
      const side:Side=this.human(a)?'a':'b',lord=this.human(a)?a:b;
      await this.battleView.runDuel(duel,side,()=>this.speed,s=>this.useItemInDuel(duel,s,lord),s=>this.aiBattleItem(duel,s,s==='a'?a:b),`🏆 九州比武大會・${stage}`);
    } else {
      while (!duel.over) {
        const ai=this.aiBattleItem(duel,'a',a);if(ai)duel.afterItem(ai);
        const bi=duel.over?null:this.aiBattleItem(duel,'b',b);if(bi)duel.afterItem(bi);
        if(!duel.over)duel.round({a:ai?'none':duel.aiAction('a'),b:bi?'none':duel.aiAction('b')});
      }
      duel.finish();
    }
    const side=tournamentWinner(duel),winner=side==='a'?a:b;
    this.ui.log(`🏆 ${stage}：${ag.name} vs ${bg.name}，${LORDS[winner.id].name}晉級${duel.draw?'（平手依剩餘血量比例裁定，同率抽籤）':''}。`,'info');
    this.refresh();return winner;
  }

  private async runAuction() {
    const lot = auctionLot(this.state);
    const bids: { id: LordId; bid: number }[] = [];
    for (const l of aliveLords(this.state)) bids.push({ id: l.id, bid: this.human(l) ? await this.playerBid(l, lot) : aiBid(this.state, l, lot) });
    const r = resolveAuction(this.state, lot, bids);
    const lines = r.bids.map((b) => `${LORDS[b.id].name}：${b.bid ? fmtStones(b.bid) : '放棄'}`);
    const result = r.winner ? `${LORDS[r.winner].name}以 ${fmtStones(r.price)} 得標「${lot.label}」！` : `無人出價，「${lot.label}」流標。`;
    this.ui.log(`🔨 ${result}`, r.winner === this.state.player ? 'good' : 'info');
    this.refresh();
    if (this.state.lords[this.state.player].alive && !this.autoPlay) await this.dialog.message('拍賣結果', `${result}\n\n各家密封出價：\n${lines.join('\n')}`, '🔨');
  }

  /** 玩家密封出價；回傳 0 表示放棄 */
  private playerBid(lord: Lord, lot: Offer): Promise<number> {
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
          <p class="dialog-text">四位主公各自秘密出價，價高者得，得標者支付自己的出價。<br>持有靈石：${fmtStones(lord.stones)}</p>
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

  /** 黃巾賊窩：繳買路錢或損兵 */
  private async banditEvent(lord: Lord) {
    const cost = banditToll(this.state);
    const loss = Math.round(lord.soldiers * 0.1);
    let payIt: boolean;
    if (this.human(lord)) {
      const r = await this.dialog.choose(
        '🏴 黃巾賊窩',
        `一群黃巾餘黨攔路，要求買路錢 ${fmtStones(cost)}。`,
        [
          { label: '💰 繳買路錢', sub: fmtStones(cost), value: 'pay', disabled: lord.stones < cost, reason: '靈石不足' },
          { label: '⚔️ 硬闖', sub: `折損一成士兵（約 ${loss} 人）`, value: 'fight' },
        ],
        null,
        '🏴',
      );
      payIt = r === 'pay';
    } else payIt = lord.stones > cost * 3;
    if (payIt) {
      lord.stones -= cost;
      this.ui.log(`${LORDS[lord.id].name}向黃巾賊繳了買路錢 ${fmtStones(cost)}。`, this.human(lord) ? 'bad' : 'ai');
    } else {
      lord.soldiers -= loss;
      this.ui.log(`${LORDS[lord.id].name}硬闖賊窩，折損 ${loss} 名士兵。`, this.human(lord) ? 'bad' : 'ai');
    }
    this.refresh();
  }

  // ───────────────────────── 宗門與突破 ─────────────────────────

  /** 要走到自己的城池，才能調度宗門隨行武將 */
  private canSwapSect(lord: Lord): boolean {
    const t = this.state.tiles[lord.position];
    return t.kind === 'city' && this.state.cities[t.cityId!].owner === lord.id;
  }

  /** 玩家回合內才能突破、閉關 */
  private canManage(): boolean {
    const cur = currentLord(this.state);
    return !this.state.over && !this.garrisonTask && cur.isPlayer && this.phase === 'preroll';
  }

  private async manageSect(lord: Lord) {
    for (;;) {
      const allFree = freeGenerals(this.state, lord.id);
      const party = allFree.filter((g) => !g.isLord && !fx(g).fixedParty && !g.ghostSourceId);
      const sect = sectGenerals(this.state, lord.id);
      const choices: Choice<General>[] = [
        ...party.map((g) => ({ label: `▼ ${g.name}`, icon: portraitUrl(g), sub: `隨行 → 留守宗門｜${REALMS[g.realm]}・戰力 ${power(g)}${pv(g)}`, value: g, color: '#c99a2e' })),
        ...sect.map((g) => ({
          label: `▲ ${g.name}`, icon: portraitUrl(g),
          sub: `宗門 → 隨行｜${REALMS[g.realm]}・戰力 ${power(g)}${pv(g)}`,
          value: g,
          disabled: allFree.length >= PARTY_LIMIT,
          reason: `隨行已滿 ${PARTY_LIMIT} 人`,
          color: '#5aa8ec',
        })),
      ];
      const g = await this.dialog.choose(`🏛️ 宗門調度（隨行 ${allFree.length}/${PARTY_LIMIT}）`, '隨行武將最多十名，其餘留在宗門。點選武將即可切換。', choices, '完成');
      if (!g) break;
      g.status = g.status === 'free' ? 'sect' : 'free';
    }
    this.refresh();
  }

  /** 從武將名冊發起突破：低階機率突破，金丹以上渡雷劫 */
  private async breakthroughFlow(g: General) {
    const can = canAttemptBreak(g, this.state.round);
    if (!can.ok) {
      this.ui.toast(can.reason);
      return;
    }
    const sprite = this.sprites.get(this.state.player)!;
    if (!needsTribulation(g)) {
      const chance = Math.round(breakChance(g) * 100);
      const ok = await this.dialog.confirm(
        `${g.name}・突破${REALMS[g.realm + 1]}`,
        `成功率 <b>${chance}%</b>${g.foundation ? '（已服築基丹）' : ''}${g.demon ? '\n⚠️ 心魔纏身，成功率大降' : ''}\n失敗會損失 <b>20%</b> 修為，並氣血翻湧：扣 <b>${Math.round(BREAK_FAIL_HP[g.realm] * 100)}%</b> 血量（境界越高扣得越多）。`,
        '突破',
        '再等等',
        '🧘',
      );
      if (!ok) return;
      const failHp = BREAK_FAIL_HP[g.realm];
      const success = attemptBreak(g, this.state.round);
      if (success) this.world.beamEffect(sprite.group.position);
      const msg = success ? `✦ ${g.name}突破成功，晉入【${REALMS[g.realm]}】！` : `${g.name}突破失敗，修為 −20%，血量 −${Math.round(failHp * 100)}%……`;
      this.ui.log(msg, success ? 'good' : 'bad');
      await this.dialog.message(success ? '突破成功' : '突破失敗', msg, success ? '✨' : '💢');
      this.refresh();
      return;
    }
    const rg = boltRange(g);
    const ok = await this.dialog.confirm(
      `${g.name}・渡劫晉入${REALMS[g.realm + 1]}`,
      `天降 <b>${rg.count}</b> 道天雷：\n每道傷害範圍 <b>${rg.min} ～ ${rg.max}</b>（平均 ${rg.avg}）\n全部共 <b>${rg.totalMin} ～ ${rg.totalMax}</b>，平均 <b>${rg.totalAvg}</b>\n目前血量 ${g.hp} / ${maxHp(g)}${g.ward ? `・護法陣減傷 ${Math.round(g.ward * 100)}%` : ''}${g.demon ? '\n⚠️ 心魔纏身，雷劫威力倍增' : ''}\n\n血量歸零則一半機率身死道消、一半機率兵解重修（跌回凡人）。\n可先用大還丹補滿，或用避雷陣、五行防禦陣護法。`,
      '渡劫',
      '再準備',
      '⚡',
    );
    if (!ok) return;
    const cityId = g.cityId;
    const startHp = g.hp;
    const startMax = maxHp(g);
    const r = await tribulation(g, () => this.protectDeath(g));
    if (r.fate === 'death' && cityId) {
      this.state.cities[cityId].garrisonGenerals = this.state.cities[cityId].garrisonGenerals.filter((id) => id !== g.id);
      if (abandonIfEmpty(this.state, cityId)) this.ui.log(`🏚️ ${this.state.cities[cityId].name}失去所有駐將，成為空城，守軍離去。`, 'bad');
    }
    await this.battleView.showTribulation(g.name, r, startHp, startMax, () => this.speed);
    if (r.success) this.world.beamEffect(sprite.group.position, 0xbfe0ff);
    const msg = r.success
      ? `⚡ ${g.name}渡過 ${r.bolts.length} 道天雷，晉入【${REALMS[g.realm]}】！`
      : r.fate === 'death'
        ? `⚡ ${g.name}渡劫失敗，身死道消……`
        : r.fate === 'saved' ? `⚡ ${g.name}渡劫失敗，保命效果令其滿血復生，境界保留。` : `⚡ ${g.name}渡劫失敗，兵解重修，跌回凡人。`;
    this.ui.log(msg, r.success ? 'good' : 'bad');
    this.world.syncCities(this.state);
    this.refresh();
    if (r.success && g.isLord && await this.checkEnd()) return;
    if (r.fate === 'death' && g.isLord) await this.onBankrupt(this.state.lords[this.state.player], `${g.name}渡劫失敗身死道消，主公陣亡`);
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
    if (this.phase === 'pickTile') {
      this.tileResolver?.(tile);
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
    text += `<br><span class="tt-links">通往：${t.links.map((n) => this.state.tiles[n].name).join('、')}</span>`;
    if (this.phase === 'pickTile') text += '<br><span class="tt-move">▶ 點擊傳送至此</span>';
    this.ui.showTooltip(text, this.mouse.x, this.mouse.y);
  }

  // ───────────────────────── 畫面 ─────────────────────────

  private tileInfoHtml(index: number): string {
    const t = this.state.tiles[index];
    const here = LORD_IDS.filter((id) => this.state.lords[id].alive && this.state.lords[id].position === index);
    const fork = t.links.length >= 3 ? `<div class="ip-row">➜ 岔路箭頭：往${this.state.tiles[this.state.forkDirections[index]].name}</div>` : '';
    const people = here.length ? `<div class="ip-row">此地：${here.map((id) => `<span style="color:${LORDS[id].css}">${LORDS[id].name}</span><small>（${this.facingText(this.state.lords[id])}）</small>`).join('、')}</div>` : '';
    const linkText = `${t.links.map((n) => `${TILE_INFO[this.state.tiles[n].kind].icon}${this.state.tiles[n].name}`).join('、')}${t.links.length >= 3 ? '（岔路口）' : ''}`;
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
        <tr><td>駐將</td><td>${gens.length ? gens.map((g) => `${g.name}（${REALMS[g.realm]}・戰力 ${power(g)}）`).join('<br>') : '無'}</td></tr>
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
    const player = this.state.lords[this.state.player];
    const current = currentLord(this.state);
    const myTurn = current.id === player.id && player.alive;
    const buttons: ActionButton[] = [];
    let hint: string;
    let fullHint = '';
    const ready = generalsOf(this.state, player.id).filter((g) => canAttemptBreak(g, this.state.round).ok).length;
    const roster: ActionButton = {
      label: '👥 武將',
      sub: ready ? `✨ ${ready} 人可突破` : undefined,
      highlight: ready > 0,
      onClick: () => void this.generalsView.open(this.state, player).then(() => this.refresh()),
    };

    if (this.state.over) hint = '天下已定';
    else if (this.autoPlay && player.alive) {
      hint = myTurn ? '🤖 電腦託管中，正在代為行動……（可按上方「託管中」取消）' : `${LORDS[current.id].name}行動中……（電腦託管中）`;
      buttons.push(roster);
    }
    else if (!player.alive) hint = `觀戰中・${LORDS[current.id].name}行動中……`;
    else if (!myTurn) {
      hint = `${LORDS[current.id].name}行動中……`;
      buttons.push(roster);
    } else if (this.phase === 'preroll') {
      hint = '擲骰前可先整備；擲完骰、處理完事件，回合自動結束';
      fullHint = '擲骰前可先使用物品、合成材料、徵兵或整備武將（宗門需站在自己的城池；調度駐軍可遠端付費開啟）；擲完骰、處理完落地事件，回合就會自動結束';
      buttons.push(
        { label: '✨ 方外神通', sub: '製物・起死回生・冤魂召喚', disabled: !abilityUsers(this.state,player).length, onClick: () => void this.generalAbilities(player) },
        { label: '🎒 使用物品', sub: `${player.items.length} 件`, onClick: () => void this.useItemPreroll(player) },
        { label: '⛏️ 材料合成', sub: `${MATERIAL_GROUPS.reduce((n, k) => n + player.materials[k].reduce((a, b) => a + b, 0), 0)} 顆`, onClick: () => void this.materialsFlow(player) },
        { label: '⚔️ 徵兵', sub: `${(recruitCost(player.id, 100) / 100).toFixed(2).replace(/\.?0+$/, '')}/名`, onClick: () => void this.recruitSoldiers(player) },
        { label: '🏯 調度駐軍', sub: '依距離收費・一次付費可操作到關閉', disabled: !citiesOf(this.state, player.id).length, onClick: () => void this.openGarrison() },
        { label: '🏛️ 宗門', sub: this.canSwapSect(player) ? `隨行 ${freeGenerals(this.state, player.id).length}/${PARTY_LIMIT}` : '需在自己的城池', disabled: !this.canSwapSect(player), onClick: () => void this.manageSect(player) },
        roster,
      );
    } else if (this.phase === 'pickTile') {
      hint = '傳送陣：點選地圖上任一格（右鍵或 Esc 取消）';
      buttons.push({ label: '✖ 取消', onClick: () => this.tileResolver?.(null) });
    } else hint = '……';
    this.ui.renderActions(buttons, hint, fullHint);
    // 擲骰：右側偏下的大圓鈕
    if (!this.state.over && player.alive && myTurn && !this.autoPlay && this.phase === 'preroll') this.ui.showRoll(() => this.rollResolver?.({ type: 'roll' }));
    else this.ui.hideRoll();

    this.ui.renderInfo(this.tileInfoHtml(this.hoverTile ?? player.position));
    this.hoverTile = null;
  }
}

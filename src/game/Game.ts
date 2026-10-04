import * as THREE from 'three';
import type { City, CraftStat, General, GameState, Lord, LordId } from './types';
import { DEFAULT_ROUNDS, GARRISON_LIMIT, abandonIfEmpty, deployable, PARTY_LIMIT, citiesOf, garrisonOf, createGameState, currentLord, freeGenerals, generalsOf, joinLord, killGeneral, nextUid, sectGenerals } from './GameState';
import { advance, aliveLords, startTurn } from './TurnManager';
import { fmtProsperity, fmtStones } from './Currency';
import { SceneManager } from '../scene/SceneManager';
import { World } from '../world/World';
import { CharacterSprite } from '../character/CharacterSprite';
import { LORDS, LORD_IDS, originCss, ownerCss, ownerName } from '../faction/Faction';
import { GameUI, type ActionButton } from '../ui/GameUI';
import { Dialog, type Choice } from '../ui/Dialog';
import { GeneralsView } from '../ui/GeneralsView';
import { BattleView } from '../ui/BattleView';
import { openShop } from '../ui/ShopView';
import { HelpView } from '../ui/HelpView';
import { RankView } from '../ui/RankView';
import { showEndScreen, showStartScreen } from '../ui/Screens';
import { REALMS } from '../data/generals';
import { fxText, passiveOf } from '../data/passives';
import { ITEM_DEFS, STAT_NAMES, makeBeast, makeEquipment, makeItem, makeTechnique } from '../data/items';
import { TILE_INFO } from '../data/board';
import { terrainEffects, terrainOf } from '../data/terrain';
import { GARRISON_STRENGTH, MIN_GARRISON, RANK_METRICS, canOccupy, cityIncome, cityIncomeOf, cityRanks, cityToll, citySaleValue, eliminate, recruitCost, garrisonPower, occupy, occupyCost, pay, sellCity, sellGeneral, toll } from '../systems/CitySystem';
import { generalSaleValue, BREAK_FAIL_HP, attack, attemptBreak, battleExp, boltCount, boltDamage, breakChance, canAttemptBreak, craft, maxHp, needsTribulation, power, qiDeviation, tribulation } from '../systems/GeneralSystem';
import { BATTLE_NAMES, CONTEST_SOLDIERS, Duel, SIEGE_START_ROUND, SURRENDER_HP, WOUNDED_HP, canDuel, craftContest, siege, siegeAllowed, siegeAttack, type BattleKind, type DuelEvent, type Side } from '../systems/BattleSystem';
import { itemChoices } from '../ui/ItemUI';
import { canUse, def, nameOf, useInDuel, usableIn, usePreroll, type PrerollTarget } from '../systems/ItemSystem';
import { buy, makeStock, type Offer, type ShopKind } from '../systems/ShopSystem';
import { REALM_LEVELS, REALM_MAX_PARTY, REALM_MIN_PARTY, deathChance, dispatch } from '../systems/RealmSystem';
import { aiDefender, aiEnemyCity, aiManageSect, aiOccupy, aiPreroll, aiRealm, aiShop, defenderPool } from '../systems/AISystem';
import { rollRoadEvent } from '../systems/RoadEvents';
import { EVENT_INTERVAL, aiBid, applyWorldEvent, auctionLot, banditToll, pickWorldEvent, resolveAuction, syncWorldMods, tickWorldEvents } from '../systems/EventSystem';

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
  private state!: GameState;
  private sprites = new Map<LordId, CharacterSprite>();
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
    this.sm.renderer.domElement.addEventListener('contextmenu', () => this.tileResolver?.(null));
    this.ui.onSpeed = (s) => (this.sm.timeScale = s);

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
    for (const [defId, d] of Object.entries(ITEM_DEFS)) for (let t = 0; t < d.price.length; t++) lord.items.push(makeItem(nextUid(this.state, 'i'), defId, t));
    for (let tier = 0; tier < 12; tier++) {
      lord.gear.push(makeEquipment(nextUid(this.state, 'e'), 'weapon', tier), makeEquipment(nextUid(this.state, 'e'), 'armor', tier));
      lord.scrolls.push(makeTechnique(nextUid(this.state, 't'), tier));
    }
    lord.beast = makeBeast(nextUid(this.state, 'b'), 11);
    for (const g of generalsOf(this.state, lord.id)) {
      g.hp = maxHp(g);
      g.stamina = 100;
    }
    this.ui.log('🧪 測試：獲得 100 極品靈石、10 萬士兵，以及所有丹藥、陣法、符籙、法器（各階）、各階神器寶衣與功法、天階靈獸。', 'good');
    this.ui.toast('🧪 測試：已獲得大量靈石與所有物品');
    this.refresh();
  }

  /** 切換電腦託管：開啟後玩家的回合由電腦代打 */
  private toggleAuto() {
    this.autoPlay = !this.autoPlay;
    this.ui.auto = this.autoPlay;
    this.ui.log(this.autoPlay ? '🤖 開啟電腦託管，由電腦代為行動。' : '🤖 取消託管，下一個回合起由你操作。', 'turn');
    const player = this.state.lords[this.state.player];
    // 正在等玩家操作：由電腦接手當前回合
    if (this.autoPlay && player.alive && currentLord(this.state).id === player.id) {
      if (this.phase === 'preroll') {
        for (const msg of aiPreroll(this.state, player)) this.ui.log(`${LORDS[player.id].name}：${msg}`, 'ai');
        this.world.syncCities(this.state);
        this.rollResolver?.({ type: 'roll' });
      }
    }
    this.refresh();
  }

  private get speed() {
    return this.ui.speed;
  }

  private wait(ms: number) {
    return sleep(ms / this.speed);
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
    this.ui.log(`天地靈氣復甦，${LORDS[player].name}起兵逐鹿天下！${maxRounds === null ? '（無盡模式：直到只剩一位主公沒破產）' : `（${maxRounds} 輪後比總資產）`}`, 'turn');
    this.ui.log('擲骰沿道路前進，遇到岔路隨機轉向：停在無主城池才能派將佔領，踏入他人城池須繳過路費或開戰。', 'info');
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
      const lord = currentLord(this.state);
      if (lord.alive) {
        if (!this.human(lord)) this.ui.beginReport();
        await this.takeTurn(lord);
        if (!this.human(lord)) await this.showTurnReport(lord, token);
      }
      if (token !== this.token || this.state.over) return;
      if (await this.checkEnd()) return;
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
    await this.ui.showReport(`${LORDS[lord.id].name}・第 ${this.state.round} 輪行動結果`, LORDS[lord.id].css, lines, Math.min(6000, 2000 + lines.length * 600) / this.speed);
  }

  private async checkEnd(): Promise<boolean> {
    const alive = aliveLords(this.state);
    if (alive.length <= 1) {
      await this.endGame(alive.length ? `${LORDS[alive[0].id].name}令群雄破產，一統天下！` : '群雄盡皆破產。');
      return true;
    }
    return false;
  }

  private async endGame(reason: string) {
    this.state.over = true;
    this.phase = 'idle';
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

    const report = startTurn(this.state, lord);
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

    if (lord.stunned > 0) {
      lord.stunned--;
      this.ui.log(`${name}受迷魂陣所困，原地停留。`, 'bad');
      this.ui.toast(`${name}受迷魂陣所困`);
      await this.wait(900);
      return;
    }
    if (this.human(lord)) await this.playerTurn(lord);
    else await this.aiTurn(lord);
  }

  private async playerTurn(lord: Lord) {
    this.phase = 'preroll';
    this.refresh();
    this.ui.toast(`第 ${this.state.round} 輪・你的回合`);
    await this.announceBreakthroughs(lord);
    const choice = await new Promise<RollChoice>((r) => (this.rollResolver = r));
    this.rollResolver = null;
    this.phase = 'busy';
    this.refresh();
    if (choice.type === 'teleport') await this.teleport(lord, choice.tile);
    else await this.moveLord(lord, await this.rollDice(lord));
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
    const logs = aiPreroll(this.state, lord);
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
    await this.moveLord(lord, await this.rollDice(lord));
    if (lord.alive && this.canSwapSect(lord)) for (const msg of aiManageSect(this.state, lord)) this.ui.log(`${LORDS[lord.id].name}：${msg}`, 'ai');
    await this.wait(300);
  }

  private async rollDice(lord: Lord): Promise<number> {
    const values = lord.fixedDice ? [lord.fixedDice] : Array.from({ length: lord.doubleDice ? 2 : 1 }, () => 1 + Math.floor(Math.random() * 6));
    await this.ui.rollDice(values, lord.bonusSteps);
    const dice = values.reduce((a, b) => a + b, 0);
    const sum = dice + lord.bonusSteps;
    this.ui.log(`${LORDS[lord.id].name}擲出 ${dice} 點${lord.bonusSteps ? `，遁地梭加成 +${lord.bonusSteps}，共走 ${sum} 步` : ''}。`, this.human(lord) ? 'info' : 'ai');
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
    // 移動方向固定：不走回頭路（連回合之間也是），只有開局與傳送後的方向是隨機的
    let prev: number | null = lord.lastTile;
    for (let i = 1; i <= steps; i++) {
      const here = lord.position;
      const links = this.state.tiles[here].links;
      let options = links.filter((n) => n !== prev);
      if (!options.length) options = [...links];
      const next = this.randomDirection(options);
      const from = sprite.group.position.clone();
      const to = this.slotPosition(lord.id, next);
      await sprite.moveAlong([from, to], this.sm.animator, (p) => this.sm.cameraController.follow(p));
      prev = here;
      lord.lastTile = here;
      lord.position = next;
      this.refresh();
      if (!lord.alive) return;
    }
    if (!this.human(lord)) {
      this.ui.restartReport();
      this.ui.log(`${LORDS[lord.id].name}停在「${this.state.tiles[lord.position].name}」。`, 'ai');
    }
    await this.land(lord, lord.position);
  }

  /** 岔路口：隨機走其中一條路 */
  private randomDirection(options: number[]): number {
    return options[Math.floor(Math.random() * options.length)];
  }

  private async teleport(lord: Lord, tile: number) {
    const sprite = this.sprites.get(lord.id)!;
    this.world.beamEffect(sprite.group.position, 0xc9a0ff);
    await this.wait(500);
    lord.position = tile;
    lord.lastTile = null;
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
    const fee = cityToll(this.state, city);
    if (lord.tollFree) {
      this.ui.log(`${name}高舉免戰牌，免繳${city.name}過路費。`, this.human(lord) ? 'good' : 'ai');
      this.ui.toast('免戰牌生效，免繳過路費');
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
          label: `🧑 ${g.name}（${REALMS[g.realm]}）`,
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

  private async playerOccupy(lord: Lord, city: City) {
    const inc = cityIncome(city);
    const free = deployable(this.state, lord.id);
    const choices: Choice<string>[] = free.map((g) => ({ label: g.name, sub: `${REALMS[g.realm]}・戰力 ${power(g)}${pv(g)}`, value: g.id, color: originCss(g.origin) }));
    const gids = await this.dialog.pickMany(
      `抵達${city.name}・是否佔領？`,
      `佔領費 ${fmtStones(occupyCost(city))}（持有 ${fmtStones(lord.stones)}）\n地貌 ${terrainOf(city).icon}${terrainOf(city).name}：${terrainEffects(terrainOf(city))}\n繁榮度 ${fmtProsperity(city.prosperity)}｜每回合收入 ${fmtStones(inc.stones)}、士兵 +${inc.soldiers}｜過路費 ${fmtStones(toll(city, citiesOf(this.state, lord.id).length + 1))}（佔領後）\n請選擇駐守武將（1–${GARRISON_LIMIT} 人，駐將越多守城越強）：`,
      choices,
      1,
      Math.min(GARRISON_LIMIT, free.length),
      '佔領',
    );
    if (!gids) return;
    const soldiers = await this.dialog.slider(
      `派多少士兵駐守${city.name}？`,
      `目前隨行士兵 ${lord.soldiers}。一名守軍約等於十名隨行士兵，守軍越多越難攻破；留在身邊的士兵可用於攻城。`,
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
    if (!soldiers) return;
    occupy(this.state, lord, city, gids, soldiers, occupyCost(city));
    this.world.syncCities(this.state);
    this.world.captureEffect(city.tile, LORDS[lord.id].color);
    this.ui.log(`支付 ${fmtStones(occupyCost(city))}，派${gids.map((id) => this.state.generals[id].name).join('、')}率 ${soldiers} 兵佔領${city.name}！`, 'good');
    this.ui.toast(`佔領${city.name}！`);
    this.refresh();
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
      { label: '⚔️ 擂台戰', sub: `雙方各派一將單挑，能量滿可施放功法。血量低於 ${Math.round(WOUNDED_HP * 100)}% 減傷三成，低於 ${Math.round(SURRENDER_HP * 100)}% 認輸；被一擊打到歸零則戰死`, value: 'duel', disabled: !fighters.length, reason: free.length ? noDuel : noGen },
      ...CRAFTS.map((s) => ({
        label: `🔥 ${STAT_NAMES[s]}比試`,
        sub: `比拼${STAT_NAMES[s]}，我方最高 ${Math.max(0, ...free.map((g) => craft(g, s)))}｜雙方各出 ${CONTEST_SOLDIERS} 兵，敗方全滅`,
        value: s as BattleKind,
        disabled: !free.length || lord.soldiers < CONTEST_SOLDIERS,
        reason: !free.length ? noGen : `需 ${CONTEST_SOLDIERS} 兵維持秩序`,
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
      `過路費 ${fmtStones(fee)}｜駐將 ${guards.length ? guards.map((g) => `${g.name}（${REALMS[g.realm]}・戰力 ${power(g)}）`).join('、') : '無'}・守軍 ${city.garrisonSoldiers}\n選擇繳費，或發起戰鬥。<b>戰鬥失敗將付雙倍過路費 ${fmtStones(fee * 2)}。</b>${fee * 2 > lord.stones ? '\n<b style="color:#b33a2a">⚠️ 雙倍過路費超過你持有的靈石，戰敗將先變賣城池，再不夠則隨行武將離開抵債，只剩主公一人時破產！</b>' : ''}`,
      choices,
      null,
      '⚔️',
    );
    return { kind: kind ?? 'pay', generals: [] };
  }

  // ───────────────────────── 戰鬥 ─────────────────────────

  /** 回傳攻方是否獲勝；玩家中途取消（還沒開打）回傳 null，由呼叫端回到選擇介面 */
  private async fight(attacker: Lord, city: City, kind: BattleKind, preset: General[]): Promise<boolean | null> {
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

    // 守方武將
    let defGen: General | null;
    if (this.human(defender)) {
      const pool = defenderPool(this.state, city).filter((g) => kind !== 'duel' || canDuel(g));
      defGen = pool.length ? ((await this.pickGeneral(`${LORDS[attacker.id].name}的${atkGen.name}挑戰${city.name}【${BATTLE_NAMES[kind]}】，派誰應戰？`, pool, kind, false)) ?? pool[0]) : null;
    } else {
      defGen = aiDefender(this.state, city, kind);
    }
    if (!defGen) {
      this.ui.log(`${city.name}無人應戰，${atkGen.name}不戰而勝。`, 'info');
      return true;
    }

    if (kind === 'duel') {
      const duel = new Duel(attacker, atkGen, defender, defGen);
      let winner: Side;
      if (involved) {
        const playerSide: Side = this.human(attacker) ? 'a' : 'b';
        const playerLord = this.human(attacker) ? attacker : defender;
        winner = await this.battleView.runDuel(duel, playerSide, () => this.speed, (side) => this.useItemInDuel(duel, side, playerLord));
      } else winner = duel.autoResolve();
      const w = winner === 'a' ? atkGen : defGen;
      const l = winner === 'a' ? defGen : atkGen;
      const dead = duel.slainGeneral();
      const gain = battleExp(w, dead ? null : l);
      const verdict = dead ? `（${l.name}戰死）` : duel.surrendered ? `（${l.name}認輸）` : '';
      this.ui.log(`擂台戰：${atkGen.name} vs ${defGen.name}，${w.name}勝出${verdict}，生死歷練修為 +${gain}。`, involved ? 'info' : 'ai');
      if (dead) await this.onGeneralSlain(dead, involved);
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

  /** 武將在擂台上被當場擊殺 */
  private async onGeneralSlain(g: General, involved: boolean) {
    const owner = g.owner;
    const abandoned = killGeneral(this.state, g);
    this.world.syncCities(this.state);
    if (abandoned) this.ui.log(`🏚️ ${this.state.cities[abandoned].name}失去所有駐將，成為空城，守軍離去。`, 'bad');
    this.ui.log(`💀 ${g.name}戰死擂台，從此除名！`, owner === this.state.player ? 'bad' : involved ? 'good' : 'ai');
    if (involved) this.ui.toast(`${g.name}戰死擂台`);
    this.refresh();
    // 主公戰死，等於敗北
    if (g.isLord && owner) await this.onBankrupt(this.state.lords[owner], `${g.name}戰死擂台，主公陣亡`);
  }

  private async runSiege(attacker: Lord, city: City, preset: General[]): Promise<boolean | null> {
    const defender = this.state.lords[city.owner as LordId];
    let team = preset;
    let sentSoldiers = attacker.soldiers;
    if (this.human(attacker)) {
      const pool = freeGenerals(this.state, attacker.id);
      const picked = await this.dialog.pickMany(
        `攻打${city.name}・選擇出征武將`,
        `最多派遣三名武將；選好武將後，可自行決定出兵數量。\n戰敗則出征的士兵全滅；勝方也會折損，雙方越接近折損越多。\n一名守軍約等於十名隨行士兵；武將武力越高，統率加成越大。守方約 ${garrisonPower(this.state, city)}。`,
        pool.map((g) => ({ label: g.name, sub: `${REALMS[g.realm]}・武力 ${attack(g)}・戰力 ${power(g)}・血量 ${g.hp}/${maxHp(g)}${pv(g)}`, value: g })),
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
      if (!sent) return null;
      sentSoldiers = sent;
    }
    const oldGenerals = garrisonOf(this.state, city);
    const r = siege(this.state, attacker, team, city, sentSoldiers);
    const involved = this.human(attacker) || this.human(defender);
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
    const weakest = [...team].filter((x) => !x.isLord).sort((a, b) => power(a) - power(b))[0] ?? deployable(this.state, attacker.id)[0];
    let gids = weakest ? [weakest.id] : [];
    let soldiers = Math.min(attacker.soldiers, Math.max(MIN_GARRISON, Math.round(attacker.soldiers * 0.4)));
    if (this.human(attacker)) {
      const cand = deployable(this.state, attacker.id);
      if (cand.length) {
        const picked = await this.dialog.pickMany(`攻下${city.name}！派誰駐守？`, `最多 ${GARRISON_LIMIT} 人，駐將越多守城越強。（主公本人不能駐守）`, cand.map((x) => ({ label: x.name, sub: `戰力 ${power(x)}${pv(x)}`, value: x.id })), 1, Math.min(GARRISON_LIMIT, cand.length), '駐守');
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
    this.ui.log(`${LORDS[attacker.id].name}奪下${city.name}，由${gids.length ? gids.map((id) => this.state.generals[id].name).join('、') : '（無駐將）'}駐守。`, this.human(attacker) ? 'good' : this.human(defender) ? 'bad' : 'ai');
    this.refresh();
    return true;
  }

  private pickGeneral(title: string, pool: General[], kind: BattleKind, cancelable = true): Promise<General | null> {
    const risky = (g: General) => (kind === 'duel' && g.isLord ? '・⚠️主公戰死即敗北' : '') + (kind === 'duel' && g.hp < maxHp(g) * WOUNDED_HP ? '・⚠️血量偏低，易戰死' : '');
    const stat = kind === 'duel' || kind === 'siege' ? null : (kind as CraftStat);
    return this.dialog.choose(
      title,
      '',
      pool.map((g) => ({
        label: g.name,
        sub: stat ? `${STAT_NAMES[stat]} ${craft(g, stat)}・${REALMS[g.realm]}${pv(g)}` : `${REALMS[g.realm]}・戰力 ${power(g)}・血量 ${g.hp}/${maxHp(g)}${risky(g)}${g.technique ? `・${g.technique.name}` : ''}${pv(g)}`,
        value: g,
        color: originCss(g.origin),
      })),
      cancelable ? '取消' : null,
    );
  }

  /** 戰鬥中使用物品：選物品 → 選使用的武將 → 生效 */
  private async useItemInDuel(duel: Duel, side: Side, lord: Lord): Promise<DuelEvent[] | null> {
    const items = lord.items.filter((i) => usableIn(i, 'battle'));
    if (!items.length) {
      this.ui.toast('沒有可在戰鬥中使用的物品');
      return null;
    }
    const item = await this.dialog.choose('使用物品', '', itemChoices(items));
    if (!item) return null;
    const fighter = duel.fighter(side).general;
    const users = [fighter, ...freeGenerals(this.state, lord.id).filter((g) => g.id !== fighter.id)];
    const user = await this.dialog.choose(
      `由誰使用${nameOf(item)}？`,
      '使用物品會消耗該武將的體力，能力值須達到門檻。',
      users.map((g) => {
        const c = canUse(item, g);
        return { label: g.name, sub: `體力 ${g.stamina}・${STAT_NAMES[def(item).stat]} ${craft(g, def(item).stat)}${pv(g)}`, value: g, disabled: !c.ok, reason: c.reason };
      }),
    );
    if (!user) return null;
    return useInDuel(duel, side, lord, item, user);
  }

  // ───────────────────────── 秘境、商店、驛道 ─────────────────────────

  private async landRealm(lord: Lord, realmName: string) {
    const free = deployable(this.state, lord.id);
    if (!free.length) {
      if (this.human(lord)) this.ui.toast(`探索${realmName}需要至少一名隨行武將`);
      return;
    }
    let team: General[] | null;
    let level = 0;
    if (this.human(lord)) {
      const best = [...free].sort((x, y) => power(y) - power(x)).slice(0, 3);
      const picked = await this.dialog.choose(
        `🌀 ${realmName}・選擇難度`,
        `難度以境界命名：越高階歷時越久、隕落率越高，寶物品階與修為也越多。
接著選擇派遣人數（${REALM_MIN_PARTY}–${REALM_MAX_PARTY} 人）：人越多越安全，四人以上多得一份寶物。`,
        REALM_LEVELS.map((l, i) => ({
          label: `${l.icon} ${l.name}秘境`,
          sub: `歷時 ${l.turns} 回合・隕落率 ×${l.risk}・寶物品階 ${l.tier >= 0 ? '+' : ''}${l.tier}・修為 ×${l.exp}・寶物 ${l.rolls} 份（四人以上 +1）｜以你最強三人估計，平均隕落率約 ${Math.round((best.reduce((sum, g) => sum + deathChance(g, best, i), 0) / best.length) * 100)}%`,
          value: i,
        })),
        '取消',
        '🌀',
      );
      if (picked === null) return;
      level = picked;
      const L = REALM_LEVELS[level];
      team = await this.dialog.pickMany(
        `🌀 ${realmName}（${L.name}秘境）・選擇武將`,
        `歷時 ${L.turns} 回合，期間武將無法出戰。選 ${REALM_MIN_PARTY}–${REALM_MAX_PARTY} 人；人越多個別隕落率越低，四人以上多得一份寶物。`,
        free.map((g) => ({ label: g.name, sub: `${REALMS[g.realm]}・戰力 ${power(g)}・單獨隕落率約 ${Math.round(deathChance(g, [g, g, g], level) * 100)}%${pv(g)}`, value: g })),
        REALM_MIN_PARTY,
        REALM_MAX_PARTY,
        '派遣',
      );
    } else {
      const plan = aiRealm(this.state, lord);
      team = plan?.team ?? null;
      level = plan?.level ?? 0;
    }
    if (!team) return;
    dispatch(lord, team, realmName, level);
    this.ui.log(`${LORDS[lord.id].name}派遣${team.map((g) => g.name).join('、')}進入${realmName}（${REALM_LEVELS[level].name}秘境）。`, this.human(lord) ? 'good' : 'ai');
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
    const pick = aiShop(this.state, lord, offers);
    if (!pick) return;
    buy(this.state, lord, pick);
    this.ui.log(`${LORDS[lord.id].name}在${this.state.tiles[lord.position].name}購得「${pick.label}」。`, 'ai');
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

  private async useItemPreroll(lord: Lord) {
    const items = lord.items.filter((i) => usableIn(i, 'preroll'));
    if (!items.length) {
      this.ui.toast('沒有可在擲骰前使用的物品');
      return;
    }
    const item = await this.dialog.choose(
      '使用物品',
      '先選物品，再選由哪位武將使用（消耗體力、需達能力門檻），最後選擇生效對象。',
      itemChoices(items),
    );
    if (!item) return;
    const user = await this.dialog.choose(
      `由誰使用${nameOf(item)}？`,
      '只有隨行武將可以使用物品。',
      freeGenerals(this.state, lord.id).map((g) => {
        const c = canUse(item, g);
        return { label: g.name, sub: `體力 ${g.stamina}・${STAT_NAMES[def(item).stat]} ${craft(g, def(item).stat)}${pv(g)}`, value: g, disabled: !c.ok, reason: c.reason };
      }),
    );
    if (!user) return;

    const target = await this.pickItemTarget(lord, item.defId);
    if (!target) return;
    const msg = usePreroll(this.state, lord, item, user, target);
    this.ui.log(msg, 'good');
    this.ui.toast(msg);
    this.world.syncCities(this.state);
    this.refresh();
    if (item.defId === 'teleport' && target.tile !== undefined) this.rollResolver?.({ type: 'teleport', tile: target.tile });
  }

  private async pickItemTarget(lord: Lord, defId: string): Promise<PrerollTarget | null> {
    const d = ITEM_DEFS[defId];
    const others = aliveLords(this.state).filter((l) => l.id !== lord.id);
    switch (d.target) {
      case 'deadGeneral': {
        const dead = Object.values(this.state.generals).filter((g) => g.status === 'dead');
        if (!dead.length) {
          this.ui.toast('目前沒有已死去的武將');
          return null;
        }
        const g = await this.dialog.choose(
          '選擇要復活的武將',
          '死去的武將會歸入你的麾下。',
          dead.map((x) => ({ label: x.name, sub: `${REALMS[x.realm]}・戰力 ${power(x)}${pv(x)}`, value: x, color: originCss(x.origin) })),
        );
        return g ? { general: g } : null;
      }
      case 'ownGeneral': {
        const pool = generalsOf(this.state, lord.id).filter((g) => g.status !== 'realm');
        const g = await this.dialog.choose(
          '選擇生效的武將',
          '',
          pool.map((x) => ({ label: x.name, sub: `血量 ${x.hp}/${maxHp(x)}・體力 ${x.stamina}・${REALMS[x.realm]}`, value: x })),
        );
        return g ? { general: g } : null;
      }
      case 'enemyGeneral': {
        const pool = others.flatMap((l) => generalsOf(this.state, l.id).filter((g) => g.status !== 'realm'));
        const g = await this.dialog.choose(
          '選擇目標敵將',
          '',
          pool.map((x) => ({ label: `${x.name}（${LORDS[x.owner!].name}）`, sub: `血量 ${x.hp}/${maxHp(x)}`, value: x, color: LORDS[x.owner!].css })),
        );
        return g ? { general: g } : null;
      }
      case 'lord': {
        const l = await this.dialog.choose(
          '選擇目標主公',
          '',
          others.map((x) => ({ label: LORDS[x.id].name, sub: `靈石 ${fmtStones(x.stones, true)}`, value: x, color: LORDS[x.id].css })),
        );
        return l ? { lord: l } : null;
      }
      case 'ownCity':
      case 'enemyCity': {
        const pool = d.target === 'ownCity' ? citiesOf(this.state, lord.id) : others.flatMap((l) => citiesOf(this.state, l.id));
        if (!pool.length) {
          this.ui.toast('沒有可選擇的城池');
          return null;
        }
        const c = await this.dialog.choose(
          '選擇城池',
          '',
          pool.map((x) => ({ label: `${x.name}（${ownerName(x.owner)}）`, sub: `守軍 ${x.garrisonSoldiers}`, value: x, color: ownerCss(x.owner) })),
        );
        return c ? { city: c } : null;
      }
      case 'dice': {
        const n = await this.dialog.choose('控骰符：選擇點數', '', [1, 2, 3, 4, 5, 6].map((v) => ({ label: `${v} 點`, value: v })));
        return n ? { dice: n } : null;
      }
      case 'tile': {
        this.phase = 'pickTile';
        this.world.showHighlights(this.state.tiles.map((t) => t.index), 0xc9a0ff);
        this.refresh();
        const tile = await new Promise<number | null>((r) => (this.tileResolver = r));
        this.tileResolver = null;
        this.world.clearHighlights();
        this.phase = 'preroll';
        this.refresh();
        return tile === null ? null : { tile };
      }
      default:
        return {};
    }
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

  private async manageGarrison(lord: Lord) {
    const cities = citiesOf(this.state, lord.id);
    if (!cities.length) {
      this.ui.toast('你還沒有城池');
      return;
    }
    const city = await this.dialog.choose(
      '🏯 調度駐軍',
      '選擇要調度的城池。',
      cities.map((c) => ({ label: c.name, sub: `駐將 ${c.garrisonGenerals.length ? garrisonOf(this.state, c).map((g) => g.name).join('、') : '無'}（${c.garrisonGenerals.length}/${GARRISON_LIMIT}）・守軍 ${c.garrisonSoldiers}・繁榮 ${fmtProsperity(c.prosperity)}`, value: c })),
    );
    if (!city) return;
    const free = deployable(this.state, lord.id);
    const action = await this.dialog.choose(`調度${city.name}`, '', [
      { label: '增派士兵', sub: `從隨行士兵調入（目前 ${lord.soldiers}）`, value: 'add', disabled: lord.soldiers < 100, reason: '士兵不足' },
      { label: '撤回士兵', sub: `至少保留 ${MIN_GARRISON} 守軍`, value: 'remove', disabled: city.garrisonSoldiers - MIN_GARRISON < 100, reason: '守軍已達下限' },
      { label: '調整駐將', sub: `最多 ${GARRISON_LIMIT} 人：從隨行武將派駐，或撤回駐將`, value: 'swap', disabled: !free.length && !city.garrisonGenerals.length, reason: '沒有隨行武將，也沒有駐將' },
    ]);
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
      if (!n) return;
      const sign = action === 'add' ? 1 : -1;
      city.garrisonSoldiers += n * sign;
      lord.soldiers -= n * sign;
    } else if (action === 'swap') {
      for (;;) {
        const on = garrisonOf(this.state, city);
        const party = deployable(this.state, lord.id);
        const g = await this.dialog.choose(
          `🏯 ${city.name}・調整駐將（${on.length}/${GARRISON_LIMIT}）`,
          '點選駐將可撤回，點選隨行武將可派駐。',
          [
            ...on.map((x) => ({ label: `▼ 撤回 ${x.name}`, sub: `駐守中｜${REALMS[x.realm]}・戰力 ${power(x)}${pv(x)}`, value: x, color: '#c99a2e', disabled: on.length <= 1, reason: '城池至少要有一名駐將' })),
            ...party.map((x) => ({ label: `▲ 派駐 ${x.name}`, sub: `隨行｜${REALMS[x.realm]}・戰力 ${power(x)}${pv(x)}`, value: x, disabled: on.length >= GARRISON_LIMIT, reason: `已滿 ${GARRISON_LIMIT} 人`, color: '#5aa8ec' })),
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

  // ───────────────────────── 九州風雲 ─────────────────────────

  /** 新的一輪：持續事件倒數；每 5 輪抽一場九州風雲 */
  private async newRoundEvents() {
    for (const msg of tickWorldEvents(this.state)) this.ui.log(msg, 'info');
    this.world.setEventMarkers(this.state.merchantTile, this.state.banditTiles);
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

    if (playerAlive) {
      const extra = def.duration ? `\n\n（持續 ${def.duration} 輪）` : '';
      await this.dialog.message(`九州風雲・${def.name}`, `${def.desc}${lines.length ? `\n\n${lines.join('\n')}` : ''}${extra}`, def.icon, def.id === 'auction' ? '參加拍賣' : '知道了');
    }
    if (def.id === 'auction') await this.runAuction();
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
    if (this.state.lords[this.state.player].alive) await this.dialog.message('拍賣結果', `${result}\n\n各家密封出價：\n${lines.join('\n')}`, '🔨');
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

  /** 要走到自己的城池，才能調度隨行武將與駐軍 */
  private canSwapSect(lord: Lord): boolean {
    const t = this.state.tiles[lord.position];
    return t.kind === 'city' && this.state.cities[t.cityId!].owner === lord.id;
  }

  /** 玩家回合內才能突破、閉關 */
  private canManage(): boolean {
    const cur = currentLord(this.state);
    return cur.isPlayer && this.phase === 'preroll';
  }

  private async manageSect(lord: Lord) {
    for (;;) {
      const allFree = freeGenerals(this.state, lord.id);
      const party = allFree.filter((g) => !g.isLord);
      const sect = sectGenerals(this.state, lord.id);
      const choices: Choice<General>[] = [
        ...party.map((g) => ({ label: `▼ ${g.name}`, sub: `隨行 → 留守宗門｜${REALMS[g.realm]}・戰力 ${power(g)}${pv(g)}`, value: g, color: '#c99a2e' })),
        ...sect.map((g) => ({
          label: `▲ ${g.name}`,
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
    const n = boltCount(g);
    const per = Math.round(boltDamage(g));
    const ok = await this.dialog.confirm(
      `${g.name}・渡劫晉入${REALMS[g.realm + 1]}`,
      `天降 <b>${n}</b> 道天雷，每道約 <b>${per}</b> 傷害（共約 ${per * n}）。\n目前血量 ${g.hp} / ${maxHp(g)}${g.ward ? `・護法陣減傷 ${Math.round(g.ward * 100)}%` : ''}${g.demon ? '\n⚠️ 心魔纏身，雷劫威力倍增' : ''}\n\n血量歸零則一半機率身死道消、一半機率兵解重修（跌回凡人）。\n可先用回血丹補滿，或用避雷陣、五行防禦陣護法。`,
      '渡劫',
      '再準備',
      '⚡',
    );
    if (!ok) return;
    const cityId = g.cityId;
    const startHp = g.hp;
    const startMax = maxHp(g);
    const r = tribulation(g);
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
        : `⚡ ${g.name}渡劫失敗，兵解重修，跌回凡人。`;
    this.ui.log(msg, r.success ? 'good' : 'bad');
    this.world.syncCities(this.state);
    this.refresh();
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
    text += `<br><span class="tt-links">通往：${t.links.map((n) => this.state.tiles[n].name).join('、')}</span>`;
    if (this.phase === 'pickTile') text += '<br><span class="tt-move">▶ 點擊傳送至此</span>';
    this.ui.showTooltip(text, this.mouse.x, this.mouse.y);
  }

  // ───────────────────────── 畫面 ─────────────────────────

  private tileInfoHtml(index: number): string {
    const t = this.state.tiles[index];
    const here = LORD_IDS.filter((id) => this.state.lords[id].alive && this.state.lords[id].position === index);
    const people = here.length ? `<div class="ip-row">此地：${here.map((id) => `<span style="color:${LORDS[id].css}">${LORDS[id].name}</span>`).join('、')}</div>` : '';
    const links = `<div class="ip-row">通往：${t.links.map((n) => `${TILE_INFO[this.state.tiles[n].kind].icon}${this.state.tiles[n].name}`).join('、')}${t.links.length >= 3 ? '（岔路口）' : ''}</div>`;
    if (t.kind !== 'city') return `<div class="ip-head"><b>${TILE_INFO[t.kind].icon} ${t.name}</b></div><div class="ip-row">${TILE_INFO[t.kind].desc}</div>${links}${people}`;
    const c = this.state.cities[t.cityId!];
    const gens = garrisonOf(this.state, c);
    const inc = cityIncomeOf(this.state, c);
    const ranks = cityRanks(this.state, c.id);
    return `
      <div class="ip-head" style="--fc:${ownerCss(c.owner)}"><b>${c.capital ? '★ ' : ''}${c.name}</b><span>${ownerName(c.owner)}</span></div>
      <table>
        <tr><td>地貌</td><td title="${terrainOf(c).desc}">${terrainOf(c).icon} ${terrainOf(c).name}<small class="terrain-fx">${terrainEffects(terrainOf(c))}</small></td></tr>
        <tr><td>繁榮度</td><td>${fmtProsperity(c.prosperity)}<small class="terrain-fx">第 ${ranks.prosperity} / ${Object.keys(this.state.cities).length} 名</small></td></tr>
        <tr><td>過路費</td><td>${c.owner === 'neutral' ? `佔領後約 ${fmtStones(toll(c))}` : fmtStones(cityToll(this.state, c))}</td></tr>
        <tr><td>每回合</td><td>${fmtStones(inc.stones)}・兵 +${inc.soldiers}<small class="terrain-fx">${RANK_METRICS.filter((m) => m.id === 'stones' || m.id === 'soldiers').map((m) => `${m.name}第 ${ranks[m.id]}`).join('・')}</small></td></tr>
        <tr><td>駐將</td><td>${gens.length ? gens.map((g) => `${g.name}（${REALMS[g.realm]}・戰力 ${power(g)}）`).join('<br>') : '無'}</td></tr>
        <tr><td>守軍</td><td>${c.garrisonSoldiers}${c.shieldTurns ? `・護城大陣 ${c.shieldTurns}` : ''}</td></tr>
        ${c.owner !== 'neutral' ? `<tr><td>守城戰力</td><td>${garrisonPower(this.state, c)}<small class="terrain-fx">第 ${ranks.defense} 名</small></td></tr>` : ''}
      </table>${links}${people}`;
  }

  private refresh() {
    if (!this.state) return;
    this.ui.renderTop(this.state);
    const player = this.state.lords[this.state.player];
    const current = currentLord(this.state);
    const myTurn = current.id === player.id && player.alive;
    const buttons: ActionButton[] = [];
    let hint: string;
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
      hint = '擲骰前可先使用物品、徵兵或整備武將（調度駐軍與宗門要站在自己的城池）；擲完骰、處理完落地事件，回合就會自動結束';
      buttons.push(
        { label: '🎒 使用物品', sub: `${player.items.length} 件`, onClick: () => void this.useItemPreroll(player) },
        { label: '⚔️ 徵兵', sub: `${(recruitCost(player.id, 100) / 100).toFixed(2).replace(/\.?0+$/, '')}/名`, onClick: () => void this.recruitSoldiers(player) },
        { label: '🏯 調度駐軍', sub: this.canSwapSect(player) ? undefined : '需在自己的城池', disabled: !this.canSwapSect(player), onClick: () => void this.manageGarrison(player) },
        { label: '🏛️ 宗門', sub: this.canSwapSect(player) ? `隨行 ${freeGenerals(this.state, player.id).length}/${PARTY_LIMIT}` : '需在自己的城池', disabled: !this.canSwapSect(player), onClick: () => void this.manageSect(player) },
        roster,
      );
    } else if (this.phase === 'pickTile') {
      hint = '傳送陣：點選地圖上任一格（右鍵或 Esc 取消）';
      buttons.push({ label: '✖ 取消', onClick: () => this.tileResolver?.(null) });
    } else hint = '……';
    this.ui.renderActions(buttons, hint);
    // 擲骰：右側偏下的大圓鈕
    if (!this.state.over && player.alive && myTurn && !this.autoPlay && this.phase === 'preroll') this.ui.showRoll(() => this.rollResolver?.({ type: 'roll' }));
    else this.ui.hideRoll();

    this.ui.renderInfo(this.tileInfoHtml(this.hoverTile ?? player.position));
    this.hoverTile = null;
  }
}

import * as THREE from 'three';
import type { City, CraftStat, General, GameState, Lord, LordId } from './types';
import { PARTY_LIMIT, citiesOf, createGameState, currentLord, freeGenerals, generalsOf, joinLord, nextUid, sectGenerals } from './GameState';
import { advance, aliveLords, startTurn } from './TurnManager';
import { fmtStones } from './Currency';
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
import { showEndScreen, showStartScreen } from '../ui/Screens';
import { REALMS } from '../data/generals';
import { ITEM_DEFS, PILL_IDS, STAT_NAMES } from '../data/items';
import { TILE_INFO } from '../data/board';
import { MIN_GARRISON, SOLDIER_PRICE, canOccupy, cityIncome, cityToll, eliminate, garrisonPower, occupy, occupyCost, pay, toll } from '../systems/CitySystem';
import { attack, attemptBreak, battleExp, boltCount, boltDamage, breakChance, canAttemptBreak, craft, maxHp, needsTribulation, power, qiDeviation, tribulation } from '../systems/GeneralSystem';
import { BATTLE_NAMES, CONTEST_SOLDIERS, Duel, SIEGE_START_ROUND, craftContest, siege, siegeAllowed, siegeAttack, type BattleKind, type DuelEvent, type Side } from '../systems/BattleSystem';
import { canUse, def, nameOf, requirementText, useInDuel, usableIn, usePreroll, type PrerollTarget } from '../systems/ItemSystem';
import { makeStock, type Offer, type ShopKind } from '../systems/ShopSystem';
import { deathChance, dispatch, REALM_TURNS } from '../systems/RealmSystem';
import { aiDefender, aiEnemyCity, aiManageSect, aiOccupy, aiPreroll, aiRealm, aiShop, defenderPool } from '../systems/AISystem';
import { EVENT_INTERVAL, aiBid, applyWorldEvent, auctionLot, banditToll, pickWorldEvent, resolveAuction, syncWorldMods, tickWorldEvents } from '../systems/EventSystem';
import { WORLD } from '../systems/WorldMods';

type Phase = 'idle' | 'preroll' | 'busy' | 'postland' | 'pickTile';
type RollChoice = { type: 'roll' } | { type: 'teleport'; tile: number };

const CRAFTS: CraftStat[] = ['alchemy', 'forging', 'talisman', 'formation'];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class Game {
  private sm: SceneManager;
  private world: World;
  private ui: GameUI;
  private dialog: Dialog;
  private generalsView: GeneralsView;
  private battleView: BattleView;
  private help: HelpView;
  private state!: GameState;
  private sprites = new Map<LordId, CharacterSprite>();
  private phase: Phase = 'idle';
  private token = 0;
  private hoverTile: number | null = null;
  private mouse = { x: 0, y: 0 };
  private rollResolver: ((c: RollChoice) => void) | null = null;
  private endResolver: (() => void) | null = null;
  private tileResolver: ((t: number | null) => void) | null = null;

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
    this.ui.onHelp = () => this.help.open();

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
      if (e.key === 'Enter' && this.phase === 'postland') this.endResolver?.();
      if (e.key === 'Escape' && this.phase === 'pickTile') this.tileResolver?.(null);
    });
    this.sm.start();
  }

  private get speed() {
    return this.ui.speed;
  }

  private wait(ms: number) {
    return sleep(ms / this.speed);
  }

  showStart() {
    this.ui.hide();
    showStartScreen(this.uiRoot, (id) => this.start(id), () => this.help.open());
  }

  // ───────────────────────── 開局 ─────────────────────────

  start(player: LordId) {
    this.token++;
    this.state = createGameState(player);
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
    this.ui.log(`天地靈氣復甦，${LORDS[player].name}起兵逐鹿天下！`, 'turn');
    this.ui.log('擲骰沿環道前進：停在無主城池才能派將佔領，踏入他人城池須繳過路費或開戰。', 'info');
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
      if (lord.alive) await this.takeTurn(lord);
      if (token !== this.token || this.state.over) return;
      if (await this.checkEnd()) return;
      const newRound = advance(this.state);
      if (newRound) {
        if (this.state.round > this.state.maxRounds) {
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
    for (const l of report.lines) this.ui.log(`${name}：${l.text}`, lord.isPlayer ? l.kind : 'ai');
    if (lord.isPlayer && report.bottlenecks.length) this.ui.toast(`${report.bottlenecks.map((id) => this.state.generals[id].name).join('、')}進入瓶頸，可以突破了！`);
    for (const r of report.realms) {
      const text = `${r.realmName}探索歸來。${r.dead.length ? `${r.dead.map((g) => g.name).join('、')}不幸隕落。` : '全員平安。'}${r.reward ? `帶回${r.reward}！` : '一無所獲。'}`;
      this.ui.log(`${name}：${text}`, r.dead.length ? 'bad' : 'good');
      for (const line of r.insights) this.ui.log(`${name}：${line}`, lord.isPlayer ? 'good' : 'ai');
      if (lord.isPlayer) await this.dialog.message('🌀 秘境歸來', `${text}\n\n${r.insights.join('\n')}`, '🌀');
    }
    this.refresh();

    if (lord.stunned > 0) {
      lord.stunned--;
      this.ui.log(`${name}受迷魂陣所困，原地停留。`, 'bad');
      this.ui.toast(`${name}受迷魂陣所困`);
      await this.wait(900);
      return;
    }
    if (lord.isPlayer) await this.playerTurn(lord);
    else await this.aiTurn(lord);
  }

  private async playerTurn(lord: Lord) {
    this.phase = 'preroll';
    this.refresh();
    this.ui.toast(`第 ${this.state.round} 輪・你的回合`);
    const choice = await new Promise<RollChoice>((r) => (this.rollResolver = r));
    this.rollResolver = null;
    this.phase = 'busy';
    this.refresh();
    if (choice.type === 'teleport') await this.teleport(lord, choice.tile);
    else await this.moveLord(lord, await this.rollDice(lord));
    if (!lord.alive || this.state.over) return;
    this.phase = 'postland';
    this.refresh();
    await new Promise<void>((r) => (this.endResolver = r));
    this.endResolver = null;
    this.phase = 'busy';
  }

  private async aiTurn(lord: Lord) {
    await this.wait(350);
    const logs = aiPreroll(this.state, lord);
    for (const msg of logs) this.ui.log(`${LORDS[lord.id].name}：${msg}`, msg.includes('⚡') || msg.includes('✦') ? 'turn' : 'ai');
    if (logs.some((m) => m.includes('突破至'))) this.world.beamEffect(this.sprites.get(lord.id)!.group.position);
    this.world.syncCities(this.state);
    this.refresh();
    await this.moveLord(lord, await this.rollDice(lord));
    if (lord.alive && this.canSwapSect(lord)) for (const msg of aiManageSect(this.state, lord)) this.ui.log(`${LORDS[lord.id].name}：${msg}`, 'ai');
    await this.wait(300);
  }

  private async rollDice(lord: Lord): Promise<number> {
    const values = lord.fixedDice ? [lord.fixedDice] : Array.from({ length: lord.doubleDice ? 2 : 1 }, () => 1 + Math.floor(Math.random() * 6));
    await this.ui.rollDice(values);
    const sum = values.reduce((a, b) => a + b, 0);
    this.ui.log(`${LORDS[lord.id].name}擲出 ${sum} 點。`, lord.isPlayer ? 'info' : 'ai');
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
    const n = this.state.tiles.length;
    for (let i = 1; i <= steps; i++) {
      const next = (lord.position + 1) % n;
      const from = sprite.group.position.clone();
      const to = this.slotPosition(lord.id, next);
      await sprite.moveAlong([from, to], this.sm.animator, (p) => this.sm.cameraController.follow(p));
      lord.position = next;
      this.refresh();
      if (!lord.alive) return;
    }
    await this.land(lord, lord.position);
  }

  private async teleport(lord: Lord, tile: number) {
    const sprite = this.sprites.get(lord.id)!;
    this.world.beamEffect(sprite.group.position, 0xc9a0ff);
    await this.wait(500);
    lord.position = tile;
    sprite.setGroundPosition(this.slotPosition(lord.id, tile));
    this.world.beamEffect(sprite.group.position, 0xc9a0ff);
    this.sm.cameraController.focus(sprite.group.position);
    await this.wait(500);
    await this.land(lord, tile);
  }

  private async land(lord: Lord, tile: number) {
    const t = this.state.tiles[tile];
    this.refresh();
    if (tile === this.state.merchantTile) await this.landShop(lord, 'merchant');
    if (this.state.banditTiles.includes(tile)) await this.banditEvent(lord);
    if (!lord.alive) return;
    switch (t.kind) {
      case 'city':
        return this.landCity(lord, this.state.cities[t.cityId!]);
      case 'realm':
        return this.landRealm(lord, t.name);
      case 'road':
        return this.roadEvent(lord);
      default:
        return this.landShop(lord, t.kind);
    }
  }

  // ───────────────────────── 城池 ─────────────────────────

  private async landCity(lord: Lord, city: City) {
    const name = LORDS[lord.id].name;
    if (city.owner === 'neutral') {
      if (!canOccupy(this.state, lord, city)) {
        if (lord.isPlayer) this.ui.toast(`佔領${city.name}需要 ${fmtStones(occupyCost(city))}、一名隨行武將與至少 ${MIN_GARRISON} 士兵`);
        return;
      }
      if (lord.isPlayer) await this.playerOccupy(lord, city);
      else this.aiTryOccupy(lord, city);
      return;
    }
    if (city.owner === lord.id) {
      if (lord.isPlayer) this.ui.toast(`回到${city.name}，可在「調度駐軍」增派守軍`);
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
      this.ui.log(`${name}高舉免戰牌，免繳${city.name}過路費。`, lord.isPlayer ? 'good' : 'ai');
      this.ui.toast('免戰牌生效，免繳過路費');
      return;
    }
    const choice = lord.isPlayer ? await this.playerEnemyCityChoice(lord, city, fee) : aiEnemyCity(this.state, lord, city);
    if (choice.kind === 'pay') {
      await this.payToll(lord, owner, fee, city, false);
      return;
    }
    const kind = choice.kind;
    this.ui.log(`${name}向${LORDS[owner.id].name}的${city.name}發起【${BATTLE_NAMES[kind]}】！`, lord.isPlayer ? 'info' : 'ai');
    const win = await this.fight(lord, city, kind, choice.generals);
    if (!lord.alive) return;
    if (win) {
      if (kind !== 'siege') this.ui.log(`${name}${BATTLE_NAMES[kind]}獲勝，免繳過路費！`, lord.isPlayer ? 'good' : 'ai');
    } else {
      this.ui.log(`${name}${BATTLE_NAMES[kind]}落敗，須付雙倍過路費。`, lord.isPlayer ? 'bad' : 'ai');
      await this.payToll(lord, owner, fee * 2, city, true);
    }
  }

  private async payToll(lord: Lord, owner: Lord, amount: number, city: City, doubled: boolean) {
    const r = pay(this.state, lord, amount, owner);
    for (const n of r.notes) this.ui.log(`${LORDS[lord.id].name}${n}`, 'bad');
    const kind = lord.isPlayer ? 'bad' : owner.isPlayer ? 'good' : 'ai';
    this.ui.log(`${LORDS[lord.id].name}向${LORDS[owner.id].name}繳納${city.name}${doubled ? '雙倍' : ''}過路費 ${fmtStones(r.paid)}。`, kind);
    if (lord.isPlayer || owner.isPlayer) this.ui.toast(`${LORDS[lord.id].name}繳納過路費 ${fmtStones(r.paid)}`);
    this.world.syncCities(this.state);
    if (r.bankrupt) await this.onBankrupt(lord);
    this.refresh();
  }

  private async onBankrupt(lord: Lord) {
    if (lord.alive) eliminate(this.state, lord);
    this.sprites.get(lord.id)!.group.visible = false;
    this.world.syncCities(this.state);
    this.ui.log(`💀 ${LORDS[lord.id].name}靈石耗盡，破產出局！麾下將領四散，城池回歸無主。`, 'bad');
    this.refresh();
    if (!lord.isPlayer) {
      await this.wait(600);
      return;
    }
    if (aliveLords(this.state).length <= 1) return;
    const watch = await this.dialog.confirm('你已破產出局', '靈石耗盡，宗門解散。\n要觀看其他主公爭到最後，還是直接結算？', '觀戰到底', '直接結算', '💀');
    if (watch) {
      this.ui.speed = 4;
      this.sm.timeScale = 4;
    } else {
      await this.endGame(`${LORDS[lord.id].name}破產出局。`);
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
    const free = freeGenerals(this.state, lord.id);
    const choices: Choice<string>[] = free.map((g) => ({ label: g.name, sub: `${REALMS[g.realm]}・戰力 ${power(g)}`, value: g.id, color: originCss(g.origin) }));
    const gid = await this.dialog.choose(
      `抵達${city.name}・是否佔領？`,
      `佔領費 ${fmtStones(occupyCost(city))}（持有 ${fmtStones(lord.stones)}）
繁榮度 ${city.prosperity}｜每回合收入 ${fmtStones(inc.stones)}、士兵 +${inc.soldiers}｜過路費 ${fmtStones(toll(city, citiesOf(this.state, lord.id).length + 1))}（佔領後）\n請選擇駐守武將：`,
      choices,
      '不佔領',
      '🏯',
    );
    if (!gid) return;
    const amounts = [300, 500, 1000, 2000, 3000, 5000].filter((a) => a <= lord.soldiers);
    const soldiers = await this.dialog.choose(
      `派多少士兵駐守${city.name}？`,
      `目前隨行士兵 ${lord.soldiers}。一名守軍約等於十名隨行士兵，守軍越多越難攻破。`,
      amounts.map((a) => ({ label: `${a} 名士兵`, value: a })),
      '取消',
    );
    if (!soldiers) return;
    occupy(this.state, lord, city, gid, soldiers, occupyCost(city));
    this.world.syncCities(this.state);
    this.world.captureEffect(city.tile, LORDS[lord.id].color);
    this.ui.log(`支付 ${fmtStones(occupyCost(city))}，派${this.state.generals[gid].name}率 ${soldiers} 兵佔領${city.name}！`, 'good');
    this.ui.toast(`佔領${city.name}！`);
    this.refresh();
  }

  private async playerEnemyCityChoice(lord: Lord, city: City, fee: number): Promise<{ kind: BattleKind | 'pay'; generals: General[] }> {
    const free = freeGenerals(this.state, lord.id);
    const fighters = free.filter((g) => g.hp > 1);
    const owner = LORDS[city.owner as LordId].name;
    const guard = city.garrisonGeneral ? this.state.generals[city.garrisonGeneral] : null;
    const noGen = '沒有可出戰的隨行武將';
    const choices: Choice<BattleKind | 'pay'>[] = [
      { label: '💰 繳納過路費', sub: `支付 ${fmtStones(fee)} 後離開`, value: 'pay' },
      { label: '⚔️ 擂台戰', sub: '雙方各派一將單挑，能量滿可施放功法', value: 'duel', disabled: !fighters.length, reason: noGen },
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
    if (WORLD.noBattle) for (const c of choices) if (c.value !== 'pay') Object.assign(c, { disabled: true, reason: '群雄會盟期間不能開戰' });
    const kind = await this.dialog.choose(
      `踏入${owner}的${city.name}`,
      `過路費 ${fmtStones(fee)}｜駐將 ${guard ? `${guard.name}（${REALMS[guard.realm]}・戰力 ${power(guard)}）` : '無'}・守軍 ${city.garrisonSoldiers}\n選擇繳費，或發起戰鬥。<b>戰鬥失敗將付雙倍過路費 ${fmtStones(fee * 2)}。</b>${fee * 2 > lord.stones ? '\n<b style="color:#b33a2a">⚠️ 雙倍過路費超過你持有的靈石，戰敗將先變賣城池，再不夠則隨行武將離開抵債，只剩主公一人時破產！</b>' : ''}`,
      choices,
      null,
      '⚔️',
    );
    return { kind: kind ?? 'pay', generals: [] };
  }

  // ───────────────────────── 戰鬥 ─────────────────────────

  /** 回傳攻方是否獲勝 */
  private async fight(attacker: Lord, city: City, kind: BattleKind, preset: General[]): Promise<boolean> {
    const defender = this.state.lords[city.owner as LordId];
    const involved = attacker.isPlayer || defender.isPlayer;
    if (kind === 'siege') return this.runSiege(attacker, city, preset);

    // 攻方武將
    let atkGen: General | null = preset[0] ?? null;
    if (attacker.isPlayer) {
      const pool = freeGenerals(this.state, attacker.id).filter((g) => kind !== 'duel' || g.hp > 1);
      atkGen = (await this.pickGeneral(`派誰出戰${BATTLE_NAMES[kind]}？`, pool, kind, false)) ?? pool[0];
    }
    if (!atkGen) return false;

    // 守方武將
    let defGen: General | null;
    if (defender.isPlayer) {
      const pool = defenderPool(this.state, city).filter((g) => kind !== 'duel' || g.hp > 1);
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
        const playerSide: Side = attacker.isPlayer ? 'a' : 'b';
        const playerLord = attacker.isPlayer ? attacker : defender;
        winner = await this.battleView.runDuel(duel, playerSide, () => this.speed, (side) => this.useItemInDuel(duel, side, playerLord));
      } else winner = duel.autoResolve();
      const w = winner === 'a' ? atkGen : defGen;
      const l = winner === 'a' ? defGen : atkGen;
      const gain = battleExp(w, l);
      this.ui.log(`擂台戰：${atkGen.name} vs ${defGen.name}，${w.name}勝出，生死歷練修為 +${gain}。`, involved ? 'info' : 'ai');
      return winner === 'a';
    }

    const stat = kind as CraftStat;
    if (city.garrisonSoldiers < CONTEST_SOLDIERS) {
      this.ui.log(`${city.name}守軍不足 ${CONTEST_SOLDIERS}，無法維持鬥法秩序，${atkGen.name}不戰而勝。`, involved ? 'info' : 'ai');
      return true;
    }
    const r = craftContest(atkGen, defGen, stat, attacker, city);
    if (involved) await this.battleView.showContest(r, atkGen, attacker.id, defGen, defender.id, attacker.isPlayer ? 'a' : 'b');
    const gain = battleExp(r.winner === 'a' ? atkGen : defGen, r.winner === 'a' ? defGen : atkGen);
    this.ui.log(
      `${STAT_NAMES[stat]}比試：${atkGen.name} ${r.aScore} vs ${defGen.name} ${r.bScore}。攻方折兵 ${r.aLoss}、守軍折損 ${r.bLoss}，勝者修為 +${gain}。`,
      involved ? 'info' : 'ai',
    );
    this.world.syncCities(this.state);
    return r.winner === 'a';
  }

  private async runSiege(attacker: Lord, city: City, preset: General[]): Promise<boolean> {
    const defender = this.state.lords[city.owner as LordId];
    let team = preset;
    if (attacker.isPlayer) {
      const pool = freeGenerals(this.state, attacker.id);
      const picked = await this.dialog.pickMany(
        `攻打${city.name}・選擇出征武將`,
        `最多派遣三名武將，率領全部未派遣的 ${attacker.soldiers} 名士兵攻城。\n戰敗則士兵全滅；勝方也會折損，雙方越接近折損越多。\n一名守軍約等於十名隨行士兵；武將武力越高，統率加成越大。守方約 ${garrisonPower(this.state, city)}。`,
        pool.map((g) => ({ label: g.name, sub: `${REALMS[g.realm]}・武力 ${attack(g)}・戰力 ${power(g)}・血量 ${g.hp}/${maxHp(g)}`, value: g })),
        1,
        3,
        '出征',
      );
      team = picked ?? [pool[0]];
    }
    const oldGeneral = city.garrisonGeneral ? this.state.generals[city.garrisonGeneral] : null;
    const r = siege(this.state, attacker, team, city);
    const involved = attacker.isPlayer || defender.isPlayer;
    if (involved) await this.battleView.showSiege(r, team, attacker.id, city, oldGeneral, attacker.isPlayer);
    this.ui.log(`攻城戰：${LORDS[attacker.id].name} ${r.attack} vs ${city.name} ${r.defense}，${r.win ? '城破！' : '攻城失敗。'}`, involved ? 'info' : 'ai');
    if (!r.win) {
      if (oldGeneral) this.ui.log(`${oldGeneral.name}守城有功，修為 +${battleExp(oldGeneral, team[0])}。`, involved ? 'info' : 'ai');
      return false;
    }
    for (const g of team) battleExp(g, oldGeneral);

    // 奪城：原駐將退回主公身邊（閉關中則走火入魔），攻方派將駐守
    if (oldGeneral) {
      if (oldGeneral.secluded) {
        qiDeviation(oldGeneral);
        this.ui.log(`${oldGeneral.name}閉關被打斷，走火入魔！重傷並損失一半修為。`, defender.isPlayer ? 'bad' : involved ? 'good' : 'ai');
      }
      joinLord(this.state, defender.id, oldGeneral);
    }
    city.garrisonGeneral = null;
    let gid = [...team].sort((a, b) => power(a) - power(b))[0].id;
    let soldiers = Math.min(attacker.soldiers, Math.max(MIN_GARRISON, Math.round(attacker.soldiers * 0.4)));
    if (attacker.isPlayer) {
      const g = await this.dialog.choose(`攻下${city.name}！派誰駐守？`, '', team.map((x) => ({ label: x.name, sub: `戰力 ${power(x)}`, value: x.id })), null, '🏯');
      if (g) gid = g;
      const amounts = [300, 500, 1000, 2000, 3000, 5000].filter((a) => a <= attacker.soldiers);
      if (amounts.length) {
        const s = await this.dialog.choose(`派多少士兵駐守${city.name}？`, `目前士兵 ${attacker.soldiers}`, amounts.map((a) => ({ label: `${a} 名士兵`, value: a })), null);
        soldiers = s ?? amounts[0];
      } else soldiers = attacker.soldiers;
    }
    occupy(this.state, attacker, city, gid, Math.max(0, soldiers));
    this.world.syncCities(this.state);
    this.world.captureEffect(city.tile, LORDS[attacker.id].color);
    this.ui.log(`${LORDS[attacker.id].name}奪下${city.name}，由${this.state.generals[gid].name}駐守。`, attacker.isPlayer ? 'good' : defender.isPlayer ? 'bad' : 'ai');
    this.refresh();
    return true;
  }

  private pickGeneral(title: string, pool: General[], kind: BattleKind, cancelable = true): Promise<General | null> {
    const stat = kind === 'duel' || kind === 'siege' ? null : (kind as CraftStat);
    return this.dialog.choose(
      title,
      '',
      pool.map((g) => ({
        label: g.name,
        sub: stat ? `${STAT_NAMES[stat]} ${craft(g, stat)}・${REALMS[g.realm]}` : `${REALMS[g.realm]}・戰力 ${power(g)}・血量 ${g.hp}/${maxHp(g)}${g.technique ? `・${g.technique.name}` : ''}`,
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
    const item = await this.dialog.choose('使用物品', '', items.map((i) => ({ label: nameOf(i), sub: `${def(i).desc(i.tier)}｜${requirementText(i)}`, value: i })));
    if (!item) return null;
    const fighter = duel.fighter(side).general;
    const users = [fighter, ...freeGenerals(this.state, lord.id).filter((g) => g.id !== fighter.id)];
    const user = await this.dialog.choose(
      `由誰使用${nameOf(item)}？`,
      '使用物品會消耗該武將的體力，能力值須達到門檻。',
      users.map((g) => {
        const c = canUse(item, g);
        return { label: g.name, sub: `體力 ${g.stamina}・${STAT_NAMES[def(item).stat]} ${craft(g, def(item).stat)}`, value: g, disabled: !c.ok, reason: c.reason };
      }),
    );
    if (!user) return null;
    return useInDuel(duel, side, lord, item, user);
  }

  // ───────────────────────── 秘境、商店、驛道 ─────────────────────────

  private async landRealm(lord: Lord, realmName: string) {
    const free = freeGenerals(this.state, lord.id);
    if (free.length < 3) {
      if (lord.isPlayer) this.ui.toast(`探索${realmName}需要三名隨行武將`);
      return;
    }
    let team: General[] | null;
    if (lord.isPlayer) {
      team = await this.dialog.pickMany(
        `🌀 ${realmName}`,
        `派遣三名武將探索秘境，歷時 ${REALM_TURNS} 回合。\n期間武將無法出戰；綜合屬性越高，個別隕落機率越低，帶回的寶物也越好。`,
        free.map((g) => ({ label: g.name, sub: `${REALMS[g.realm]}・戰力 ${power(g)}・單獨隕落率約 ${Math.round(deathChance(g, [g, g, g]) * 100)}%`, value: g })),
        3,
        3,
        '派遣',
      );
    } else team = aiRealm(this.state, lord);
    if (!team) return;
    dispatch(lord, team, realmName);
    this.ui.log(`${LORDS[lord.id].name}派遣${team.map((g) => g.name).join('、')}進入${realmName}。`, lord.isPlayer ? 'good' : 'ai');
    this.refresh();
  }

  private async landShop(lord: Lord, kind: ShopKind) {
    const offers = makeStock(this.state, lord, kind);
    if (lord.isPlayer) {
      await openShop(this.dialog, this.state, lord, kind, offers, (msg) => {
        this.ui.log(msg, 'good');
        this.refresh();
      });
      return;
    }
    const pick = aiShop(this.state, lord, offers);
    if (!pick) return;
    lord.stones -= pick.price;
    if (pick.kind === 'item') lord.items.push(pick.item);
    else if (pick.kind === 'equipment') lord.gear.push(pick.equipment);
    else if (pick.kind === 'technique') lord.scrolls.push(pick.technique);
    else if (pick.kind === 'beast') lord.beast = pick.beast;
    else joinLord(this.state, lord.id, pick.general);
    this.ui.log(`${LORDS[lord.id].name}在${this.state.tiles[lord.position].name}購得「${pick.label}」。`, 'ai');
    this.refresh();
  }

  private async roadEvent(lord: Lord) {
    const r = Math.random();
    if (r < 0.35) return;
    let text: string;
    if (r < 0.55) {
      const n = 300 + Math.floor(Math.random() * 900);
      lord.stones += n;
      text = `途中拾獲一袋靈石：${fmtStones(n)}`;
    } else if (r < 0.7) {
      const n = Math.round(lord.soldiers * 0.06);
      lord.soldiers -= n;
      text = `遭遇山賊伏擊，折損 ${n} 名士兵`;
    } else if (r < 0.82) {
      const defId = PILL_IDS[Math.floor(Math.random() * PILL_IDS.length)];
      const item = { uid: nextUid(this.state, 'i'), defId, tier: 0, price: ITEM_DEFS[defId].price[0] };
      lord.items.push(item);
      text = `偶遇散修，獲贈一顆${nameOf(item)}`;
    } else {
      for (const g of generalsOf(this.state, lord.id)) g.hp = Math.min(maxHp(g), g.hp + Math.round(maxHp(g) * 0.2));
      text = '尋得一處靈泉，眾將傷勢回復兩成';
    }
    this.ui.log(`${LORDS[lord.id].name}：${text}`, lord.isPlayer ? 'good' : 'ai');
    if (lord.isPlayer) this.ui.toast(text);
    this.refresh();
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
      items.map((i) => ({ label: nameOf(i), sub: `${def(i).desc(i.tier)}｜${requirementText(i)}`, value: i })),
    );
    if (!item) return;
    const user = await this.dialog.choose(
      `由誰使用${nameOf(item)}？`,
      '只有隨行武將可以使用物品。',
      freeGenerals(this.state, lord.id).map((g) => {
        const c = canUse(item, g);
        return { label: g.name, sub: `體力 ${g.stamina}・${STAT_NAMES[def(item).stat]} ${craft(g, def(item).stat)}`, value: g, disabled: !c.ok, reason: c.reason };
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
    const n = await this.dialog.choose(
      '⚔️ 徵兵',
      `每名士兵 ${SOLDIER_PRICE} 下品靈石。目前士兵 ${lord.soldiers}，靈石 ${fmtStones(lord.stones)}。`,
      [1000, 2000, 5000, 10000].map((a) => ({ label: `徵召 ${a} 名`, sub: fmtStones(a * SOLDIER_PRICE), value: a, disabled: lord.stones < a * SOLDIER_PRICE, reason: '靈石不足' })),
    );
    if (!n) return;
    lord.stones -= n * SOLDIER_PRICE;
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
      cities.map((c) => ({ label: c.name, sub: `駐將 ${c.garrisonGeneral ? this.state.generals[c.garrisonGeneral].name : '無'}・守軍 ${c.garrisonSoldiers}・繁榮 ${c.prosperity}`, value: c })),
    );
    if (!city) return;
    const free = freeGenerals(this.state, lord.id);
    const action = await this.dialog.choose(`調度${city.name}`, '', [
      { label: '增派士兵', sub: `從隨行士兵調入（目前 ${lord.soldiers}）`, value: 'add', disabled: lord.soldiers < 300, reason: '士兵不足' },
      { label: '撤回士兵', sub: `至少保留 ${MIN_GARRISON} 守軍`, value: 'remove', disabled: city.garrisonSoldiers - MIN_GARRISON < 300, reason: '守軍已達下限' },
      { label: '更換駐將', sub: '由隨行武將換下目前駐將', value: 'swap', disabled: !free.length, reason: '沒有隨行武將' },
    ]);
    if (action === 'add' || action === 'remove') {
      const max = action === 'add' ? lord.soldiers : city.garrisonSoldiers - MIN_GARRISON;
      const n = await this.dialog.choose(
        action === 'add' ? '增派多少？' : '撤回多少？',
        '',
        [300, 500, 1000, 2000, 5000].filter((a) => a <= max).map((a) => ({ label: `${a} 名`, value: a })),
      );
      if (!n) return;
      const sign = action === 'add' ? 1 : -1;
      city.garrisonSoldiers += n * sign;
      lord.soldiers -= n * sign;
    } else if (action === 'swap') {
      const g = await this.pickGeneral(`由誰接替駐守${city.name}？`, free, 'siege');
      if (!g) return;
      if (city.garrisonGeneral) joinLord(this.state, lord.id, this.state.generals[city.garrisonGeneral]);
      g.status = 'garrison';
      g.cityId = city.id;
      city.garrisonGeneral = g.id;
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
    for (const l of aliveLords(this.state)) bids.push({ id: l.id, bid: l.isPlayer ? await this.playerBid(l, lot) : aiBid(this.state, l, lot) });
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
    });
  }

  /** 黃巾賊窩：繳買路錢或損兵 */
  private async banditEvent(lord: Lord) {
    const cost = banditToll(this.state);
    const loss = Math.round(lord.soldiers * 0.1);
    let payIt: boolean;
    if (lord.isPlayer) {
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
      this.ui.log(`${LORDS[lord.id].name}向黃巾賊繳了買路錢 ${fmtStones(cost)}。`, lord.isPlayer ? 'bad' : 'ai');
    } else {
      lord.soldiers -= loss;
      this.ui.log(`${LORDS[lord.id].name}硬闖賊窩，折損 ${loss} 名士兵。`, lord.isPlayer ? 'bad' : 'ai');
    }
    this.refresh();
  }

  // ───────────────────────── 宗門與突破 ─────────────────────────

  /** 聽風樓、空城或自己的城池才能調度宗門 */
  private canSwapSect(lord: Lord): boolean {
    const t = this.state.tiles[lord.position];
    if (t.kind === 'tavern') return true;
    if (t.kind !== 'city') return false;
    const owner = this.state.cities[t.cityId!].owner;
    return owner === 'neutral' || owner === lord.id;
  }

  /** 玩家回合內才能突破、閉關 */
  private canManage(): boolean {
    const cur = currentLord(this.state);
    return cur.isPlayer && (this.phase === 'preroll' || this.phase === 'postland');
  }

  private async manageSect(lord: Lord) {
    for (;;) {
      const party = freeGenerals(this.state, lord.id);
      const sect = sectGenerals(this.state, lord.id);
      const choices: Choice<General>[] = [
        ...party.map((g) => ({ label: `▼ ${g.name}`, sub: `隨行 → 留守宗門｜${REALMS[g.realm]}・戰力 ${power(g)}`, value: g, color: '#c99a2e' })),
        ...sect.map((g) => ({
          label: `▲ ${g.name}`,
          sub: `宗門 → 隨行｜${REALMS[g.realm]}・戰力 ${power(g)}`,
          value: g,
          disabled: party.length >= PARTY_LIMIT,
          reason: `隨行已滿 ${PARTY_LIMIT} 人`,
          color: '#5aa8ec',
        })),
      ];
      const g = await this.dialog.choose(`🏛️ 宗門調度（隨行 ${party.length}/${PARTY_LIMIT}）`, '隨行武將最多十名，其餘留在宗門。點選武將即可切換。', choices, '完成');
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
        `成功率 <b>${chance}%</b>${g.foundation ? '（已服築基丹）' : ''}${g.demon ? '\n⚠️ 心魔纏身，成功率大降' : ''}\n失敗會氣血翻湧：扣除一半血量與體力，下一輪才能再試。`,
        '突破',
        '再等等',
        '🧘',
      );
      if (!ok) return;
      const success = attemptBreak(g, this.state.round);
      if (success) this.world.beamEffect(sprite.group.position);
      const msg = success ? `✦ ${g.name}突破成功，晉入【${REALMS[g.realm]}】！` : `${g.name}突破失敗，氣血翻湧……`;
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
    if (r.fate === 'death' && cityId) this.state.cities[cityId].garrisonGeneral = null;
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
      text += `（${ownerName(c.owner)}）<br>繁榮 ${c.prosperity}${c.owner === 'neutral' ? '' : `・過路費 ${fmtStones(cityToll(this.state, c))}`}`;
    } else text += `<br>${TILE_INFO[t.kind].desc}`;
    if (this.phase === 'pickTile') text += '<br><span class="tt-move">▶ 點擊傳送至此</span>';
    this.ui.showTooltip(text, this.mouse.x, this.mouse.y);
  }

  // ───────────────────────── 畫面 ─────────────────────────

  private tileInfoHtml(index: number): string {
    const t = this.state.tiles[index];
    const here = LORD_IDS.filter((id) => this.state.lords[id].alive && this.state.lords[id].position === index);
    const people = here.length ? `<div class="ip-row">此地：${here.map((id) => `<span style="color:${LORDS[id].css}">${LORDS[id].name}</span>`).join('、')}</div>` : '';
    if (t.kind !== 'city') return `<div class="ip-head"><b>${TILE_INFO[t.kind].icon} ${t.name}</b></div><div class="ip-row">${TILE_INFO[t.kind].desc}</div>${people}`;
    const c = this.state.cities[t.cityId!];
    const g = c.garrisonGeneral ? this.state.generals[c.garrisonGeneral] : null;
    const inc = cityIncome(c);
    return `
      <div class="ip-head" style="--fc:${ownerCss(c.owner)}"><b>${c.capital ? '★ ' : ''}${c.name}</b><span>${ownerName(c.owner)}</span></div>
      <table>
        <tr><td>繁榮度</td><td>${c.prosperity}</td></tr>
        <tr><td>過路費</td><td>${c.owner === 'neutral' ? `佔領後約 ${fmtStones(toll(c))}` : fmtStones(cityToll(this.state, c))}</td></tr>
        <tr><td>每回合</td><td>${fmtStones(inc.stones)}・兵 +${inc.soldiers}</td></tr>
        <tr><td>駐將</td><td>${g ? `${g.name}（${REALMS[g.realm]}・戰力 ${power(g)}）` : '無'}</td></tr>
        <tr><td>守軍</td><td>${c.garrisonSoldiers}${c.shieldTurns ? `・護城大陣 ${c.shieldTurns}` : ''}</td></tr>
        ${c.owner !== 'neutral' ? `<tr><td>守城戰力</td><td>${garrisonPower(this.state, c)}</td></tr>` : ''}
      </table>${people}`;
  }

  private refresh() {
    if (!this.state) return;
    this.ui.renderTop(this.state);
    const player = this.state.lords[this.state.player];
    const current = currentLord(this.state);
    const myTurn = current.id === player.id && player.alive;
    const buttons: ActionButton[] = [];
    let hint: string;
    const roster: ActionButton = { label: '👥 武將', onClick: () => void this.generalsView.open(this.state, player).then(() => this.refresh()) };

    if (this.state.over) hint = '天下已定';
    else if (!player.alive) hint = `觀戰中・${LORDS[current.id].name}行動中……`;
    else if (!myTurn) {
      hint = `${LORDS[current.id].name}行動中……`;
      buttons.push(roster);
    } else if (this.phase === 'preroll') {
      hint = '擲骰前可先使用物品、徵兵、調度駐軍或整備武將';
      buttons.push(
        { label: '🎲 擲骰', sub: '空白鍵', kind: 'primary', onClick: () => this.rollResolver?.({ type: 'roll' }) },
        { label: '🎒 使用物品', sub: `${player.items.length} 件`, onClick: () => void this.useItemPreroll(player) },
        { label: '⚔️ 徵兵', sub: `${SOLDIER_PRICE}/名`, onClick: () => void this.recruitSoldiers(player) },
        { label: '🏯 調度駐軍', onClick: () => void this.manageGarrison(player) },
        { label: '🏛️ 宗門', sub: `隨行 ${freeGenerals(this.state, player.id).length}/${PARTY_LIMIT}`, disabled: !this.canSwapSect(player), onClick: () => void this.manageSect(player) },
        roster,
      );
    } else if (this.phase === 'pickTile') {
      hint = '傳送陣：點選地圖上任一格（右鍵或 Esc 取消）';
      buttons.push({ label: '✖ 取消', onClick: () => this.tileResolver?.(null) });
    } else if (this.phase === 'postland') {
      hint = '本回合行動完畢';
      buttons.push(
        roster,
        { label: '🏯 調度駐軍', onClick: () => void this.manageGarrison(player) },
        { label: '🏛️ 宗門', sub: `隨行 ${freeGenerals(this.state, player.id).length}/${PARTY_LIMIT}`, disabled: !this.canSwapSect(player), onClick: () => void this.manageSect(player) },
        { label: '結束回合', sub: 'Enter', kind: 'primary', onClick: () => this.endResolver?.() },
      );
    } else hint = '……';
    this.ui.renderActions(buttons, hint);

    this.ui.renderInfo(this.tileInfoHtml(this.hoverTile ?? player.position));
    this.hoverTile = null;
  }
}

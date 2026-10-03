import * as THREE from 'three';
import type { City, CraftStat, General, GameState, Lord, LordId } from './types';
import { citiesOf, createGameState, currentLord, freeGenerals, generalsOf, nextUid } from './GameState';
import { advance, aliveLords, startTurn } from './TurnManager';
import { fmtStones } from './Currency';
import { SceneManager } from '../scene/SceneManager';
import { World } from '../world/World';
import { CharacterSprite } from '../character/CharacterSprite';
import { LORDS, LORD_IDS, ownerCss, ownerName } from '../faction/Faction';
import { GameUI, type ActionButton } from '../ui/GameUI';
import { Dialog, type Choice } from '../ui/Dialog';
import { GeneralsView } from '../ui/GeneralsView';
import { BattleView } from '../ui/BattleView';
import { openShop } from '../ui/ShopView';
import { showEndScreen, showStartScreen } from '../ui/Screens';
import { REALMS } from '../data/generals';
import { ITEM_DEFS, PILL_IDS, STAT_NAMES } from '../data/items';
import { TILE_INFO } from '../data/board';
import { MIN_GARRISON, SOLDIER_PRICE, canOccupy, cityIncome, cityToll, eliminate, garrisonPower, occupy, occupyCost, pay, toll } from '../systems/CitySystem';
import { maxHp, power, craft } from '../systems/GeneralSystem';
import { BATTLE_NAMES, Duel, craftContest, siege, type BattleKind, type DuelEvent, type Side } from '../systems/BattleSystem';
import { canUse, def, nameOf, requirementText, useInDuel, usableIn, usePreroll, type PrerollTarget } from '../systems/ItemSystem';
import { makeStock, type ShopKind } from '../systems/ShopSystem';
import { deathChance, dispatch, REALM_TURNS } from '../systems/RealmSystem';
import { aiDefender, aiEnemyCity, aiOccupy, aiPreroll, aiRealm, aiShop, defenderPool } from '../systems/AISystem';

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
  private state!: GameState;
  private sprites = new Map<LordId, CharacterSprite>();
  private phase: Phase = 'idle';
  private token = 0;
  private hoverTile: number | null = null;
  private mouse = { x: 0, y: 0 };
  private askOnPass = true;
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
    this.generalsView = new GeneralsView(uiRoot, this.dialog);
    this.battleView = new BattleView(uiRoot);

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
    showStartScreen(this.uiRoot, (id) => this.start(id));
  }

  // ───────────────────────── 開局 ─────────────────────────

  start(player: LordId) {
    this.token++;
    this.state = createGameState(player);
    this.askOnPass = true;
    this.world.clearHighlights();
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
    this.ui.log('擲骰沿環道前進：路過無主城池可派將佔領，踏入他人城池須繳過路費或開戰。', 'info');
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
    if (report.breakthroughs.length) this.world.beamEffect(sprite.group.position);
    for (const r of report.realms) {
      const text = `${r.realmName}探索歸來。${r.dead.length ? `${r.dead.map((g) => g.name).join('、')}不幸隕落。` : '全員平安。'}${r.reward ? `帶回${r.reward}！` : '一無所獲。'}`;
      this.ui.log(`${name}：${text}`, r.dead.length ? 'bad' : 'good');
      if (lord.isPlayer) await this.dialog.message('🌀 秘境歸來', text, '🌀');
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
    for (const msg of aiPreroll(this.state, lord)) this.ui.log(`${LORDS[lord.id].name}：${msg}`, 'ai');
    this.refresh();
    await this.moveLord(lord, await this.rollDice(lord));
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
      if (i < steps) await this.passTile(lord, next);
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

  /** 路過格子：只處理無主城池的佔領 */
  private async passTile(lord: Lord, tile: number) {
    const t = this.state.tiles[tile];
    if (t.kind !== 'city') return;
    const city = this.state.cities[t.cityId!];
    if (city.owner !== 'neutral' || !canOccupy(this.state, lord, city)) return;
    if (lord.isPlayer) {
      if (this.askOnPass) await this.playerOccupy(lord, city, true);
    } else if (Math.random() < 0.6) this.aiTryOccupy(lord, city);
  }

  private async land(lord: Lord, tile: number) {
    const t = this.state.tiles[tile];
    this.refresh();
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
      if (lord.isPlayer) await this.playerOccupy(lord, city, false);
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

  private async playerOccupy(lord: Lord, city: City, passing: boolean) {
    const inc = cityIncome(city);
    const free = freeGenerals(this.state, lord.id);
    const choices: Choice<string>[] = free.map((g) => ({ label: g.name, sub: `${REALMS[g.realm]}・戰力 ${power(g)}`, value: g.id, color: LORDS[g.origin].css }));
    if (passing) choices.push({ label: '本局路過不再詢問', sub: '之後只有停在無主城池時才會詢問', value: '__never' });
    const gid = await this.dialog.choose(
      `${passing ? '路過' : '抵達'}${city.name}・是否佔領？`,
      `佔領費 ${fmtStones(occupyCost(city))}（持有 ${fmtStones(lord.stones)}）
繁榮度 ${city.prosperity}｜每回合收入 ${fmtStones(inc.stones)}、士兵 +${inc.soldiers}｜過路費 ${fmtStones(toll(city, citiesOf(this.state, lord.id).length + 1))}（佔領後）\n請選擇駐守武將：`,
      choices,
      '不佔領',
      '🏯',
    );
    if (!gid) return;
    if (gid === '__never') {
      this.askOnPass = false;
      return;
    }
    const amounts = [100, 200, 300, 500, 800, 1200].filter((a) => a <= lord.soldiers);
    const soldiers = await this.dialog.choose(
      `派多少士兵駐守${city.name}？`,
      `目前士兵 ${lord.soldiers}。守軍越多，被攻城時越難攻破。`,
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
        sub: `比拼${STAT_NAMES[s]}能力，我方最高 ${Math.max(0, ...free.map((g) => craft(g, s)))}`,
        value: s as BattleKind,
        disabled: !free.length,
        reason: noGen,
      })),
      {
        label: '🏯 攻城戰',
        sub: `最多三將 + 全部 ${lord.soldiers} 兵，勝則奪城｜守方約 ${garrisonPower(this.state, city)}`,
        value: 'siege',
        disabled: !free.length || lord.soldiers <= 0,
        reason: !free.length ? noGen : '沒有士兵',
      },
    ];
    const kind = await this.dialog.choose(
      `踏入${owner}的${city.name}`,
      `過路費 ${fmtStones(fee)}｜駐將 ${guard ? `${guard.name}（${REALMS[guard.realm]}・戰力 ${power(guard)}）` : '無'}・守軍 ${city.garrisonSoldiers}\n選擇繳費，或發起戰鬥。<b>戰鬥失敗將付雙倍過路費 ${fmtStones(fee * 2)}。</b>${fee * 2 > lord.stones ? '\n<b style="color:#b33a2a">⚠️ 雙倍過路費超過你持有的靈石，戰敗將被迫變賣資產，甚至破產！</b>' : ''}`,
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
      this.ui.log(`擂台戰：${atkGen.name} vs ${defGen.name}，${w.name}勝出。`, involved ? 'info' : 'ai');
      return winner === 'a';
    }

    const stat = kind as CraftStat;
    const r = craftContest(atkGen, defGen, stat);
    if (involved) await this.battleView.showContest(r, atkGen, attacker.id, defGen, defender.id, attacker.isPlayer ? 'a' : 'b');
    this.ui.log(`${STAT_NAMES[stat]}比試：${atkGen.name} ${r.aScore} vs ${defGen.name} ${r.bScore}。`, involved ? 'info' : 'ai');
    return r.winner === 'a';
  }

  private async runSiege(attacker: Lord, city: City, preset: General[]): Promise<boolean> {
    const defender = this.state.lords[city.owner as LordId];
    let team = preset;
    if (attacker.isPlayer) {
      const pool = freeGenerals(this.state, attacker.id);
      const picked = await this.dialog.pickMany(
        `攻打${city.name}・選擇出征武將`,
        `最多派遣三名武將，率領全部 ${attacker.soldiers} 名士兵攻城。城池駐軍有 1.5 倍加成。`,
        pool.map((g) => ({ label: g.name, sub: `${REALMS[g.realm]}・戰力 ${power(g)}・血量 ${g.hp}/${maxHp(g)}`, value: g })),
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
    if (!r.win) return false;

    // 奪城：原駐將退回主公身邊，攻方派將駐守
    if (oldGeneral) {
      oldGeneral.status = 'free';
      oldGeneral.cityId = null;
    }
    city.garrisonGeneral = null;
    let gid = [...team].sort((a, b) => power(a) - power(b))[0].id;
    let soldiers = Math.min(attacker.soldiers, Math.max(MIN_GARRISON, Math.round(attacker.soldiers * 0.4)));
    if (attacker.isPlayer) {
      const g = await this.dialog.choose(`攻下${city.name}！派誰駐守？`, '', team.map((x) => ({ label: x.name, sub: `戰力 ${power(x)}`, value: x.id })), null, '🏯');
      if (g) gid = g;
      const amounts = [100, 200, 300, 500, 800].filter((a) => a <= attacker.soldiers);
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
        color: LORDS[g.origin].css,
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
      await openShop(this.dialog, lord, kind, offers, (msg) => {
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
    else {
      pick.general.owner = lord.id;
      pick.general.status = 'free';
    }
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
      [100, 300, 500, 1000, 2000].map((a) => ({ label: `徵召 ${a} 名`, sub: fmtStones(a * SOLDIER_PRICE), value: a, disabled: lord.stones < a * SOLDIER_PRICE, reason: '靈石不足' })),
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
      { label: '增派士兵', sub: `從主公帳下調兵（目前 ${lord.soldiers}）`, value: 'add', disabled: lord.soldiers < 100, reason: '士兵不足' },
      { label: '撤回士兵', sub: `至少保留 ${MIN_GARRISON} 守軍`, value: 'remove', disabled: city.garrisonSoldiers - MIN_GARRISON < 100, reason: '守軍已達下限' },
      { label: '更換駐將', sub: '由隨行武將換下目前駐將', value: 'swap', disabled: !free.length, reason: '沒有隨行武將' },
    ]);
    if (action === 'add' || action === 'remove') {
      const max = action === 'add' ? lord.soldiers : city.garrisonSoldiers - MIN_GARRISON;
      const n = await this.dialog.choose(
        action === 'add' ? '增派多少？' : '撤回多少？',
        '',
        [100, 200, 300, 500, 1000].filter((a) => a <= max).map((a) => ({ label: `${a} 名`, value: a })),
      );
      if (!n) return;
      const sign = action === 'add' ? 1 : -1;
      city.garrisonSoldiers += n * sign;
      lord.soldiers -= n * sign;
    } else if (action === 'swap') {
      const g = await this.pickGeneral(`由誰接替駐守${city.name}？`, free, 'siege');
      if (!g) return;
      if (city.garrisonGeneral) {
        const old = this.state.generals[city.garrisonGeneral];
        old.status = 'free';
        old.cityId = null;
      }
      g.status = 'garrison';
      g.cityId = city.id;
      city.garrisonGeneral = g.id;
    }
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
        roster,
      );
    } else if (this.phase === 'pickTile') {
      hint = '傳送陣：點選地圖上任一格（右鍵或 Esc 取消）';
      buttons.push({ label: '✖ 取消', onClick: () => this.tileResolver?.(null) });
    } else if (this.phase === 'postland') {
      hint = '本回合行動完畢';
      buttons.push(roster, { label: '🏯 調度駐軍', onClick: () => void this.manageGarrison(player) }, { label: '結束回合', sub: 'Enter', kind: 'primary', onClick: () => this.endResolver?.() });
    } else hint = '……';
    this.ui.renderActions(buttons, hint);

    this.ui.renderInfo(this.tileInfoHtml(this.hoverTile ?? player.position));
    this.hoverTile = null;
  }
}

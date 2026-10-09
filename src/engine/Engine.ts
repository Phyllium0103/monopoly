import { MATERIAL_GROUPS, MATERIAL_NAMES, WEAPON_CATALOG, WEAPON_GRADES, WEAPON_PENETRATION, type MaterialGroup } from '../data/weaponCatalog';
import { materialIncome, materialsText, synthesize, upgradeRequirement, upgradeWeapon } from '../systems/MaterialSystem';
import { tournamentBracket, tournamentWinner, grantTournamentPrize } from '../systems/TournamentSystem';
import { abilityUsers, abilityReady, abilityTargets, useGeneralAbility, seclusionUser, startSeclusion, itemBlockUser, triggerItemBlock } from '../systems/GeneralAbilities';
import { sectDispatchFee, sectTransferRequirement, transferSectGeneral } from '../systems/SectSystem';
import { garrisonDispatch } from '../systems/GarrisonSystem';
import { immortalWinner } from '../systems/VictorySystem';
import type { City, CraftStat, Equipment, General, GameState, Item, Lord, LordId } from '../game/types';
import type { ContestKind } from '../game/types';
import { GARRISON_LIMIT, abandonIfEmpty, deployable, PARTY_LIMIT, citiesOf, garrisonOf, currentLord, freeGenerals, generalsOf, joinLord, killGeneral, sectGenerals } from '../game/GameState';
import { advance, aliveLords, startTurn } from '../game/TurnManager';
import { fmtProsperity, fmtStones } from '../game/Currency';
import { LORDS, LORD_IDS, originCss, ownerCss, ownerName } from '../faction/Faction';
import { facts, type Choice } from '../ui/Dialog';
import { portraitUrl, equipIconUrl } from '../ui/Icons';
import { CASINO_MIN_BET, CASINO_NAME, aiCasinoBet, diceTotal, maxBet, playCasino, type CasinoResult } from '../systems/CasinoSystem';
import { REALMS } from '../data/generals';
import { bindPassiveState, passiveOf, fx, lordHas } from '../data/passives';
import { ELEMENT_CSS, ELEMENT_NAMES, ITEM_DEFS, STAT_NAMES, equipDesc, equipRealm, techniqueDesc } from '../data/items';
import { terrainEffects, terrainOf } from '../data/terrain';
import { GARRISON_STRENGTH, MIN_GARRISON, canOccupy, cityIncome, citySaleValue, eliminate, recruitCost, veinStones, garrisonPower, occupy, occupyCost, pay, sellCity, sellGeneral, toll, visitingToll } from '../systems/CitySystem';
import { generalSaleValue, BREAK_FAIL_HP, boltRange, attack, attemptBreak, battleExp, breakChance, canAttemptBreak, canLearn, craft, defense, equip, unequip, learn, abolish, inBottleneck, maxHp, maxStamina, needsTribulation, power, qiDeviation, tribulation } from '../systems/GeneralSystem';
import { BATTLE_NAMES, CONTEST_SOLDIERS, Duel, SIEGE_START_ROUND, SURRENDER_HP, WOUNDED_HP, WOUNDED_REDUCE, canDuel, craftContest, siege, siegeAllowed, siegeAttack, type BattleKind, type DuelEvent, type Side } from '../systems/BattleSystem';
import { chooseCategorizedItem } from '../ui/ItemUI';
import { aptTag, generalBlock, generalBrief, realmTag, statCells, vitalBars, itemTargetInfo, itemUserInfo, sortUsers } from '../ui/GeneralInfo';
import { canUse, consumeItem, def, nameOf, useInDuel, usableIn, usePreroll, type PrerollTarget } from '../systems/ItemSystem';
import { buy, makeStock, makeSellStock, beginShopVisit, refreshShop, sell, lockTavernGeneral, SHOP_REFRESH_COSTS, type Offer, type ShopKind } from '../systems/ShopSystem';
import { REALM_LEVELS, REALM_MAX_PARTY, REALM_MIN_PARTY, deathChance, dispatch, partyRealm, realmRolls, realmTurns } from '../systems/RealmSystem';
import { aiDefender, aiEnemyCity, aiManageSect, aiOccupy, aiPreroll, aiRealm, aiShop, defenderPool } from '../systems/AISystem';
import { enterFork, nextMovementTile } from '../systems/MovementSystem';
import { rollRoadEvent } from '../systems/RoadEvents';
import { EVENT_INTERVAL, IMMORTAL_INTERVAL, TOURNAMENT_INTERVAL, eventDef, aiBid, applyWorldEvent, auctionLot, banditToll, pickWorldEvent, resolveAuction, tickWorldEvents } from '../systems/EventSystem';
import { Ask, type DuelAction, type PrerollAction, type Prompt, type RosterAction, type Sender, type ShopAction } from './prompts';
import type { EngineView } from './view';
import { duelSnapshot } from './snapshots';

type RollChoice = { type: 'roll' } | { type: 'teleport'; tile: number };
export type RosterActionType = Exclude<RosterAction, { type: 'close' }>['type'];

const CRAFTS: CraftStat[] = ['alchemy', 'forging', 'talisman', 'formation'];

export interface EnginePorts {
  view: EngineView;
  /** 向某位主公提出抉擇 */
  send: Sender;
  /** 託管或交由電腦代打的主公：由電腦決定 */
  isAuto(lord: LordId): boolean;
  /** 多人模式：沒有「破產後直接結算」等單機專屬流程 */
  multiplayer: boolean;
  /** 單機玩家選擇觀戰到底 */
  onSpectate?(): void;
}

/**
 * 遊戲引擎：完整的回合流程與規則，不碰任何畫面或網路。
 * 單機時在瀏覽器裡跑；多人時在伺服器（Edge Function）上跑，玩家只送出抉擇。
 */
export class Engine {
  stopped = false;
  /** 本回合開始時新進入瓶頸的武將，玩家回合開始時提示 */
  private pendingBreak: string[] = [];
  /** 選格子時可否選乾坤骰閣（迷魂指定對手落點時不行） */
  private pickCasinoOk = true;

  constructor(public state: GameState, private ports: EnginePorts) {
    bindPassiveState(state);
  }

  private get view() {
    return this.ports.view;
  }

  /** 真人操作中的主公：玩家且沒有託管 */
  human(l: Lord) {
    return l.isPlayer && !this.ports.isAuto(l.id);
  }

  private dlg(lord: Lord | LordId) {
    return new Ask(typeof lord === 'string' ? lord : lord.id, this.ports.send);
  }

  private ask(lord: Lord, prompt: Prompt) {
    return this.ports.send(lord.id, prompt);
  }

  private wait(ms: number) {
    return this.view.wait(ms);
  }

  stop() {
    this.stopped = true;
  }

  // ───────────────────────── 主迴圈 ─────────────────────────

  async run() {
    while (!this.stopped && !this.state.over) {
      if (!(await this.step())) return;
    }
  }

  /** 一次迴圈：目前主公的回合，以及回合後的比武、換輪事件。回傳 false 代表遊戲結束或已停止。 */
  async step(): Promise<boolean> {
    await this.wait(0);
    if (this.stopped || this.state.over) return false;
    const lord = currentLord(this.state);
    if (lord.alive) {
      if (!this.human(lord)) this.view.beginReport(lord.id);
      await this.takeTurn(lord);
      if (lord.tollFreeTurns > 0) lord.tollFreeTurns--;
      if (lord.clearCultivationTurns) lord.clearCultivationTurns--;
      lord.tollFree = lord.tollFreeTurns > 0;
      if (!this.state.over && !this.human(lord)) await this.view.endReport(lord.id, this.state.round);
    }
    await this.wait(0);
    if (this.stopped || this.state.over) return false;
    if (await this.checkEnd()) return false;
    const completedRound = !this.state.order.slice(this.state.turn + 1).some((id) => this.state.lords[id].alive);
    if (completedRound && this.state.round % TOURNAMENT_INTERVAL === 0) {
      await this.runTournament();
      if (this.stopped || (await this.checkEnd())) return false;
    }
    const newRound = advance(this.state);
    if (newRound) {
      if (this.state.maxRounds !== null && this.state.round > this.state.maxRounds) {
        this.state.round = this.state.maxRounds;
        await this.endGame(`${this.state.maxRounds} 輪已至，依總資產論英雄。`);
        return false;
      }
      this.view.log(`── 第 ${this.state.round} 輪 ──`, 'turn');
      await this.newRoundEvents();
      if (this.stopped || this.state.over) return false;
    }
    return true;
  }

  async checkEnd(): Promise<boolean> {
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
    await this.wait(0);
    if (this.state.over) return;
    this.state.over = true;
    this.view.refresh();
    await this.view.gameOver(reason);
  }

  // ───────────────────────── 回合 ─────────────────────────

  private async takeTurn(lord: Lord) {
    const name = LORDS[lord.id].name;
    this.view.focusTurn(lord.id);
    this.view.refresh();

    // 首都在首次收入前選定；託管與電腦由 startTurn 自動安排。
    if (this.human(lord)) for (const city of citiesOf(this.state, lord.id)) {
      if (!city.mining) await this.chooseMining(lord, city, true);
    }
    let clearThisTurn = false;
    const seclusion = seclusionUser(this.state, lord);
    if (!lord.stunned && lord.forcedTile === null && seclusion && !(lord.clearCultivationTurns ?? 0)) {
      clearThisTurn = this.human(lord) ? await this.dlg(lord).confirm('管寧：全隊清修？', '啟動當回合放棄全部主動行動，隨行隊伍（含主公）修為獲得 +100%，持續五個自身回合；使用後冷卻十個自身回合。', '開始清修', '正常行動') : Math.random() < 0.15;
      if (clearThisTurn) startSeclusion(lord, seclusion);
    }
    const report = await startTurn(this.state, lord, (g) => this.protectDeath(g), async (owner, ex, team, endangered) => {
      if (!this.human(owner)) return true;
      return this.dlg(owner).confirm('破界遁空符：全隊撤離？',
        `${ex.realmName}中，${endangered.map(g => g.name).join('、')}觸發隕落風險。\n消耗一張符可讓本次 ${team.length} 名武將全部平安撤離；境界與修為不變，整趟無獎勵。若不使用，按原規則結算死亡與獎勵（不死圖騰仍可另行選擇）。`,
        '消耗一張・全隊撤離', '不使用・繼續結算', '🌀');
    });
    this.view.log(`<b style="color:${LORDS[lord.id].css}">【${name}】</b>的回合`, 'turn');
    for (const l of report.lines) this.view.log(`${name}：${l.text}`, this.human(lord) ? l.kind : 'ai');
    if (this.human(lord)) this.pendingBreak = report.bottlenecks;
    for (const r of report.realms) {
      const text = r.summary;
      this.view.log(`${name}：${r.icon} ${text}`, r.dead.length ? 'bad' : 'good');
      for (const line of r.insights) this.view.log(`${name}：${line}`, this.human(lord) ? 'good' : 'ai');
      if (this.human(lord)) await this.dlg(lord).message(`${r.realmName}・歸來`, `${text}${r.insights.length ? `\n\n${r.insights.join('\n')}` : ''}`, r.icon);
    }
    this.view.refresh();

    if (clearThisTurn) { this.view.log(name + '全隊清修，本回合不採取主動行動。', 'good'); await this.wait(700); return; }
    if (this.human(lord)) await this.playerTurn(lord);
    else {
      for (const g of abilityUsers(this.state, lord)) if (abilityReady(this.state, lord, g).ok) {
        const target = abilityTargets(this.state, lord, g).sort((a, b) => power(b) - power(a))[0];
        if (fx(g).produceCategory || target) this.view.log(useGeneralAbility(this.state, lord, g, target), 'ai');
      }
      await this.aiTurn(lord);
    }
  }

  private async playerTurn(lord: Lord) {
    this.view.refresh();
    this.view.toast(`第 ${this.state.round} 輪・你的回合`, lord.id);
    await this.announceBreakthroughs(lord);
    if (this.state.over) return;
    const choice = await this.prerollPhase(lord);
    await this.wait(0);
    if (this.state.over || (await this.checkEnd())) return;
    this.view.refresh();
    if (choice.type === 'teleport' && !lord.stunned && lord.forcedTile === null && !lord.stayThisTurn) await this.teleport(lord, choice.tile);
    else await this.resolveDiceMovement(lord);
  }

  /** 擲骰前整備：反覆詢問要做什麼，直到擲骰（或使用傳送物品） */
  private async prerollPhase(lord: Lord): Promise<RollChoice> {
    for (;;) {
      if (this.state.over || !lord.alive || this.stopped) return { type: 'roll' };
      // 整備途中改由電腦接手
      if (!this.human(lord)) return this.autoPreroll(lord);
      const a = (await this.ask(lord, { kind: 'preroll' })) as PrerollAction | null;
      switch (a?.type) {
        case 'roll':
          return { type: 'roll' };
        case 'auto':
          if (!this.ports.multiplayer) return this.autoPreroll(lord);
          break;
        case 'items': {
          const tile = await this.useItemPreroll(lord);
          if (tile !== null) return { type: 'teleport', tile };
          break;
        }
        case 'abilities': await this.generalAbilities(lord); break;
        case 'materials': await this.materialsFlow(lord); break;
        case 'recruit': await this.recruitSoldiers(lord); break;
        case 'garrison': await this.manageGarrison(lord); break;
        case 'roster': await this.rosterFlow(lord); break;
        case 'sect': await this.manageSect(lord); break;
      }
      if (await this.checkEnd()) return { type: 'roll' };
    }
  }

  private async autoPreroll(lord: Lord): Promise<RollChoice> {
    for (const msg of await aiPreroll(this.state, lord, this.itemHooks())) this.view.log(`${LORDS[lord.id].name}：${msg}`, 'ai');
    this.view.syncCities();
    this.view.refresh();
    return { type: 'roll' };
  }

  /** 有武將修為圓滿時，提示玩家前往突破 */
  private async announceBreakthroughs(lord: Lord) {
    const ids = this.pendingBreak.filter((id) => canAttemptBreak(this.state.generals[id], this.state.round).ok);
    this.pendingBreak = [];
    if (!ids.length) return;
    const names = ids.map((id) => this.state.generals[id].name).join('、');
    const go = await this.dlg(lord).confirm(
      '✨ 修為圓滿，可以突破了！',
      `${names}修為已滿，進入瓶頸。\n到「武將名冊」就能嘗試突破（金丹以上要渡雷劫），現在前往嗎？`,
      '前往突破',
      '稍後再說',
      '✨',
    );
    if (go) await this.rosterFlow(lord);
    this.view.refresh();
  }

  private async aiTurn(lord: Lord) {
    await this.wait(350);
    const logs = await aiPreroll(this.state, lord, this.itemHooks());
    for (const msg of logs) this.view.log(`${LORDS[lord.id].name}：${msg}`, msg.includes('⚡') || msg.includes('✦') ? 'turn' : 'ai');
    if (logs.some((m) => m.includes('突破至'))) this.view.beam(lord.id);
    this.view.syncCities();
    this.view.refresh();
    if (!lord.alive) {
      // 渡劫身死的主公：敗北出局
      this.view.hideLord(lord.id);
      this.view.syncCities();
      this.view.refresh();
      return;
    }
    if (await this.checkEnd()) return;
    await this.resolveDiceMovement(lord);
    if (lord.alive) for (const msg of aiManageSect(this.state, lord)) this.view.log(`${LORDS[lord.id].name}：${msg}`, 'ai');
    await this.wait(300);
  }

  /** 移動限制在擲骰時結算；零步與指定落點都走一般落地事件流程。 */
  private async resolveDiceMovement(lord: Lord) {
    const steps = await this.rollDice(lord);
    if (lord.stunned > 0) {
      lord.stunned--; lord.stayThisTurn = false;
      this.view.log(LORDS[lord.id].name + '受定身／鎖仙效果所困，本次擲骰原地停留。', 'bad');
      try { await this.land(lord, lord.position); }
      finally { if (lord.itemsLocked > 0) lord.itemsLocked--; }
    } else if (lord.forcedTile !== null) {
      const tile = lord.forcedTile; lord.forcedTile = null; lord.stayThisTurn = false;
      this.view.log(LORDS[lord.id].name + '受迷魂效果引導，本次擲骰強制前往' + this.state.tiles[tile].name + '。', 'bad');
      await this.teleport(lord, tile);
    } else if (lord.stayThisTurn) {
      lord.stayThisTurn = false;
      this.view.log(LORDS[lord.id].name + '使用停留物品，本次擲骰原地停留。', 'info');
      await this.land(lord, lord.position);
    } else await this.moveLord(lord, steps);
  }

  private async rollDice(lord: Lord): Promise<number> {
    const draw = () => Array.from({ length: lord.doubleDice ? 2 : 1 }, () => 1 + Math.floor(Math.random() * 6));
    let values = lord.fixedDice ? [lord.fixedDice] : draw();
    if (!lord.fixedDice && lordHas(lord.id, 'divination')) {
      const candidates = Array.from({ length: 3 }, draw);
      const exclude = this.human(lord) ? await this.dlg(lord).choose('管輅：卜問前路', '排除一個候選步數，從另外兩個隨機決定。取消則隨機排除。', candidates.map((v, i) => ({ label: '候選 ' + (i + 1) + '：' + v.reduce((a, b) => a + b, 0) + ' 點', value: i }))) : candidates.reduce((best, v, i) => v.reduce((a, b) => a + b, 0) < candidates[best].reduce((a, b) => a + b, 0) ? i : best, 0);
      const excluded = exclude ?? Math.floor(Math.random() * 3);
      const remaining = candidates.filter((_, i) => i !== excluded);
      values = remaining[Math.floor(Math.random() * remaining.length)];
    }
    await this.view.rollDice(lord.id, values, lord.bonusSteps, lord.moveMultiplier);
    await this.wait(0);
    const dice = values.reduce((a, b) => a + b, 0);
    const sum = (dice + lord.bonusSteps) * lord.moveMultiplier;
    this.view.log(`${LORDS[lord.id].name}擲出 ${dice} 點${lord.bonusSteps ? `，遁地梭加成 +${lord.bonusSteps}，共走 ${sum} 步` : ''}。`, this.human(lord) ? 'info' : 'ai');
    if (lord.moveMultiplier > 1) this.view.log('遁地梭生效，本回合共走 ' + sum + ' 步。', 'info');
    return sum;
  }

  // ───────────────────────── 移動 ─────────────────────────

  private async moveLord(lord: Lord, steps: number) {
    for (let i = 1; i <= steps; i++) {
      await this.wait(0);
      if (this.state.over) return;
      const here = lord.position;
      await this.chooseWheelDirection(lord);
      const next = nextMovementTile(this.state, lord);
      this.view.refresh();
      await this.view.moveStep(lord.id, here, next);
      await this.wait(0);
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
        this.view.log(`${LORDS[lord.id].name}：${message}`, this.human(lord) ? 'info' : 'ai');
      }
      this.passVein(lord, next);
      this.view.refresh();
      if (!lord.alive) return;
    }
    if (!this.human(lord)) {
      this.view.restartReport(lord.id);
      this.view.log(`${LORDS[lord.id].name}停在「${this.state.tiles[lord.position].name}」。`, 'ai');
    }
    await this.land(lord, lord.position);
  }

  /** 路過靈脈：不用停下，依主公本人的境界獲得靈石，每輪每位主公只領一次 */
  private passVein(lord: Lord, tile: number) {
    if (this.state.tiles[tile].kind !== 'vein' || lord.veinsTapped.includes(tile)) return;
    lord.veinsTapped.push(tile);
    const lordGen = generalsOf(this.state, lord.id).find((g) => g.isLord);
    const n = veinStones(lordGen?.realm ?? 0);
    lord.stones += n;
    this.view.log(`${LORDS[lord.id].name}路過靈脈，汲取靈氣化為 ${fmtStones(n)}（主公境界：${REALMS[lordGen?.realm ?? 0]}）。`, this.human(lord) ? 'good' : 'ai');
    if (this.human(lord)) this.view.toast(`💎 路過靈脈：+${fmtStones(n)}`, lord.id);
    this.view.beam(lord.id, 0x7ae8ff);
  }

  private async teleport(lord: Lord, tile: number) {
    await this.view.teleport(lord.id, tile);
    lord.position = tile;
    lord.lastTile = null;
    lord.forkExit = null;
    await this.land(lord, tile);
  }

  /** 隨機傳送的落點：不含傳送陣、乾坤骰閣與目前所在格 */
  private randomDestination(here: number) {
    const dests = this.state.tiles.filter((t) => t.kind !== 'portal' && t.kind !== 'casino' && t.index !== here);
    return dests[Math.floor(Math.random() * dests.length)];
  }

  /** 踩到角落的傳送陣：一半機率送往地圖正中的乾坤骰閣，否則隨機傳送到任一格 */
  private async landPortal(lord: Lord) {
    const casino = this.state.tiles.find((t) => t.kind === 'casino');
    const dest = casino && Math.random() < 0.5 ? casino : this.randomDestination(lord.position);
    this.view.log(`${LORDS[lord.id].name}踏入傳送陣，被送到「${dest.name}」！`, this.human(lord) ? 'good' : 'ai');
    if (this.human(lord)) this.view.toast(`傳送陣！被送到「${dest.name}」`, lord.id);
    await this.teleport(lord, dest.index);
  }

  private async land(lord: Lord, tile: number) {
    await this.wait(0);
    if (this.state.over) return;
    const t = this.state.tiles[tile];
    this.view.refresh();
    if (tile === this.state.merchantTile) {
      this.view.log(`${LORDS[lord.id].name}遇上旅行商人，商隊交易後離開了。`, lord.isPlayer ? 'good' : 'ai');
      await this.landShop(lord, 'merchant');
      this.state.merchantTile = null;
      this.view.setEventMarkers();
    }
    if (this.state.banditTiles.includes(tile)) await this.banditEvent(lord);
    if (!lord.alive) return;
    switch (t.kind) {
      case 'city':
        return this.landCity(lord, this.state.cities[t.cityId!]);
      case 'realm':
        return this.landRealm(lord, t.name);
      case 'vein':
        return this.passVein(lord, tile);
      case 'portal':
        return this.landPortal(lord);
      case 'road':
        return this.roadEvent(lord, t.name);
      case 'casino':
        return this.landCasino(lord);
      default:
        return this.landShop(lord, t.kind);
    }
  }

  // ───────────────────────── 城池 ─────────────────────────

  private async landCity(lord: Lord, city: City) {
    const name = LORDS[lord.id].name;
    if (city.owner === 'neutral') {
      if (!canOccupy(this.state, lord, city)) {
        if (this.human(lord)) this.view.toast(`佔領${city.name}需要 ${fmtStones(occupyCost(city))}、一名隨行武將與至少 ${MIN_GARRISON} 士兵`, lord.id);
        return;
      }
      if (this.human(lord)) await this.playerOccupy(lord, city);
      else this.aiTryOccupy(lord, city);
      return;
    }
    if (city.owner === lord.id) {
      if (this.human(lord)) this.view.toast(`回到${city.name}，可在「調度駐軍」增派守軍`, lord.id);
      else if (lord.soldiers > 1200) {
        city.garrisonSoldiers += 300;
        lord.soldiers -= 300;
        this.view.log(`${name}：增派 300 士兵駐守${city.name}`, 'ai');
      }
      return;
    }
    // 他人城池
    const owner = this.state.lords[city.owner];
    const fee = visitingToll(this.state, city, lord);
    const truce = lord.items.find(i => i.defId === 'truce');
    if (!lord.tollFree && truce && !lord.itemsLocked && (!this.human(lord) || await this.dlg(lord).confirm('免戰牌：免繳過路費？', '踏入' + city.name + '，過路費 ' + fmtStones(fee) + '。', '使用免戰牌', '繼續選擇'))) {
      consumeItem(lord, truce); this.view.log(name + '使用免戰牌，免繳' + city.name + '過路費。', 'good'); return;
    }
    if (lord.tollFree) {
      this.view.log(`${name}斂息隱行，免繳${city.name}過路費。`, this.human(lord) ? 'good' : 'ai');
      this.view.toast('斂息符生效，免繳過路費', lord.id);
      return;
    }
    for (;;) {
      const choice = this.human(lord) ? await this.playerEnemyCityChoice(lord, city, fee) : aiEnemyCity(this.state, lord, city);
      if (choice.kind === 'pay') {
        await this.payToll(lord, owner, fee, city, false);
        return;
      }
      const kind = choice.kind;
      if (!this.human(lord)) this.view.log(`${name}向${LORDS[owner.id].name}的${city.name}發起【${BATTLE_NAMES[kind]}】！`, 'ai');
      const win = await this.fight(lord, city, kind, choice.generals);
      // 中途取消：回到選擇介面，不會自動付錢
      if (win === null) continue;
      if (win === 'draw') {
        this.view.log(`${name}與${LORDS[owner.id].name}的守將戰成平手，免繳${city.name}過路費。`, this.human(lord) ? 'good' : 'ai');
        if (this.human(lord)) this.view.toast('平手！免繳過路費', lord.id);
        return;
      }
      if (this.human(lord)) this.view.log(`${name}向${LORDS[owner.id].name}的${city.name}發起【${BATTLE_NAMES[kind]}】！`, 'info');
      if (!lord.alive) return;
      if (win) {
        if (kind !== 'siege') this.view.log(`${name}${BATTLE_NAMES[kind]}獲勝，免繳過路費！`, this.human(lord) ? 'good' : 'ai');
      } else {
        this.view.log(`${name}${BATTLE_NAMES[kind]}落敗，須付雙倍過路費。`, this.human(lord) ? 'bad' : 'ai');
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
          label: `🧑 ${g.name}`, icon: portraitUrl(g),
          sub: generalBrief(g, statCells([['戰力', power(g)], ['身價', fmtStones(generalSaleValue(g))]]), { note: '賣出後自動卸下裝備，離開進入聽風樓' }),
          value: { kind: 'general', general: g } as Sale,
          color: '#c99a2e',
        })),
      ];
      let sale = await this.dlg(lord).choose(
        '💸 靈石不足，必須割地賠款',
        `需要支付 ${fmtStones(amount)}，持有 ${fmtStones(lord.stones)}，還差 ${fmtStones(amount - lord.stones)}。\n請選擇要變賣的城池或隨行武將；城池與隨行武將都賣光仍湊不齊，就會破產出局！`,
        choices,
        null,
        '💸',
      );
      // 無效的回答（例如斷線代打）：先賣最不值錢的城池
      if (!sale) sale = choices.find((c) => !c.disabled)?.value ?? null;
      if (!sale) return;
      if (sale.kind === 'city') {
        const value = sellCity(this.state, lord, sale.city);
        this.view.log(`${LORDS[lord.id].name}變賣城池「${sale.city.name}」，得 ${fmtStones(value)}。`, 'bad');
        this.view.syncCities();
      } else {
        const value = sellGeneral(lord, sale.general);
        this.view.log(`${LORDS[lord.id].name}賣掉隨行武將${sale.general.name}（裝備已卸下），得 ${fmtStones(value)}。`, 'bad');
      }
      this.view.refresh();
    }
  }

  private async payToll(lord: Lord, owner: Lord, amount: number, city: City, doubled: boolean) {
    // 玩家靈石不足時，自己選擇要變賣哪些城池
    if (this.human(lord) && lord.stones < amount) await this.raiseFunds(lord, amount);
    const r = pay(this.state, lord, amount, owner);
    for (const n of r.notes) this.view.log(`${LORDS[lord.id].name}${n}`, 'bad');
    const kind = this.human(lord) ? 'bad' : this.human(owner) ? 'good' : 'ai';
    this.view.log(`${LORDS[lord.id].name}向${LORDS[owner.id].name}繳納${city.name}${doubled ? '雙倍' : ''}過路費 ${fmtStones(r.paid)}。`, kind);
    if (this.human(lord)) this.view.toast(`${LORDS[lord.id].name}繳納過路費 ${fmtStones(r.paid)}`, lord.id);
    if (this.human(owner)) this.view.toast(`${LORDS[lord.id].name}繳納過路費 ${fmtStones(r.paid)}`, owner.id);
    this.view.syncCities();
    if (r.bankrupt) await this.onBankrupt(lord);
    this.view.refresh();
  }

  private async onBankrupt(lord: Lord, death?: string) {
    if (lord.alive) eliminate(this.state, lord);
    this.view.hideLord(lord.id);
    this.view.syncCities();
    this.view.log(death ? `💀 ${death}，${LORDS[lord.id].name}敗北出局！麾下將領四散，城池回歸無主。` : `💀 ${LORDS[lord.id].name}靈石耗盡，破產出局！麾下將領四散，城池回歸無主。`, 'bad');
    this.view.refresh();
    if (!lord.isPlayer) {
      await this.wait(600);
      return;
    }
    if (aliveLords(this.state).length <= 1) return;
    if (this.ports.multiplayer) {
      await this.view.notice(lord.id, death ? '主公陣亡，你輸了' : '你已破產出局', `${death ? `${death}，主公一死，大勢已去。` : '靈石耗盡，宗門解散。'}\n你可以繼續觀看其他主公爭到最後。`, '💀', '觀戰');
      return;
    }
    const watch = await this.dlg(lord).confirm(death ? '主公陣亡，你輸了' : '你已破產出局', `${death ? `${death}，主公一死，大勢已去。` : '靈石耗盡，宗門解散。'}
要觀看其他主公爭到最後，還是直接結算？`, '觀戰到底', '直接結算', '💀');
    if (watch) this.ports.onSpectate?.();
    else await this.endGame(death ? `${death}。` : `${LORDS[lord.id].name}破產出局。`);
  }

  private aiTryOccupy(lord: Lord, city: City) {
    const d = aiOccupy(this.state, lord, city);
    if (!d) return;
    occupy(this.state, lord, city, d.generalId, d.soldiers, occupyCost(city));
    this.view.syncCities();
    this.view.capture(city.tile, lord.id);
    this.view.log(`${LORDS[lord.id].name}派${this.state.generals[d.generalId].name}率 ${d.soldiers} 兵佔領${city.name}。`, 'ai');
    this.view.refresh();
  }

  /** 佔領後從四項技藝中指定一種比試；每座城固定開放擂台戰 */
  private async chooseContest(lord: Lord, city: City) {
    const kinds: { value: ContestKind; label: string; sub: string }[] = [
      ...(['alchemy', 'forging', 'talisman', 'formation'] as const).map((k) => ({ value: k as ContestKind, label: `🔥 ${STAT_NAMES[k]}比試`, sub: `比拼${STAT_NAMES[k]}能力值；適合${STAT_NAMES[k]}高的駐將` })),
    ];
    const gens = garrisonOf(this.state, city);
    // 推薦：駐將中最擅長的那一項技藝，排在最前面
    const best = (k: CraftStat) => Math.max(0, ...gens.map((g) => craft(g, k)));
    const recommended = gens.length ? (['alchemy', 'forging', 'talisman', 'formation'] as const).reduce((a, b) => (best(b) > best(a) ? b : a)) : null;
    kinds.sort((x, y) => Number(y.value === recommended) - Number(x.value === recommended));
    const picked = await this.dlg(lord).choose(
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
    const choices: Choice<string>[] = free.map((g) => ({ label: g.name, icon: portraitUrl(g), sub: generalBlock(g), value: g.id, color: originCss(g.origin) }));
    for (;;) {
      const gids = await this.dlg(lord).pickMany(
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
      const soldiers = await this.dlg(lord).slider(
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
      if (!canOccupy(this.state, lord, city)) return;
      occupy(this.state, lord, city, gids, soldiers, occupyCost(city));
      this.view.syncCities();
      this.view.capture(city.tile, lord.id);
      this.view.log(`支付 ${fmtStones(occupyCost(city))}，派${gids.map((id) => this.state.generals[id].name).join('、')}率 ${soldiers} 兵佔領${city.name}！`, 'good');
      this.view.toast(`佔領${city.name}！`, lord.id);
      await this.chooseContest(lord, city);
      await this.chooseMining(lord, city, true);
      this.view.refresh();
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
    const kind = await this.dlg(lord).choose(
      `踏入${owner}的${city.name}`,
      facts([
        ['過路費', `<b>${fmtStones(fee)}</b>（戰敗付雙倍 ${fmtStones(fee * 2)}）`],
        ['守軍', `${city.garrisonSoldiers} 名`],
        ...(guards.length ? guards.map((g) => ['駐將', `<b>${g.name}</b> ${realmTag(g.realm)}${aptTag(g)} 戰力 <b>${power(g)}</b>・武力 ${attack(g)}・防禦 ${defense(g)}`] as [string, string]) : [['駐將', '無'] as [string, string]]),
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
      atkGen = await this.pickGeneral(attacker, `派誰出戰${BATTLE_NAMES[kind]}？`, pool, kind, true);
      if (!atkGen) return null;
    }
    if (!atkGen) return false;

    // 擂台與技藝比試：守方可保留城池而退讓，攻方不提供脫逃。
    const defensePool = defenderPool(this.state, city).filter(g => kind !== 'duel' || canDuel(g));
    const best = [...defensePool].sort((a, b) => kind === 'duel' ? power(b) - power(a) : craft(b, kind as CraftStat) - craft(a, kind as CraftStat))[0];
    const attackScore = kind === 'duel' ? power(atkGen) : craft(atkGen, kind as CraftStat);
    const defenseScore = best ? (kind === 'duel' ? power(best) : craft(best, kind as CraftStat)) : 0;
    let flee = false;
    let defGen: General | null = null;
    let defPicked = false;
    if (this.human(defender)) for (;;) {
      const decision = await this.dlg(defender).choose(
        `${LORDS[attacker.id].name}挑戰${city.name}【${BATTLE_NAMES[kind]}】`,
        `<b>敵將 ${atkGen.name}</b>${generalBlock(atkGen)}<br>臨陣脫逃會直接判負，保留城池、駐將與其餘守軍。守軍四分之一（${Math.floor(city.garrisonSoldiers / 4)} 人）加入敵方，對方免繳過路費。`,
        [
          { label: '迎戰・選擇應戰武將', value: 'fight', sub: defensePool.map(g => `<b class="gb-name">${g.name}</b>${generalBrief(g, statCells([['戰力', power(g)], ['武力', attack(g)], ['防禦', defense(g)]]) + vitalBars(g), { passive: false })}`).join('') || '沒有可應戰武將，將不戰而敗' },
          { label: '臨陣脫逃', value: 'flee', sub: `保留${city.name}，${Math.floor(city.garrisonSoldiers / 4)} 名守軍倒戈` },
        ], null, '⚔️',
      );
      flee = decision === 'flee';
      if (flee) break;
      // 選擇應戰武將；按「返回」回到迎戰／脫逃的選擇
      if (!defensePool.length) { defPicked = true; break; }
      const picked = await this.pickGeneral(defender, `${LORDS[attacker.id].name}的${atkGen.name}挑戰${city.name}【${BATTLE_NAMES[kind]}】，派誰應戰？`, defensePool, kind, true, '返回');
      if (picked) { defGen = picked; defPicked = true; break; }
      // 斷線代打時直接派最強的守將，避免卡在這裡
      if (this.ports.isAuto(defender.id)) { defPicked = false; break; }
    } else flee = attackScore > defenseScore * 1.8 && Math.random() < 0.5;
    if (flee) {
      const joined = Math.floor(city.garrisonSoldiers / 4);
      city.garrisonSoldiers -= joined;
      attacker.soldiers += joined;
      this.view.log(`${LORDS[defender.id].name}在${city.name}【${BATTLE_NAMES[kind]}】臨陣脫逃，${joined} 名守軍加入${LORDS[attacker.id].name}；城池與駐將保留，攻方免繳過路費。`, this.human(defender) ? 'bad' : involved ? 'good' : 'ai');
      this.view.syncCities();
      this.view.refresh();
      return true;
    }

    // 守方武將（玩家已在上面選好）
    if (!defPicked) defGen = aiDefender(this.state, city, kind);
    if (!defGen) {
      this.view.log(`${city.name}無人應戰，${atkGen.name}不戰而勝。`, 'info');
      return true;
    }

    if (kind === 'duel') {
      const duel = new Duel(attacker, atkGen, defender, defGen);
      const winner = await this.runDuel(duel, attacker, defender, '⚔️ 擂台戰');
      if (winner === 'draw') {
        // 平手：雙方都獲得歷練，過路費一筆勾銷
        const g1 = battleExp(atkGen, null);
        const g2 = battleExp(defGen, null);
        this.view.log(`擂台戰：${atkGen.name} vs ${defGen.name}，戰成平手！雙方各得歷練（修為 +${g1} / +${g2}），免繳過路費。`, involved ? 'info' : 'ai');
        for (const f of [duel.a, duel.b]) if (f.hp <= 0) await this.onGeneralSlain(f.general, involved, f.itemsSealed);
        return 'draw';
      }
      const w = winner === 'a' ? atkGen : defGen;
      const l = winner === 'a' ? defGen : atkGen;
      const dead = duel.slainGeneral();
      const gain = battleExp(w, dead ? null : l);
      const verdict = dead ? `（${l.name}戰死）` : duel.surrendered ? `（${l.name}認輸）` : '';
      this.view.log(`擂台戰：${atkGen.name} vs ${defGen.name}，${w.name}勝出${verdict}，生死歷練修為 +${gain}。`, involved ? 'info' : 'ai');
      if (dead) await this.onGeneralSlain(dead, involved, duel.fighter(dead.id === atkGen.id ? 'a' : 'b').itemsSealed);
      return winner === 'a';
    }

    const stat = kind as CraftStat;
    if (city.garrisonSoldiers < CONTEST_SOLDIERS) {
      this.view.log(`${city.name}守軍不足 ${CONTEST_SOLDIERS}，無法維持鬥法秩序，${atkGen.name}不戰而勝。`, involved ? 'info' : 'ai');
      return true;
    }
    const r = craftContest(atkGen, defGen, stat, attacker, city);
    if (involved) await this.view.contest(r, atkGen.id, attacker.id, defGen.id, defender.id);
    const gain = battleExp(r.winner === 'a' ? atkGen : defGen, r.winner === 'a' ? defGen : atkGen);
    this.view.log(
      `${STAT_NAMES[stat]}比試：${atkGen.name} ${r.aScore} vs ${defGen.name} ${r.bScore}。攻方折兵 ${r.aLoss}、守軍折損 ${r.bLoss}，勝者修為 +${gain}。`,
      involved ? 'info' : 'ai',
    );
    this.view.syncCities();
    return r.winner === 'a';
  }

  /**
   * 擂台戰：每回合真人選擇攻擊、功法或物品，電腦自動決定；雙方都是電腦時直接算完。
   * 回傳勝方或平手。
   */
  private async runDuel(duel: Duel, aLord: Lord, bLord: Lord, title: string): Promise<Side | 'draw'> {
    const lordOf = (s: Side) => (s === 'a' ? aLord : bLord);
    if (!this.human(aLord) && !this.human(bLord)) {
      while (!duel.over) {
        const aItems = this.aiBattleItem(duel, 'a', aLord), bItems = duel.over ? null : this.aiBattleItem(duel, 'b', bLord);
        if (aItems) duel.afterItem(aItems);
        if (bItems) duel.afterItem(bItems);
        if (!duel.over) duel.round({ a: aItems ? 'none' : duel.aiAction('a'), b: bItems ? 'none' : duel.aiAction('b') });
      }
      duel.finish();
      return duel.draw ? 'draw' : duel.winner!;
    }
    this.view.duelStart(duelSnapshot(duel), title);
    while (!duel.over) {
      let events: DuelEvent[] = [];
      const acts: Record<Side, 'attack' | 'skill' | 'none'> = { a: 'attack', b: 'attack' };
      for (const side of ['a', 'b'] as const) {
        if (duel.over) break;
        const lord = lordOf(side);
        if (this.human(lord)) {
          for (;;) {
            const act = (await this.ask(lord, { kind: 'duel', side, duel: duelSnapshot(duel) })) as DuelAction | null;
            if (act === 'item') {
              const ev = await this.useItemInDuel(duel, side, lord);
              if (!ev) continue;
              events = events.concat(duel.afterItem(ev));
              acts[side] = 'none';
              break;
            }
            acts[side] = act === 'skill' && duel.canSkill(side) ? 'skill' : 'attack';
            break;
          }
        } else {
          const items = this.aiBattleItem(duel, side, lord);
          if (items) {
            events = events.concat(duel.afterItem(items));
            acts[side] = 'none';
          } else acts[side] = duel.aiAction(side);
        }
      }
      if (!duel.over) events = events.concat(duel.round(acts));
      await this.view.duelEvents(duelSnapshot(duel), events);
    }
    await this.view.duelEvents(duelSnapshot(duel), duel.verdict());
    duel.finish();
    await this.view.duelEnd(duelSnapshot(duel));
    return duel.draw ? 'draw' : duel.winner!;
  }

  /** 擂台或擲骰前物品致死，共用護法、清理與主公敗北流程。 */
  private async onGeneralSlain(g: General, involved: boolean, sealed = false, cause = '戰死擂台') {
    if (!sealed && await this.protectDeath(g)) { this.view.refresh(); return; }
    const owner = g.owner;
    const abandoned = killGeneral(this.state, g);
    this.view.syncCities();
    if (abandoned) this.view.log(`🏚️ ${this.state.cities[abandoned].name}失去所有駐將，成為空城，守軍離去。`, 'bad');
    this.view.log(`💀 ${g.name}${cause}，從此除名！`, owner && this.state.lords[owner].isPlayer ? 'bad' : involved ? 'good' : 'ai');
    if (involved) this.view.toast(`${g.name}${cause}`);
    this.view.refresh();
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
        const picked = await this.dlg(attacker).pickMany(
          `攻打${city.name}・選擇出征武將`,
          `最多派遣三名武將；選好武將後，可自行決定出兵數量。\n戰敗則出征的士兵全滅；勝方也會折損，雙方越接近折損越多。\n一名守軍約等於十五名隨行士兵；武將武力越高，統率加成越大。守方約 ${garrisonPower(this.state, city)}。`,
          pool.map((g) => ({ label: g.name, icon: portraitUrl(g), sub: generalBlock(g), value: g })),
          1,
          3,
          '出征',
        );
        if (!picked) return null;
        team = picked;
        const sent = await this.dlg(attacker).slider(
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
    if (involved) await this.view.siege(r, team.map((g) => g.id), attacker.id, city.id, oldGenerals.map((g) => g.id), defender.id);
    this.view.log(`攻城戰：${LORDS[attacker.id].name} ${r.attack} vs ${city.name} ${r.defense}，${r.win ? '城破！' : '攻城失敗。'}`, involved ? 'info' : 'ai');
    if (!r.win) {
      for (const og of oldGenerals) this.view.log(`${og.name}守城有功，修為 +${battleExp(og, team[0])}。`, involved ? 'info' : 'ai');
      return false;
    }
    for (const g of team) battleExp(g, oldGenerals[0] ?? null);

    // 奪城：原駐將退回主公身邊（閉關中則走火入魔），攻方派將駐守
    for (const og of oldGenerals) {
      if (og.secluded) {
        qiDeviation(og);
        this.view.log(`${og.name}閉關被打斷，走火入魔！重傷並損失一半修為。`, this.human(defender) ? 'bad' : involved ? 'good' : 'ai');
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
        const picked = await this.dlg(attacker).pickMany(`攻下${city.name}！派誰駐守？`, `最多 ${GARRISON_LIMIT} 人，駐將越多守城越強。（主公本人不能駐守）`, cand.map((x) => ({ label: x.name, icon: portraitUrl(x), sub: generalBlock(x), value: x.id })), 1, Math.min(GARRISON_LIMIT, cand.length), '駐守');
        if (picked) gids = picked;
      } else gids = [];
      if (attacker.soldiers > 0) {
        const s = await this.dlg(attacker).slider(
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
      this.view.syncCities();
      this.view.log(`${LORDS[attacker.id].name}攻破${city.name}，卻無將可派駐，城池淪為空城。`, this.human(attacker) ? 'bad' : 'ai');
      this.view.refresh();
      return true;
    }
    this.view.syncCities();
    this.view.capture(city.tile, attacker.id);
    if (this.human(attacker)) {
      await this.chooseContest(attacker, city);
      await this.chooseMining(attacker, city, true);
    }
    this.view.log(`${LORDS[attacker.id].name}奪下${city.name}，由${gids.length ? gids.map((id) => this.state.generals[id].name).join('、') : '（無駐將）'}駐守。`, this.human(attacker) ? 'good' : this.human(defender) ? 'bad' : 'ai');
    this.view.refresh();
    return true;
  }

  private pickGeneral(lord: Lord, title: string, pool: General[], kind: BattleKind, cancelable = true, cancelLabel = '取消'): Promise<General | null> {
    const risky = (g: General) => (kind === 'duel' && g.isLord ? '・⚠️主公戰死即敗北' : '') + (kind === 'duel' && g.hp < maxHp(g) * WOUNDED_HP ? '・⚠️血量偏低，易戰死' : '');
    const stat = kind === 'duel' || kind === 'siege' ? null : (kind as CraftStat);
    return this.dlg(lord).choose(
      title,
      '',
      // 只列與這場比試有關的數值（含被動）；技藝比試依該能力值由高到低，擂台依戰力
      [...pool].sort((x, y) => (stat ? craft(y, stat) - craft(x, stat) : power(y) - power(x))).map((g) => ({
        label: g.name, icon: portraitUrl(g),
        sub: stat
          ? generalBrief(g, statCells([[STAT_NAMES[stat], craft(g, stat)], ['體力', `${g.stamina}/${maxStamina(g)}`]]))
          : kind === 'duel'
            ? generalBlock(g, { note: [g.technique ? `功法：${g.technique.name}` : '', risky(g).replace(/^・/, '')].filter(Boolean).join('・') })
            : generalBrief(g, statCells([['戰力', power(g)], ['武力', attack(g)]])),
        value: g,
        color: originCss(g.origin),
      })),
      cancelable ? cancelLabel : null,
    );
  }

  /** 戰鬥中使用物品：選物品 → 選使用的武將 → 生效 */
  private async useItemInDuel(duel: Duel, side: Side, lord: Lord): Promise<DuelEvent[] | null> {
    if (lord.itemsLocked > 0 || duel.fighter(side).itemsSealed) { this.view.toast('目前不能使用物品', lord.id); return null; }
    const items = lord.items.filter((i) => usableIn(i, 'battle'));
    if (!items.length) {
      this.view.toast('沒有可在戰鬥中使用的物品', lord.id);
      return null;
    }
    const selection = { category: null as string | null };
    for (;;) {
      const item = await chooseCategorizedItem(this.dlg(lord), items, selection);
      if (!item) return null;
      const fighter = duel.fighter(side).general;
      const users = [fighter, ...freeGenerals(this.state, lord.id).filter((g) => g.id !== fighter.id)];
      const user = await this.dlg(lord).choose(
        `由誰使用${nameOf(item)}？`,
        '使用物品會消耗該武將的體力，能力值須達到門檻。',
        sortUsers(users, item).map((g) => {
          const c = canUse(item, g);
          return { label: g.name, icon: portraitUrl(g), sub: generalBrief(g, `<span class="gb-line">${itemUserInfo(g, item)}</span>`, { passive: false }), value: g, disabled: !c.ok, reason: c.reason };
        }),
      );
      if (!user) continue;
      return useInDuel(duel, side, lord, item, user);
    }
  }

  // ───────────────────────── 秘境、商店、驛道 ─────────────────────────

  private async landRealm(lord: Lord, realmName: string) {
    if (!lord.items.some(i => i.defId === 'realmkey') || lord.itemsLocked > 0) {
      if (this.human(lord)) await this.dlg(lord).message('秘境入口', lord.itemsLocked > 0 ? '目前不能使用物品，無法消耗秘境遺鑰。' : `探索${realmName}需消耗一把秘境遺鑰，可在天寶商行購買（3000 下品靈石）。`, '🌀');
      return;
    }
    const free = deployable(this.state, lord.id);
    if (!free.length) {
      if (this.human(lord)) this.view.toast(`探索${realmName}需要至少一名隨行武將`, lord.id);
      return;
    }
    let team: General[] | null = null;
    let level = 0;
    if (this.human(lord)) {
      // 選難度 → 選人 → 確認；任何一步按取消都回到上一步重新選擇
      const best = [...free].sort((x, y) => y.realm - x.realm || power(y) - power(x)).slice(0, 3);
      for (;;) {
        const picked = await this.dlg(lord).choose(
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
          chosen = await this.dlg(lord).pickMany(
            `🌀 ${realmName}（${L.name}秘境）・選擇武將`,
            `選 ${REALM_MIN_PARTY}–${REALM_MAX_PARTY} 人；歷時依隊伍平均境界而定，人越多個別隕落率越低，四人以上多得一份寶物。按取消可回到難度選擇。`,
            // 依境界由高到低，同境界比修為
            [...free].sort((x, y) => y.realm - x.realm || y.exp - x.exp).map((g) => ({ label: g.name, icon: portraitUrl(g), sub: generalBrief(g, statCells([['戰力', power(g)], ['單獨隕落率', `${Math.round(deathChance(g, [g], level) * 100)}%`]]) + vitalBars(g)), value: g })),
            REALM_MIN_PARTY,
            REALM_MAX_PARTY,
            '下一步',
          );
          if (!chosen) break;
          const ok = await this.dlg(lord).confirm(
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
    this.view.log(`${LORDS[lord.id].name}消耗一把秘境遺鑰，派遣${team.map((g) => g.name).join('、')}進入${realmName}（${REALM_LEVELS[level].name}秘境，${realmTurns(level, team)} 回合）。`, this.human(lord) ? 'good' : 'ai');
    this.view.refresh();
  }

  /** 乾坤骰閣：玩家自訂賭注開一把；電腦手頭寬裕時小賭 */
  private async landCasino(lord: Lord) {
    const human = this.human(lord);
    let r: CasinoResult | null = null;
    if (human) {
      const a = await this.ask(lord, { kind: 'casino' });
      const bet = typeof a === 'number' ? Math.floor(a / CASINO_MIN_BET) * CASINO_MIN_BET : 0;
      if (bet >= CASINO_MIN_BET && bet <= maxBet(lord)) r = playCasino(lord, bet);
      // 開盅動畫在玩家自己的畫面播放（下注視窗仍開著）
      if (r) await this.view.casino(lord.id, r);
    } else {
      const bet = aiCasinoBet(lord);
      if (bet) r = playCasino(lord, bet);
    }
    if (r) {
      const tail = r.net > 0 ? `贏得 ${fmtStones(r.net)}` : r.net < 0 ? `輸掉 ${fmtStones(-r.net)}` : '和局，賭注退回';
      this.view.log(`${LORDS[lord.id].name}在${CASINO_NAME}押 ${fmtStones(r.bet)}：莊家 ${diceTotal(r.dealer)} 點、自己 ${diceTotal(r.player)} 點${r.outcome === 'triple' ? '（豹子）' : ''}，${tail}。`, human ? (r.net >= 0 ? 'good' : 'bad') : 'ai');
    } else if (!human) this.view.log(`${LORDS[lord.id].name}在${CASINO_NAME}沒有下注。`, 'ai');
    this.view.refresh();
    // 離開後被隨機送往地圖其他地點，並觸發該地事件
    if (this.state.over || !lord.alive) return;
    const dest = this.randomDestination(lord.position);
    this.view.log(`${LORDS[lord.id].name}離開${CASINO_NAME}，被送到「${dest.name}」。`, human ? 'good' : 'ai');
    if (human) this.view.toast(`離開${CASINO_NAME}，被送到「${dest.name}」`, lord.id);
    await this.teleport(lord, dest.index);
  }

  private async landShop(lord: Lord, kind: ShopKind) {
    const offers = makeStock(this.state, lord, kind);
    if (this.human(lord)) return this.shopFlow(lord, kind, offers);
    const limit = kind === 'tavern' && lordHas(lord.id, 'recruitLimit') ? 2 : 1;
    const visit = beginShopVisit(this.state, lord, kind, offers);
    for (let purchased = 0; purchased < limit;) {
      const pick = aiShop(this.state, lord, visit.offers.filter(o => o.kind !== 'general' || !o.general.owner));
      if (!pick) {
        const cost = SHOP_REFRESH_COSTS[visit.refreshes];
        // 電腦只在沒有合適貨品且付費後仍留足備用金時刷新。
        if (cost === undefined || !visit.offers.length || lord.stones < cost + 8000) break;
        const r = refreshShop(this.state, lord, visit); if (!r.ok) break;
        this.view.log(r.message, 'ai'); continue;
      }
      const result = buy(this.state, lord, pick); if (!result.ok) break;
      purchased++; this.view.log(result.message, 'ai');
    }
    this.view.refresh();
  }

  /** 玩家逛商店：可連續購買、出售、刷新與鎖定，直到離開 */
  private async shopFlow(lord: Lord, kind: ShopKind, offers: Offer[]) {
    const visit = beginShopVisit(this.state, lord, kind, offers);
    const sold = new Set<number>();
    let recruited = 0;
    let revivedOther = false;
    const recruitLimit = kind === 'tavern' && lordHas(lord.id, 'recruitLimit') ? 2 : 1;
    for (;;) {
      if (this.state.over || !lord.alive) return;
      const a = (await this.ask(lord, {
        kind: 'shop',
        shop: { shopKind: kind, offers: visit.offers, sold: [...sold], recruited, recruitLimit, revivedOther, refreshes: visit.refreshes, sellStock: makeSellStock(lord, kind) },
      })) as ShopAction | null;
      if (!a || a.type === 'leave') return;
      if (a.type === 'buy') {
        const o = visit.offers[a.index];
        if (!o || sold.has(a.index) || lord.stones < o.price) continue;
        if (o.kind === 'general' && (o.general.owner || o.general.status === 'dead')) continue;
        if (kind === 'tavern' && recruited >= recruitLimit) continue;
        if (o.kind === 'revive' && !o.own && revivedOther) continue;
        const r = buy(this.state, lord, o);
        if (r.ok) {
          sold.add(a.index);
          if (kind === 'tavern') recruited++;
          if (o.kind === 'revive' && !o.own) revivedOther = true;
          this.view.log(r.message, 'good');
        }
      } else if (a.type === 'sell') {
        const o = makeSellStock(lord, kind)[a.index];
        if (!o) continue;
        const r = sell(lord, kind, o);
        if (r.ok) this.view.log(r.message, 'good');
      } else if (a.type === 'refresh') {
        const r = refreshShop(this.state, lord, visit);
        if (r.ok) {
          sold.clear();
          this.view.log(r.message, 'good');
        }
      } else if (a.type === 'lock') {
        const o = visit.offers[a.index];
        if (kind !== 'tavern' || o?.kind !== 'general' || sold.has(a.index) || o.general.owner || o.general.status === 'dead') continue;
        if (lord.tavernLocked?.includes(o.general.id)) {
          lord.tavernLocked = lord.tavernLocked.filter((id) => id !== o.general.id);
          this.view.log('取消鎖定' + o.general.name + '。', 'good');
        } else {
          const r = lockTavernGeneral(lord, o);
          if (r.ok) this.view.log(r.message, 'good');
        }
      }
      this.view.refresh();
    }
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
        const picked = await this.dlg(lord).choose(
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
    this.view.log(`${name}：${ev.icon} ${ev.title}――${result}`, this.human(lord) ? (ev.tone === 'bad' ? 'bad' : 'good') : 'ai');
    this.view.refresh();
    if (this.human(lord)) await this.dlg(lord).message(`${ev.icon} ${ev.title}`, ev.options ? result : `${ev.story}\n\n${result}`, ev.icon);
  }

  // ───────────────────────── 玩家擲骰前操作 ─────────────────────────

  private async generalAbilities(lord: Lord) {
    for (;;) {
      if (!abilityUsers(this.state, lord).length) break;
      const user = await this.dlg(lord).choose('方外神通', '隨行人物可在整備期間使用，不限所在位置。製物／起死回生耗 100 體力，冤魂召喚每五個自身回合一次。', abilityUsers(this.state, lord).map(g => { const r = abilityReady(this.state, lord, g); return { label: g.name, icon: portraitUrl(g), sub: generalBrief(g, `<span class="gb-line gb-passive">${passiveOf(g).effectText}</span>`, { passive: false }), value: g, disabled: !r.ok, reason: r.reason }; }));
      if (!user) break;
      let target: General | undefined;
      if (!fx(user).produceCategory) {
        const selected = await this.dlg(lord).choose(fx(user).reviveAbility ? '起死回生：選擇我方亡將' : '召喚冤魂：選擇亡將', '取消返回神通列表。', abilityTargets(this.state, lord, user).map(g => ({ label: g.name, icon: portraitUrl(g), sub: generalBrief(g, statCells([['戰力', power(g)], ['修為', g.exp]])), value: g })), '返回');
        if (!selected) continue; target = selected;
      }
      this.view.log(useGeneralAbility(this.state, lord, user, target), 'good'); this.view.refresh();
    }
    this.view.refresh();
  }

  /** 擲骰前使用物品；用了傳送類物品時回傳目的地 */
  private async useItemPreroll(lord: Lord): Promise<number | null> {
    if (lord.itemsLocked > 0) { this.view.toast('目前不能使用物品', lord.id); return null; }
    const items = lord.items.filter((i) => usableIn(i, 'preroll') && (!['teleport', 'cloud', 'cushion', 'prison'].includes(i.defId) || (!lord.stunned && lord.forcedTile === null && !lord.stayThisTurn)));
    if (!items.length) {
      this.view.toast('沒有可在擲骰前使用的物品', lord.id);
      return null;
    }
    const selection = { category: null as string | null };
    for (;;) {
      const item = await chooseCategorizedItem(this.dlg(lord), items, selection);
      if (!item) return null;
      for (;;) {
        const user = await this.dlg(lord).choose(
          `由誰使用${nameOf(item)}？`,
          '只有隨行武將可以使用物品；取消返回物品清單。',
          sortUsers(freeGenerals(this.state, lord.id), item).map((g) => {
            const c = canUse(item, g);
            return { label: g.name, icon: portraitUrl(g), sub: generalBrief(g, `<span class="gb-line">${itemUserInfo(g, item)}</span>`, { passive: false }), value: g, disabled: !c.ok, reason: c.reason };
          }),
        );
        if (!user) break;
        const target = await this.pickItemTarget(lord, item.defId);
        if (!target) continue;
        const msg = await this.usePrerollWithReaction(lord, item, user, target);
        this.view.log(msg, 'good');
        this.view.toast(msg, lord.id);
        if (item.defId === 'transmission' && target.city) await this.manageGarrison(lord, target.city, true);
        this.view.syncCities();
        this.view.refresh();
        if (['teleport', 'cloud'].includes(item.defId) && target.tile !== undefined) return target.tile;
        return null;
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
        const eligible = pool.filter(g => defId !== 'five' || !['waste', 'heaven'].includes(g.aptitude));
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
        if (!eligible.length) { this.view.toast('沒有符合條件的目標武將', lord.id); return null; }
        const g = await this.dlg(lord).choose('選擇生效的武將', defId === 'five' ? '僅能選擇五行靈根武將。' : '', eligible.map(x => ({ label: x.name, icon: portraitUrl(x), sub: generalBrief(x, `<span class="gb-line">${itemTargetInfo(x, defId)}</span>`, { passive: false }), value: x, color: originCss(x.origin) })));
        if (!g) return null;
        if (defId === 'five') {
          const element = await this.dlg(lord).choose('選擇新的靈根', '不相容功法會卸回原主公行囊。', (['metal', 'wood', 'water', 'fire', 'earth'] as const).map(value => ({ label: ELEMENT_NAMES[value] + '靈根', value })), '返回選武將');
          if (!element) continue;
          return { general: g, element };
        }
        return { general: g };
      }
      if (d.target === 'lord') {
        const candidates = others.filter(l => !['poison', 'bow'].includes(defId) || freeGenerals(this.state, l.id).length > 0).filter(l => defId !== 'move' || l.items.length > 0);
        if (!candidates.length) { this.view.toast('沒有符合條件的目標主公', lord.id); return null; }
        const victim = await this.dlg(lord).choose('選擇目標主公', '', candidates.map(value => ({ label: LORDS[value.id].name, sub: '靈石 ' + fmtStones(value.stones, true), value, color: LORDS[value.id].css })));
        if (!victim) return null;
        if (['confuse', 'confusing'].includes(defId)) {
          // 迷魂只能指定一般地點，乾坤骰閣只能自己傳送前往
          this.pickCasinoOk = false;
          let destination: { tile?: number } | null;
          try { destination = await this.pickItemTarget(lord, 'teleport'); } finally { this.pickCasinoOk = true; }
          if (!destination) continue;
          return { lord: victim, tile: destination.tile };
        }
        return { lord: victim };
      }
      if (d.target === 'ownCity' || d.target === 'enemyCity') {
        const own = citiesOf(this.state, lord.id);
        if (defId === 'graft' && !own.length) { this.view.toast('沒有己方城池可交換', lord.id); return null; }
        const pool = d.target === 'ownCity' ? own : others.flatMap(l => citiesOf(this.state, l.id));
        if (!pool.length) { this.view.toast('沒有可選擇的城池', lord.id); return null; }
        const city = await this.dlg(lord).choose('選擇城池', '', pool.map(value => ({ label: value.name + '（' + ownerName(value.owner) + '）', sub: '守軍 ' + value.garrisonSoldiers, value, color: ownerCss(value.owner) })));
        if (!city) return null;
        if (defId === 'graft') {
          const ownCity = await this.dlg(lord).choose('選擇交換的己方城池', '所有權與軍隊交換，地點與繁榮度保留。', own.map(value => ({ label: value.name, sub: '守軍 ' + value.garrisonSoldiers, value })), '返回選敵城');
          if (!ownCity) continue;
          return { city, ownCity };
        }
        return { city };
      }
      if (d.target === 'dice') { const dice = await this.dlg(lord).choose('控骰符：選擇點數', '', [1, 2, 3, 4, 5, 6].map(value => ({ label: value + ' 點', value }))); return dice ? { dice } : null; }
      if (d.target === 'tile') {
        const allowCasino = this.pickCasinoOk;
        const a = await this.ask(lord, { kind: 'tile', allowCasino });
        const tile = typeof a === 'number' && Number.isInteger(a) ? this.state.tiles[a] : undefined;
        if (!tile || (!allowCasino && tile.kind === 'casino')) return null;
        return { tile: tile.index };
      }
      return {};
    }
  }

  private aiBattleItem(duel: Duel, side: Side, lord: Lord): DuelEvent[] | null {
    const fighter = duel.fighter(side), foe = duel.other(side);
    if (fighter.itemsSealed || lord.itemsLocked || duel.over) return null;
    const items = lord.items.filter(i => usableIn(i, 'battle'));
    const users = [fighter.general, ...freeGenerals(this.state, lord.id).filter(g => g.id !== fighter.general.id)];
    const item = items.find(i => users.some(g => canUse(i, g).ok) && (
      i.defId === 'heal' ? fighter.hp < fighter.maxHp * .6 :
      i.defId === 'charge' ? !!fighter.general.technique && fighter.energy < 50 :
      i.defId === 'blood' ? !fighter.itemLifesteal :
      i.defId === 'drain' ? !foe.itemsSealed :
      i.defId === 'poison' ? !foe.poison :
      i.defId === 'ring' ? !foe.frozen :
      ['shield', 'vajra'].includes(i.defId) ? fighter.shield < fighter.maxHp * .2 :
      i.defId === 'invert' ? foe.atk + foe.def > fighter.atk + fighter.def :
      ['rage', 'mist'].includes(i.defId)));
    if (!item) return null;
    return useInDuel(duel, side, lord, item, users.find(g => canUse(item, g).ok)!);
  }

  private itemHooks() {
    return { use: (lord: Lord, item: Item, user: General, target: PrerollTarget) => this.usePrerollWithReaction(lord, item, user, target), protect: (g: General) => this.protectDeath(g) };
  }

  private async usePrerollWithReaction(lord: Lord, item: Item, user: General, target: PrerollTarget): Promise<string> {
    const victim = target.lord ?? (target.general?.isLord && target.general.owner ? this.state.lords[target.general.owner] : undefined);
    const guardian = victim && victim.id !== lord.id ? itemBlockUser(this.state, victim) : undefined;
    let blocked = !!guardian;
    if (!blocked && victim && victim.id !== lord.id && !victim.itemsLocked) {
      const card = victim.items.find(i => i.defId === 'substitute');
      const users = card ? freeGenerals(this.state, victim.id).filter(g => canUse(card, g).ok) : [];
      if (card && users.length) {
        if (!this.human(victim)) { consumeItem(victim, card, users[0]); blocked = true; }
        else for (;;) {
          if (!await this.dlg(victim).confirm('替身符：抵消敵方物品？', LORDS[lord.id].name + '對你使用' + nameOf(item) + '。', '使用替身符', '承受效果')) break;
          const defender = await this.dlg(victim).choose('由誰使用替身符？', '取消返回確認。', users.map(value => ({ label: value.name, sub: '體力 ' + value.stamina, value })), '返回');
          if (!defender) continue;
          consumeItem(victim, card, defender); blocked = true; break;
        }
      }
    }
    const result = await usePreroll(this.state, lord, item, user, target, blocked, async g => {
      if (await this.protectDeath(g)) return true;
      await this.onGeneralSlain(g, this.human(lord) || (!!g.owner && this.state.lords[g.owner].isPlayer), true, '遭物品擊殺');
      return false;
    });
    if (guardian && victim) { triggerItemBlock(victim, guardian); this.view.log('左慈擲杯戲曹，敵方非戰鬥物品失效，護法冷卻五個自身回合。', 'good'); }
    return result;
  }

  private async protectDeath(g: General): Promise<boolean> {
    if (!g.owner) return false;
    const lord = this.state.lords[g.owner], card = lord.items.find(i => i.defId === 'totem');
    if (!lord.alive || lord.itemsLocked || !card) return false;
    if (this.human(lord) && !await this.dlg(lord).confirm('不死圖騰：免疫死亡？', g.name + '即將死亡。使用後回復滿血，保留境界、修為、所屬與功法。', '使用圖騰', '不使用')) return false;
    consumeItem(lord, card); g.hp = maxHp(g);
    this.view.log(g.name + '的不死圖騰生效，滿血復生。', 'good'); return true;
  }

  private async chooseWheelDirection(lord: Lord): Promise<boolean> {
    const tile = this.state.tiles[lord.position];
    if (!lord.forkChoice || tile.links.length < 3) return false;
    if (lord.forkExit === null) enterFork(this.state, lord, 1);
    const picked = this.human(lord) ? await this.dlg(lord).choose('風火輪：選擇岔路方向', tile.name, tile.links.map(value => ({ label: this.state.tiles[value].name, value })), null) : null;
    const exit = picked ?? tile.links[Math.floor(Math.random() * tile.links.length)];
    lord.forkExit = exit; lord.forkChoice = false;
    this.view.log(LORDS[lord.id].name + '使用風火輪，選擇前往' + this.state.tiles[exit].name + '。', 'info'); return true;
  }

  private async recruitSoldiers(lord: Lord) {
    const most = Math.floor(lord.stones / recruitCost(lord.id, 1) / 100) * 100;
    if (most < 100) {
      this.view.toast('靈石不足，至少要能徵召 100 名士兵', lord.id);
      return;
    }
    const n = await this.dlg(lord).slider(
      '⚔️ 徵兵',
      `每名士兵 ${(recruitCost(lord.id, 100) / 100).toFixed(2).replace(/\.?0+$/, '')} 下品靈石。目前士兵 ${lord.soldiers}，靈石 ${fmtStones(lord.stones)}。`,
      { min: 100, max: most, step: 100, initial: Math.min(2000, most), unit: ' 名', confirm: '徵召', preview: (v) => `花費 ${fmtStones(recruitCost(lord.id, v))}，徵兵後士兵 ${lord.soldiers + v}` },
      '⚔️',
    );
    if (!n || recruitCost(lord.id, n) > lord.stones) return;
    lord.stones -= recruitCost(lord.id, n);
    lord.soldiers += n;
    this.view.log(`徵召 ${n} 名士兵。`, 'good');
    this.view.refresh();
  }

  /** 挖掘設定在佔領時免費指定，之後由已付費的城池調度視窗更換。 */
  private async chooseMining(lord: Lord, city: City, required = false) {
    if (city.owner !== lord.id) return;
    let group = await this.dlg(lord).choose<MaterialGroup>(
      `${city.name}・挖掘材料`,
      `每個自身回合收入 ${materialIncome(city)} 顆。選擇此城挖掘的材料。`,
      MATERIAL_GROUPS.map(k => ({ label: MATERIAL_NAMES[k][0] + (city.mining === k ? '（目前）' : ''), value: k })),
      required ? null : '返回調度', '⛏️',
    );
    // 必選卻沒有有效回答（斷線代打）：沿用第一種材料
    if (!group && required && !city.mining) group = MATERIAL_GROUPS[0];
    if (!group || city.owner !== lord.id) return;
    city.mining = group;
    this.view.log(`⛏️ ${city.name}改為挖掘${MATERIAL_NAMES[group][0]}，每個自身回合收入 ${materialIncome(city)} 顆。`, this.human(lord) ? 'good' : 'ai');
    this.view.refresh();
  }

  private async materialsFlow(lord: Lord) {
    for (;;) {
      const selected = await this.dlg(lord).choose(
        '⛏️ 材料與合成',
        materialsText(lord) + '<br><br>城池挖掘提供基礎材料；更換種類請使用「調度駐軍」。每 10 顆合成下一階 1 顆；武器在「武將」名冊升階。',
        MATERIAL_GROUPS.flatMap(group => [0, 1].map(stage => ({
          label: `${MATERIAL_NAMES[group][stage]} → ${MATERIAL_NAMES[group][stage + 1]}`,
          sub: `10：1・可合成 ${Math.floor(lord.materials[group][stage] / 10)} 顆`,
          disabled: lord.materials[group][stage] < 10, reason: '材料不足 10 顆', value: { group, stage },
        }))), '關閉', '⛏️',
      );
      if (!selected) return;
      const { group, stage } = selected;
      const count = await this.dlg(lord).slider('合成多少顆？', `每顆消耗 10 顆${MATERIAL_NAMES[group][stage]}，獲得${MATERIAL_NAMES[group][stage + 1]}。`, {
        min: 1, max: Math.floor(lord.materials[group][stage] / 10), step: 1, initial: 1, unit: ' 顆', confirm: '合成',
        preview: n => `消耗 ${n * 10} 顆，獲得 ${n} 顆；剩餘 ${lord.materials[group][stage] - n * 10} 顆原材料。`,
      }, '⛏️');
      if (count === null) continue;
      this.view.log(synthesize(lord, group, stage, count), 'good');
      this.view.refresh();
    }
  }

  async manageGarrison(lord: Lord, selectedCity?: City, freeDispatch = false) {
    const cities = citiesOf(this.state, lord.id);
    if (!cities.length) {
      this.view.toast('你還沒有城池', lord.id);
      return;
    }
    for (;;) {
      const city = selectedCity ?? await this.dlg(lord).choose(
        '🏯 調度駐軍',
        '主公所在城池免費；其他城池依道路距離收費。開啟後可不限次調整該城，直到關閉；操作期間遊戲暫停。',
        cities.map((c) => ({ label: c.name, disabled: lord.stones < garrisonDispatch(this.state, lord, c).fee, reason: '靈石不足', sub: `距離 ${garrisonDispatch(this.state, lord, c).distance} 格・調遣費 ${fmtStones(garrisonDispatch(this.state, lord, c).fee)}・駐將 ${c.garrisonGenerals.length ? garrisonOf(this.state, c).map((g) => g.name).join('、') : '無'}（${c.garrisonGenerals.length}/${GARRISON_LIMIT}）・守軍 ${c.garrisonSoldiers}・繁榮 ${fmtProsperity(c.prosperity)}`, value: c })),
      );
      if (!city) return;
      const fee = freeDispatch ? 0 : garrisonDispatch(this.state, lord, city).fee;
      if (fee > 0 && !await this.dlg(lord).confirm(`開啟${city.name}調度`, `支付 ${fmtStones(fee)}，即可不限次調整此城，直到關閉。關閉後重新開啟會再收費。`, '付費調度', '返回選城', '🏯')) continue;
      if (city.owner !== lord.id || lord.stones < fee) return;
      lord.stones -= fee;
      this.view.log(`🏯 ${city.name}調遣費：${fmtStones(fee)}；本次視窗不限次調整。`, 'info');
      this.view.refresh();
      for (;;) {
        const free = deployable(this.state, lord.id);
        const action = await this.dlg(lord).choose(`調度${city.name}`, `${fee === 0 ? '免費調度' : `已付費 ${fmtStones(fee)}`}・本次操作不再收費。守軍 ${city.garrisonSoldiers}・隨行士兵 ${lord.soldiers}`, [
          { label: '增派士兵', sub: `從隨行士兵調入（目前 ${lord.soldiers}）`, value: 'add', disabled: lord.soldiers < 100, reason: '士兵不足' },
          { label: '撤回士兵', sub: `至少保留 ${MIN_GARRISON} 守軍`, value: 'remove', disabled: city.garrisonSoldiers - MIN_GARRISON < 100, reason: '守軍已達下限' },
          { label: '更換挖掘材料', sub: `${city.mining ? MATERIAL_NAMES[city.mining][0] : '尚未指定'}・每個自身回合 ${materialIncome(city)} 顆`, value: 'mining' },
          { label: '調整駐將', sub: `最多 ${GARRISON_LIMIT} 人：從隨行武將派駐，或撤回駐將`, value: 'swap', disabled: !free.length && !city.garrisonGenerals.length, reason: '沒有隨行武將，也沒有駐將' },
        ], '關閉調度');
        if (!action || city.owner !== lord.id) break;
        if (action === 'add' || action === 'remove') {
          const max = action === 'add' ? lord.soldiers : city.garrisonSoldiers - MIN_GARRISON;
          const n = await this.dlg(lord).slider(
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
            const g = await this.dlg(lord).choose(
              `🏯 ${city.name}・調整駐將（${on.length}/${GARRISON_LIMIT}）`,
              '點選駐將可撤回，點選隨行武將可派駐。',
              [
                ...on.map((x) => ({ label: `▼ 撤回 ${x.name}`, icon: portraitUrl(x), sub: generalBlock(x, { tags: ['駐守中'] }), value: x, color: '#c99a2e', disabled: on.length <= 1, reason: '城池至少要有一名駐將' })),
                ...party.map((x) => ({ label: `▲ 派駐 ${x.name}`, icon: portraitUrl(x), sub: generalBlock(x, { tags: ['隨行'] }), value: x, disabled: on.length >= GARRISON_LIMIT, reason: `已滿 ${GARRISON_LIMIT} 人`, color: '#5aa8ec' })),
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
        this.view.syncCities();
        this.view.refresh();
      }
      return;
    }
  }

  // ───────────────────────── 九州風雲 ─────────────────────────

  /** 給所有人看的通知（單機時只有在玩家存活且未託管時顯示） */
  private notifyAll(title: string, text: string, icon: string, button = '知道了') {
    return this.view.notice(null, title, text, icon, button);
  }

  /** 新的一輪：持續事件倒數；每 5 輪抽一場九州風雲 */
  private async newRoundEvents() {
    for (const msg of tickWorldEvents(this.state)) this.view.log(msg, 'info');
    this.view.setEventMarkers();
    if (this.state.round % IMMORTAL_INTERVAL === 0) {
      const def = eventDef('immortals'), lines = applyWorldEvent(this.state, def);
      this.view.log(`【固定活動】${def.icon} ${def.name}：${lines.join(' ')}`, 'turn');
      await this.notifyAll(def.name, lines.join('\n'), '🧙', '確定');
      this.view.refresh();
    }
    if (this.state.round % EVENT_INTERVAL !== 0) return;

    const def = pickWorldEvent(this.state);
    const before = new Map(LORD_IDS.map((id) => [id, this.state.lords[id].position]));
    const lines = applyWorldEvent(this.state, def);
    this.view.log(`【九州風雲】${def.icon} ${def.name}：${def.desc}`, 'turn');
    for (const l of lines) this.view.log(l, 'info');
    this.view.toast(`九州風雲・${def.icon} ${def.name}`);

    if (def.id === 'shuffle') {
      for (const id of LORD_IDS) {
        const lord = this.state.lords[id];
        if (!lord.alive || before.get(id) === lord.position) continue;
        this.view.placeLord(id, lord.position);
      }
    }
    this.view.setEventMarkers();
    this.view.syncCities();
    this.view.refresh();

    const extra = def.duration ? `\n\n（持續 ${def.duration} 輪）` : '';
    await this.notifyAll(`九州風雲・${def.name}`, `${def.desc}${lines.length ? `\n\n${lines.join('\n')}` : ''}${extra}`, def.icon, def.id === 'auction' ? '參加拍賣' : '知道了');
    if (def.id === 'auction') await this.runAuction();
  }

  /** Every completed twentieth round, independent of the random world event draw. */
  private async runTournament() {
    const lords = aliveLords(this.state);
    if (lords.length < 2) return;
    const bracket = tournamentBracket(lords);
    this.view.refresh();
    const announce = `第 ${this.state.round} 輪九州比武大會開始！隨機分組，半決賽與決賽可重選隨行武將；不會戰死，血量與體力不會自動回復。`;
    this.view.log('🏆 ' + announce, 'turn');
    const pairs = Array.from({ length: bracket.length / 2 }, (_, i) => `${LORDS[bracket[i * 2]!.id].name} vs ${bracket[i * 2 + 1] ? LORDS[bracket[i * 2 + 1]!.id].name : '輪空'}`);
    await this.notifyAll('九州比武大會', announce + '\n\n' + pairs.join('\n'), '🏆', '確定');
    let champion: Lord | null;
    if (lords.length === 2) champion = await this.tournamentMatch(bracket[0]!, bracket[1]!, '決賽');
    else {
      const finalists: (Lord | null)[] = [];
      for (let i = 0; i < bracket.length; i += 2) {
        const a = bracket[i], b = bracket[i + 1];
        finalists.push(a && b ? await this.tournamentMatch(a, b, '半決賽') : a ?? b);
      }
      const [a, b] = finalists;
      champion = a && b ? await this.tournamentMatch(a, b, '決賽') : a ?? b ?? null;
    }
    if (!champion) { this.view.log('九州比武大會無人完成參賽，本屆沒有冠軍。', 'info'); return; }
    const prize = grantTournamentPrize(this.state, champion);
    const result = `${LORDS[champion.id].name}奪得冠軍，獲得天階上品獎勵「${prize.label}」！`;
    this.view.log('🏆 ' + result, champion.isPlayer ? 'good' : 'info'); this.view.refresh();
    await this.notifyAll('九州比武大會・冠軍', result + '\n\n' + prize.sub, '🏆', '確定');
  }

  private async tournamentGeneral(lord: Lord, stage: string): Promise<General | null> {
    const pool = freeGenerals(this.state, lord.id).filter(canDuel);
    if (!pool.length) return null;
    if (!this.human(lord)) return [...pool].sort((a, b) => power(b) * (b.hp / maxHp(b)) - power(a) * (a.hp / maxHp(a)))[0];
    return this.dlg(lord).choose(`九州比武大會・${stage}：派誰出戰？`, '可與上一場派同一人或換人。血量與體力沿用現況；不會戰死，取消視為棄權。', pool.map(g => ({ label: g.name, icon: portraitUrl(g), sub: generalBlock(g), value: g })), '棄權');
  }

  private async tournamentMatch(a: Lord, b: Lord, stage: string): Promise<Lord | null> {
    await this.wait(0);
    const ag = await this.tournamentGeneral(a, stage), bg = await this.tournamentGeneral(b, stage);
    if (!ag || !bg) {
      const winner = ag ? a : bg ? b : null;
      this.view.log(`🏆 ${stage}：${winner ? LORDS[winner.id].name + '因對手無人應戰或棄權而晉級' : '雙方無人應戰或棄權'}。`, 'info');
      return winner;
    }
    const duel = new Duel(a, ag, b, bg, true);
    await this.runDuel(duel, a, b, `🏆 九州比武大會・${stage}`);
    const side = tournamentWinner(duel), winner = side === 'a' ? a : b;
    this.view.log(`🏆 ${stage}：${ag.name} vs ${bg.name}，${LORDS[winner.id].name}晉級${duel.draw ? '（平手依剩餘血量比例裁定，同率抽籤）' : ''}。`, 'info');
    this.view.refresh(); return winner;
  }

  private async runAuction() {
    const lot = auctionLot(this.state);
    const bids: { id: LordId; bid: number }[] = [];
    for (const l of aliveLords(this.state)) bids.push({ id: l.id, bid: this.human(l) ? await this.playerBid(l, lot) : aiBid(this.state, l, lot) });
    const r = resolveAuction(this.state, lot, bids);
    const lines = r.bids.map((b) => `${LORDS[b.id].name}：${b.bid ? fmtStones(b.bid) : '放棄'}`);
    const result = r.winner ? `${LORDS[r.winner].name}以 ${fmtStones(r.price)} 得標「${lot.label}」！` : `無人出價，「${lot.label}」流標。`;
    this.view.log(`🔨 ${result}`, r.winner && this.state.lords[r.winner].isPlayer ? 'good' : 'info');
    this.view.refresh();
    await this.notifyAll('拍賣結果', `${result}\n\n各家密封出價：\n${lines.join('\n')}`, '🔨', '確定');
  }

  /** 玩家密封出價；回傳 0 表示放棄 */
  private async playerBid(lord: Lord, lot: Offer): Promise<number> {
    const a = await this.ask(lord, { kind: 'bid', lot: { label: lot.label, sub: lot.sub, price: lot.price } });
    if (typeof a !== 'number' || !Number.isFinite(a)) return 0;
    return Math.max(0, Math.min(lord.stones, Math.round(a / 100) * 100));
  }

  /** 黃巾賊窩：繳買路錢或損兵 */
  private async banditEvent(lord: Lord) {
    const cost = banditToll(this.state);
    const loss = Math.round(lord.soldiers * 0.1);
    let payIt: boolean;
    if (this.human(lord)) {
      const r = await this.dlg(lord).choose(
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
      this.view.log(`${LORDS[lord.id].name}向黃巾賊繳了買路錢 ${fmtStones(cost)}。`, this.human(lord) ? 'bad' : 'ai');
    } else {
      lord.soldiers -= loss;
      this.view.log(`${LORDS[lord.id].name}硬闖賊窩，折損 ${loss} 名士兵。`, this.human(lord) ? 'bad' : 'ai');
    }
    this.view.refresh();
  }

  // ───────────────────────── 宗門、名冊與突破 ─────────────────────────

  async manageSect(lord: Lord) {
    while (!this.state.over && lord.alive) {
      const allFree = freeGenerals(this.state, lord.id);
      const candidates = [...allFree.filter(g => !g.isLord && !fx(g).fixedParty && !g.ghostSourceId), ...sectGenerals(this.state, lord.id)];
      const choices: Choice<General>[] = candidates.map(g => {
        const r = sectTransferRequirement(this.state, lord, g);
        return { label: `${g.status === 'free' ? '▼' : '▲'} ${g.name}`, icon: portraitUrl(g),
          sub: generalBlock(g, { tags: [g.status === 'free' ? '隨行 → 留守宗門' : '宗門 → 隨行'] }),
          value: g, disabled: !r.ok, reason: r.reason, color: g.status === 'free' ? '#c99a2e' : '#5aa8ec' };
      });
      const fee = sectDispatchFee(this.state, lord);
      const g = await this.dlg(lord).choose(`🏛️ 宗門調度（隨行 ${allFree.length}/${PARTY_LIMIT}）`,
        `${fee === 0 ? '目前所在城池免費調度' : '每人每次耗費 10 下品靈石'}・持有 ${fmtStones(lord.stones)}。隨行最多十名；自己的城池與空城免費。`, choices, '完成');
      if (!g) break;
      const r = sectTransferRequirement(this.state, lord, g);
      if (!r.ok) { this.view.toast(r.reason, lord.id); continue; }
      this.view.log(transferSectGeneral(this.state, lord, g), 'good');
      this.view.refresh();
    }
  }

  /** 武將名冊：反覆詢問要整備哪位武將，直到關閉 */
  private async rosterFlow(lord: Lord) {
    for (;;) {
      if (this.state.over || !lord.alive) return;
      const a = (await this.ask(lord, { kind: 'roster' })) as RosterAction | null;
      if (!a || a.type === 'close') return;
      const g = this.state.generals[a.generalId];
      if (!g || g.owner !== lord.id) continue;
      await this.rosterAction(lord, a.type, g);
    }
  }

  /** 名冊上的單一操作；突破、閉關、升階、換裝只在自己的整備階段，學功法與自廢修為單機時隨時可用 */
  async rosterAction(lord: Lord, type: RosterActionType, g: General) {
    const away = g.status === 'realm' || !!g.ghostSourceId;
    const ask = this.dlg(lord);
    switch (type) {
      case 'break':
        await this.breakthroughFlow(lord, g);
        break;
      case 'seclude':
        if (g.status === 'garrison') g.secluded = !g.secluded;
        break;
      case 'upgrade': {
        const r = upgradeRequirement(lord, g);
        if (away || !r.ok || r.stage === undefined || !r.group || !r.cost) return;
        const name = WEAPON_CATALOG[g.id].names[r.stage + 1];
        const ok = await ask.confirm(`${g.name}・武器升階`,
          `${g.weapon!.name} → ${WEAPON_GRADES[r.stage + 1]}・${name}。\n消耗 ${r.cost} 顆${MATERIAL_NAMES[r.group][r.stage]}；無視防禦 ${Math.round(WEAPON_PENETRATION[r.stage] * 100)}% → ${Math.round(WEAPON_PENETRATION[r.stage + 1] * 100)}%。`,
          '消耗材料・升階', '返回名冊', '⚔️');
        if (ok && upgradeRequirement(lord, g).ok) await ask.message('武器升階完成', upgradeWeapon(lord, g), '⚔️');
        break;
      }
      case 'equip': {
        const kind = 'armor' as const;
        const pool = lord.gear.filter((e) => e.kind === kind);
        if (away || (!pool.length && !g[kind])) return;
        const choices: Choice<Equipment | 'off'>[] = pool.map((x) => ({
          label: x.name,
          icon: equipIconUrl(x),
          sub: equipDesc(x),
          value: x,
          disabled: g.realm < equipRealm(x.tier),
          reason: `需達${REALMS[equipRealm(x.tier)]}`,
        }));
        if (g[kind]) choices.unshift({ label: `卸下${g[kind]!.name}`, sub: '取下寶衣放回行囊', value: 'off' });
        const e = await ask.choose(`${g.name}・寶衣`, '', choices);
        if (e === 'off') unequip(lord, g, kind);
        else if (e) equip(lord, g, e);
        break;
      }
      case 'learn': {
        if (away || g.technique || !lord.scrolls.length || g.aptitude === 'waste') return;
        const s = await ask.choose(
          `${g.name}・學習功法`,
          '每位武將只能修習一種功法；五行靈根須與功法屬性相符，天靈根不限屬性，廢靈根無法修習。學會後不可更換，除非自廢修為。',
          lord.scrolls.map((x) => ({
            label: x.name,
            sub: techniqueDesc(x),
            value: x,
            color: ELEMENT_CSS[x.element],
            disabled: !canLearn(g, x).ok,
            reason: canLearn(g, x).reason,
          })),
        );
        if (s) learn(lord, g, s);
        break;
      }
      case 'abolish': {
        if (away || !g.technique) return;
        const ok = await ask.confirm('自廢修為', `${g.name}將散去「${g.technique.name}」，境界跌回凡人，修為歸零。\n此後可改修其他功法。確定嗎？`, '自廢', '取消', '⚠️');
        if (ok) abolish(g);
        break;
      }
    }
    this.view.refresh();
  }

  /** 從武將名冊發起突破：低階機率突破，金丹以上渡雷劫 */
  private async breakthroughFlow(lord: Lord, g: General) {
    const can = canAttemptBreak(g, this.state.round);
    if (!can.ok) {
      this.view.toast(can.reason, lord.id);
      return;
    }
    const ask = this.dlg(lord);
    if (!needsTribulation(g)) {
      const chance = Math.round(breakChance(g) * 100);
      const ok = await ask.confirm(
        `${g.name}・突破${REALMS[g.realm + 1]}`,
        `成功率 <b>${chance}%</b>${g.foundation ? '（已服築基丹）' : ''}${g.demon ? '\n⚠️ 心魔纏身，成功率大降' : ''}\n失敗會損失 <b>20%</b> 修為，並氣血翻湧：扣 <b>${Math.round(BREAK_FAIL_HP[g.realm] * 100)}%</b> 血量（境界越高扣得越多）。`,
        '突破',
        '再等等',
        '🧘',
      );
      if (!ok) return;
      const failHp = BREAK_FAIL_HP[g.realm];
      const success = attemptBreak(g, this.state.round);
      if (success) this.view.beam(lord.id);
      const msg = success ? `✦ ${g.name}突破成功，晉入【${REALMS[g.realm]}】！` : `${g.name}突破失敗，修為 −20%，血量 −${Math.round(failHp * 100)}%……`;
      this.view.log(msg, success ? 'good' : 'bad');
      await ask.message(success ? '突破成功' : '突破失敗', msg, success ? '✨' : '💢');
      this.view.refresh();
      return;
    }
    const rg = boltRange(g);
    const ok = await ask.confirm(
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
      if (abandonIfEmpty(this.state, cityId)) this.view.log(`🏚️ ${this.state.cities[cityId].name}失去所有駐將，成為空城，守軍離去。`, 'bad');
    }
    await this.view.tribulation(g.id, lord.id, r, startHp, startMax);
    if (r.success) this.view.beam(lord.id, 0xbfe0ff);
    const msg = r.success
      ? `⚡ ${g.name}渡過 ${r.bolts.length} 道天雷，晉入【${REALMS[g.realm]}】！`
      : r.fate === 'death'
        ? `⚡ ${g.name}渡劫失敗，身死道消……`
        : r.fate === 'saved' ? `⚡ ${g.name}渡劫失敗，保命效果令其滿血復生，境界保留。` : `⚡ ${g.name}渡劫失敗，兵解重修，跌回凡人。`;
    this.view.log(msg, r.success ? 'good' : 'bad');
    this.view.syncCities();
    this.view.refresh();
    if (r.success && g.isLord && await this.checkEnd()) return;
    if (r.fate === 'death' && g.isLord) await this.onBankrupt(lord, `${g.name}渡劫失敗身死道消，主公陣亡`);
  }
}

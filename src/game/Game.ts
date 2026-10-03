import * as THREE from 'three';
import type { Character, City, FactionId, GameState } from './types';
import { createGameState, heroesOf } from './GameState';
import { advanceTurn } from './TurnManager';
import { EventManager } from './EventManager';
import { SceneManager } from '../scene/SceneManager';
import { World } from '../world/World';
import { CharacterSprite } from '../character/CharacterSprite';
import { heroPower, realmName, troopCapacity } from '../character/Character';
import { FACTIONS, ownerName } from '../faction/Faction';
import { GameUI, type ActionGroup } from '../ui/GameUI';
import { EventModal } from '../ui/EventModal';
import { showEndScreen, showStartScreen } from '../ui/Screens';
import { applyBuild, buildOptions, canAfford, formatCost, formatGain } from '../systems/EconomySystem';
import { CULTIVATE_COST, cultivate, pillCost, takePill, type GainResult } from '../systems/CultivationSystem';
import { DISCIPLE_COST, recruitDisciples } from '../systems/RecruitmentSystem';
import { FORMATION_COST, attackStrength, castFormation, defenseStrength, recruitTroops, siege, troopCost } from '../systems/MilitarySystem';
import { runNpcTurn } from '../systems/NpcSystem';

type Mode = 'idle' | 'move' | 'busy';

const TILE_DESC: Record<string, string> = {
  road: '驛道：可能觸發隨機事件',
  vein: '靈脈：踏上獲得靈氣與修為，修煉效果佳',
  market: '市集：踏上獲得靈石',
  danger: '兇地：必定觸發事件',
};

export class Game {
  private sm: SceneManager;
  private world: World;
  private ui: GameUI;
  private modal: EventModal;
  private events = new EventManager();
  private state!: GameState;
  private sprites = new Map<string, CharacterSprite>();
  private selectedId: string | null = null;
  private viewCityId: string | null = null;
  private mode: Mode = 'idle';
  private reach: Map<string, { cost: number; prev: string | null }> | null = null;

  constructor(
    sceneRoot: HTMLElement,
    private uiRoot: HTMLElement,
  ) {
    this.sm = new SceneManager(sceneRoot);
    this.world = new World(this.sm.scene, this.sm.animator);
    this.ui = new GameUI(uiRoot);
    this.modal = new EventModal(uiRoot);

    this.sm.onUpdate((dt, time) => {
      this.world.update(dt);
      for (const s of this.sprites.values()) s.update(dt, time);
    });
    this.sm.onPick = (o) => this.handlePick(o);
    this.sm.onHover = (o) => this.handleHover(o);
    this.sm.renderer.domElement.addEventListener('pointermove', (e) => (this.mouse = { x: e.clientX, y: e.clientY }));
    this.ui.onEndTurn = () => void this.endTurn();
    this.ui.onSelectHero = (id) => this.selectHero(id, true);

    window.addEventListener('keydown', (e) => {
      if (!this.state || this.state.over) return;
      // 避免快捷鍵同時觸發目前聚焦的按鈕
      if ((e.key === ' ' || e.key === 'Enter') && (e.target as HTMLElement)?.tagName === 'BUTTON') e.preventDefault();
      if (!this.modalClosed()) return;
      if (e.key === 'Escape' && this.mode === 'move') this.cancelMove();
      if (e.key === 'Enter' && this.mode === 'idle') void this.endTurn();
      if (e.key === ' ' && this.mode === 'idle') {
        e.preventDefault();
        void this.rollMove();
      }
    });

    this.sm.start();
  }

  private mouse = { x: 0, y: 0 };

  private modalClosed() {
    return !this.uiRoot.querySelector('.modal-backdrop:not(.hidden), .screen');
  }

  showStart() {
    this.ui.hide();
    showStartScreen(this.uiRoot, (f) => this.start(f));
  }

  // ───────────────────────── 遊戲流程 ─────────────────────────

  start(faction: FactionId) {
    this.state = createGameState(faction);
    this.mode = 'idle';
    this.reach = null;
    this.viewCityId = null;
    this.world.clearReachable();
    this.world.syncCities(this.state);
    this.sm.setPickables([...this.world.pickables]);

    for (const s of this.sprites.values()) s.dispose();
    this.sprites.clear();
    for (const c of this.state.characters) {
      const s = new CharacterSprite(c);
      this.sm.scene.add(s.group);
      this.sprites.set(c.id, s);
    }
    this.sm.setPickables([...this.world.pickables, ...[...this.sprites.values()].map((s) => s.group)]);
    this.placeAll();

    this.ui.reset();
    this.ui.show();
    const f = FACTIONS[faction];
    this.ui.log(`天地靈氣復甦。${f.name}・${f.sect}踏上仙途！`, 'turn');
    this.ui.log(`宗門特色：${f.bonusText}`, 'info');
    const first = heroesOf(this.state, faction)[0];
    this.selectHero(first.id, true);
    this.ui.toast(`第 1 回合 · ${f.name}`);
  }

  private restart() {
    this.ui.hide();
    for (const s of this.sprites.values()) s.dispose();
    this.sprites.clear();
    this.showStart();
  }

  private async endTurn() {
    if (this.mode !== 'idle' || this.state.over) return;
    this.setBusy(true);
    this.world.clearReachable();
    this.ui.toast('群雄行動中……');

    // NPC 回合
    const report = runNpcTurn(this.state, this.world.map);
    const byHero = new Map<string, string[][]>();
    for (const m of report.moves) {
      if (!byHero.has(m.heroId)) byHero.set(m.heroId, []);
      byHero.get(m.heroId)!.push(m.path);
    }
    await Promise.all(
      [...byHero].map(async ([id, paths]) => {
        const sprite = this.sprites.get(id)!;
        for (const path of paths) await this.animatePath(sprite, path, 0, false);
      }),
    );
    for (const msg of report.messages) this.ui.log(msg, 'npc');
    for (const { id, from } of report.captured) {
      const city = this.state.cities[id];
      this.world.captureEffect(id, FACTIONS[city.owner as FactionId].color);
      if (from === this.state.player) {
        this.ui.log(`我方失去了${city.name}！`, 'bad');
        this.sm.cameraController.focus(this.world.nodePosition(id));
      }
    }
    this.world.syncCities(this.state);
    this.placeAll();
    if (report.captured.length) await this.sm.animator.wait(0.8);

    // 結算
    const summary = advanceTurn(this.state, formatGain);
    if (summary.gameOver) {
      this.setBusy(false);
      this.mode = 'busy';
      this.refresh();
      await this.modal.message('📜', '三十回合已至', '天下大勢已定，進入勢力結算。', '查看結算');
      showEndScreen(this.uiRoot, this.state, () => this.restart());
      return;
    }
    this.ui.log(`── 第 ${this.state.turn} 回合 ──`, 'turn');
    this.ui.log(`城池收入：${summary.incomeText || '無'}　軍糧消耗：${summary.upkeep}`, 'good');
    if (summary.deserted) this.ui.log(`糧草斷絕！軍隊逃散 ${summary.deserted} 人。`, 'bad');
    if (this.state.turn === this.state.maxTurns) this.ui.log('最後一回合！', 'bad');

    this.setBusy(false);
    const first = heroesOf(this.state, this.state.player)[0];
    this.selectHero(first.id, true);
    this.ui.toast(`第 ${this.state.turn} 回合${this.state.turn === this.state.maxTurns ? '（最終回合）' : ''}`);
  }

  // ───────────────────────── 選取與輸入 ─────────────────────────

  private get hero(): Character | null {
    return this.state.characters.find((c) => c.id === this.selectedId) ?? null;
  }

  private selectHero(id: string, focus: boolean) {
    if (this.mode === 'move') this.cancelMove();
    const c = this.state.characters.find((x) => x.id === id);
    if (!c || c.faction !== this.state.player) return;
    this.selectedId = id;
    for (const s of this.sprites.values()) s.setSelected(s.character.id === id);
    const node = this.world.map.node(c.position);
    if (node.type === 'city') this.viewCityId = node.id;
    if (focus) this.sm.cameraController.focus(this.sprites.get(id)!.group.position);
    this.refresh();
  }

  private handlePick(o: THREE.Object3D | null) {
    if (!o || !this.state || this.mode === 'busy') return;
    if (o.userData.heroId) {
      const c = this.state.characters.find((x) => x.id === o.userData.heroId)!;
      if (c.faction === this.state.player && this.mode !== 'move') {
        this.selectHero(c.id, false);
        return;
      }
      if (c.faction !== this.state.player) {
        this.ui.toast(`${FACTIONS[c.faction].name}・${c.name}（${realmName(c.level)}）戰力 ${heroPower(c)}，兵 ${c.troops}`);
      }
      // 點到角色時視同點擊其所在節點
      this.clickNode(c.position);
      return;
    }
    if (o.userData.nodeId) this.clickNode(o.userData.nodeId);
  }

  private clickNode(id: string) {
    const node = this.world.map.node(id);
    if (this.mode === 'move' && this.reach?.has(id) && this.hero && id !== this.hero.position) {
      void this.moveHero(this.hero, id);
      return;
    }
    if (node.type === 'city') {
      this.viewCityId = id;
      this.refresh();
    } else {
      this.ui.toast(node.type === 'realm' ? `${node.name}：秘境，可探索取得機緣` : TILE_DESC[node.tile]);
    }
  }

  private handleHover(o: THREE.Object3D | null) {
    if (!this.state) return;
    let nodeId: string | null = o?.userData.nodeId ?? null;
    if (o?.userData.heroId) nodeId = this.state.characters.find((c) => c.id === o.userData.heroId)!.position;
    this.world.setHover(nodeId);
    if (!nodeId) {
      this.ui.showTooltip(null);
      return;
    }
    const n = this.world.map.node(nodeId);
    let text: string;
    if (n.type === 'city') {
      const c = this.state.cities[nodeId];
      text = `<b>${c.name}</b>（${ownerName(c.owner)}）<br>城防 ${c.defense} · 人口 ${c.population}`;
    } else if (n.type === 'realm') text = `<b>🌀 ${n.name}</b><br>秘境：可探索`;
    else text = TILE_DESC[n.tile];
    if (this.mode === 'move' && this.reach?.has(nodeId)) text += `<br><span class="tt-move">▶ ${this.reach.get(nodeId)!.cost} 步可達</span>`;
    this.ui.showTooltip(text, this.mouse.x, this.mouse.y);
  }

  // ───────────────────────── 移動 ─────────────────────────

  private async rollMove() {
    const h = this.hero;
    if (!h || h.moved || h.acted || this.mode !== 'idle') return;
    this.setBusy(true);
    const dice = 1 + Math.floor(Math.random() * 6);
    await this.ui.rollDice(dice);
    this.setBusy(false);
    this.reach = this.world.map.reachable(h.position, dice, h.faction);
    const targets = [...this.reach.keys()].filter((id) => id !== h.position);
    this.mode = 'move';
    this.world.showReachable(targets);
    this.ui.log(`${h.name}擲出 ${dice} 點。`);
    this.refresh();
  }

  private cancelMove() {
    // 已擲骰仍視為已移動（原地停留）
    const h = this.hero;
    if (h) h.moved = true;
    this.mode = 'idle';
    this.reach = null;
    this.world.clearReachable();
    this.refresh();
  }

  private async moveHero(h: Character, target: string) {
    const path = this.world.map.pathTo(this.reach!, target);
    this.world.clearReachable();
    this.reach = null;
    this.mode = 'busy';
    this.setBusy(true);
    const sprite = this.sprites.get(h.id)!;
    await this.animatePath(sprite, path, this.slotIndex(h, target), true);
    h.position = target;
    h.moved = true;
    this.placeAll();

    const node = this.world.map.node(target);
    if (node.type === 'city') this.viewCityId = target;
    this.ui.log(`${h.name}抵達${node.name}。`);

    // 抵達觸發
    const tileMsg = this.events.tileEffect(this.state, h, node.tile);
    if (node.type === 'road' && tileMsg) {
      this.ui.log(tileMsg, 'good');
      this.ui.toast(tileMsg);
      if (tileMsg.includes('突破')) this.world.breakthroughEffect(sprite.group.position);
    }
    const ev = node.type === 'road' && node.tile === 'danger' ? this.events.trigger(this.state, h) : this.events.maybeTrigger(this.state, h);
    this.setBusy(false);
    if (ev) {
      this.mode = 'busy';
      this.refresh();
      this.ui.log(`【事件】${ev.title}`, 'info');
      const levelBefore = h.level;
      const result = await this.modal.show(ev);
      if (result) this.ui.log(result, result.includes('折損') || result.includes('劫') ? 'bad' : 'good');
      else if (ev.choices.length === 1) this.ui.log(ev.text.replace(/\n+/g, ' '), 'info');
      if (h.level > levelBefore) this.world.breakthroughEffect(sprite.group.position);
    }
    this.mode = 'idle';
    this.refresh();
  }

  /** 依序跳過每一格 */
  private async animatePath(sprite: CharacterSprite, path: string[], slot: number, follow: boolean) {
    if (path.length < 2) return;
    const map = this.world.map;
    const points = path.map((id, i) => (i === path.length - 1 ? this.standPosition(id, slot, slot + 1) : this.standPosition(id, 0, 1)));
    points[0] = sprite.group.position.clone();
    const longSteps = path.map((id, i) => i > 0 && map.neighbors(path[i - 1]).some((e) => e.to === id && e.water));
    await sprite.moveAlong(points, this.sm.animator, follow ? (p) => this.sm.cameraController.follow(p) : undefined, longSteps);
  }

  // ───────────────────────── 角色站位 ─────────────────────────

  private standPosition(nodeId: string, index: number, count: number): THREE.Vector3 {
    const node = this.world.map.node(nodeId);
    const base = this.world.nodePosition(nodeId);
    const spread = (index - (count - 1) / 2) * 2.1;
    if (node.type === 'city') {
      const x = base.x + spread;
      const z = base.z + 4.2;
      return new THREE.Vector3(x, this.world.ground(x, z) + 0.05, z);
    }
    if (node.type === 'realm') {
      const x = base.x + spread;
      const z = base.z + 2.8;
      return new THREE.Vector3(x, this.world.ground(x, z) + 0.05, z);
    }
    return new THREE.Vector3(base.x + spread * 0.7, base.y - 0.05, base.z + (count > 1 ? 0.3 : 0));
  }

  private slotIndex(h: Character, nodeId: string): number {
    return this.state.characters.filter((c) => c.position === nodeId && c.id !== h.id).length;
  }

  private placeAll() {
    const groups = new Map<string, Character[]>();
    for (const c of this.state.characters) {
      if (!groups.has(c.position)) groups.set(c.position, []);
      groups.get(c.position)!.push(c);
    }
    for (const [nodeId, list] of groups) {
      list.forEach((c, i) => this.sprites.get(c.id)!.setGroundPosition(this.standPosition(nodeId, i, list.length)));
    }
  }

  // ───────────────────────── 行動 ─────────────────────────

  private finishAction(h: Character, message: string, kind: 'good' | 'bad' = 'good', gain?: GainResult) {
    h.acted = true;
    h.moved = true;
    this.ui.log(message, kind);
    this.ui.toast(message);
    if (gain?.brokeThrough) this.world.breakthroughEffect(this.sprites.get(h.id)!.group.position);
    this.refresh();
    // 自動切換到下一位可行動的角色
    const next = heroesOf(this.state, this.state.player).find((c) => !c.acted);
    if (next) setTimeout(() => this.mode === 'idle' && this.selectHero(next.id, true), 700);
  }

  private tryAction(h: Character, fn: () => { ok: boolean; message: string; result?: GainResult }) {
    const r = fn();
    if (!r.ok) {
      this.ui.toast(r.message);
      return;
    }
    this.finishAction(h, r.message, 'good', r.result);
  }

  private async attack(h: Character, city: City) {
    const prevOwner = city.owner;
    this.mode = 'busy';
    this.setBusy(true);
    const r = siege(this.state, this.state.player, city);
    const verb = prevOwner === 'neutral' ? '佔領' : '攻城';
    await this.modal.message(
      r.win ? '🏯' : '⚔️',
      `${verb}戰報・${city.name}`,
      `你的戰力：${r.attack}\n${city.name}守軍：${r.defense}\n\n結果：${r.win ? `成功佔領${city.name}！\n繳獲靈石 ${r.loot}` : '攻城失敗，軍隊折損四成。'}`,
    );
    if (r.win) {
      this.world.syncCities(this.state);
      this.world.captureEffect(city.id, FACTIONS[this.state.player].color);
      this.placeAll();
    }
    this.setBusy(false);
    this.mode = 'idle';
    this.finishAction(h, r.message, r.win ? 'good' : 'bad');
  }

  private buildActions(): { groups: ActionGroup[]; hint: string } {
    const h = this.hero;
    const groups: ActionGroup[] = [];
    if (!h) return { groups, hint: '選擇一名角色' };
    const fs = this.state.factions[this.state.player];
    const res = fs.resources;
    const node = this.world.map.node(h.position);
    const locked = h.acted || this.mode !== 'idle';

    if (this.mode === 'move') {
      groups.push({ title: '移動', buttons: [{ label: '✖ 原地停留', onClick: () => this.cancelMove() }] });
      return { groups, hint: `🎲 點選地圖上<b>黃色標記</b>的位置移動 ${h.name}（Esc 原地停留）` };
    }

    groups.push({
      title: '移動',
      buttons: [
        {
          label: '🎲 擲骰移動',
          sub: '空白鍵',
          kind: 'primary',
          disabled: h.moved || h.acted || this.mode !== 'idle',
          onClick: () => void this.rollMove(),
        },
      ],
    });

    if (node.type === 'city') {
      const city = this.state.cities[node.id];
      if (city.owner === this.state.player) {
        groups.push({
          title: '招募',
          buttons: [
            {
              label: '招募弟子 ×1',
              sub: formatCost(DISCIPLE_COST),
              disabled: locked || city.recruitable < 1 || !canAfford(res, DISCIPLE_COST),
              onClick: () => this.tryAction(h, () => recruitDisciples(this.state, city, 1)),
            },
            {
              label: `招募弟子 ×${Math.max(1, city.recruitable)}`,
              sub: `靈石 ${100 * Math.max(1, city.recruitable)}`,
              disabled: locked || city.recruitable < 2 || res.stones < 100 * city.recruitable,
              onClick: () => this.tryAction(h, () => recruitDisciples(this.state, city, city.recruitable)),
            },
            ...[50, 100].map((n) => ({
              label: `招募軍隊 +${n}`,
              sub: formatCost(troopCost(h.faction, n)),
              disabled: locked || h.troops >= troopCapacity(h) || !canAfford(res, troopCost(h.faction, n)),
              onClick: () => this.tryAction(h, () => recruitTroops(this.state, h, n)),
            })),
          ],
        });
        groups.push({
          title: '建設',
          buttons: buildOptions(this.state.player).map((o) => ({
            label: o.name,
            sub: formatCost(o.cost),
            title: o.desc,
            disabled: locked || !canAfford(res, o.cost),
            onClick: () => this.finishAction(h, applyBuild(this.state, city, o)),
          })),
        });
      } else {
        const atk = attackStrength(this.state, this.state.player, city.id);
        const seeDef = city.owner === 'neutral' || FACTIONS[this.state.player].intel;
        const def = defenseStrength(this.state, city);
        const buttons: ActionGroup['buttons'] = [
          {
            label: city.owner === 'neutral' ? '🏯 佔領' : '⚔️ 攻城',
            sub: `我方 ${atk} vs 守方 ${seeDef ? def : '???'}`,
            kind: 'danger',
            disabled: locked,
            onClick: () => void this.attack(h, city),
          },
        ];
        if (FACTIONS[this.state.player].id === 'jin' && city.owner !== 'neutral') {
          buttons.push({
            label: '☯ 天機陣',
            sub: fs.formationCooldown > 0 ? `冷卻 ${fs.formationCooldown} 回合` : `${formatCost(FORMATION_COST)}・不耗行動`,
            kind: 'free',
            disabled: this.mode !== 'idle' || fs.formationCooldown > 0 || !canAfford(res, FORMATION_COST),
            onClick: () => {
              const r = castFormation(this.state, city);
              if (r.ok) {
                this.world.formationEffect(city.id);
                this.ui.log(r.message, 'good');
              }
              this.ui.toast(r.message);
              this.refresh();
            },
          });
        }
        groups.push({ title: city.owner === 'neutral' ? '佔領' : `攻略・${ownerName(city.owner)}`, buttons });
      }
    }

    if (node.type === 'realm') {
      groups.push({
        title: '秘境',
        buttons: [
          {
            label: '🌀 探索秘境',
            sub: '修為・寶物・風險',
            kind: 'primary',
            disabled: locked,
            onClick: () => void this.explore(h, node.name),
          },
        ],
      });
    }

    groups.push({
      title: '修煉',
      buttons: [
        {
          label: '🧘 閉關修煉',
          sub: formatCost(CULTIVATE_COST),
          disabled: locked || !canAfford(res, CULTIVATE_COST),
          onClick: () => this.tryAction(h, () => cultivate(this.state, h, node)),
        },
        {
          label: '💊 服用丹藥',
          sub: formatCost(pillCost(h)),
          disabled: locked || !canAfford(res, pillCost(h)),
          onClick: () => this.tryAction(h, () => takePill(this.state, h)),
        },
      ],
    });

    groups.push({
      title: '其他',
      buttons: [{ label: '💤 待命', disabled: locked, onClick: () => this.finishAction(h, `${h.name}原地待命。`) }],
    });

    let hint: string;
    const ready = heroesOf(this.state, this.state.player).filter((c) => !c.acted);
    if (!ready.length) hint = '所有角色皆已行動，請按 <b>結束回合</b>（Enter）';
    else if (h.acted) hint = `${h.name}本回合已行動，請選擇其他角色或結束回合`;
    else if (!h.moved) hint = `${h.name}：先擲骰移動，或在原地執行一個主要行動`;
    else hint = `${h.name}：選擇一個主要行動（佔領・招募・修煉・建設・探索）`;
    return { groups, hint };
  }

  private async explore(h: Character, name: string) {
    this.mode = 'busy';
    const before = h.level;
    const ev = this.events.exploreRealm(this.state, h, name);
    await this.modal.show(ev);
    this.mode = 'idle';
    const gain: GainResult | undefined = h.level > before ? { gained: 0, brokeThrough: true, newRealm: realmName(h.level) } : undefined;
    this.finishAction(h, ev.text.split('\n')[0], ev.text.includes('折損') ? 'bad' : 'good', gain);
  }

  // ───────────────────────── 畫面更新 ─────────────────────────

  private setBusy(b: boolean) {
    if (b) this.mode = 'busy';
    else if (this.mode === 'busy') this.mode = 'idle';
    this.ui.setBusy(b);
  }

  private refresh() {
    if (!this.state) return;
    this.ui.renderTop(this.state);
    this.ui.renderHeroes(this.state, this.selectedId, (id) => this.world.map.node(id).name);
    const { groups, hint } = this.buildActions();
    this.ui.renderActions(groups, hint);
    this.ui.renderCity(this.viewCityId ? this.state.cities[this.viewCityId] : null, this.state);
    for (const s of this.sprites.values()) {
      const c = s.character;
      s.setDone(c.faction === this.state.player && c.acted);
    }
  }
}

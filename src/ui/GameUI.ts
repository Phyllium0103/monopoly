import type { City, GameState, ResourceKey } from '../game/types';
import { FACTIONS, FACTION_IDS, ownerCss, ownerName } from '../faction/Faction';
import { heroPower, nextThreshold, realmName, REALM_THRESHOLDS, troopCapacity } from '../character/Character';
import { RESOURCE_ICONS, RESOURCE_NAMES, cityIncome, formatGain } from '../systems/EconomySystem';
import { discipleCount, disciplePower } from '../systems/RecruitmentSystem';
import { citiesOf, heroesOf } from '../game/GameState';
import { REALMS } from '../character/Character';

export interface ActionButton {
  label: string;
  sub?: string;
  title?: string;
  disabled?: boolean;
  kind?: 'primary' | 'free' | 'danger';
  onClick: () => void;
}

export interface ActionGroup {
  title: string;
  buttons: ActionButton[];
}

const SPECIALTY: Record<string, string> = { food: '糧倉', wood: '林場', iron: '礦山', qi: '靈脈', trade: '商埠' };
const DICE = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

export class GameUI {
  private top: HTMLDivElement;
  private heroes: HTMLDivElement;
  private actions: HTMLDivElement;
  private cityPanel: HTMLDivElement;
  private logEl: HTMLDivElement;
  private toastEl: HTMLDivElement;
  private tooltip: HTMLDivElement;
  private dice: HTMLDivElement;
  private hud: HTMLDivElement;
  onEndTurn: (() => void) | null = null;
  onSelectHero: ((id: string) => void) | null = null;

  constructor(private root: HTMLElement) {
    this.hud = document.createElement('div');
    this.hud.className = 'hud hidden';
    this.hud.innerHTML = `
      <div class="top-bar"></div>
      <div class="left-column">
        <div class="log-panel"><div class="log-title">天下紀事</div><div class="log-list"></div></div>
        <div class="hero-cards"></div>
      </div>
      <div class="city-panel hidden"></div>
      <div class="bottom-panel">
        <div class="action-panel"></div>
      </div>
      <div class="toast"></div>
      <div class="dice hidden"></div>
      <div class="tooltip hidden"></div>
      <div class="help">左鍵拖曳旋轉 · 右鍵平移 · 滾輪縮放 · WASD 移動視角</div>`;
    root.appendChild(this.hud);
    const q = <T extends HTMLElement>(s: string) => this.hud.querySelector(s) as T;
    this.top = q('.top-bar');
    this.heroes = q('.hero-cards');
    this.actions = q('.action-panel');
    this.cityPanel = q('.city-panel');
    this.logEl = q('.log-list');
    this.toastEl = q('.toast');
    this.tooltip = q('.tooltip');
    this.dice = q('.dice');
  }

  show() {
    this.hud.classList.remove('hidden');
  }

  hide() {
    this.hud.classList.add('hidden');
  }

  reset() {
    this.logEl.innerHTML = '';
    this.cityPanel.classList.add('hidden');
  }

  setBusy(busy: boolean) {
    this.hud.classList.toggle('busy', busy);
  }

  renderTop(state: GameState) {
    const f = FACTIONS[state.player];
    const fs = state.factions[state.player];
    const res = (Object.keys(RESOURCE_NAMES) as ResourceKey[])
      .map((k) => `<div class="res" title="${RESOURCE_NAMES[k]}"><span>${RESOURCE_ICONS[k]}</span><b>${Math.floor(fs.resources[k])}</b><small>${RESOURCE_NAMES[k]}</small></div>`)
      .join('');
    const powers = FACTION_IDS.map(
      (id) => `<span class="pw ${id === state.player ? 'me' : ''}" style="--fc:${FACTIONS[id].css}">${FACTIONS[id].name} ${citiesOf(state, id).length}城</span>`,
    ).join('');
    const tide = state.qiTideTurn === state.turn ? '<span class="tide">🌊 靈氣潮汐</span>' : '';
    this.top.innerHTML = `
      <div class="faction-badge" style="--fc:${f.css}"><b>${f.name}</b><small>${f.sect}</small></div>
      <div class="turn">回合 <b>${Math.min(state.turn, state.maxTurns)}</b> / ${state.maxTurns} ${tide}</div>
      <div class="resources">${res}<div class="res" title="弟子（戰力 ${disciplePower(fs)}）"><span>🧑‍🎓</span><b>${discipleCount(fs)}</b><small>弟子</small></div></div>
      <div class="powers">${powers}</div>
      <button class="btn end-turn">結束回合 ⏎</button>`;
    (this.top.querySelector('.end-turn') as HTMLButtonElement).onclick = () => this.onEndTurn?.();
  }

  renderHeroes(state: GameState, selectedId: string | null, nodeName: (id: string) => string) {
    this.heroes.innerHTML = '';
    for (const h of heroesOf(state, state.player)) {
      const next = nextThreshold(h.level);
      const prev = REALM_THRESHOLDS[h.level];
      const pct = next ? ((h.cultivation - prev) / (next - prev)) * 100 : 100;
      const status = h.acted ? '已行動' : h.moved ? '已移動' : '可行動';
      const card = document.createElement('button');
      card.className = `hero-card ${h.id === selectedId ? 'selected' : ''} ${h.acted ? 'done' : ''}`;
      card.innerHTML = `
        <div class="hc-head"><b>${h.name}</b><span class="role">${h.role}</span><span class="realm">${realmName(h.level)}</span><span class="status s-${h.acted ? 'done' : h.moved ? 'moved' : 'ready'}">${status}</span></div>
        <div class="bar" title="修為 ${h.cultivation}${next ? ` / ${next}` : ''}"><i style="width:${Math.min(100, pct)}%"></i><span>修為 ${h.cultivation}${next ? ` / ${next}` : ''}</span></div>
        <div class="hc-row">戰力 <b>${heroPower(h)}</b> · 兵 ${h.troops}/${troopCapacity(h)} · 攻${h.attack} 防${h.defense}</div>
        <div class="hc-row loc">📍 ${nodeName(h.position)} · 忠誠 ${h.loyalty}</div>`;
      card.onclick = () => this.onSelectHero?.(h.id);
      this.heroes.appendChild(card);
    }
  }

  renderActions(groups: ActionGroup[], hint: string) {
    this.actions.innerHTML = `<div class="hint">${hint}</div>`;
    const wrap = document.createElement('div');
    wrap.className = 'action-groups';
    for (const g of groups) {
      const ge = document.createElement('div');
      ge.className = 'action-group';
      ge.innerHTML = `<div class="ag-title">${g.title}</div>`;
      const row = document.createElement('div');
      row.className = 'ag-buttons';
      for (const b of g.buttons) {
        const btn = document.createElement('button');
        btn.className = `btn action ${b.kind ?? ''}`;
        btn.disabled = !!b.disabled;
        btn.title = b.title ?? '';
        btn.innerHTML = `${b.label}${b.sub ? `<small>${b.sub}</small>` : ''}`;
        btn.onclick = () => b.onClick();
        row.appendChild(btn);
      }
      ge.appendChild(row);
      wrap.appendChild(ge);
    }
    this.actions.appendChild(wrap);
  }

  renderCity(city: City | null, state: GameState) {
    if (!city) {
      this.cityPanel.classList.add('hidden');
      return;
    }
    this.cityPanel.classList.remove('hidden');
    const mine = city.owner === state.player;
    const seeGarrison = mine || city.owner === 'neutral' || FACTIONS[state.player].intel;
    const visitors = state.characters.filter((c) => c.position === city.id);
    const income = mine ? formatGain(cityIncome(city, state.player)) : '';
    this.cityPanel.innerHTML = `
      <div class="cp-head" style="--fc:${ownerCss(city.owner)}">
        <b>${city.capital ? '★ ' : ''}${city.name}</b><span>${ownerName(city.owner)}</span>
      </div>
      <table>
        <tr><td>人口</td><td>${city.population}</td></tr>
        <tr><td>城防</td><td>${city.defense}</td></tr>
        <tr><td>守軍</td><td>${seeGarrison ? city.garrison : '???'}${!mine && city.owner !== 'neutral' && FACTIONS[state.player].intel ? ' <small>(天機洞悉)</small>' : ''}</td></tr>
        <tr><td>資源</td><td>${city.resources}</td></tr>
        <tr><td>靈氣</td><td>${city.spiritEnergy}</td></tr>
        <tr><td>特產</td><td>${SPECIALTY[city.specialty]}</td></tr>
        ${mine ? `<tr><td>可招弟子</td><td>練氣期 × ${city.recruitable}</td></tr>` : ''}
      </table>
      ${mine ? `<div class="cp-income">每回合：${income}</div>` : ''}
      ${visitors.length ? `<div class="cp-visitors">駐留：${visitors.map((v) => `<span style="color:${FACTIONS[v.faction].css}">${v.name}</span>`).join('、')}</div>` : ''}
      <div class="cp-realms">境界：${REALMS.join(' → ')}</div>`;
  }

  log(msg: string, kind: 'info' | 'good' | 'bad' | 'npc' | 'turn' = 'info') {
    const li = document.createElement('div');
    li.className = `log-item ${kind}`;
    li.textContent = msg;
    this.logEl.prepend(li);
    while (this.logEl.children.length > 60) this.logEl.lastChild?.remove();
  }

  toast(msg: string) {
    this.toastEl.textContent = msg;
    this.toastEl.classList.remove('show');
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add('show');
  }

  showTooltip(text: string | null, x = 0, y = 0) {
    if (!text) {
      this.tooltip.classList.add('hidden');
      return;
    }
    this.tooltip.classList.remove('hidden');
    this.tooltip.innerHTML = text;
    this.tooltip.style.left = `${x + 14}px`;
    this.tooltip.style.top = `${y + 14}px`;
  }

  /** 擲骰動畫 */
  rollDice(value: number): Promise<void> {
    return new Promise((resolve) => {
      this.dice.classList.remove('hidden');
      this.dice.classList.add('rolling');
      let n = 0;
      const timer = setInterval(() => {
        this.dice.textContent = DICE[Math.floor(Math.random() * 6)];
        if (++n > 10) {
          clearInterval(timer);
          this.dice.classList.remove('rolling');
          this.dice.innerHTML = `${DICE[value - 1]}<small>${value} 步</small>`;
          setTimeout(() => {
            this.dice.classList.add('hidden');
            resolve();
          }, 650);
        }
      }, 60);
    });
  }

  get rootEl() {
    return this.root;
  }
}

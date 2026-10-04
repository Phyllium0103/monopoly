import type { GameState } from '../game/types';
import { LORDS } from '../faction/Faction';
import { citiesOf, generalsOf } from '../game/GameState';
import { fmtStones } from '../game/Currency';

export interface ActionButton {
  label: string;
  sub?: string;
  kind?: 'primary' | 'danger' | 'free';
  disabled?: boolean;
  onClick: () => void;
}

const DICE = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

export class GameUI {
  private hud: HTMLDivElement;
  private top: HTMLDivElement;
  private actions: HTMLDivElement;
  private info: HTMLDivElement;
  private logEl: HTMLDivElement;
  private toastEl: HTMLDivElement;
  private tooltip: HTMLDivElement;
  private dice: HTMLDivElement;
  speed = 1;
  onSpeed: ((s: number) => void) | null = null;
  onHelp: (() => void) | null = null;

  constructor(root: HTMLElement) {
    this.hud = document.createElement('div');
    this.hud.className = 'hud hidden';
    this.hud.innerHTML = `
      <div class="top-bar"></div>
      <div class="log-panel"><div class="log-title">天下紀事</div><div class="log-list"></div></div>
      <div class="info-panel hidden"></div>
      <div class="bottom-panel"><div class="action-panel"></div></div>
      <div class="toast"></div>
      <div class="dice hidden"></div>
      <div class="tooltip hidden"></div>
      <div class="help">左鍵拖曳旋轉 · 右鍵平移 · 滾輪縮放 · WASD 移動視角</div>`;
    root.appendChild(this.hud);
    const q = <T extends HTMLElement>(s: string) => this.hud.querySelector(s) as T;
    this.top = q('.top-bar');
    this.actions = q('.action-panel');
    this.info = q('.info-panel');
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
    this.info.classList.add('hidden');
  }

  renderTop(state: GameState) {
    const current = state.order[state.turn];
    const lords = state.order
      .map((id) => {
        const l = state.lords[id];
        const d = LORDS[id];
        const status = !l.alive ? '<span class="tag dead">出局</span>' : l.stunned ? `<span class="tag stun">迷魂 ${l.stunned}</span>` : '';
        const realm = l.expeditions.length ? `<span class="tag realm">🌀${l.expeditions.length}</span>` : '';
        return `<div class="lord-card ${id === current ? 'current' : ''} ${l.alive ? '' : 'out'} ${l.isPlayer ? 'me' : ''}" style="--fc:${d.css}">
          <div class="lc-head"><b>${d.name}</b><small>${d.kingdom}${l.isPlayer ? '・你' : ''}</small>${status}${realm}</div>
          <div class="lc-row">💎 ${fmtStones(l.stones, true)}</div>
          <div class="lc-row">⚔️ ${l.soldiers} · 🏯 ${citiesOf(state, id).length} · 👥 ${generalsOf(state, id).length}</div>
        </div>`;
      })
      .join('');
    this.top.innerHTML = `
      <div class="round">第 <b>${Math.min(state.round, state.maxRounds)}</b> / ${state.maxRounds} 輪
        <div class="world-events">${
          state.events.map((e) => `<span class="ev" title="${e.name}">${e.icon}${e.name} ${e.roundsLeft}</span>`).join('') ||
          `<span class="ev next">下次風雲：第 ${Math.ceil((state.round + 1) / 5) * 5} 輪</span>`
        }</div>
      </div>
      <div class="lords">${lords}</div>
      <div class="speed"><button class="btn mini help-btn">📖 說明</button>${[1, 2, 4].map((s) => `<button class="btn mini ${s === this.speed ? 'on' : ''}" data-s="${s}">${s}×</button>`).join('')}</div>`;
    (this.top.querySelector('.help-btn') as HTMLButtonElement).onclick = () => this.onHelp?.();
    this.top.querySelectorAll<HTMLButtonElement>('.speed button[data-s]').forEach((b) => {
      b.onclick = () => {
        this.speed = Number(b.dataset.s);
        this.onSpeed?.(this.speed);
        this.renderTop(state);
      };
    });
  }

  renderActions(buttons: ActionButton[], hint: string) {
    this.actions.innerHTML = `<div class="hint">${hint}</div>`;
    const row = document.createElement('div');
    row.className = 'action-row';
    for (const b of buttons) {
      const btn = document.createElement('button');
      btn.className = `btn action ${b.kind ?? ''}`;
      btn.disabled = !!b.disabled;
      btn.innerHTML = `${b.label}${b.sub ? `<small>${b.sub}</small>` : ''}`;
      btn.onclick = () => b.onClick();
      row.appendChild(btn);
    }
    this.actions.appendChild(row);
  }

  renderInfo(html: string | null) {
    this.info.classList.toggle('hidden', !html);
    if (html) this.info.innerHTML = html;
  }

  log(msg: string, kind: 'info' | 'good' | 'bad' | 'ai' | 'turn' = 'info') {
    const li = document.createElement('div');
    li.className = `log-item ${kind}`;
    li.innerHTML = msg;
    this.logEl.prepend(li);
    while (this.logEl.children.length > 80) this.logEl.lastChild?.remove();
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
    this.tooltip.style.left = `${Math.min(x + 14, window.innerWidth - 260)}px`;
    this.tooltip.style.top = `${y + 14}px`;
  }

  /** 擲骰動畫 */
  rollDice(values: number[]): Promise<void> {
    const flicker = 10;
    const interval = 60 / this.speed;
    return new Promise((resolve) => {
      this.dice.classList.remove('hidden');
      this.dice.classList.add('rolling');
      let n = 0;
      const timer = setInterval(() => {
        this.dice.textContent = values.map(() => DICE[Math.floor(Math.random() * 6)]).join('');
        if (++n > flicker) {
          clearInterval(timer);
          this.dice.classList.remove('rolling');
          const sum = values.reduce((a, b) => a + b, 0);
          this.dice.innerHTML = `${values.map((v) => DICE[v - 1]).join('')}<small>${sum} 步</small>`;
          setTimeout(() => {
            this.dice.classList.add('hidden');
            resolve();
          }, 650 / this.speed);
        }
      }, interval);
    });
  }
}

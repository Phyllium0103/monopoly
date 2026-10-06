import { totalAssets } from '../systems/CitySystem';
import { music } from './Music';
import type { GameState, LordId } from '../game/types';
import { LORDS } from '../faction/Faction';
import { citiesOf, generalsOf } from '../game/GameState';
import { fmtStones } from '../game/Currency';
import { canAttemptBreak } from '../systems/GeneralSystem';

export interface ActionButton {
  label: string;
  sub?: string;
  kind?: 'primary' | 'danger' | 'free';
  disabled?: boolean;
  /** 閃爍提示 */
  highlight?: boolean;
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
  private report: HTMLDivElement;
  private overlay: HTMLDivElement;
  private rollBtn: HTMLButtonElement;
  private logPanel: HTMLDivElement;
  private logOpen = true;
  private closeReport: (() => void) | null = null;
  /** 正在蒐集電腦這回合的行動 */
  private collecting: string[] | null = null;
  speed = 1;
  onSpeed: ((s: number) => void) | null = null;
  onHelp: (() => void) | null = null;
  onGarrison: (() => void) | null = null;
  onRank: (() => void) | null = null;
  onAuto: (() => void) | null = null;
  onCheat: (() => void) | null = null;
  onLord: ((id: LordId) => void) | null = null;
  /** 電腦託管中 */
  auto = false;

  constructor(root: HTMLElement) {
    this.hud = document.createElement('div');
    this.hud.className = 'hud hidden';
    this.hud.innerHTML = `
      <div class="top-bar"></div>
      <div class="log-panel"><div class="log-title">天下紀事</div><div class="log-list"></div></div>
      <div class="info-panel hidden"></div>
      <div class="bottom-panel"><div class="action-panel"></div></div>
      <div class="toast"></div>
      <div class="report-overlay hidden"></div>
      <div class="turn-report hidden"></div>
      <button class="roll-btn hidden" title="擲骰（空白鍵）"><span class="roll-dice">🎲</span><b>擲骰</b><small>空白鍵</small></button>
      <div class="dice hidden"></div>
      <div class="tooltip hidden"></div>
`;
    root.appendChild(this.hud);
    const q = <T extends HTMLElement>(s: string) => this.hud.querySelector(s) as T;
    this.top = q('.top-bar');
    this.actions = q('.action-panel');
    this.info = q('.info-panel');
    this.logEl = q('.log-list');
    this.toastEl = q('.toast');
    this.tooltip = q('.tooltip');
    this.dice = q('.dice');
    this.report = q('.turn-report');
    this.overlay = q('.report-overlay');
    this.rollBtn = q('.roll-btn');
    this.logPanel = q('.log-panel');
    // 點擊任何地方都能立刻關閉電腦行動結果
    this.overlay.addEventListener('click', () => this.closeReport?.());
    this.report.addEventListener('click', () => this.closeReport?.());
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
    this.closeReport?.();
    this.hideRoll();
    this.collecting = null;
  }

  renderTop(state: GameState) {
    const current = state.order[state.turn];
    const lords = state.order
      .map((id) => {
        const l = state.lords[id];
        const d = LORDS[id];
        const status = !l.alive ? '<span class="tag dead">出局</span>' : l.stunned ? `<span class="tag stun">迷魂 ${l.stunned}</span>` : '';
        const realm = l.expeditions.length ? `<span class="tag realm">🌀${l.expeditions.length}</span>` : '';
        const ready = l.alive && l.isPlayer ? generalsOf(state, id).filter((g) => canAttemptBreak(g, state.round).ok).length : 0;
        const breakTag = ready ? `<span class="tag ready" title="有武將修為圓滿，可到武將名冊突破">✨可突破 ${ready}</span>` : '';
        return `<div class="lord-card clickable ${id === current ? 'current' : ''} ${l.alive ? '' : 'out'} ${l.isPlayer ? 'me' : ''}" data-lord="${id}" style="--fc:${d.css}">
          <div class="lc-head"><b>${d.name}</b><small>${d.kingdom}${l.isPlayer ? '・你' : ''}</small>${status}${realm}${breakTag}</div>
          <div class="lc-row">💎 ${fmtStones(l.stones, true)}</div>
          <div class="lc-row">總資產 <b>${fmtStones(totalAssets(state, id).total, true)}</b></div>
          <div class="lc-more"><div>⚔️ 士兵 <b>${l.soldiers}</b></div><div>🏯 城池 <b>${citiesOf(state, id).length}</b> 座</div><div>👥 武將 <b>${generalsOf(state, id).length}</b> 名</div><small>點擊查看詳細資料</small></div>
        </div>`;
      })
      .join('');
    this.top.innerHTML = `
      <div class="round">${state.maxRounds === null ? `第 <b>${state.round}</b> 輪・無盡` : `第 <b>${Math.min(state.round, state.maxRounds)}</b> / ${state.maxRounds} 輪`}
        <div class="world-events">${
          state.events.map((e) => `<span class="ev" title="${e.name}">${e.icon}${e.name} ${e.roundsLeft}</span>`).join('') ||
          `<span class="ev next">下次風雲：第 ${Math.ceil((state.round + 1) / 5) * 5} 輪</span>`
        }</div>
      </div>
      <div class="lords">${lords}</div>
      <div class="speed">
        <button class="btn mini tool log-btn ${this.logOpen ? 'on' : ''}" data-tip="天下紀事（開／關）">📜</button>
        <button class="btn mini tool auto-btn ${this.auto ? 'on' : ''}" data-tip="${this.auto ? '電腦託管中（點擊取消）' : '電腦代打你的回合'}">🤖</button>
        <button class="btn mini tool garrison-btn" ${state.over || !state.lords[state.player].alive ? 'disabled' : ''} data-tip="調兵：隨時調動駐軍，依道路距離收費，一次付費可操作到關閉">🏯</button>
        <button class="btn mini tool rank-btn" data-tip="城池榜">🏆</button>
        <button class="btn mini tool help-btn" data-tip="說明（地圖：左鍵旋轉・右鍵平移・滾輪縮放・WASD 移動）">📖</button>
        <span class="tool music" data-tip="背景音樂音量">🎵<span class="music-fly"><input type="range" class="music-vol" min="0" max="100" step="5" value="${Math.round(music.volume * 100)}"><span class="music-pct">${Math.round(music.volume * 100)}%</span></span></span>
        <button class="btn mini tool cheat-btn" data-tip="測試用：獲得大量靈石與所有物品">🧪</button>
        <span class="speed-group">${[1, 2, 4].map((s) => `<button class="btn mini ${s === this.speed ? 'on' : ''}" data-s="${s}" data-tip="遊戲速度 ${s}×">${s}×</button>`).join('')}</span>
      </div>`;
    (this.top.querySelector('.help-btn') as HTMLButtonElement).onclick = () => this.onHelp?.();
    (this.top.querySelector('.garrison-btn') as HTMLButtonElement).onclick = () => this.onGarrison?.();
    const vol = this.top.querySelector('.music-vol') as HTMLInputElement;
    vol.oninput = () => {
      music.setVolume(Number(vol.value) / 100);
      (this.top.querySelector('.music-pct') as HTMLElement).textContent = `${vol.value}%`;
    };
    this.top.querySelectorAll<HTMLElement>('.lord-card[data-lord]').forEach((c) => {
      c.onclick = () => this.onLord?.(c.dataset.lord as LordId);
    });
    (this.top.querySelector('.rank-btn') as HTMLButtonElement).onclick = () => this.onRank?.();
    (this.top.querySelector('.auto-btn') as HTMLButtonElement).onclick = () => this.onAuto?.();
    (this.top.querySelector('.cheat-btn') as HTMLButtonElement).onclick = () => this.onCheat?.();
    (this.top.querySelector('.log-btn') as HTMLButtonElement).onclick = () => {
      this.logOpen = !this.logOpen;
      this.logPanel.classList.toggle('hidden', !this.logOpen);
      this.renderTop(state);
    };
    this.top.querySelectorAll<HTMLButtonElement>('.speed button[data-s]').forEach((b) => {
      b.onclick = () => {
        this.speed = Number(b.dataset.s);
        this.onSpeed?.(this.speed);
        this.renderTop(state);
      };
    });
  }

  renderActions(buttons: ActionButton[], hint: string, fullHint = '') {
    this.actions.innerHTML = `<div class="hint" ${fullHint ? `title="${fullHint}"` : ''}>${hint}</div>`;
    const row = document.createElement('div');
    row.className = 'action-row';
    for (const b of buttons) {
      const btn = document.createElement('button');
      btn.className = `btn action ${b.kind ?? ''}${b.highlight ? ' pulse' : ''}`;
      btn.disabled = !!b.disabled;
      // 太長的說明收進 hover，按鈕本身只留簡短的資訊
      const longSub = !!b.sub && b.sub.length > 10;
      if (longSub) btn.dataset.tip = b.sub;
      btn.innerHTML = `${b.label}${b.sub && !longSub ? `<small>${b.sub}</small>` : ''}`;
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
    if (this.collecting && kind !== 'turn') this.collecting.push(msg);
    this.logEl.prepend(li);
    while (this.logEl.children.length > 80) this.logEl.lastChild?.remove();
  }

  /** 開始蒐集一位主公這回合的所有行動 */
  beginReport() {
    this.collecting = [];
  }

  /** 丟掉目前蒐集的內容，只保留之後的結果 */
  restartReport() {
    this.collecting = [];
  }

  /** 結束蒐集並回傳這回合的行動紀錄 */
  endReport(): string[] {
    const lines = this.collecting ?? [];
    this.collecting = null;
    return lines;
  }

  /** 在畫面中央顯示一位主公這回合的行動結果；點擊任何地方立刻關閉，也會在時間到時自動關閉 */
  showReport(title: string, css: string, lines: string[], autoCloseMs = 5000): Promise<void> {
    this.closeReport?.();
    this.report.style.setProperty('--fc', css);
    this.report.innerHTML = `
      <div class="tr-head"><b>${title}</b><span class="tr-tip">點擊任意處關閉</span></div>
      <ul>${(lines.length ? lines : ['按兵不動，沒有特別的行動。']).map((l) => `<li>${l}</li>`).join('')}</ul>`;
    this.report.classList.remove('hidden');
    this.overlay.classList.remove('hidden');
    return new Promise((resolve) => {
      const timer = setTimeout(() => this.closeReport?.(), autoCloseMs);
      this.closeReport = () => {
        clearTimeout(timer);
        this.report.classList.add('hidden');
        this.overlay.classList.add('hidden');
        this.closeReport = null;
        resolve();
      };
    });
  }

  hideReport() {
    this.closeReport?.();
  }

  /** 擲骰大圓鈕 */
  showRoll(onClick: () => void) {
    this.rollBtn.classList.remove('hidden');
    this.rollBtn.onclick = onClick;
  }

  hideRoll() {
    this.rollBtn.classList.add('hidden');
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
  rollDice(values: number[], bonus = 0, multiplier = 1): Promise<void> {
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
          const sum = (values.reduce((a, b) => a + b, 0) + bonus) * multiplier;
          this.dice.innerHTML = `${values.map((v) => DICE[v - 1]).join('')}<small>${sum} 步${multiplier > 1 ? `（遁地梭 ×${multiplier}）` : bonus ? `（額外 +${bonus}）` : ''}</small>`;
          setTimeout(() => {
            this.dice.classList.add('hidden');
            resolve();
          }, 650 / this.speed);
        }
      }, interval);
    });
  }
}

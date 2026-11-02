import { RELIC_EVENTS } from '../systems/RelicSystem';
import type { LordId } from '../game/types';
import { LORDS } from '../faction/Faction';
import './relic-map.css';

/** 每站在捲軸上的高低起伏（百分比），連成一條蜿蜒山徑 */
const WAVE = [62, 40, 26, 38, 60, 72, 56, 34, 24, 40, 62, 70, 52, 32, 28, 46];

/** 山河社稷圖：橫向展開的捲軸，外圈 16 站由左而右走完一圈；旅程跨多個回合時保持開啟 */
export class RelicMap {
  private panel = document.createElement('section');
  private paper = document.createElement('div');
  private title = document.createElement('h2');
  private progress = document.createElement('div');
  private result = document.createElement('p');
  private roll = document.createElement('button');
  private tiles: HTMLDivElement[] = [];
  private lord: LordId | null = null;

  constructor(onRoll: () => void) {
    this.panel.className = 'relic-map';
    this.panel.hidden = true;
    this.panel.setAttribute('aria-label', '山河社稷圖：16 站試煉捲軸');
    this.paper.className = 'relic-paper';

    const seal = document.createElement('div');
    seal.className = 'relic-seal';
    seal.innerHTML = '<b>山河社稷圖</b><small>順行一周<br>站站吉凶<br>圖內禁道具</small>';

    const track = document.createElement('div');
    track.className = 'relic-track';
    const pts = WAVE.map((y, i) => `${((i + 1) / 17) * 100},${y}`);
    track.innerHTML = `<svg class="relic-path" viewBox="0 0 100 100" preserveAspectRatio="none">
      <polyline points="0,${WAVE[0]} ${pts.join(' ')} 100,${WAVE[WAVE.length - 1]}"/></svg>
      <span class="relic-gate start" style="top:${WAVE[0]}%">入口</span><span class="relic-gate end" style="top:${WAVE[WAVE.length - 1]}%">歸返</span>`;
    RELIC_EVENTS.forEach((e, i) => {
      const tile = document.createElement('div');
      tile.className = 'relic-cell';
      tile.style.left = `${((i + 1) / 17) * 100}%`;
      tile.style.top = `${WAVE[i]}%`;
      tile.title = `吉：${e.good}\n凶：${e.bad}\n吉運 ${Math.round(e.chance * 100)}%`;
      tile.setAttribute('aria-label', `第 ${i + 1} 站 ${e.name}：吉 ${e.good}，凶 ${e.bad}，吉運 ${Math.round(e.chance * 100)}%`);
      tile.innerHTML = `<span class="relic-no">${i + 1}</span><span class="relic-icon">${e.icon}</span><span class="relic-name">${e.name}</span><span class="relic-luck">吉 ${Math.round(e.chance * 100)}%</span>`;
      this.tiles.push(tile);
      track.append(tile);
    });

    const close = document.createElement('button');
    close.textContent = '收起';
    close.className = 'relic-close';
    close.onclick = () => { this.panel.hidden = true; };
    this.title.className = 'relic-title';
    this.progress.className = 'relic-progress';
    this.result.className = 'relic-result';
    this.roll.className = 'relic-roll';
    this.roll.textContent = '擲骰前進';
    this.roll.onclick = onRoll;

    const head = document.createElement('div');
    head.className = 'relic-head';
    head.append(this.title, this.progress, close);
    const foot = document.createElement('div');
    foot.className = 'relic-foot';
    foot.append(this.result, this.roll);
    const body = document.createElement('div');
    body.className = 'relic-body';
    body.append(head, track, foot);
    const inner = document.createElement('div');
    inner.className = 'relic-inner';
    inner.append(seal, body);
    this.paper.append(inner);

    const roller = (side: string) => { const r = document.createElement('div'); r.className = `relic-roller ${side}`; return r; };
    this.panel.append(roller('left'), this.paper, roller('right'));
    (document.getElementById('ui') ?? document.body).append(this.panel);
  }

  show(lord: LordId, step: number, text: string) {
    // 從收起狀態打開時才播放展開動畫，走步更新不重播
    if (this.panel.hidden) {
      this.panel.classList.remove('unroll');
      void this.panel.offsetWidth;
      this.panel.classList.add('unroll');
    }
    this.lord = lord;
    this.panel.hidden = false;
    this.panel.style.setProperty('--lord-color', LORDS[lord].css);
    this.title.textContent = `${LORDS[lord].name}・山河試煉`;
    this.progress.innerHTML = `<span>已行 <b>${step}</b> / 16 站</span><i><em style="width:${(step / 16) * 100}%"></em></i>`;
    this.result.textContent = text;
    this.tiles.forEach((tile, i) => {
      tile.classList.toggle('occupied', i === step % 16);
      tile.classList.toggle('visited', i > 0 && i <= step);
    });
    this.panel.dataset.steps = String(step);
    this.panel.dataset.lord = lord;
  }

  hide() {
    this.panel.hidden = true;
    this.lord = null;
  }

  setReady(me: LordId, ready: boolean) {
    this.roll.disabled = !ready || this.lord !== me;
    this.roll.textContent = this.roll.disabled ? '等待此主公下回合' : '擲骰前進';
  }
}

import type { GameState } from '../game/types';
import { ownerCss, ownerName } from '../faction/Faction';
import { RANK_METRICS, rankCities, type RankMetric } from '../systems/CitySystem';

type Tab = RankMetric | 'all';

const MEDALS = ['🥇', '🥈', '🥉'];

/** 城池排行榜：各項指標的排名，以及所有城池的總表 */
export class RankView {
  private el: HTMLDivElement;
  private tab: Tab = 'prosperity';
  private state: GameState | null = null;
  /** 點選城池時的回呼（鏡頭移過去） */
  onFocus: ((cityId: string) => void) | null = null;

  constructor(root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'help-backdrop hidden';
    // 外框與頁籤只建一次；切換頁籤只換表格內容，不重建整個面板
    const tabs: { id: Tab; label: string }[] = [...RANK_METRICS.map((m) => ({ id: m.id as Tab, label: `${m.icon} ${m.name}` })), { id: 'all', label: '📋 總表' }];
    this.el.innerHTML = `
      <div class="help-card scroll-card">
        <div class="help-head"><h2>🏆 城池榜</h2><button class="btn close">關閉 ✕</button></div>
        <div class="help-main">
          <nav class="help-tabs">${tabs.map((t) => `<button class="help-tab" data-t="${t.id}">${t.label}</button>`).join('')}</nav>
          <article class="help-body"></article>
        </div>
      </div>`;
    root.appendChild(this.el);
    this.el.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t === this.el || t.closest('.close')) return this.close();
      const tab = t.closest<HTMLElement>('.help-tab');
      if (tab) {
        this.tab = tab.dataset.t as Tab;
        return this.render();
      }
      const row = t.closest<HTMLElement>('tr[data-city]');
      if (row) {
        this.close();
        this.onFocus?.(row.dataset.city!);
      }
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.el.classList.contains('hidden')) this.close();
    });
  }

  open(state: GameState) {
    this.state = state;
    this.el.classList.remove('hidden');
    this.render();
  }

  close() {
    this.el.classList.add('hidden');
  }

  private rankBadge(rank: number) {
    return rank <= 3 ? MEDALS[rank - 1] : `${rank}`;
  }

  private metricTable(state: GameState, metric: RankMetric): string {
    const def = RANK_METRICS.find((m) => m.id === metric)!;
    const rows = rankCities(state, metric);
    const max = Math.max(1, ...rows.map((r) => r.value));
    const body = rows
      .map((r) => {
        return `<tr data-city="${r.city.id}">
          <td class="rk-rank">${this.rankBadge(r.rank)}</td>
          <td class="rk-city"><b>${r.city.capital ? '★' : ''}${r.city.name}</b></td>
          <td style="color:${ownerCss(r.city.owner)}">${ownerName(r.city.owner)}</td>
          <td class="rk-bar"><i style="width:${(r.value / max) * 100}%;background:${ownerCss(r.city.owner)}"></i></td>
          <td class="rk-val">${def.format(r.value)}</td>
        </tr>`;
      })
      .join('');
    return `<p class="rk-note">${def.icon} <b>${def.name}</b>：${def.note}</p><table class="rank-table"><tr><th>名次</th><th>城池</th><th>主人</th><th></th><th>${def.name}</th></tr>${body}</table>`;
  }

  private overviewTable(state: GameState): string {
    const ranks = new Map<RankMetric, Map<string, number>>();
    for (const m of RANK_METRICS) ranks.set(m.id, new Map(rankCities(state, m.id).map((r) => [r.city.id, r.rank])));
    const rows = rankCities(state, 'prosperity')
      .map((r) => {
        const cells = RANK_METRICS.map((m) => {
          const rk = ranks.get(m.id)!.get(r.city.id)!;
          const cls = rk <= 3 ? 'top' : rk > Object.keys(state.cities).length - 3 ? 'low' : '';
          return `<td class="rk-cell ${cls}">${rk}</td>`;
        }).join('');
        return `<tr data-city="${r.city.id}"><td class="rk-city"><b>${r.city.capital ? '★' : ''}${r.city.name}</b></td><td style="color:${ownerCss(r.city.owner)}">${ownerName(r.city.owner)}</td>${cells}</tr>`;
      })
      .join('');
    return `<p class="rk-note">📋 <b>總表</b>：每座城池在各項指標的名次（前三名標金色、後三名標灰色）。點選城池可移動鏡頭過去。</p>
      <table class="rank-table"><tr><th>城池</th><th>主人</th>${RANK_METRICS.map((m) => `<th>${m.icon}${m.name}</th>`).join('')}</tr>${rows}</table>`;
  }

  private render() {
    const state = this.state;
    if (!state) return;
    this.el.querySelectorAll<HTMLElement>('.help-tab').forEach((t) => t.classList.toggle('on', t.dataset.t === this.tab));
    const body = this.el.querySelector<HTMLElement>('.help-body')!;
    body.innerHTML = this.tab === 'all' ? this.overviewTable(state) : this.metricTable(state, this.tab);
    body.scrollTop = 0;
  }
}

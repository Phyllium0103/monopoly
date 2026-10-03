import type { GameState, LordId } from '../game/types';
import { LORDS, LORD_IDS } from '../faction/Faction';
import { GENERAL_SEEDS } from '../data/generals';
import { totalAssets } from '../systems/CitySystem';
import { fmtStones } from '../game/Currency';
import { MAX_ROUNDS } from '../game/GameState';

/** 開始畫面：選擇主公 */
export function showStartScreen(root: HTMLElement, onStart: (id: LordId) => void) {
  const el = document.createElement('div');
  el.className = 'screen start-screen';
  el.innerHTML = `
    <div class="title-block">
      <h1>仙途三國</h1>
      <p class="subtitle">靈氣復甦，群雄修仙・擲骰爭天下</p>
    </div>
    <div class="faction-cards"></div>
    <p class="hint">擲骰環遊天下，佔城收過路費 · 對手破產出局 · ${MAX_ROUNDS} 輪後比總資產</p>`;
  const cards = el.querySelector('.faction-cards')!;
  for (const id of LORD_IDS) {
    const d = LORDS[id];
    const gens = GENERAL_SEEDS.filter((g) => g.origin === id);
    const card = document.createElement('button');
    card.className = 'faction-card';
    card.style.setProperty('--fc', d.css);
    card.innerHTML = `
      <div class="fc-name">${d.kingdom}</div>
      <div class="fc-sect">${d.name}</div>
      <p class="fc-motto">${d.desc}</p>
      <p class="fc-bonus">開局麾下<br>${gens
        .filter((g) => g.start)
        .map((g) => g.name)
        .join('・')}</p>
      <div class="fc-heroes">可招募：${gens
        .filter((g) => !g.start)
        .map((g) => g.name)
        .join('・')}</div>`;
    card.onclick = () => {
      el.remove();
      onStart(id);
    };
    cards.appendChild(card);
  }
  root.appendChild(el);
}

/** 結算：先依出局順序，存活者依總資產排名 */
export function showEndScreen(root: HTMLElement, state: GameState, reason: string, onRestart: () => void) {
  const rows = LORD_IDS.map((id) => ({ id, a: totalAssets(state, id), l: state.lords[id] }));
  rows.sort((x, y) => {
    if (x.l.alive !== y.l.alive) return x.l.alive ? -1 : 1;
    if (!x.l.alive) return x.l.rank - y.l.rank;
    return y.a.total - x.a.total;
  });
  const myRank = rows.findIndex((r) => r.id === state.player) + 1;
  const titles = ['一統天下・仙朝之主', '雄踞一方', '偏安一隅', '道途坎坷'];
  const me = rows.find((r) => r.id === state.player)!;

  const el = document.createElement('div');
  el.className = 'screen end-screen';
  el.innerHTML = `
    <div class="result-card scroll-card">
      <div class="divider">════════════════════</div>
      <h1>天下結算</h1>
      <div class="result-reason">${reason}</div>
      <div class="result-title">第 ${myRank} 名・${titles[myRank - 1]}</div>
      <table class="result-table">
        <tr><td>主公</td><td style="color:${LORDS[state.player].css}">${LORDS[state.player].name}</td></tr>
        <tr><td>靈石</td><td>${fmtStones(me.a.stones)}</td></tr>
        <tr><td>士兵</td><td>${me.a.soldiers}</td></tr>
        <tr><td>城池</td><td>${me.a.cities} 座</td></tr>
        <tr><td>將領</td><td>${me.a.generals} 名</td></tr>
        <tr class="total"><td>總資產</td><td>${fmtStones(me.a.total, true)}</td></tr>
      </table>
      <div class="divider">════════════════════</div>
      <h3>群雄排名</h3>
      <ol class="ranking">
        ${rows
          .map(
            (r) =>
              `<li class="${r.id === state.player ? 'me' : ''}"><span style="color:${LORDS[r.id].css}">${LORDS[r.id].name}</span><span>${r.l.alive ? `${r.a.cities} 城` : '破產出局'}</span><b>${r.l.alive ? fmtStones(r.a.total, true) : '—'}</b></li>`,
          )
          .join('')}
      </ol>
      <button class="btn primary big">重新開始</button>
    </div>`;
  el.querySelector('button')!.onclick = () => {
    el.remove();
    onRestart();
  };
  root.appendChild(el);
}

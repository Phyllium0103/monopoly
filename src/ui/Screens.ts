import type { FactionId, GameState } from '../game/types';
import { FACTIONS, FACTION_IDS } from '../faction/Faction';
import { HERO_SEEDS } from '../character/Character';
import { factionScore } from '../systems/NpcSystem';

/** 開始畫面：選擇宗門 */
export function showStartScreen(root: HTMLElement, onStart: (f: FactionId) => void) {
  const el = document.createElement('div');
  el.className = 'screen start-screen';
  el.innerHTML = `
    <div class="title-block">
      <h1>仙途三國</h1>
      <p class="subtitle">天地靈氣復甦，群雄修仙爭天下</p>
    </div>
    <div class="faction-cards"></div>
    <p class="hint">選擇你的宗門 · 30 回合後進行天下結算</p>`;
  const cards = el.querySelector('.faction-cards')!;
  for (const id of FACTION_IDS) {
    const f = FACTIONS[id];
    const card = document.createElement('button');
    card.className = 'faction-card';
    card.style.setProperty('--fc', f.css);
    card.innerHTML = `
      <div class="fc-name">${f.name}</div>
      <div class="fc-sect">${f.sect}</div>
      <div class="fc-traits">${f.traits.map((t) => `<span>${t}</span>`).join('')}</div>
      <p class="fc-motto">${f.motto}</p>
      <p class="fc-bonus">${f.bonusText.split('｜').join('<br>')}</p>
      <div class="fc-heroes">${HERO_SEEDS[id].map((h) => h.name).join('・')}</div>`;
    card.onclick = () => {
      el.remove();
      onStart(id);
    };
    cards.appendChild(card);
  }
  root.appendChild(el);
}

/** 天下結算 */
export function showEndScreen(root: HTMLElement, state: GameState, onRestart: () => void) {
  const me = factionScore(state, state.player);
  const ranking = FACTION_IDS.map((f) => ({ f, s: factionScore(state, f) })).sort((a, b) => b.s.total - a.s.total);
  const rank = ranking.findIndex((r) => r.f === state.player) + 1;
  const titles = ['一統天下・仙朝之主', '雄踞一方・宗門巨擘', '偏安一隅・小有所成', '道途坎坷・東山再起'];

  const el = document.createElement('div');
  el.className = 'screen end-screen';
  el.innerHTML = `
    <div class="result-card scroll-card">
      <div class="divider">════════════════════</div>
      <h1>天下結算</h1>
      <div class="result-title">${titles[rank - 1]}</div>
      <table class="result-table">
        <tr><td>宗門</td><td style="color:${FACTIONS[state.player].css}">${FACTIONS[state.player].name}・${FACTIONS[state.player].sect}</td></tr>
        <tr><td>城池</td><td>${me.cities} × 100</td></tr>
        <tr><td>軍隊</td><td>${me.troops} × 2</td></tr>
        <tr><td>靈石</td><td>${me.stones}</td></tr>
        <tr><td>修為</td><td>${me.cultivation}</td></tr>
        <tr class="total"><td>勢力總分</td><td>${me.total}</td></tr>
      </table>
      <div class="divider">════════════════════</div>
      <h3>群雄排名</h3>
      <ol class="ranking">
        ${ranking
          .map(
            (r) =>
              `<li class="${r.f === state.player ? 'me' : ''}"><span style="color:${FACTIONS[r.f].css}">${FACTIONS[r.f].name}</span> <span>${r.s.cities} 城</span> <b>${r.s.total}</b></li>`,
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

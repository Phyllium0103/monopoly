import type { GameState, LordId } from '../game/types';
import { LORDS, LORD_IDS, TRAITS } from '../faction/Faction';
import { GENERAL_SEEDS } from '../data/generals';
import { citiesOf, generalsOf } from '../game/GameState';
import { nameOf } from '../systems/ItemSystem';
import { generalValue } from '../systems/GeneralSystem';
import { REALMS } from '../data/generals';
import { SOLDIER_PRICE, totalAssets } from '../systems/CitySystem';
import { fmtStones } from '../game/Currency';
import { DEFAULT_ROUNDS, ROUND_OPTIONS } from '../game/GameState';

/** 開始畫面：選擇主公 */
export function showStartScreen(root: HTMLElement, onStart: (id: LordId, maxRounds: number | null) => void, onHelp: () => void) {
  let rounds: number | null = DEFAULT_ROUNDS;
  const el = document.createElement('div');
  el.className = 'screen start-screen';
  el.innerHTML = `
    <div class="title-block">
      <h1 class="long-title">丞相，這過路費比雷劫還狠！</h1>
      <p class="title-en">Chancellor, This Toll is Worse Than Heavenly Tribulation!</p>
      <p class="subtitle">靈氣復甦，群雄修仙・擲骰爭天下</p>
    </div>
    <div class="mode-row"><span>遊戲模式</span><div class="mode-options"></div></div>
    <div class="faction-cards"></div>
    <p class="hint"></p>
    <button class="btn help-start">📖 遊戲說明</button>`;
  (el.querySelector('.help-start') as HTMLButtonElement).onclick = onHelp;
  const hint = el.querySelector('.hint') as HTMLElement;
  const options = el.querySelector('.mode-options')!;
  const renderMode = () => {
    options.innerHTML = '';
    const add = (label: string, value: number | null) => {
      const b = document.createElement('button');
      b.className = `btn mini ${rounds === value ? 'on' : ''}`;
      b.textContent = label;
      b.onclick = () => {
        rounds = value;
        renderMode();
      };
      options.appendChild(b);
    };
    for (const r of ROUND_OPTIONS) add(`${r} 輪`, r);
    add('♾️ 無盡模式', null);
    hint.textContent = rounds === null ? '無盡模式：沒有回合上限，主公到達真仙或最後存活者獲勝 · 擲骰環遊天下，佔城收過路費' : `擲骰環遊天下，佔城收過路費 · 主公到達真仙立即獲勝 · 對手破產出局 · ${rounds} 輪後比總資產`;
  };
  renderMode();
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
      <div class="fc-trait"><b>【${TRAITS[id].title}】</b>${TRAITS[id].pros.map((x) => `<span class="pro">＋${x}</span>`).join('')}${TRAITS[id].cons.map((x) => `<span class="con">－${x}</span>`).join('')}</div>
      <p class="fc-bonus">開局麾下<br>${gens
        .filter((g) => g.start && !g.lord)
        .map((g) => g.name)
        .join('・')}</p>
      <div class="fc-heroes">可招募：${gens
        .filter((g) => !g.start)
        .map((g) => g.name)
        .join('・')}</div>`;
    card.onclick = () => {
      el.remove();
      onStart(id, rounds);
    };
    cards.appendChild(card);
  }
  root.appendChild(el);
}

/** 結算：真仙主公優先，其餘依存活、出局順序與總資產排名。 */
export function showEndScreen(root: HTMLElement, state: GameState, reason: string, onRestart: () => void) {
  const rows = LORD_IDS.map((id) => ({ id, a: totalAssets(state, id), l: state.lords[id] }));
  rows.sort((x, y) => {
    if (x.id === y.id) return 0;
    if (x.id === state.winner) return -1;
    if (y.id === state.winner) return 1;
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
      <h3>全部資產明細</h3>
      <p class="muted">估值以此表計入總資產：士兵每名 ${SOLDIER_PRICE} 下品、城池繁榮每點 100 下品、物品市價五折；已裝備的神器、寶衣及功法包含在武將估值內。</p>
      ${rows.map(r => assetDetails(state, r.id)).join('')}
      <button class="btn primary big">重新開始</button>
    </div>`;
  el.querySelector('button')!.onclick = () => {
    el.remove();
    onRestart();
  };
  root.appendChild(el);
}

/** 各家現有資產逐項展開，裝備不重複計入行囊。 */
function assetDetails(state: GameState, id: LordId): string {
  const lord = state.lords[id];
  const a = totalAssets(state, id);
  const cities = citiesOf(state, id);
  const gens = generalsOf(state, id);
  const row = (label: string, value: number) => `<tr><td>${label}</td><td>${fmtStones(value)}</td></tr>`;
  const list = (title: string, entries: string[]) => `<h4>${title}</h4><table class="result-table">${entries.length ? entries.join('') : '<tr><td colspan="2">無</td></tr>'}</table>`;
  const statuses = { free: '隨行', sect: '宗門', garrison: '駐城', realm: '秘境', dead: '陣亡' };
  return `<details class="asset-details" ${id === state.player ? 'open' : ''}>
    <summary style="color:${LORDS[id].css}">${LORDS[id].name}・總資產 ${fmtStones(a.total, true)}${id === state.winner ? '・真仙勝利' : ''}</summary>
    <table class="result-table">
      ${row('持有靈石', a.stones)}
      ${row(`隨行士兵 ${lord.soldiers} 名`, lord.soldiers * SOLDIER_PRICE)}
      ${row('城池及守軍小計', a.cityValue)}
      ${row('武將及已裝備物品小計', a.generalValue)}
      ${row('行囊與靈獸小計（市價五折）', a.itemValue * .5)}
      ${row('總資產', a.total)}
    </table>
    ${list('城池與守軍', cities.map(c => row(`${c.name}・繁榮 ${c.prosperity}・守軍 ${c.garrisonSoldiers} 名・駐將 ${c.garrisonGenerals.map(g => state.generals[g].name).join('、') || '無'}`, c.prosperity * 100 + c.garrisonSoldiers * SOLDIER_PRICE)))}
    ${list('武將（含裝備與功法）', gens.map(g => row(`${g.name}・${REALMS[g.realm]}・${statuses[g.status]}${g.cityId ? '／' + state.cities[g.cityId].name : ''}<br><small>神器：${g.weapon?.name ?? '無'}／寶衣：${g.armor?.name ?? '無'}／功法：${g.technique?.name ?? '無'}</small>`, generalValue(g))))}
    ${list('丹藥、陣法、符籙與法器', lord.items.map(i => row(`${nameOf(i)}`, i.price * .5)))}
    ${list('行囊神器與寶衣', lord.gear.map(i => row(i.name, i.price * .5)))}
    ${list('功法秘笈', lord.scrolls.map(i => row(i.name, i.price * .5)))}
    ${list('靈獸', lord.beast ? [row(lord.beast.name, lord.beast.price * .5)] : [])}
  </details>`;
}

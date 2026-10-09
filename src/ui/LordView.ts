import type { GameState, General, LordId } from '../game/types';
import { MATERIAL_NAMES } from '../data/weaponCatalog';
import { materialIncome, materialsText } from '../systems/MaterialSystem';
import { LORDS, LORD_IDS } from '../faction/Faction';
import { realmTag } from './GeneralInfo';
import { passiveOf } from '../data/passives';
import { fmtProsperity, fmtStones } from '../game/Currency';
import { citiesOf, garrisonOf, generalsOf } from '../game/GameState';
import { cityIncomeOf, cityToll, garrisonPower, totalAssets } from '../systems/CitySystem';
import { attack, defense, maxHp, power } from '../systems/GeneralSystem';
import { ITEM_DEFS } from '../data/items';
import { STAT_NAMES } from '../data/items';

const STATUS: Record<General['status'], string> = { free: '隨行', sect: '宗門', garrison: '駐守', realm: '秘境中', dead: '已死亡' };

/** 主公詳細資料：任何一位主公的資源、城池、武將與行囊（含電腦主公） */
export class LordView {
  private el: HTMLDivElement;
  private current: LordId = 'cao';
  private state: GameState | null = null;
  /** 取得某位主公面向的描述 */
  facingText: ((id: LordId) => string) | null = null;

  constructor(root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'help-backdrop hidden';
    root.appendChild(this.el);
    this.el.addEventListener('click', (e) => {
      if (e.target === this.el) this.close();
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.el.classList.contains('hidden')) this.close();
    });
  }

  open(state: GameState, id: LordId) {
    this.state = state;
    this.current = id;
    this.el.classList.remove('hidden');
    this.render();
  }

  close() {
    this.el.classList.add('hidden');
  }

  private render() {
    const state = this.state;
    if (!state) return;
    const id = this.current;
    const lord = state.lords[id];
    const d = LORDS[id];
    const assets = totalAssets(state, id);
    const here = state.tiles[lord.position];

    const cities = citiesOf(state, id)
      .sort((a, b) => b.prosperity - a.prosperity)
      .map((c) => {
        const inc = cityIncomeOf(state, c);
        const guards = garrisonOf(state, c);
        return `<tr><td><b>${c.capital ? '★ ' : ''}${c.name}</b></td><td>${fmtProsperity(c.prosperity)}</td><td>${fmtStones(inc.stones, true)}・兵 +${inc.soldiers}<br>${c.mining ? MATERIAL_NAMES[c.mining][0] : '待指定'} +${materialIncome(c)} 顆</td><td>${c.garrisonSoldiers}</td><td>${guards.map((g) => g.name).join('、') || '—'}</td><td>${garrisonPower(state, c)}</td><td>${fmtStones(cityToll(state, c), true)}</td><td>擂台戰＋${STAT_NAMES[c.contest]}比試</td></tr>`;
      })
      .join('');

    const gens = generalsOf(state, id)
      .sort((a, b) => b.realm - a.realm || power(b) - power(a))
      .map(
        (g) =>
          `<tr><td><b style="color:${d.css}">${g.name}${g.isLord ? '（主公）' : ''}</b></td><td>${realmTag(g.realm)}</td><td>${power(g)}</td><td>${attack(g)}/${defense(g)}/${g.hp}・${maxHp(g)}</td><td>${STATUS[g.status]}${g.status === 'garrison' && g.cityId ? `・${state.cities[g.cityId].name}` : ''}</td><td>${passiveOf(g).name}</td></tr>`,
      )
      .join('');

    const cat = new Map<string, number>();
    for (const i of lord.items) cat.set(ITEM_DEFS[i.defId].category, (cat.get(ITEM_DEFS[i.defId].category) ?? 0) + 1);
    const bag = [...cat].map(([k, n]) => `${k} ${n}`).join('、') || '無';

    this.el.innerHTML = `
      <div class="help-card scroll-card">
        <div class="help-head"><h2>👑 主公詳細資料</h2><button class="btn close">關閉 ✕</button></div>
        <div class="help-main">
          <nav class="help-tabs">${LORD_IDS.map((x) => `<button class="help-tab ${x === id ? 'on' : ''}" data-id="${x}" style="border-left:5px solid ${LORDS[x].css}">${LORDS[x].name}<small>${LORDS[x].kingdom}${state.lords[x].alive ? '' : '・出局'}${state.lords[x].isPlayer ? '・你' : ''}</small></button>`).join('')}</nav>
          <article class="help-body">
            <h3 style="color:${d.css}">${d.kingdom}・${d.name}　${lord.alive ? '' : '（已出局）'}</h3>
            <table class="terrain-table"><tr><th>靈石</th><th>士兵</th><th>城池</th><th>武將</th><th>總資產</th><th>所在</th><th>面向</th></tr>
              <tr><td>${fmtStones(lord.stones)}</td><td>${lord.soldiers}</td><td>${assets.cities} 座</td><td>${assets.generals} 名</td><td>${fmtStones(assets.total, true)}</td><td>${here.name}</td><td>${this.facingText?.(id) ?? '—'}</td></tr></table>
            <p>行囊：${bag}｜行囊寶衣 ${lord.gear.length} 件｜功法 ${lord.scrolls.length} 本｜靈獸：${lord.beast ? lord.beast.name : '無'}${lord.expeditions.length ? `｜秘境探索中 ${lord.expeditions.length} 隊` : ''}</p>
            <h4>升階材料</h4><p>${materialsText(lord)}</p>
            <h4>城池（${assets.cities}）</h4>
            <table class="terrain-table rank-detail"><tr><th>城池</th><th>繁榮</th><th>每回合收入</th><th>守軍</th><th>駐將</th><th>守城戰力</th><th>過路費</th><th>擂台與比試</th></tr>${cities || '<tr><td colspan="8">沒有城池</td></tr>'}</table>
            <h4>武將（${assets.generals}）</h4>
            <table class="terrain-table rank-detail"><tr><th>武將</th><th>境界</th><th>戰力</th><th>武/防/血・上限</th><th>狀態</th><th>被動</th></tr>${gens || '<tr><td colspan="6">沒有武將</td></tr>'}</table>
          </article>
        </div>
      </div>`;
    (this.el.querySelector('.close') as HTMLButtonElement).onclick = () => this.close();
    this.el.querySelectorAll<HTMLButtonElement>('.help-tab').forEach((b) => {
      b.onclick = () => {
        this.current = b.dataset.id as LordId;
        this.render();
      };
    });
  }
}

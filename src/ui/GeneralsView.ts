import { upgradeRequirement, weaponUpgradeTip } from '../systems/MaterialSystem';
import { generalCooldownText } from '../systems/GeneralAbilities';
import type { GameState, General, Lord } from '../game/types';
import { PARTY_LIMIT, generalsOf } from '../game/GameState';
import { APTITUDE_DESC, APTITUDE_NAMES } from '../data/generals';
import { realmTag } from './GeneralInfo';
import { fxText, passiveOf, fx } from '../data/passives';
import { ELEMENT_CSS, equipDesc, techniqueDesc } from '../data/items';
import {
  attack,
  boltCount,
  boltDamage,
  breakChance,
  canAttemptBreak,
  craft,
  defense,
  expCap,
  inBottleneck,
  maxHp,
  maxStamina,
  expMultiplier,
  needsTribulation,
  passiveExp,
  power,
} from '../systems/GeneralSystem';
import { bagHtml } from './ItemUI';
import { LORDS, originKingdom } from '../faction/Faction';
import { equipIconUrl, portraitUrl } from './Icons';
import type { RosterAction } from '../engine/prompts';

const SECTIONS: { status: General['status']; title: string }[] = [
  { status: 'free', title: '隨行' },
  { status: 'garrison', title: '駐守城池' },
  { status: 'sect', title: '留守宗門' },
  { status: 'realm', title: '外出中（秘境）' },
];

/** 武將名冊：查看能力、裝備、學功法、突破渡劫、閉關 */
/** 提示文字：去掉 HTML 標籤並跳脫引號，才能放進 title 屬性 */
const tip = (html: string) => html.replace(/<br\s*\/?>/g, '｜').replace(/<[^>]+>/g, '').replace(/"/g, '&quot;');

/** 武將名冊可選的排序項目（由大到小；主公永遠排第一） */
const SORTS: { id: string; name: string; value: (g: General) => number }[] = [
  { id: 'power', name: '戰力', value: (g) => power(g) },
  { id: 'attack', name: '武力', value: (g) => attack(g) },
  { id: 'defense', name: '防禦', value: (g) => defense(g) },
  { id: 'hp', name: '血量上限', value: (g) => maxHp(g) },
  { id: 'alchemy', name: '煉丹', value: (g) => craft(g, 'alchemy') },
  { id: 'forging', name: '煉器', value: (g) => craft(g, 'forging') },
  { id: 'talisman', name: '畫符', value: (g) => craft(g, 'talisman') },
  { id: 'formation', name: '佈陣', value: (g) => craft(g, 'formation') },
  // 先比境界，同境界再比修為
  { id: 'realm', name: '境界', value: (g) => g.realm * 1e6 + g.exp },
];

export interface RosterMode {
  /** 自己的整備階段：可突破、閉關、升階、換裝 */
  manage: boolean;
  /** 不在整備階段時仍可學功法、自廢修為（單機） */
  free: boolean;
}

export class GeneralsView {
  /** 目前的排序項目，預設戰力 */
  private sortId = 'power';
  private el: HTMLDivElement;
  private resolve: (() => void) | null = null;
  private mode: RosterMode = { manage: false, free: false };
  private onAction: ((a: RosterAction) => void) | null = null;
  private current: { state: GameState; lord: Lord } | null = null;

  constructor(root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'drawer hidden';
    root.appendChild(this.el);
  }

  get isOpen() {
    return !this.el.classList.contains('hidden');
  }

  /** 開啟名冊；onAction 收到按鈕動作（關閉時收到 close） */
  open(state: GameState, lord: Lord, mode: RosterMode = { manage: false, free: false }, onAction: ((a: RosterAction) => void) | null = null): Promise<void> {
    this.mode = mode;
    this.onAction = onAction;
    this.current = { state, lord };
    this.el.classList.remove('hidden');
    this.render(state, lord);
    return new Promise((resolve) => {
      const prev = this.resolve;
      this.resolve = resolve;
      prev?.();
    });
  }

  /** 整備階段的名冊：等待下一個動作 */
  ask(state: GameState, lord: Lord): Promise<RosterAction> {
    return new Promise((resolve) => {
      let answered = false;
      const once = (a: RosterAction) => {
        if (answered) return;
        answered = true;
        // 動作處理中暫時停用按鈕，避免連按
        this.mode = { manage: false, free: false };
        if (this.current) this.render(this.current.state, this.current.lord);
        resolve(a);
      };
      if (this.isOpen) {
        this.mode = { manage: true, free: true };
        this.onAction = once;
        this.current = { state, lord };
        this.render(state, lord);
      } else void this.open(state, lord, { manage: true, free: true }, once);
    });
  }

  /** 重新繪製（狀態更新後） */
  refresh(state: GameState, lord: Lord) {
    if (!this.isOpen) return;
    this.current = { state, lord };
    this.render(state, lord);
  }

  close() {
    if (!this.isOpen) return;
    this.el.classList.add('hidden');
    const action = this.onAction;
    this.onAction = null;
    action?.({ type: 'close' });
    this.resolve?.();
    this.resolve = null;
  }

  private emit(a: RosterAction) {
    this.onAction?.(a);
  }

  private render(state: GameState, lord: Lord) {
    const gens = generalsOf(state, lord.id);
    const manage = this.mode.manage;

    const bag = bagHtml(lord.items);
    const gear = lord.gear.map((e) => `<span class="chip" title="${tip(equipDesc(e))}">${e.name}</span>`).join('') || '<span class="muted">無</span>';
    const scrolls = lord.scrolls.map((t) => `<span class="chip" style="border-color:${ELEMENT_CSS[t.element]}" title="${tip(`${t.name.split('・')[0]}｜${techniqueDesc(t)}`)}">${t.name.split('・').slice(1).join('・')}</span>`).join('') || '<span class="muted">無</span>';
    const party = gens.filter((g) => g.status === 'free').length;

    this.el.innerHTML = `
      <div class="drawer-head">
        <h2 style="color:${LORDS[lord.id].css}">${LORDS[lord.id].name}・武將名冊</h2>
        <span class="muted">隨行 ${party}/${PARTY_LIMIT}・共 ${gens.length} 名${manage ? '' : '・非你的回合，無法突破或閉關'}</span>
        <label class="sort-box">排序 <select class="sort-select">${SORTS.map((x) => `<option value="${x.id}" ${x.id === this.sortId ? 'selected' : ''}>${x.name}</option>`).join('')}</select></label>
        <button class="btn close">關閉 ✕</button>
      </div>
      <div class="ready-section"></div>
      <div class="bag">
        <div><b>行囊</b>${bag}</div>
        <div><b>行囊寶衣</b>${gear}</div>
        <div><b>功法秘笈</b>${scrolls}</div>
        <div><b>靈獸</b>${lord.beast ? `<span class="chip" title="${tip(lord.beast.desc)}">${lord.beast.name}</span>` : '<span class="muted">無</span>'}</div>
      </div>
      <div class="sections"></div>`;
    (this.el.querySelector('.close') as HTMLButtonElement).onclick = () => this.close();
    (this.el.querySelector('.sort-select') as HTMLSelectElement).onchange = (e) => {
      this.sortId = (e.target as HTMLSelectElement).value;
      this.render(state, lord);
    };
    const key = (SORTS.find((x) => x.id === this.sortId) ?? SORTS[0]).value;
    // 主公固定第一，其餘依所選數值由大到小，同分再比戰力
    const order = (a: General, b: General) => Number(b.isLord) - Number(a.isLord) || key(b) - key(a) || power(b) - power(a);

    // 可以突破的武將暫時移到最上方
    const ready = gens.filter((g) => canAttemptBreak(g, state.round).ok).sort(order);
    const readyBox = this.el.querySelector('.ready-section') as HTMLElement;
    if (ready.length) {
      const h = document.createElement('h3');
      h.className = 'section-title ready-title';
      h.textContent = `✨ 可以突破的武將（${ready.length}）`;
      const grid = document.createElement('div');
      grid.className = 'general-grid';
      for (const g of ready) grid.appendChild(this.card(state, lord, g, manage));
      readyBox.append(h, grid);
    }
    const readyIds = new Set(ready.map((g) => g.id));

    const sections = this.el.querySelector('.sections')!;
    for (const sec of SECTIONS) {
      const list = gens.filter((g) => g.status === sec.status && !readyIds.has(g.id)).sort(order);
      if (!list.length) continue;
      const h = document.createElement('h3');
      h.className = 'section-title';
      h.textContent = `${sec.title}（${list.length}${sec.status === 'free' ? `/${PARTY_LIMIT}` : ''}）`;
      sections.appendChild(h);
      const grid = document.createElement('div');
      grid.className = 'general-grid';
      for (const g of list) grid.appendChild(this.card(state, lord, g, manage));
      sections.appendChild(grid);
    }
  }

  private card(state: GameState, lord: Lord, g: General, manage: boolean): HTMLDivElement {
    const free = manage || this.mode.free;
    const card = document.createElement('div');
    const ready = canAttemptBreak(g, state.round).ok;
    card.className = `general-card s-${g.status}${ready ? ' ready' : ''}`;
    const cap = expCap(g);
    const t = g.technique;
    const city = g.cityId ? state.cities[g.cityId] : null;
    const trip = lord.expeditions.find((e) => e.generalIds.includes(g.id));
    const status = g.ghostSourceId ? `冤魂（剩餘 ${g.ghostTurns} 回合）` : g.status === 'garrison' ? `駐守${city?.name ?? ''}${g.secluded ? '・閉關中' : ''}` : g.status === 'realm' ? `${trip?.realmName ?? '外出'}（${trip?.turnsLeft ?? 0} 回合）` : g.status === 'sect' ? '宗門' : '隨行';
    const bottleneck = inBottleneck(g);
    const breakInfo = !bottleneck
      ? ''
      : needsTribulation(g)
        ? fx(g).tribulationSuccess ? '⚡ 專屬被動：渡劫必定成功' : `⚡ 渡劫：${boltCount(g)} 道天雷・每道約 ${Math.round(boltDamage(g))}`
        : `突破成功率 ${Math.round(breakChance(g) * 100)}%`;
    const buffs = [g.foundation ? '已服築基丹' : '', g.sevenLife ? '七星續命護法' : '', g.breakBoost ? `引雷減傷 ${Math.round(g.breakBoost * 100)}%` : '', g.ward ? `護法減傷 ${Math.round(g.ward * 100)}%` : '', g.demon ? `心魔 ×${g.demon}` : ''].filter(Boolean).join('・');

    const req = upgradeRequirement(lord, g);
    card.innerHTML = `
      <div class="gc-details">
      ${ready ? `<div class="ready-banner">✨ 修為圓滿，可以${needsTribulation(g) ? '渡劫' : '突破'}了！</div>` : ''}
      <div class="gc-top">
      <div class="gc-portrait"><img src="${portraitUrl(g)}" alt="${g.name}" loading="lazy" decoding="async" onerror="this.style.visibility='hidden'"></div>
      <div class="gc-head">
        <b>${g.name}</b><small>${originKingdom(g.origin)}</small>${realmTag(g.realm)}${g.isLord ? '<span class="lord-tag">主公</span>' : ''}
        <span class="chip apt-${g.aptitude}" title="${APTITUDE_DESC[g.aptitude]}">${APTITUDE_NAMES[g.aptitude]}</span>
        <span class="chip trait" title="【${passiveOf(g).name}】${tip(fxText(passiveOf(g).fx))}${generalCooldownText(lord, g) ? `｜${tip(generalCooldownText(lord, g))}` : ''}｜${tip(passiveOf(g).flavor)}">【${passiveOf(g).name}】</span>
        ${buffs ? `<span class="chip buff">${buffs}</span>` : ''}
        <span class="st">${status}</span>
      </div>
      </div>
      <div class="gc-body">
        <div class="gc-slots">
          <div class="gc-slot eq-row" data-slot="weapon" ${g.weapon ? `title="${tip(`${equipDesc(g.weapon)}｜${weaponUpgradeTip(lord, g)}`)}"` : ''}><small>武器</small>${g.weapon ? `<img class="slot-icon" src="${equipIconUrl(g.weapon)}" alt="" onerror="this.style.visibility='hidden'"><b>${g.weapon.name.split('・').pop()}</b><em class="slot-tier">${g.weapon.name.split('・')[0]}・破防 ${Math.round((g.weapon.penetration ?? 0) * 100)}%</em>` : '<b><span class="muted">無</span></b>'}</div>
          <div class="gc-slot eq-row" data-slot="armor" ${g.armor ? `title="${tip(equipDesc(g.armor))}"` : ''}><small>寶衣</small>${g.armor ? `<img class="slot-icon" src="${equipIconUrl(g.armor)}" alt="" onerror="this.style.visibility='hidden'"><b>${g.armor.name.split('・').pop()}</b><em class="slot-tier">${g.armor.name.split('・')[0]}</em>` : '<b><span class="muted">無</span></b>'}</div>
        </div>
        <table class="gc-table">
          <tr class="gc-row-main">
            <td><small>戰力</small><b>${power(g)}</b></td>
            <td><small>武力</small><b>${attack(g)}</b></td>
            <td><small>防禦</small><b>${defense(g)}</b></td>
            <td><small>修為／回合</small><b>+${Math.round(passiveExp(g, city) * expMultiplier(g))}</b></td>
          </tr>
          <tr class="gc-row-craft">
            <td><small>煉丹</small><b>${craft(g, 'alchemy')}</b></td>
            <td><small>煉器</small><b>${craft(g, 'forging')}</b></td>
            <td><small>畫符</small><b>${craft(g, 'talisman')}</b></td>
            <td><small>佈陣</small><b>${craft(g, 'formation')}</b></td>
          </tr>
        </table>
      </div>
      <div class="bar exp ${bottleneck ? 'full' : ''}"><i style="width:${Number.isFinite(cap) ? Math.min(100, (g.exp / cap) * 100) : 100}%"></i><span>修為 ${g.exp}${Number.isFinite(cap) ? ` / ${cap}` : '（化神圓滿）'}${bottleneck ? '・瓶頸' : ''}</span></div>
      ${breakInfo ? `<div class="break-info">${breakInfo}</div>` : ''}
      <div class="bar hp"><i style="width:${(g.hp / maxHp(g)) * 100}%"></i><span>血量 ${g.hp} / ${maxHp(g)}</span></div>
      <div class="bar sta"><i style="width:${g.stamina / maxStamina(g) * 100}%"></i><span>體力 ${g.stamina} / ${maxStamina(g)}</span></div>
      <div class="equip">
        <div class="eq-row" data-slot="technique"><span class="eq-info" ${t ? `title="${tip(`${t.name.split('・')[0]}｜${techniqueDesc(t)}`)}"` : ''}>功法：${t ? `<span style="color:${ELEMENT_CSS[t.element]}">${t.name.split('・').slice(1).join('・')}</span>` : '<span class="muted">未修習</span>'}</span></div>
      </div>
      <div class="gc-actions"></div>
      </div>`;

    const actions = card.querySelector('.gc-actions')!;
    const btn = (label: string, disabled: boolean, fn: () => void, cls = '') => {
      const b = document.createElement('button');
      b.className = `btn mini ${cls}`;
      b.textContent = label;
      b.disabled = disabled;
      b.onclick = fn;
      actions.appendChild(b);
    };
    const away = g.status === 'realm' || !!g.ghostSourceId;
    const rowBtn = (slot: string, label: string, disabled: boolean, fn: () => void) => {
      const b = document.createElement('button');
      b.className = 'btn mini';
      b.textContent = label;
      b.disabled = disabled;
      b.onclick = fn;
      card.querySelector(`.eq-row[data-slot="${slot}"]`)!.appendChild(b);
    };

    if (bottleneck) {
      const can = canAttemptBreak(g, state.round);
      btn(needsTribulation(g) ? '⚡ 渡劫' : '🧘 突破', !manage || !can.ok, () => this.emit({ type: 'break', generalId: g.id }), 'danger');
    }
    if (g.status === 'garrison') {
      btn(g.secluded ? '出關' : '閉關修煉', !manage, () => this.emit({ type: 'seclude', generalId: g.id }));
    }
    rowBtn('weapon', req.reason === '已達天階' ? '已達天階' : (g.weapon ? '武器升階' : '無專屬武器'), !manage || away || !req.ok, () => this.emit({ type: 'upgrade', generalId: g.id }));
    const weaponButton = card.querySelector<HTMLButtonElement>('.eq-row[data-slot="weapon"] button');
    if (weaponButton) weaponButton.title = req.reason;
    const pool = lord.gear.filter((e) => e.kind === 'armor');
    rowBtn('armor', g.armor ? '更換／卸下' : '裝備', !manage || away || (!pool.length && !g.armor), () => this.emit({ type: 'equip', generalId: g.id }));
    // 已經修習功法就不再顯示學習按鈕
    if (!t) rowBtn('technique', g.aptitude === 'waste' ? '廢靈根' : '學習功法', !free || away || !lord.scrolls.length || g.aptitude === 'waste', () => this.emit({ type: 'learn', generalId: g.id }));
    btn('自廢修為', !free || away || !t, () => this.emit({ type: 'abolish', generalId: g.id }));
    return card;
  }
}

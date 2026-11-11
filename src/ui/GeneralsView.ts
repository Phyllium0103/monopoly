import { upgradeRequirement } from '../systems/MaterialSystem';
import './technique-roster.css';
import { materialLabel } from './MaterialArt';
import { RosterEquipment, armorPicture, techniquePicture } from './RosterEquipment';
import { compareBagItems, bagSlots, bagItems, EQUIPMENT_CAPACITY, isArmor } from '../systems/EquipmentInventory';
import './roster-equipment.css';
import { generalCooldownText } from '../systems/GeneralAbilities';
import type { GameState, General, Lord } from '../game/types';
import { PARTY_LIMIT, generalsOf } from '../game/GameState';
import { APTITUDE_DESC, APTITUDE_NAMES } from '../data/generals';
import { realmTag, fusionSummary } from './GeneralInfo';
import { fxText, passiveOf, fx } from '../data/passives';
import { techniqueBaseName } from '../data/items';
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
import { LORDS, originKingdom } from '../faction/Faction';
import { equipIconUrl } from './Icons';
import { generalHeadUrl, hasHeavenWeapon, rosterArtUrl } from '../data/generalArt';
import type { RosterAction } from '../engine/prompts';


/** 武將名冊：查看能力、裝備、學功法、突破渡劫 */
/** 提示文字：去掉 HTML 標籤並跳脫引號，才能放進 title 屬性 */
const tip = (html: string) => html.replace(/<br\s*\/?>/g, '｜').replace(/<[^>]+>/g, '').replace(/"/g, '&quot;');

const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');


/** 武將名冊可選的排序項目（由大到小） */
const APTITUDE_ORDER: General['aptitude'][] = ['waste', 'earth', 'fire', 'water', 'wood', 'metal', 'heaven'];
const SORTS: { id: string; name: string; value: (g: General) => number }[] = [
  { id: 'location', name: '位置', value: () => 0 },
  { id: 'name', name: '姓名', value: () => 0 },
  { id: 'exp', name: '修為', value: g => g.exp },
  { id: 'weapon', name: '本命武器', value: () => 0 },
  { id: 'armor', name: '仙衣', value: () => 0 },
  { id: 'technique', name: '功法', value: () => 0 },
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
  // 天靈根最前、五行靈根其次、廢靈根最後；同類依五行順序
  { id: 'aptitude', name: '靈根', value: (g) => APTITUDE_ORDER.indexOf(g.aptitude) },
];

/** 名冊清單的欄位：標題列與每一列共用；sort 對應 SORTS，點欄名即可排序 */
const COLUMNS: { cls: string; label: string; sort?: string }[] = [
  { cls: 'c-face', label: '' },
  { cls: 'c-name', label: '姓名', sort: 'name' },
  { cls: 'c-origin', label: '所屬' },
  { cls: 'c-realm', label: '境界', sort: 'realm' },
  { cls: 'c-apt', label: '靈根', sort: 'aptitude' },
  { cls: 'c-st', label: '位置', sort: 'location' },
  { cls: 'c-hp', label: '血量／修為' },
  { cls: 'c-weapon', label: '本命武器', sort: 'weapon' },
  { cls: 'c-armor', label: '仙衣', sort: 'armor' },
  { cls: 'c-technique', label: '功法', sort: 'technique' },
  { cls: 'c-power', label: '戰力', sort: 'power' },
  { cls: 'c-attack', label: '武力', sort: 'attack' },
  { cls: 'c-defense', label: '防禦', sort: 'defense' },
  { cls: 'c-craft', label: '煉丹', sort: 'alchemy' },
  { cls: 'c-craft', label: '煉器', sort: 'forging' },
  { cls: 'c-craft', label: '畫符', sort: 'talisman' },
  { cls: 'c-craft', label: '佈陣', sort: 'formation' },
  { cls: 'c-passive', label: '被動' },
  { cls: 'c-caret', label: '' },
];

export interface RosterMode {
  /** 自己的整備階段：可突破、升階、換裝 */
  manage: boolean;
  inspect?: boolean;
  /** 不在整備階段時仍可學功法、自廢修為（單機） */
  free: boolean;
}

export function sortRosterGenerals(gens: General[], state: GameState, sortId: string, reverse = false): General[] {
  const key = (SORTS.find(x => x.id === sortId) ?? SORTS[0]).value;
  const locationOrder = (g: General) => g.status === 'free' ? 0 : g.status === 'garrison' ? 1 : g.status === 'realm' ? 2 : 3;
  const location = (a: General, b: General) => locationOrder(a) - locationOrder(b) || (a.status === 'garrison' && b.status === 'garrison' ? (state.cities[b.cityId!]?.prosperity ?? 0) - (state.cities[a.cityId!]?.prosperity ?? 0) : 0) || power(b) - power(a);
  const compare = (a: General, b: General) => {
    if (sortId === 'default') return Number(b.isLord) - Number(a.isLord) || location(a,b);
    if (sortId === 'weapon') return Math.floor((b.weapon?.tier ?? -3)/3) - Math.floor((a.weapon?.tier ?? -3)/3) || Number(b.isLord) - Number(a.isLord) || location(a,b);
    if (sortId === 'location') return location(a,b);
    if (sortId === 'name') return a.name.localeCompare(b.name, 'zh-Hant-u-co-stroke');
    if (sortId === 'armor' || sortId === 'technique') {
      const x = a[sortId], y = b[sortId];
      if (!x || !y) return Number(!!y) - Number(!!x) || location(a,b);
      return Math.floor(y.tier / 3) - Math.floor(x.tier / 3) || compareBagItems(x,y) || location(a,b);
    }
    return key(b) - key(a) || location(a,b);
  };
  return [...gens].sort((a,b) => (reverse ? -1 : 1) * compare(a,b));
}

export class GeneralsView {
  /** 目前的排序項目，預設戰力 */
  private sortId = 'default';
  private reverse = false;
  private el: HTMLDivElement;
  private resolve: (() => void) | null = null;
  private mode: RosterMode = { manage: false, free: false };
  private onAction: ((a: RosterAction) => void) | null = null;
  private current: { state: GameState; lord: Lord } | null = null;
  /** 目前詳情彈窗中的武將；重繪後保留 */
  private detailId: string | null = null;
  /** 下次重繪時開啟詳情並捲到這名武將（點右下大頭貼進來時） */
  private focusId: string | null = null;
  private equipmentControls: RosterEquipment;

  constructor(root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'drawer roster-screen hidden';
    root.appendChild(this.el);
    this.equipmentControls = new RosterEquipment(this.el, a => this.emit(a));
    window.addEventListener('keydown', e => {
      const visible = [...document.querySelectorAll('.roster-screen:not(.hidden)')];
      if (visible[visible.length - 1] !== this.el) return;
      if (e.key !== 'Escape' || !this.isOpen || e.defaultPrevented) return;
      if (this.el.classList.contains('equipment-carrying')) { this.equipmentControls.clear(); return; }
      if (this.detailId) this.closeDetail(); else this.close();
    });
    this.el.addEventListener('click', e => {
      const weapon = (e.target as HTMLElement).closest<HTMLElement>('[data-weapon-general]');
      if (!weapon || !this.current || this.mode.inspect || weapon.closest('.general-modal') || this.el.classList.contains('equipment-carrying')) return;
      e.stopPropagation();
      const g = this.current.state.generals[weapon.dataset.weaponGeneral!];
      const req = upgradeRequirement(this.current.lord, g);
      if (!this.mode.manage || g.status === 'realm' || g.ghostSourceId || g.mortalTrial || !req.ok) this.equipmentControls.notify(!this.mode.manage ? '只能在自己的整備階段突破本命武器' : req.reason || '武將目前無法突破本命武器');
      else this.emit({type:'upgrade', generalId:g.id});
    });
  }

  get isOpen() {
    return !this.el.classList.contains('hidden');
  }

  /** 指定下次開啟名冊時要開啟詳情並捲到的武將 */
  focus(generalId: string) {
    this.focusId = generalId;
    this.detailId = generalId;
  }

  /** 開啟名冊；onAction 收到按鈕動作（關閉時收到 close） */
  open(state: GameState, lord: Lord, mode: RosterMode = { manage: false, free: false }, onAction: ((a: RosterAction) => void) | null = null): Promise<void> {
    this.sortId = 'default'; this.reverse = false;
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
    lord = this.mode.inspect && this.current ? state.lords[this.current.lord.id] : lord;
    this.current = { state, lord };
    this.render(state, lord);
  }

  close() {
    if (!this.isOpen) return;
    this.el.classList.add('hidden');
    this.closeDetail();
    this.equipmentControls.clear();
    const action = this.onAction;
    this.onAction = null;
    action?.({ type: 'close' });
    this.resolve?.();
    this.resolve = null;
  }

  private emit(a: RosterAction) {
    this.onAction?.(a);
  }

  private vitals(g: General, stamina = true): string {
    const cap = expCap(g);
    const bar = (cls: string, name: string, value: number, max: number) => `<span class="bar ${cls}" role="meter" aria-label="${name}" aria-valuemin="0" aria-valuemax="${Number.isFinite(max) ? max : 100}" aria-valuenow="${Number.isFinite(max) ? Math.min(max, value) : 100}"><i style="width:${Number.isFinite(max) ? Math.max(0, Math.min(100, value / Math.max(1, max) * 100)) : 100}%"></i><span>${name} ${Math.round(value)}${Number.isFinite(max) ? ` / ${max}` : '・圓滿'}</span></span>`;
    return bar('hp', '血量', g.hp, maxHp(g)) + bar('exp', '修為', g.exp, cap) + (stamina ? bar('sta', '體力', g.stamina, maxStamina(g)) : '');
  }

  private closeDetail() {
    const id = this.detailId;
    this.detailId = null;
    this.el.querySelector('.general-modal-backdrop')?.remove();
    for (const el of this.el.querySelectorAll<HTMLElement>('[data-roster-inert]')) { el.inert = false; el.removeAttribute('data-roster-inert'); }
    if (id) this.el.querySelector<HTMLButtonElement>(`[data-general-id="${id}"] .roster-toggle`)?.focus({ preventScroll: true });
  }

  private openDetail(state: GameState, lord: Lord, g: General, manage: boolean) {
    this.el.querySelector('.general-modal-backdrop')?.remove();
    this.detailId = g.id;
    const backdrop = document.createElement('div');
    backdrop.className = 'general-modal-backdrop';
    backdrop.innerHTML = `<section class="general-modal" role="dialog" aria-modal="true" aria-labelledby="general-detail-title"><header class="general-modal-head"><div><small>武將檔案</small><h2 id="general-detail-title">${escapeHtml(g.name)}</h2></div><button type="button" class="btn detail-close" aria-label="關閉武將詳情">✕</button></header><div class="general-modal-content"></div></section>`;
    backdrop.querySelector('.general-modal-content')!.appendChild(this.card(state, lord, g, manage));
    backdrop.querySelector<HTMLButtonElement>('.detail-close')!.onclick = () => this.closeDetail();
    backdrop.onclick = e => { if (e.target === backdrop) this.closeDetail(); };
    backdrop.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        // Let the equipment controller consume the first Escape while carrying an item.
        if (this.el.classList.contains('equipment-carrying')) return;
        e.stopPropagation(); this.closeDetail();
      }
      if (e.key === 'Tab') {
        const buttons = [...backdrop.querySelectorAll<HTMLElement>('button:not(:disabled), [tabindex="0"]')];
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    });
    for (const child of this.el.children) { const el = child as HTMLElement; el.inert = true; el.setAttribute('data-roster-inert', ''); }
    this.el.appendChild(backdrop);
    this.equipmentControls.update(state, lord, manage, this.mode.free);
    backdrop.querySelector<HTMLButtonElement>('.detail-close')!.focus({ preventScroll: true });
  }

  private render(state: GameState, lord: Lord) {
    this.el.classList.toggle('roster-readonly', !!this.mode.inspect);
    const gens = generalsOf(state, lord.id);
    const manage = this.mode.manage;

    const cells = bagSlots(lord).map((item, index) => '<div class="inventory-cell" data-inventory-slot="' + index + '">' + (item ? isArmor(item) ? armorPicture(item) : techniquePicture(item) : '<button type="button" class="technique-picture armor-picture armor-empty" aria-label="行囊空格 ' + (index + 1) + '"></button>') + '</div>').join('');
    const party = gens.filter((g) => g.status === 'free').length;

    // 重繪前記住捲動位置：只有下方清單捲動，標題列固定
    const scrollTop = this.el.querySelector('.drawer-body')?.scrollTop ?? 0;
    this.el.innerHTML = `
      <div class="drawer-head">
        <div class="roster-title"><small>將星錄 · ${LORDS[lord.id].name}</small><h2>武將名冊</h2></div>
        <span class="muted">隨行 ${party}/${PARTY_LIMIT}・共 ${gens.length} 名${manage ? '' : this.mode.inspect ? '・查看名冊' : '・非你的回合，無法突破'}</span>
        <button class="btn close roster-close" aria-label="關閉武將名冊">✕</button>
      </div>
      <div class="drawer-body">
      <div class="sections"></div>
      </div>
      ${this.mode.inspect ? '' : `<footer class="roster-inventory">
        <div class="inventory-heading"><div><b>隨身行囊</b><span>仙衣 · 功法</span></div><span class="inventory-count">${bagItems(lord).length} / ${EQUIPMENT_CAPACITY}</span></div>
        <div class="inventory-grid">${cells}</div>
        <div class="equipment-feedback" role="status" aria-live="polite">點選圖片拿起，再點裝備格放入；已修習功法的取下操作在武將詳情中。</div>
      </footer>`}`;

    (this.el.querySelector('.close') as HTMLButtonElement).onclick = () => this.close();
    this.el.querySelector('.sections')!.appendChild(this.list(state, lord, sortRosterGenerals(gens, state, this.sortId, this.reverse), manage));
    this.el.querySelector('.drawer-body')!.scrollTop = scrollTop;
    if (this.detailId && state.generals[this.detailId]?.owner === lord.id) this.openDetail(state, lord, state.generals[this.detailId], manage);
    this.equipmentControls.update(state, lord, manage, this.mode.free);
  }

  /** 條列式名冊：每位武將一列，點選開啟獨立詳情彈窗 */
  private list(state: GameState, lord: Lord, gens: General[], manage: boolean): HTMLDivElement {
    const list = document.createElement('div');
    list.className = 'roster-list';
    const head = document.createElement('div');
    head.className = 'roster-head';
    const groups = ['roster-before', 'roster-equipment', 'roster-after'].map(cls => {
      const group = document.createElement('span');
      group.className = cls;
      head.appendChild(group);
      return group;
    });
    const center = COLUMNS.findIndex(c => c.cls === 'c-weapon');
    for (const [index, c] of COLUMNS.entries()) {
      const cell = document.createElement(c.sort ? 'button' : 'span');
      cell.className = `${c.cls}${c.sort === this.sortId ? ' sorted' : ''}`;
      cell.textContent = c.label;
      if (c.cls === 'c-hp') {
        cell.innerHTML = ['hp','exp'].map((id,i) => `<button data-vital-sort="${id}" class="${this.sortId === id ? 'sorted' : ''} ${this.reverse ? 'ascending' : ''}">${i ? '修為' : '血量'}</button>`).join('／');
        cell.querySelectorAll<HTMLElement>('[data-vital-sort]').forEach(b => b.onclick = () => { const id = b.dataset.vitalSort!; this.reverse = this.sortId === id ? !this.reverse : false; this.sortId = id; this.render(state,lord); });
      }
      cell.classList.toggle('ascending', this.reverse);
      if (c.sort) {
        const id = c.sort;
        cell.title = `依${c.label}排序`;
        cell.onclick = () => {
          this.reverse = this.sortId === id ? !this.reverse : false; this.sortId = id;
          this.render(state, lord);
        };
      }
      groups[index < center ? 0 : index < center + 3 ? 1 : 2].appendChild(cell);
    }
    list.appendChild(head);

    for (const g of gens) {
      const ready = canAttemptBreak(g, state.round).ok;
      const item = document.createElement('div');
      item.className = `roster-item s-${g.status}${ready ? ' ready' : ''}${g.isLord ? ' is-lord' : ''}`;
      item.dataset.generalId = g.id;
      const row = document.createElement('div');
      row.className = 'roster-row';
      row.setAttribute('role', 'group');
      row.setAttribute('aria-label', g.name);
      row.innerHTML = this.rowHtml(state, lord, g, ready);
      if (this.mode.inspect) this.displayOnly(row);
      item.appendChild(row);
      row.onclick = e => {
        if (this.el.classList.contains('equipment-carrying')) return;
        if ((e.target as HTMLElement).closest('[data-equipment-kind], [data-inventory-slot], [data-weapon-general]')) return;
        this.openDetail(state, lord, g, manage);
      };
      list.appendChild(item);
      if (this.focusId === g.id) {
        this.focusId = null;
        requestAnimationFrame(() => item.scrollIntoView({ block: 'center' }));
      }
    }
    return list;
  }

  /** 名冊列顯示摘要；完整武器與能力資訊在詳情彈窗顯示。 */
  private rowHtml(state: GameState, lord: Lord, g: General, ready: boolean): string {
    const city = g.cityId ? state.cities[g.cityId] : null;
    const trip = lord.expeditions.find((e) => e.generalIds.includes(g.id));
    const place = g.ghostSourceId ? `冤魂・${g.ghostTurns} 回合` : g.status === 'garrison' ? `${city?.name ?? '駐守'}` : g.status === 'realm' ? `${trip?.realmName ?? '外出'}・${trip?.turnsLeft ?? 0} 回合` : g.status === 'sect' ? '宗門' : '隨行';
    const p = passiveOf(g);
    // 頭像用背景圖，避免點頭像時被看圖功能攔下而無法開啟詳情
    return `
      <span class="roster-before">
      <span class="c-face" style="background-image:url('${generalHeadUrl(g)}')"></span>
      <span class="c-name"><b>${g.name}</b>${g.isLord ? '<span class="lord-tag">主公</span>' : ''}${ready ? '<span class="rr-ready" title="修為圓滿，可以突破">✨</span>' : ''}</span>
      <span class="c-origin">${originKingdom(g.origin)}</span>
      <span class="c-realm">${realmTag(g.realm)}</span>
      <span class="c-apt"><span class="chip apt-${g.aptitude}" title="${APTITUDE_DESC[g.aptitude]}">${APTITUDE_NAMES[g.aptitude].replace('靈根', '')}</span></span>
      <span class="c-st">${place}</span>
      <span class="c-hp roster-vitals">${this.vitals(g, false)}</span>
      </span>
      <span class="roster-equipment"><span class="c-weapon">${this.weaponPicture(g)}</span><span class="c-armor">${armorPicture(g.armor, g.id)}</span><span class="c-technique">${techniquePicture(g.technique, g.id)}</span></span>
      <span class="roster-after">
      <span class="c-power"><b>${power(g)}</b></span>
      <span class="c-attack">${attack(g)}</span>
      <span class="c-defense">${defense(g)}</span>
      <span class="c-craft">${craft(g, 'alchemy')}</span>
      <span class="c-craft">${craft(g, 'forging')}</span>
      <span class="c-craft">${craft(g, 'talisman')}</span>
      <span class="c-craft">${craft(g, 'formation')}</span>
      <span class="c-passive" title="${tip(`【${p.name}】${fxText(p.fx)}`)}">【${p.name}】</span>
      <button type="button" class="c-caret roster-toggle" aria-label="查看${g.name}詳細資訊" aria-haspopup="dialog">›</button></span>`;
  }

  private displayOnly(root: HTMLElement) {
    root.querySelectorAll<HTMLElement>('[data-equipment-kind], [data-weapon-general]').forEach(el => {
      const display = document.createElement('span');
      display.className = el.className;
      for (const name of ['data-tip','data-tip-html','aria-label']) { const value = el.getAttribute(name); if (value) display.setAttribute(name,value.replace('<br>點擊突破本命武器','').replace('・突破本命武器','')); }
      display.innerHTML = el.innerHTML;
      el.replaceWith(display);
    });
  }

  private weaponPicture(g: General): string {
    const w = g.weapon;
    if (!w) return '<span class="technique-picture armor-empty"></span>';
    const html = `<div class="tech-tip"><div class="tech-tip-rank">本命武器</div><strong>${escapeHtml(w.name)}</strong><div class="tech-tip-rule"></div><div class="tech-tip-detail">無視防禦 ${Math.round((w.penetration ?? 0)*100)}%<br>點擊突破本命武器</div></div>`;
    return `<button type="button" class="technique-picture armor-picture grade-${Math.floor(w.tier/3)}" data-weapon-general="${g.id}" data-tip="${escapeHtml(w.name)}" data-tip-html="${escapeHtml(html)}" aria-label="${escapeHtml(w.name)}・突破本命武器"><img src="${equipIconUrl(w)}" alt="" draggable="false"></button>`;
  }

  private card(state: GameState, lord: Lord, g: General, manage: boolean): HTMLDivElement {
    const free = manage || this.mode.free;
    const card = document.createElement('div');
    const ready = canAttemptBreak(g, state.round).ok;
    const heavenWeapon = hasHeavenWeapon(g);
    // 預留各品階最長的武器名稱，升階換圖時不讓右側文字撐高圖片框。
    card.className = `general-card s-${g.status}${ready ? ' ready' : ''}${heavenWeapon ? ' has-fx-art' : ''}`;
    const art = `<div class="gc-portrait"><div class="gc-art"><img src="${rosterArtUrl(g)}" data-full-art="${rosterArtUrl(g)}" alt="${g.name}" loading="lazy" decoding="async" onerror="this.style.visibility='hidden'"></div></div>`;
    const t = g.technique;
    const city = g.cityId ? state.cities[g.cityId] : null;
    const trip = lord.expeditions.find((e) => e.generalIds.includes(g.id));
    const status = g.ghostSourceId ? `冤魂（剩餘 ${g.ghostTurns} 回合）` : g.status === 'garrison' ? `駐守${city?.name ?? ''}` : g.status === 'realm' ? `${trip?.realmName ?? '外出'}（${trip?.turnsLeft ?? 0} 回合）` : g.status === 'sect' ? '宗門' : '隨行';
    const bottleneck = inBottleneck(g);
    const breakInfo = g.demon ? '心魔纏身，需先服用清心丹' : !bottleneck
      ? ''
      : needsTribulation(g)
        ? fx(g).tribulationSuccess ? '⚡ 專屬被動：渡劫必定成功' : `⚡ 渡劫：${boltCount(g)} 道天雷・每道約 ${Math.round(boltDamage(g))}`
        : `突破成功率 ${Math.round(breakChance(g) * 100)}%`;
    const buffs = [g.foundation ? '已服築基丹' : '', g.sevenLife ? '七星續命護法' : '', g.ward ? `護法減傷 ${Math.round(g.ward * 100)}%` : '', g.demon ? '心魔：修為減半・無法突破' : ''].filter(Boolean).join('・');

    const req = upgradeRequirement(lord, g);
    const passive = passiveOf(g);
    const stat = (label: string, value: number) => '<div class="detail-stat"><small>' + label + '</small><b>' + value + '</b></div>';
    card.innerHTML = `
      <div class="dossier-layout">
        <aside class="dossier-identity">${art}<div class="dossier-name"><h3>${g.name}</h3><span>${originKingdom(g.origin)}${g.isLord ? ' · 主公' : ''}</span></div>
          <div class="dossier-tags">${realmTag(g.realm)}<span class="chip apt-${g.aptitude}" title="${APTITUDE_DESC[g.aptitude]}">${APTITUDE_NAMES[g.aptitude]}</span></div>
          <p class="dossier-location">${status}</p>
          <section class="dossier-passive"><small>專屬天賦</small><h4>${passive.name}</h4><p>${fxText(passive.fx)}</p>${generalCooldownText(lord,g) ? '<p>'+generalCooldownText(lord,g)+'</p>' : ''}<em>${passive.flavor}</em></section>
        </aside>
        <div class="dossier-main">
          <section class="dossier-section"><div class="dossier-section-head"><h3>身心狀態</h3><span>每回合修為 +${Math.round(passiveExp(g, city) * expMultiplier(g))}</span></div><div class="dossier-vitals">${this.vitals(g)}</div>
            ${buffs ? '<p class="dossier-condition">'+buffs+'</p>' : ''}
            ${breakInfo.trim() && breakInfo.replace(/<[^>]*>/g, '').trim() ? '<p class="break-info">'+breakInfo+'</p>' : ''}
            ${ready ? '<p class="dossier-ready">修為圓滿，可以'+(needsTribulation(g) ? '渡劫' : '突破')+'</p>' : ''}
          </section>
          <section class="dossier-section"><div class="dossier-section-head"><h3>戰鬥與四藝</h3></div><div class="detail-combat">${stat('戰力',power(g))}${stat('武力',attack(g))}${stat('防禦',defense(g))}</div><div class="detail-crafts">${stat('煉丹',craft(g,'alchemy'))}${stat('煉器',craft(g,'forging'))}${stat('畫符',craft(g,'talisman'))}${stat('佈陣',craft(g,'formation'))}</div>
            ${g.fusionBonus ? '<p class="fusion-summary">融合加成：'+fusionSummary(g)+'</p>' : ''}
          </section>
          <section class="dossier-section"><div class="dossier-section-head"><h3>隨身裝備</h3><span>滑鼠停留查看能力</span></div><div class="detail-equipment">
            <div class="eq-row detail-weapon" data-slot="weapon"><small>本命武器</small>${g.weapon ? ''+this.weaponPicture(g)+'<b>'+g.weapon.name+'</b><span class="muted">破防 '+Math.round((g.weapon.penetration??0)*100)+'%</span>' : '<b>無本命武器</b>'}</div>
            <div class="eq-row" data-slot="armor"><small>仙衣</small>${armorPicture(g.armor,g.id)}<b>${g.armor?.name ?? '未裝備'}</b></div>
            <div class="eq-row" data-slot="technique"><small>功法</small>${techniquePicture(t,g.id)}<b>${t ? escapeHtml(techniqueBaseName(t)) : '未修習'}</b></div>
          </div></section>
          <div class="gc-actions"></div>
        </div>
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

    if (g.realm === 2 && !g.mortalTrial) btn('金丹路線', !manage || away, () => this.emit({ type: 'break', generalId: g.id }));
    if (bottleneck) {
      const can = canAttemptBreak(g, state.round);
      btn(needsTribulation(g) ? '渡劫' : '突破境界', !manage || !can.ok, () => this.emit({ type: 'break', generalId: g.id }), 'danger');
    }
    rowBtn('weapon', req.reason === '已達天階' ? '已達天階' : (g.weapon ? '武器升階' : '無本命武器'), !manage || away || !req.ok, () => this.emit({ type: 'upgrade', generalId: g.id }));
    const weaponButton = card.querySelector<HTMLButtonElement>('.eq-row[data-slot="weapon"] button.btn');
    if (weaponButton) weaponButton.title = req.reason;
    if (g.weapon && req.group && req.stage !== undefined && req.cost) {
      const cost = document.createElement('div');
      cost.className = 'weapon-material-cost';
      cost.innerHTML = `升階：${materialLabel(req.group, req.stage)} × ${req.cost}`;
      card.querySelector('.eq-row[data-slot="weapon"]')!.appendChild(cost);
    }
    // 已經修習功法就不再顯示學習按鈕
    if (!t) rowBtn('technique', g.aptitude === 'waste' ? '廢靈根' : '學習功法', !free || away || !lord.scrolls.length || g.aptitude === 'waste', () => this.emit({ type: 'learn', generalId: g.id }));
    rowBtn('armor', '取下仙衣', !manage || away || !g.armor, () => this.equipmentControls.unequip(g.id));
    if (t) rowBtn('technique', '自廢修為', !free || away, () => this.emit({ type: 'abolish', generalId: g.id }));
    const note = document.createElement('p'); note.className = 'dossier-warning'; note.textContent = '自廢會散去功法、境界回到凡人、修為歸零。功法不會回到行囊。'; if (t) card.querySelector('.eq-row[data-slot="technique"]')!.appendChild(note);
    const breakthrough = actions.querySelector('button.danger');
    if (breakthrough) { breakthrough.classList.add('dossier-breakthrough'); card.querySelector('.dossier-identity')!.insertBefore(breakthrough, card.querySelector('.dossier-passive'));  }
    // Detail equipment is informational; actions live on the explicit buttons.
    this.displayOnly(card);
    if (this.mode.inspect) {
      card.querySelectorAll('button, .gc-actions, .weapon-material-cost, .dossier-warning').forEach(el => el.remove());
    }
    const weaponRow = card.querySelector('[data-slot="weapon"]');
    const cost = weaponRow?.querySelector('.weapon-material-cost');
    const upgrade = weaponRow?.querySelector('button');
    if (cost && upgrade) weaponRow!.insertBefore(cost, upgrade);
    return card;
  }
}

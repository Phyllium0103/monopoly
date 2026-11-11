import { upgradeRequirement, weaponUpgradeTip } from '../systems/MaterialSystem';
import './technique-roster.css';
import { materialLabel } from './MaterialArt';
import { ArmorRoster, armorPicture } from './ArmorRoster';
import { generalCooldownText } from '../systems/GeneralAbilities';
import type { GameState, General, Lord, Technique } from '../game/types';
import { PARTY_LIMIT, generalsOf } from '../game/GameState';
import { APTITUDE_DESC, APTITUDE_NAMES } from '../data/generals';
import { realmTag } from './GeneralInfo';
import { fxText, passiveOf, fx } from '../data/passives';
import { equipDesc, techniqueDesc, techniqueTag, techniqueBaseName, tierName } from '../data/items';
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
import { WEAPON_CATALOG } from '../data/weaponCatalog';
import { realmFrameHtml } from './RealmFrame';
import type { RosterAction } from '../engine/prompts';

const SECTIONS: { status: General['status']; title: string }[] = [
  { status: 'free', title: '隨行' },
  { status: 'garrison', title: '駐守城池' },
  { status: 'sect', title: '留守宗門' },
  { status: 'realm', title: '外出中（秘境）' },
];

/** 武將名冊：查看能力、裝備、學功法、突破渡劫 */
/** 提示文字：去掉 HTML 標籤並跳脫引號，才能放進 title 屬性 */
const tip = (html: string) => html.replace(/<br\s*\/?>/g, '｜').replace(/<[^>]+>/g, '').replace(/"/g, '&quot;');

const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
function techniquePicture(t: Technique): string {
  const grade = Math.max(0, Math.min(3, Math.floor(t.tier / 3)));
  const family = t.art ?? t.element;
  const image = family ? `${import.meta.env.BASE_URL}assets/techniques/${family}-${['huang', 'xuan', 'di', 'tian'][grade]}.webp` : '';
  const name = techniqueBaseName(t);
  const rank = tierName(t.tier, '階');
  const tag = techniqueTag(t);
  const parts = techniqueDesc(t).replace(/<br\s*\/?>/g, '｜').replace(/<[^>]+>/g, '').split('｜').map(escapeHtml);
  const description = `<span style="color:${tag.css}">${parts[0]}</span><br>${parts.slice(1).join('<br>')}`;
  const detail = `<div class="tech-tip"><div class="tech-tip-rank">${escapeHtml(rank)} · <span style="color:${tag.css}">${escapeHtml(tag.text)}</span></div><strong>${escapeHtml(name)}</strong><div class="tech-tip-rule"></div><div class="tech-tip-detail">${description}</div></div>`;
  return `<span class="technique-picture grade-${grade}" tabindex="0" data-tip="${escapeHtml(`${rank}｜${name}｜${tip(techniqueDesc(t))}`)}" data-tip-html="${escapeHtml(detail)}" aria-label="${escapeHtml(`${rank} ${name}`)}">${image ? `<img src="${image}" alt="" loading="lazy" decoding="async">` : '<span aria-hidden="true">卷</span>'}</span>`;
}

/** 武將名冊可選的排序項目（由大到小；主公永遠排第一） */
const APTITUDE_ORDER: General['aptitude'][] = ['waste', 'earth', 'fire', 'water', 'wood', 'metal', 'heaven'];
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
  // 天靈根最前、五行靈根其次、廢靈根最後；同類依五行順序
  { id: 'aptitude', name: '靈根', value: (g) => APTITUDE_ORDER.indexOf(g.aptitude) },
];

/** 名冊清單的欄位：標題列與每一列共用；sort 對應 SORTS，點欄名即可排序 */
const COLUMNS: { cls: string; label: string; sort?: string }[] = [
  { cls: 'c-face', label: '' },
  { cls: 'c-name', label: '姓名' },
  { cls: 'c-origin', label: '所屬' },
  { cls: 'c-realm', label: '境界', sort: 'realm' },
  { cls: 'c-apt', label: '靈根', sort: 'aptitude' },
  { cls: 'c-st', label: '位置' },
  { cls: 'c-hp', label: '血量', sort: 'hp' },
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
  /** 目前展開詳細資訊的武將；重繪後保持展開 */
  private expanded = new Set<string>();
  /** 下次重繪時展開並捲到這名武將（點右下大頭貼進來時） */
  private focusId: string | null = null;
  private armorControls: ArmorRoster;

  constructor(root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'drawer hidden';
    root.appendChild(this.el);
    this.armorControls = new ArmorRoster(this.el, a => this.emit(a));
  }

  get isOpen() {
    return !this.el.classList.contains('hidden');
  }

  /** 指定下次開啟名冊時要展開並捲到的武將 */
  focus(generalId: string) {
    this.focusId = generalId;
    this.expanded.add(generalId);
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
    this.armorControls.clear();
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

    const gear = [...lord.gear].sort((a, b) => a.tier - b.tier || a.designId.localeCompare(b.designId)).map(e => armorPicture(e)).join('') || '<span class="muted">尚無仙衣</span>';
    const families = ['metal', 'wood', 'water', 'fire', 'earth', 'alchemy', 'forging', 'talisman', 'formation'];
    const familyOrder = (t: Technique) => { const i = families.indexOf(t.art ?? t.element ?? ''); return i < 0 ? families.length : i; };
    const scrolls = [...lord.scrolls].sort((a, b) => Math.floor(a.tier / 3) - Math.floor(b.tier / 3) || familyOrder(a) - familyOrder(b) || a.tier - b.tier).map(techniquePicture).join('') || '<span class="muted">無</span>';
    const party = gens.filter((g) => g.status === 'free').length;

    // 重繪前記住捲動位置：只有下方清單捲動，標題列固定
    const scrollTop = this.el.querySelector('.drawer-body')?.scrollTop ?? 0;
    this.el.innerHTML = `
      <div class="drawer-head">
        <h2 style="color:${LORDS[lord.id].css}">${LORDS[lord.id].name}・武將名冊</h2>
        <span class="muted">隨行 ${party}/${PARTY_LIMIT}・共 ${gens.length} 名${manage ? '' : '・非你的回合，無法突破'}</span>
        <label class="sort-box">排序 <select class="sort-select">${SORTS.map((x) => `<option value="${x.id}" ${x.id === this.sortId ? 'selected' : ''}>${x.name}</option>`).join('')}</select></label>
        <button class="btn mini toggle-all">${gens.length && gens.every((g) => this.expanded.has(g.id)) ? '全部收合' : '全部展開'}</button>
        <button class="btn close">關閉 ✕</button>
      </div>
      <div class="drawer-body">
      <div class="ready-section"></div>
      <div class="bag">
        <div class="armor-collection">
          <div class="armor-collection-head"><b>行囊仙衣</b><span class="muted">拖曳圖片到仙衣格，或依序點選兩邊圖片</span><button type="button" class="btn mini" data-armor-cancel>取消選擇</button></div>
          <div class="armor-bag-items" data-armor-bag>${gear}<button type="button" class="armor-unequip" data-armor-bag>放回行囊</button></div>
          <div class="armor-feedback" role="status" aria-live="polite">${manage ? '換下的仙衣自動回到行囊；點選已穿著的仙衣再放回行囊可卸下' : '只能在自己的整備階段換裝'}</div>
        </div>
        <div class="technique-collection"><b>功法秘笈</b><span class="technique-list">${scrolls}</span></div>
        <div><b>靈獸</b>${lord.beast ? `<span class="chip" title="${tip(lord.beast.desc)}">${lord.beast.name}</span>` : '<span class="muted">無</span>'}</div>
      </div>
      <div class="sections"></div>
      </div>`;
    (this.el.querySelector('.close') as HTMLButtonElement).onclick = () => this.close();
    (this.el.querySelector('.toggle-all') as HTMLButtonElement).onclick = () => {
      if (gens.every((g) => this.expanded.has(g.id))) this.expanded.clear();
      else for (const g of gens) this.expanded.add(g.id);
      this.render(state, lord);
    };
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
      readyBox.append(h, this.list(state, lord, ready, manage));
    }
    const readyIds = new Set(ready.map((g) => g.id));

    const sections = this.el.querySelector('.sections')!;
    for (const sec of SECTIONS) {
      const list = gens.filter((g) => g.status === sec.status && !readyIds.has(g.id)).sort(order);
      if (!list.length) continue;
      const h = document.createElement('h3');
      h.className = 'section-title';
      h.textContent = `${sec.title}（${list.length}${sec.status === 'free' ? `/${PARTY_LIMIT}` : ''}）`;
      sections.append(h, this.list(state, lord, list, manage));
    }
    this.el.querySelector('.drawer-body')!.scrollTop = scrollTop;
    this.armorControls.update(state, lord, manage);
  }

  /** 條列式名冊：每位武將一列，點一下展開原本的詳細卡片，再點一次收合 */
  private list(state: GameState, lord: Lord, gens: General[], manage: boolean): HTMLDivElement {
    const list = document.createElement('div');
    list.className = 'roster-list';
    const head = document.createElement('div');
    head.className = 'roster-head';
    for (const c of COLUMNS) {
      const cell = document.createElement(c.sort ? 'button' : 'span');
      cell.className = `${c.cls}${c.sort === this.sortId ? ' sorted' : ''}`;
      cell.textContent = c.label;
      if (c.sort) {
        const id = c.sort;
        cell.title = `依${c.label}排序`;
        cell.onclick = () => {
          this.sortId = id;
          this.render(state, lord);
        };
      }
      head.appendChild(cell);
    }
    list.appendChild(head);

    for (const g of gens) {
      const ready = canAttemptBreak(g, state.round).ok;
      const item = document.createElement('div');
      item.className = `roster-item s-${g.status}${ready ? ' ready' : ''}${g.isLord ? ' is-lord' : ''}`;
      const row = document.createElement('button');
      row.className = 'roster-row';
      row.innerHTML = this.rowHtml(state, lord, g, ready);
      item.appendChild(row);
      const show = (open: boolean) => {
        item.classList.toggle('open', open);
        row.setAttribute('aria-expanded', String(open));
        if (open) item.appendChild(this.card(state, lord, g, manage));
        else item.querySelector('.general-card')?.remove();
      };
      row.onclick = () => {
        const open = !this.expanded.has(g.id);
        if (open) this.expanded.add(g.id);
        else this.expanded.delete(g.id);
        show(open);
        this.armorControls.update(state, lord, manage);
      };
      show(this.expanded.has(g.id));
      list.appendChild(item);
      if (this.focusId === g.id) {
        this.focusId = null;
        requestAnimationFrame(() => item.scrollIntoView({ block: 'center' }));
      }
    }
    return list;
  }

  /** 收合時只顯示摘要；武器圖片與名稱在展開後的詳細卡片顯示。 */
  private rowHtml(state: GameState, lord: Lord, g: General, ready: boolean): string {
    const city = g.cityId ? state.cities[g.cityId] : null;
    const trip = lord.expeditions.find((e) => e.generalIds.includes(g.id));
    const place = g.ghostSourceId ? `冤魂・${g.ghostTurns} 回合` : g.status === 'garrison' ? `${city?.name ?? '駐守'}` : g.status === 'realm' ? `${trip?.realmName ?? '外出'}・${trip?.turnsLeft ?? 0} 回合` : g.status === 'sect' ? '宗門' : '隨行';
    const p = passiveOf(g);
    // 頭像用背景圖，避免點頭像時被看圖功能攔下而無法展開
    return `
      <span class="c-face" style="background-image:url('${generalHeadUrl(g)}')"></span>
      <span class="c-name"><b>${g.name}</b>${g.isLord ? '<span class="lord-tag">主公</span>' : ''}${ready ? '<span class="rr-ready" title="修為圓滿，可以突破">✨</span>' : ''}</span>
      <span class="c-origin">${originKingdom(g.origin)}</span>
      <span class="c-realm">${realmTag(g.realm)}</span>
      <span class="c-apt"><span class="chip apt-${g.aptitude}" title="${APTITUDE_DESC[g.aptitude]}">${APTITUDE_NAMES[g.aptitude].replace('靈根', '')}</span></span>
      <span class="c-st">${place}</span>
      <span class="c-hp"><span class="bar hp"><i style="width:${Math.min(100, (g.hp / maxHp(g)) * 100)}%"></i><span>${g.hp}/${maxHp(g)}</span></span></span>
      <span class="c-power"><b>${power(g)}</b></span>
      <span class="c-attack">${attack(g)}</span>
      <span class="c-defense">${defense(g)}</span>
      <span class="c-craft">${craft(g, 'alchemy')}</span>
      <span class="c-craft">${craft(g, 'forging')}</span>
      <span class="c-craft">${craft(g, 'talisman')}</span>
      <span class="c-craft">${craft(g, 'formation')}</span>
      <span class="c-passive" title="${tip(`【${p.name}】${fxText(p.fx)}`)}">【${p.name}】</span>
      <span class="c-caret" aria-hidden="true">▸</span>`;
  }

  private card(state: GameState, lord: Lord, g: General, manage: boolean): HTMLDivElement {
    const free = manage || this.mode.free;
    const card = document.createElement('div');
    const ready = canAttemptBreak(g, state.round).ok;
    const heavenWeapon = hasHeavenWeapon(g);
    // 預留各品階最長的武器名稱，升階換圖時不讓右側文字撐高圖片框。
    const weaponNames = WEAPON_CATALOG[g.ghostSourceId ?? g.id]?.names ?? [];
    const weaponNameSpace = weaponNames.reduce((longest, name) => name.length > longest.length ? name : longest, g.weapon?.name.split('・').pop() ?? '');
    card.className = `general-card s-${g.status}${ready ? ' ready' : ''}${heavenWeapon ? ' has-fx-art' : ''}`;
    const art = `<div class="gc-portrait has-realm-frame"><div class="gc-art"><img src="${rosterArtUrl(g)}" data-full-art="${rosterArtUrl(g)}" alt="${g.name}" loading="lazy" decoding="async" onerror="this.style.visibility='hidden'"></div>${realmFrameHtml(g.realm)}</div>`;
    const cap = expCap(g);
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
    card.innerHTML = `
      <div class="gc-details">
      ${ready ? `<div class="ready-banner">✨ 修為圓滿，可以${needsTribulation(g) ? '渡劫' : '突破'}了！</div>` : ''}
      <div class="gc-overview">
      ${art}
      <div class="gc-head">
        <b>${g.name}</b><small>${originKingdom(g.origin)}</small>${realmTag(g.realm)}${g.isLord ? '<span class="lord-tag">主公</span>' : ''}
        <span class="chip apt-${g.aptitude}" title="${APTITUDE_DESC[g.aptitude]}">${APTITUDE_NAMES[g.aptitude]}</span>
        <span class="chip trait" title="【${passiveOf(g).name}】${tip(fxText(passiveOf(g).fx))}${generalCooldownText(lord, g) ? `｜${tip(generalCooldownText(lord, g))}` : ''}｜${tip(passiveOf(g).flavor)}">【${passiveOf(g).name}】</span>
        ${buffs ? `<span class="chip buff">${buffs}</span>` : ''}
        <span class="st">${status}</span>
        ${g.fusionBonus ? `<div class="fusion-summary">融合加成：${fusionSummary(g)}</div>` : ''}
      </div>
      <div class="gc-body">
        <div class="gc-slots">
          <div class="gc-slot eq-row" data-slot="weapon" ${g.weapon ? `title="${tip(`${equipDesc(g.weapon)}｜${weaponUpgradeTip(lord, g)}`)}"` : ''}><small>武器</small>${g.weapon ? `<img class="slot-icon" src="${equipIconUrl(g.weapon)}" alt="" onerror="this.style.visibility='hidden'"><b class="gc-slot-name" data-name-space="${weaponNameSpace}"><span>${g.weapon.name.split('・').pop()}</span></b><em class="slot-tier" data-tier-space="天階・破防 100%"><span>${g.weapon.name.split('・')[0]}・破防 ${Math.round((g.weapon.penetration ?? 0) * 100)}%</span></em>` : '<b><span class="muted">無</span></b>'}</div>
          <div class="gc-slot eq-row" data-slot="armor"><small>仙衣</small>${armorPicture(g.armor, g.id)}<b class="armor-equipped-name">${g.armor?.name.split('・').pop() ?? '未裝備'}</b><em class="slot-tier">${g.armor?.name.split('・')[0] ?? '點選或拖入'}</em><span class="armor-slot-hint">${manage ? '拖曳／點選換裝' : '整備階段可換裝'}</span></div>
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
      </div>
      <div class="bar exp ${bottleneck ? 'full' : ''}"><i style="width:${Number.isFinite(cap) ? Math.min(100, (g.exp / cap) * 100) : 100}%"></i><span>修為 ${g.exp}${Number.isFinite(cap) ? ` / ${cap}` : '（真仙圓滿）'}${bottleneck ? '・瓶頸' : ''}</span></div>
      ${breakInfo ? `<div class="break-info">${breakInfo}</div>` : ''}
      <div class="bar hp"><i style="width:${(g.hp / maxHp(g)) * 100}%"></i><span>血量 ${g.hp} / ${maxHp(g)}</span></div>
      <div class="bar sta"><i style="width:${g.stamina / maxStamina(g) * 100}%"></i><span>體力 ${g.stamina} / ${maxStamina(g)}</span></div>
      <div class="equip">
        <div class="eq-row" data-slot="technique"><span class="eq-info technique-equipped"><span>功法</span>${t ? `${techniquePicture(t)}<span class="technique-equipped-name grade-text-${Math.max(0, Math.min(3, Math.floor(t.tier / 3)))}">${escapeHtml(techniqueBaseName(t))}</span>` : '<span class="muted">未修習</span>'}</span></div>
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

    if (g.realm === 2 && !g.mortalTrial) btn('金丹路線', !manage || away, () => this.emit({ type: 'break', generalId: g.id }));
    if (bottleneck) {
      const can = canAttemptBreak(g, state.round);
      btn(needsTribulation(g) ? '⚡ 渡劫' : '🧘 突破', !manage || !can.ok, () => this.emit({ type: 'break', generalId: g.id }), 'danger');
    }
    rowBtn('weapon', req.reason === '已達天階' ? '已達天階' : (g.weapon ? '武器升階' : '無專屬武器'), !manage || away || !req.ok, () => this.emit({ type: 'upgrade', generalId: g.id }));
    const weaponButton = card.querySelector<HTMLButtonElement>('.eq-row[data-slot="weapon"] button');
    if (weaponButton) weaponButton.title = req.reason;
    if (g.weapon && req.group && req.stage !== undefined && req.cost) {
      const cost = document.createElement('div');
      cost.className = 'weapon-material-cost';
      cost.innerHTML = `升階：${materialLabel(req.group, req.stage)} × ${req.cost}`;
      card.querySelector('.eq-row[data-slot="weapon"]')!.appendChild(cost);
    }
    // 已經修習功法就不再顯示學習按鈕
    if (!t) rowBtn('technique', g.aptitude === 'waste' ? '廢靈根' : '學習功法', !free || away || !lord.scrolls.length || g.aptitude === 'waste', () => this.emit({ type: 'learn', generalId: g.id }));
    btn('自廢修為', !free || away || !t, () => this.emit({ type: 'abolish', generalId: g.id }));
    return card;
  }
}
import { fusionSummary } from './GeneralInfo';

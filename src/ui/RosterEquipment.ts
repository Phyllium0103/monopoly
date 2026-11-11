import type { Equipment, GameState, Lord, Technique } from '../game/types';
import type { RosterAction } from '../engine/prompts';
import { armorGrade, armorGradeName } from '../data/armorCatalog';
import { equipDesc, equipStats, equipRealm, techniqueBaseName, techniqueDesc, techniqueTag, tierName } from '../data/items';
import { armorTransferCheck, canWearArmor, techniqueTransferCheck } from '../systems/GeneralSystem';
import { equipIconUrl } from './Icons';
import './armor-roster.css';
import { REALMS } from '../data/generals';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
type Kind = 'armor' | 'technique';
type Source = { kind: Kind; uid: string; from?: string };
const labelOf = (kind: Kind) => kind === 'armor' ? '仙衣' : '功法';
const attrs = (kind: Kind, uid?: string, id?: string) => `data-equipment-kind="${kind}" ${uid ? `data-equipment-item="${esc(uid)}"` : ''} ${id ? `data-equipment-target="${esc(id)}"` : ''} draggable="false" aria-pressed="false"`;
export function armorPicture(e: Equipment | null, id?: string): string {
  const label = e ? `${e.name} ${equipDesc(e, false).replace(/<br\s*\/?>/g, ' ').replace(/｜/g, ' ')}` : '未裝備仙衣';
  const detail = e ? `<div class="tech-tip"><div class="tech-tip-rank">${armorGradeName(e.tier)} · 仙衣</div><strong>${esc(e.name.split('・').pop()!)}</strong><div class="tech-tip-rule"></div><div class="tech-tip-detail">${equipStats(e)}<br>需要${REALMS[equipRealm(e.tier)]}以上</div></div>` : '';
  return `<button type="button" class="technique-picture armor-picture grade-${e ? armorGrade(e.tier) : 0}${e ? '' : ' armor-empty'}" ${attrs('armor', e?.uid, id)} ${detail ? `data-tip="${esc(label)}"` : ''} ${detail ? `data-tip-html="${esc(detail)}"` : ''} aria-label="${esc(label)}">${e ? `<img src="${equipIconUrl(e)}" alt="" loading="lazy" decoding="async" draggable="false">` : ''}</button>`;
}
export function techniqueIconUrl(t: Technique): string {
  return `${import.meta.env?.BASE_URL ?? './'}assets/techniques/${t.art ?? t.element}-${['huang', 'xuan', 'di', 'tian'][armorGrade(t.tier)]}.webp`;
}
export function techniquePicture(t: Technique | null, id?: string): string {
  const name = t ? techniqueBaseName(t) : '未修習功法', rank = t ? tierName(t.tier, '階') : '點選放入';
  const label = t ? `${rank}｜${name}｜${techniqueDesc(t).replace(/<br\s*\/?>/g, '｜').replace(/<[^>]+>/g, '')}` : '未修習功法・選擇此武將';
  const tag = t ? techniqueTag(t) : null;
  const detail = t && tag ? `<div class="tech-tip"><div class="tech-tip-rank">${esc(rank)} · <span style="color:${tag.css}">${esc(tag.text)}</span></div><strong>${esc(name)}</strong><div class="tech-tip-rule"></div><div class="tech-tip-detail">${techniqueDesc(t)}${id ? '<br>已修習，須先自廢修為才能更換' : ''}</div></div>` : '';
  // Learned techniques are bound; unused scrolls can be selected.
  return `<button type="button" class="technique-picture armor-picture grade-${t ? armorGrade(t.tier) : 0}${t ? '' : ' armor-empty'}" ${attrs('technique', id ? undefined : t?.uid, id)} ${detail ? `data-tip="${esc(label)}"` : ''} ${detail ? `data-tip-html="${esc(detail)}"` : ''} aria-label="${esc(label)}">${t ? `<img src="${techniqueIconUrl(t)}" alt="" loading="lazy" decoding="async" draggable="false">` : ''}</button>`;
}

/** Click to carry, click to place. Only host-validated actions change ownership. */
export class RosterEquipment {
  private context: { state: GameState; lord: Lord; manage: boolean; free: boolean } | null = null;
  private selected: Source | null = null;
  private cursor: HTMLDivElement | null = null;
  private pointer = { x: 0, y: 0 };
  constructor(private root: HTMLElement, private emit: (a: RosterAction) => void) {
    root.addEventListener('click', e => {
      if (this.selected && !(e.target as HTMLElement).closest('[data-equipment-kind], [data-inventory-slot]')) { e.preventDefault(); e.stopPropagation(); }
    }, true);
    root.addEventListener('pointermove', e => { this.pointer = { x: e.clientX, y: e.clientY }; this.positionCursor(); if (this.cursor) this.cursor.hidden = false; });
    root.addEventListener('pointerleave', () => { if (this.cursor) this.cursor.hidden = true; });
    root.addEventListener('focusin', e => { if (!this.pointer.x && !this.pointer.y) { const rect = (e.target as HTMLElement).getBoundingClientRect(); this.pointer = { x: rect.right, y: rect.bottom }; this.positionCursor(); } });
    root.addEventListener('dragstart', e => { if ((e.target as HTMLElement).closest('[data-equipment-kind], [data-inventory-slot]')) e.preventDefault(); });
    root.addEventListener('keydown', e => { if (e.key === 'Escape' && this.selected) { e.preventDefault(); e.stopPropagation(); this.clear(); } });
    root.addEventListener('contextmenu', e => { if (this.selected) { e.preventDefault(); this.clear(); } });
    root.addEventListener('click', e => {
      if ((e.target as HTMLElement).closest('.general-modal, .roster-readonly')) return;
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-equipment-kind], [data-inventory-slot], [data-equipment-cancel]');
      if (!el || !root.contains(el)) return;
      if (e.clientX || e.clientY) this.pointer = { x: e.clientX, y: e.clientY };
      if (el.hasAttribute('data-equipment-cancel')) { this.clear(); return; }
      const cell = el.closest<HTMLElement>('[data-inventory-slot]');
      const kind = el.dataset.equipmentKind as Kind;
      const to = el.dataset.equipmentTarget, uid = el.dataset.equipmentItem;
      if (cell && this.selected) {
        const index = Number(cell.dataset.inventorySlot), source = this.selected;
        if (!source.from) {
          if (!this.allowed(source.kind)) { this.message('目前無法整理行囊', true); return; }
          this.selected = null; this.paint();
          this.emit({ type: 'move-bag-item', itemUid: source.uid, slot: index });
        } else if (uid) {
          if (kind !== 'armor') { this.message('仙衣只能與仙衣交換；請選擇空格放回', true); return; }
          this.move({ kind: 'armor', uid }, source.from, index);
        } else this.move(source, undefined, index);
        return;
      }
      if (!kind) { this.message('先點選一件仙衣或功法，再點目的格'); return; }
      if (!this.allowed(kind)) { this.message(kind === 'armor' ? '只能在自己的整備階段換裝' : '目前無法修習功法', true, kind === 'technique' ? '無法修習' : '無法裝備'); return; }
      if (this.selected) {
        if (this.selected.uid === uid || (to && to === this.selected.from)) { this.clear(); return; }
        if (kind !== this.selected.kind) { this.message(labelOf(this.selected.kind) + '只能放入' + labelOf(this.selected.kind) + '格', true); return; }
        if (to) this.move(this.selected, to);
        return;
      }
      if (to && kind === 'technique' && this.context?.state.generals[to]?.technique) { this.message('已修習功法不能直接取下，請開啟武將詳情使用「自廢修為」', true, '無法修習'); return; }
      if (!uid) { this.message('先點選行囊中的' + labelOf(kind) + '，再點這個格子'); return; }
      const s: Source = { kind, uid, from: to };
      if (to) { const check = this.targetCheck(kind, to); if (!check.ok) { this.message(check.reason, true); return; } }
      if (!this.sourceItem(s)) { this.message('物品已移動，請重新選擇', true); return; }
      this.selected = s; this.paint();
      this.message('已拿起「' + this.sourceItem(s)!.name + '」；點亮起的格子放入，Esc 取消');
    });
  }
  update(state: GameState, lord: Lord, manage: boolean, free = false) {
    if (this.context?.lord.id !== lord.id) this.selected = null;
    this.context = { state, lord, manage, free };
    if (this.selected && (!this.allowed(this.selected.kind) || !this.sourceItem(this.selected))) this.selected = null;
    this.paint();
  }
  notify(text: string) { this.message(text, true, '無法突破'); }
  clear() { this.selected = null; this.paint(); this.message('已取消選擇'); }
  unequip(generalId: string) { const item = this.context?.state.generals[generalId]?.armor; if (item) this.move({ kind: 'armor', uid: item.uid, from: generalId }); }
  private allowed(kind: Kind) { return !!this.context && (this.context.manage || (kind === 'technique' && this.context.free)); }
  private targetCheck(kind: Kind, id: string) {
    const c = this.context, g = c?.state.generals[id];
    if (!c || !g) return { ok: false, reason: '武將不存在' };
    const r = canWearArmor(c.lord, g); if (!r.ok) return r;
    if (kind === 'technique' && g.technique) return { ok: false, reason: '已修習功法，須先自廢修為' };
    if (kind === 'technique' && g.aptitude === 'waste') return { ok: false, reason: '廢靈根無法修習功法' };
    return { ok: true, reason: '' };
  }
  private sourceItem(s: Source): Equipment | Technique | undefined {
    const c = this.context; if (!c) return;
    const item = s.kind === 'technique' ? c.lord.scrolls.find(t => t.uid === s.uid) : s.from ? c.state.generals[s.from]?.armor ?? undefined : c.lord.gear.find(e => e.uid === s.uid);
    return item?.uid === s.uid ? item : undefined;
  }
  private check(s: Source, to?: string) {
    if (!this.context || !this.allowed(s.kind)) return { ok: false, reason: '目前無法裝備' };
    const { state, lord } = this.context;
    return s.kind === 'armor' ? armorTransferCheck(state, lord, s.uid, s.from, to) : to ? techniqueTransferCheck(state, lord, s.uid, to) : { ok: false, reason: '功法只能放入武將的功法格' };
  }
  private move(s: Source, to?: string, bagSlot?: number) {
    const check = this.check(s, to); if (!check.ok) { this.paint(); this.message(check.reason, true); return; }
    this.selected = null; this.paint();
    this.emit(s.kind === 'armor' ? { type: 'transfer-armor', itemUid: s.uid, fromGeneralId: s.from, toGeneralId: to, bagSlot } : { type: 'learn-technique', itemUid: s.uid, generalId: to! });
  }
  private message(text: string, error = false, heading?: string) {
    const el = this.root.querySelector<HTMLElement>('.equipment-feedback');
    if (el) { el.textContent = text; el.classList.toggle('is-error', error); }
    const old = this.root.querySelector('.equipment-notice'); old?.remove();
    if (error) {
      const notice = this.root.ownerDocument.createElement('div'); notice.className = 'equipment-notice'; notice.setAttribute('role', 'alert');
      notice.innerHTML = '<span class="notice-mark">!</span><div><strong>' + (heading ?? (this.selected?.kind === 'technique' ? '無法修習' : '無法裝備')) + '</strong><p>' + esc(text) + '</p></div><button type="button" aria-label="關閉提示">✕</button>';
      notice.querySelector('button')!.onclick = () => notice.remove(); this.root.appendChild(notice);
      setTimeout(() => notice.remove(), 5000);
    }
  }
  private paint() {
    for (const el of this.root.querySelectorAll<HTMLElement>('[data-equipment-kind], [data-inventory-slot]')) {
      if (el.closest('.general-modal, .roster-readonly')) continue;
      const kind = el.dataset.equipmentKind as Kind, id = el.dataset.equipmentTarget;
      const selected = !!this.selected && el.dataset.equipmentItem === this.selected.uid;
      el.classList.toggle('armor-selected', selected); el.setAttribute('aria-pressed', String(selected)); el.draggable = false;
      const check = id && this.selected ? kind !== this.selected.kind ? { ok: false } : this.check(this.selected, id) : id ? this.targetCheck(kind, id) : { ok: true };
      const blocked = kind ? !this.allowed(kind) || !check.ok : !this.context?.manage && !this.context?.free;
      el.classList.toggle('armor-unavailable', blocked); el.setAttribute('aria-disabled', String(blocked));
      const bag = el.hasAttribute('data-inventory-slot');
      const canBag = bag && !!this.selected && (!this.selected.from || !el.querySelector('[data-equipment-item]') && this.check(this.selected).ok || !!el.querySelector('[data-equipment-kind="armor"]'));
      const canPlace = !!this.selected && !selected && (!!id && !blocked && kind === this.selected.kind || !!canBag);
      el.classList.toggle('equipment-compatible', canPlace);
    }
    this.paintCursor();
  }
  private paintCursor() {
    const s = this.selected, item = s ? this.sourceItem(s) : null;
    this.root.classList.toggle('equipment-carrying', !!item);
    if (!s || !item) { this.cursor?.remove(); this.cursor = null; return; }
    const doc = this.root.ownerDocument;
    if (!this.cursor) { this.cursor = doc.createElement('div'); this.cursor.className = 'equipment-cursor'; this.cursor.setAttribute('aria-hidden', 'true'); doc.body.appendChild(this.cursor); }
    if (this.cursor.dataset.uid !== item.uid) { this.cursor.dataset.uid = item.uid; this.cursor.innerHTML = '<img src="' + (s.kind === 'armor' ? equipIconUrl(item as Equipment) : techniqueIconUrl(item as Technique)) + '" alt="">'; }
    this.positionCursor();
  }
  private positionCursor() {
    if (!this.cursor) return;
    const view = this.root.ownerDocument.defaultView;
    const x = Math.max(0, Math.min(this.pointer.x - 27, (view?.innerWidth ?? 1024) - 54)), y = Math.max(0, Math.min(this.pointer.y - 27, (view?.innerHeight ?? 768) - 54));
    this.cursor.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0)';
  }
}

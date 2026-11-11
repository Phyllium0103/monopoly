import type { Equipment, GameState, Lord, Technique } from '../game/types';
import type { RosterAction } from '../engine/prompts';
import { armorGrade } from '../data/armorCatalog';
import { equipDesc, techniqueBaseName, techniqueDesc, techniqueTag, tierName } from '../data/items';
import { armorTransferCheck, canWearArmor, techniqueTransferCheck } from '../systems/GeneralSystem';
import { equipIconUrl } from './Icons';
import './armor-roster.css';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
type Kind = 'armor' | 'technique';
type Source = { kind: Kind; uid: string; from?: string };
type Selection = Source | { kind: Kind; to: string };
const labelOf = (kind: Kind) => kind === 'armor' ? '仙衣' : '功法';
const attrs = (kind: Kind, uid?: string, id?: string) => `data-equipment-kind="${kind}" ${uid ? `data-equipment-item="${esc(uid)}"` : ''} ${id ? `data-equipment-target="${esc(id)}"` : ''} draggable="false" aria-pressed="false"`;
export function armorPicture(e: Equipment | null, id?: string): string {
  const label = e ? `${e.name}｜${equipDesc(e).replace(/<br\s*\/?>/g, '｜')}` : '未裝備仙衣・選擇此武將';
  return `<button type="button" class="technique-picture armor-picture grade-${e ? armorGrade(e.tier) : 0}${e ? '' : ' armor-empty'}" ${attrs('armor', e?.uid, id)} data-tip="${esc(label)}" aria-label="${esc(label)}">${e ? `<img src="${equipIconUrl(e)}" alt="" loading="lazy" decoding="async" draggable="false">` : '<span aria-hidden="true">＋</span>'}</button>`;
}
export function techniqueIconUrl(t: Technique): string {
  return `${import.meta.env?.BASE_URL ?? './'}assets/techniques/${t.art ?? t.element}-${['huang', 'xuan', 'di', 'tian'][armorGrade(t.tier)]}.webp`;
}
export function techniquePicture(t: Technique | null, id?: string): string {
  const name = t ? techniqueBaseName(t) : '未修習功法', rank = t ? tierName(t.tier, '階') : '點選或拖入';
  const label = t ? `${rank}｜${name}｜${techniqueDesc(t).replace(/<br\s*\/?>/g, '｜').replace(/<[^>]+>/g, '')}` : '未修習功法・選擇此武將';
  const tag = t ? techniqueTag(t) : null;
  const detail = t && tag ? `<div class="tech-tip"><div class="tech-tip-rank">${esc(rank)} · <span style="color:${tag.css}">${esc(tag.text)}</span></div><strong>${esc(name)}</strong><div class="tech-tip-rule"></div><div class="tech-tip-detail">${techniqueDesc(t)}${id ? '<br>已修習，須先自廢修為才能更換' : ''}</div></div>` : '';
  // Learned techniques are bound; only unused scrolls are draggable sources.
  return `<button type="button" class="technique-picture armor-picture grade-${t ? armorGrade(t.tier) : 0}${t ? '' : ' armor-empty'}" ${attrs('technique', id ? undefined : t?.uid, id)} data-tip="${esc(label)}" ${detail ? `data-tip-html="${esc(detail)}"` : ''} aria-label="${esc(label)}">${t ? `<img src="${techniqueIconUrl(t)}" alt="" loading="lazy" decoding="async" draggable="false">` : '<span aria-hidden="true">＋</span>'}</button>`;
}

/** Shared pointer/drag selection. Inventory changes are always validated by the host. */
export class RosterEquipment {
  private context: { state: GameState; lord: Lord; manage: boolean; free: boolean } | null = null;
  private selected: Selection | null = null;
  private dragged: Source | null = null;
  private cursor: HTMLDivElement | null = null;
  private pointer = { x: 0, y: 0 };
  constructor(private root: HTMLElement, private emit: (a: RosterAction) => void) {
    root.addEventListener('pointermove', e => { this.pointer = { x: e.clientX, y: e.clientY }; this.positionCursor(); if (this.cursor) this.cursor.hidden = false; });
    root.addEventListener('pointerleave', () => { if (this.cursor) this.cursor.hidden = true; });
    root.addEventListener('focusin', e => { const rect = (e.target as HTMLElement).getBoundingClientRect(); this.pointer = { x: rect.right, y: rect.bottom }; this.positionCursor(); });
    root.addEventListener('click', e => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-equipment-kind], [data-equipment-cancel]');
      if (!el || !root.contains(el)) return;
      if (e.clientX || e.clientY) this.pointer = { x: e.clientX, y: e.clientY };
      if (el.hasAttribute('data-equipment-cancel')) { this.clear(); return; }
      const kind = el.dataset.equipmentKind as Kind;
      if (!this.allowed(kind)) { this.message(kind === 'armor' ? '只能在自己的整備階段換裝' : '目前無法修習功法'); return; }
      const to = el.dataset.equipmentTarget, uid = el.dataset.equipmentItem;
      if (to) {
        if (this.selected && 'uid' in this.selected) {
          if (this.selected.kind !== kind) this.message(`${labelOf(this.selected.kind)}只能放入${labelOf(this.selected.kind)}格`);
          else if (this.selected.from === to) this.clear();
          else this.move(this.selected, to);
        } else if (uid && kind === 'armor') this.select({ kind, uid, from: to });
        else this.select({ kind, to });
      } else if (uid) {
        if (this.selected?.kind === kind && 'uid' in this.selected && this.selected.uid === uid) { this.clear(); return; }
        const to = this.selected?.kind === kind ? ('to' in this.selected ? this.selected.to : this.selected.from) : undefined;
        if (to) this.move({ kind, uid }, to); else this.select({ kind, uid });
      } else if (this.selected?.kind === 'armor' && 'uid' in this.selected && this.selected.from) this.move(this.selected);
      else this.message('先點選武將身上的仙衣，再點「放回行囊」即可卸下；已修習功法不可卸下');
    });
    root.addEventListener('keydown', e => { if (e.key === 'Escape' && this.selected) { e.stopPropagation(); this.clear(); } });
    root.addEventListener('dragstart', e => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-equipment-item]');
      if (!el || !root.contains(el) || !e.dataTransfer) return;
      const s: Source = { kind: el.dataset.equipmentKind as Kind, uid: el.dataset.equipmentItem!, from: el.dataset.equipmentTarget };
      if (!this.select(s)) { e.preventDefault(); return; }
      this.dragged = s; this.paintCursor(); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', s.uid);
    });
    root.addEventListener('dragover', e => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-equipment-target], [data-equipment-bag]');
      if (!el || !this.dragged || !this.allowed(this.dragged.kind)) return;
      e.preventDefault(); const ok = this.dropCheck(this.dragged, el).ok;
      el.classList.toggle('armor-drop-ready', ok); el.classList.toggle('armor-drop-blocked', !ok);
      if (e.dataTransfer) e.dataTransfer.dropEffect = ok ? 'move' : 'none';
    });
    root.addEventListener('dragleave', e => { (e.target as HTMLElement).closest('[data-equipment-target], [data-equipment-bag]')?.classList.remove('armor-drop-ready', 'armor-drop-blocked'); });
    root.addEventListener('drop', e => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-equipment-target], [data-equipment-bag]');
      if (!el || !this.dragged) return;
      e.preventDefault(); const s = this.dragged, check = this.dropCheck(s, el); this.dragged = null;
      if (check.ok) this.move(s, el.dataset.equipmentTarget); else { this.paint(); this.message(check.reason); }
    });
    root.addEventListener('dragend', () => { this.dragged = null; this.paint(); });
  }
  update(state: GameState, lord: Lord, manage: boolean, free = false) {
    if (this.context?.lord.id !== lord.id) { this.selected = null; this.dragged = null; }
    this.context = { state, lord, manage, free };
    if (this.selected && (!this.allowed(this.selected.kind) || ('uid' in this.selected && !this.sourceItem(this.selected)))) this.selected = null;
    if (this.dragged && (!this.allowed(this.dragged.kind) || !this.sourceItem(this.dragged))) this.dragged = null;
    this.paint();
  }
  clear() { this.selected = null; this.dragged = null; this.paint(); this.message('已取消選擇'); }
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
  private select(s: Selection): boolean {
    if (!this.allowed(s.kind)) return false;
    const id = 'to' in s ? s.to : s.from;
    if (id) { const r = this.targetCheck(s.kind, id); if (!r.ok) { this.message(r.reason); return false; } }
    if ('uid' in s && (!this.sourceItem(s) || (s.kind === 'technique' && s.from))) return false;
    this.selected = s; this.paint();
    this.message('to' in s ? `已選擇武將，請點選行囊中的${labelOf(s.kind)}` : `已選擇「${this.sourceItem(s)!.name}」，請放入武將的${labelOf(s.kind)}格；Esc 取消`);
    return true;
  }
  private check(s: Source, to?: string): { ok: boolean; reason: string } {
    if (!this.context || !this.allowed(s.kind)) return { ok: false, reason: '目前無法裝備' };
    const { state, lord } = this.context;
    return s.kind === 'armor' ? armorTransferCheck(state, lord, s.uid, s.from, to) : to ? techniqueTransferCheck(state, lord, s.uid, to) : { ok: false, reason: '功法只能放入武將的功法格' };
  }
  private dropCheck(s: Source, el: HTMLElement) {
    return el.dataset.equipmentKind !== s.kind ? { ok: false, reason: `${labelOf(s.kind)}只能放入${labelOf(s.kind)}格` } : this.check(s, el.dataset.equipmentTarget);
  }
  private move(s: Source, to?: string) {
    const check = this.check(s, to); if (!check.ok) { this.paint(); this.message(check.reason); return; }
    this.selected = null; this.dragged = null; this.paint();
    this.emit(s.kind === 'armor' ? { type: 'transfer-armor', itemUid: s.uid, fromGeneralId: s.from, toGeneralId: to } : { type: 'learn-technique', itemUid: s.uid, generalId: to! });
  }
  private message(text: string) { const el = this.root.querySelector<HTMLElement>('.equipment-feedback'); if (el) el.textContent = text; }
  private paint() {
    for (const el of this.root.querySelectorAll<HTMLElement>('[data-equipment-kind]')) {
      const kind = el.dataset.equipmentKind as Kind, id = el.dataset.equipmentTarget;
      const selected = this.selected?.kind === kind && ('uid' in this.selected ? el.dataset.equipmentItem === this.selected.uid : id === this.selected.to);
      el.classList.toggle('armor-selected', !!selected); el.setAttribute('aria-pressed', String(!!selected)); el.classList.remove('armor-drop-ready', 'armor-drop-blocked');
      el.draggable = !!el.dataset.equipmentItem && this.allowed(kind) && (!id || this.targetCheck(kind, id).ok);
      const check = id && this.selected && 'uid' in this.selected ? this.dropCheck(this.selected, el) : id ? this.targetCheck(kind, id) : { ok: true };
      const blocked = !this.allowed(kind) || !check.ok;
      el.classList.toggle('armor-unavailable', blocked); el.setAttribute('aria-disabled', String(blocked));
      el.classList.toggle('equipment-compatible', !!id && !!this.selected && 'uid' in this.selected && !selected && !blocked);
    }
    this.paintCursor();
  }
  private paintCursor() {
    const s = this.selected && 'uid' in this.selected ? this.selected : null, item = s ? this.sourceItem(s) : null;
    if (!s || !item || this.dragged) { this.cursor?.remove(); this.cursor = null; return; }
    const doc = this.root.ownerDocument; if (!doc) return;
    if (!this.cursor) { this.cursor = doc.createElement('div'); this.cursor.className = 'equipment-cursor'; this.cursor.setAttribute('aria-hidden', 'true'); doc.body.appendChild(this.cursor); }
    if (this.cursor.dataset.uid !== item.uid) { this.cursor.dataset.uid = item.uid; this.cursor.innerHTML = `<img src="${s.kind === 'armor' ? equipIconUrl(item as Equipment) : techniqueIconUrl(item as Technique)}" alt=""><span>${esc(item.name)}<small>Esc 取消</small></span>`; }
    this.positionCursor();
  }
  private positionCursor() {
    if (!this.cursor) return;
    const view = this.root.ownerDocument.defaultView;
    const x = Math.max(4, Math.min(this.pointer.x + 16, (view?.innerWidth ?? 1024) - 170)), y = Math.max(4, Math.min(this.pointer.y + 16, (view?.innerHeight ?? 768) - 86));
    this.cursor.style.transform = `translate3d(${x}px,${y}px,0)`;
  }
}

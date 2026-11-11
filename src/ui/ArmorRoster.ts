import type { Equipment, GameState, Lord } from '../game/types';
import type { RosterAction } from '../engine/prompts';
import { armorGrade } from '../data/armorCatalog';
import { equipDesc } from '../data/items';
import { armorTransferCheck, canWearArmor } from '../systems/GeneralSystem';
import { equipIconUrl } from './Icons';
import './armor-roster.css';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
type Source = { uid: string; from?: string };
type Selection = Source | { to: string };

/** Same 54px frame as technique icons; buttons also support keyboard/touch. */
export function armorPicture(e: Equipment | null, generalId?: string): string {
  const label = e ? `${e.name}｜${equipDesc(e).replace(/<br\s*\/?>/g, '｜')}` : '未裝備仙衣・選擇此武將';
  return `<button type="button" class="technique-picture armor-picture grade-${e ? armorGrade(e.tier) : 0}${e ? '' : ' armor-empty'}" ${e ? `data-armor-item="${esc(e.uid)}"` : ''} ${generalId ? `data-armor-target="${esc(generalId)}"` : ''} draggable="false" data-tip="${esc(label)}" aria-label="${esc(label)}" aria-pressed="false">${e ? `<img src="${equipIconUrl(e)}" alt="" loading="lazy" decoding="async" draggable="false">` : '<span aria-hidden="true">＋</span>'}</button>`;
}

/** Delegated controls survive card expansion and roster redraws. No local inventory mutation. */
export class ArmorRoster {
  private context: { state: GameState; lord: Lord; manage: boolean } | null = null;
  private selected: Selection | null = null;
  private dragged: Source | null = null;
  constructor(private root: HTMLElement, private emit: (a: RosterAction) => void) {
    root.addEventListener('click', e => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-armor-item], [data-armor-target], [data-armor-bag], [data-armor-cancel]');
      if (!el || !root.contains(el)) return;
      if (el.hasAttribute('data-armor-cancel')) { this.clear(); return; }
      if (!this.context?.manage) { this.message('只能在自己的整備階段換裝'); return; }
      const to = el.dataset.armorTarget;
      const uid = el.dataset.armorItem;
      if (to) {
        if (this.selected && 'uid' in this.selected) {
          if (this.selected.from === to) this.clear();
          else this.move(this.selected, to);
        } else if (uid) this.select({ uid, from: to });
        else this.select({ to });
      } else if (uid) {
        const destination = this.selected && ('to' in this.selected ? this.selected.to : this.selected.from);
        if (destination) this.move({ uid }, destination);
        else if (this.selected && 'uid' in this.selected && this.selected.uid === uid) this.clear();
        else this.select({ uid });
      } else if (this.selected && 'uid' in this.selected && this.selected.from) this.move(this.selected);
      else this.message('先點選武將身上的仙衣，再點「放回行囊」即可卸下');
    });
    root.addEventListener('keydown', e => { if (e.key === 'Escape' && this.selected) { e.stopPropagation(); this.clear(); } });
    root.addEventListener('dragstart', e => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-armor-item]');
      if (!el || !root.contains(el) || !this.context?.manage || !e.dataTransfer) return;
      const source = { uid: el.dataset.armorItem!, from: el.dataset.armorTarget };
      if (!this.select(source)) { e.preventDefault(); return; }
      this.dragged = source;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', source.uid);
    });
    root.addEventListener('dragover', e => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-armor-target], [data-armor-bag]');
      if (!el || !this.dragged || !this.context?.manage) return;
      e.preventDefault();
      const { state, lord } = this.context;
      const ok = armorTransferCheck(state, lord, this.dragged.uid, this.dragged.from, el.dataset.armorTarget).ok;
      el.classList.toggle('armor-drop-ready', ok);
      el.classList.toggle('armor-drop-blocked', !ok);
      if (e.dataTransfer) e.dataTransfer.dropEffect = ok ? 'move' : 'none';
    });
    root.addEventListener('dragleave', e => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-armor-target], [data-armor-bag]');
      el?.classList.remove('armor-drop-ready', 'armor-drop-blocked');
    });
    root.addEventListener('drop', e => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-armor-target], [data-armor-bag]');
      if (!el || !this.dragged) return;
      e.preventDefault();
      const source = this.dragged;
      this.dragged = null;
      this.move(source, el.dataset.armorTarget);
    });
    root.addEventListener('dragend', () => { this.dragged = null; this.paint(); });
  }
  update(state: GameState, lord: Lord, manage: boolean) {
    if (this.context?.lord.id !== lord.id || !manage) this.selected = null;
    this.context = { state, lord, manage };
    if (!manage) this.dragged = null;
    this.paint();
  }
  clear() { this.selected = null; this.dragged = null; this.paint(); this.message('已取消選擇'); }
  private select(selection: Selection): boolean {
    if (!this.context?.manage) return false;
    const { state, lord } = this.context;
    const id = 'to' in selection ? selection.to : selection.from;
    if (id) {
      const general = state.generals[id];
      const check = general ? canWearArmor(lord, general) : { ok: false, reason: '武將不存在' };
      if (!check.ok) { this.message(check.reason); return false; }
    } else if ('uid' in selection && !lord.gear.some(e => e.uid === selection.uid)) return false;
    this.selected = selection;
    this.paint();
    this.message('to' in selection ? '已選擇武將，請點選行囊中的仙衣' : '已選擇仙衣，請點選武將的仙衣格；點「放回行囊」可卸下');
    return true;
  }
  private move(source: Source, to?: string) {
    if (!this.context?.manage) return;
    const { state, lord } = this.context;
    const check = armorTransferCheck(state, lord, source.uid, source.from, to);
    if (!check.ok) { this.message(check.reason); this.paint(); return; }
    this.selected = null;
    this.dragged = null;
    this.emit({ type: 'transfer-armor', itemUid: source.uid, fromGeneralId: source.from, toGeneralId: to });
  }
  private message(text: string) { const el = this.root.querySelector<HTMLElement>('.armor-feedback'); if (el) el.textContent = text; }
  private paint() {
    const c = this.context;
    for (const el of this.root.querySelectorAll<HTMLElement>('[data-armor-item], [data-armor-target], [data-armor-bag]')) {
      const id = el.dataset.armorTarget;
      const selected = !!this.selected && ('uid' in this.selected ? el.dataset.armorItem === this.selected.uid : id === this.selected.to);
      el.classList.toggle('armor-selected', selected);
      el.classList.remove('armor-drop-ready', 'armor-drop-blocked');
      el.setAttribute('aria-pressed', String(selected));
      if (el.hasAttribute('data-armor-item')) el.draggable = !!c?.manage && (!id || canWearArmor(c.lord, c.state.generals[id]).ok);
      const blocked = !c?.manage || !!(id && !canWearArmor(c.lord, c.state.generals[id]).ok)
        || !!(c && id && this.selected && 'uid' in this.selected && this.selected.from !== id && !armorTransferCheck(c.state, c.lord, this.selected.uid, this.selected.from, id).ok);
      el.classList.toggle('armor-unavailable', blocked);
      el.setAttribute('aria-disabled', String(blocked));
    }
  }
}

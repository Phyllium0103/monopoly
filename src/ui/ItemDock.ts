import type { Item } from '../game/types';
import { ITEM_DEFS, PILL_GRADES, itemName } from '../data/items';
import { CATEGORY_STYLE, TIER_COLORS } from './ItemUI';
import { itemIconUrl } from './Icons';
import { SPECIAL_ITEM_STORAGE } from '../systems/DirectItems';
import { requirementText } from '../systems/ItemSystem';
import { shortItemName } from '../data/itemLabels';
import { uiViewportSize } from './UiViewport';
import './item-dock.css';

export interface ItemDockChoice { id: string; name: string; img?: string; tip?: string; disabled?: boolean; selected?: boolean }
export interface ItemDockState {
  items: Item[]; visible: boolean; battle: boolean; selected: string | null; hint: string;
  choices: ItemDockChoice[];
  disabled(item: Item): string;
  pick(item: Item): void; choose(id: string): void; cancel(): void;
}
/** One image row, at most 15 stacks; small windows use 10 larger hit targets. */
export class ItemDock {
  readonly el = document.createElement('section');
  private category = '全部'; private page = 0; private columns = 15;
  private state: ItemDockState | null = null; private key = '';
  constructor(private hud: HTMLElement) {
    this.el.className = 'item-dock hidden'; this.el.setAttribute('aria-label', '物品快捷列');
    hud.append(this.el);
    new ResizeObserver(() => {
      const { scale } = uiViewportSize();
      const width = this.el.getBoundingClientRect().width / scale;
      const columns = width >= 720 ? 15 : 10;
      if (columns !== this.columns) { this.columns = columns; this.page = 0; this.key = ''; this.paint(); }
      const height = this.el.classList.contains('hidden') ? 0 : this.el.getBoundingClientRect().height / scale;
      hud.style.setProperty('--item-dock-height', `${Math.round(height)}px`);
      hud.parentElement?.style.setProperty('--item-dock-height', `${Math.round(height)}px`);
    }).observe(this.el);
    this.el.addEventListener('click', event => {
      const b = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
      if (!b || !this.state || b.disabled) return;
      if (b.dataset.category) { this.category = b.dataset.category; this.page = 0; this.state.cancel(); this.paint(); }
      else if (b.dataset.page) { this.page += Number(b.dataset.page); this.state.cancel(); this.paint(); }
      else if (b.dataset.uid) { const item = this.state.items.find(i => i.uid === b.dataset.uid); if (item) this.state.pick(item); }
      else if (b.dataset.choice) this.state.choose(b.dataset.choice);
      else if (b.dataset.cancel) this.state.cancel();
    });
  }
  render(state: ItemDockState) { this.state = state; this.paint(); }
  private paint() {
    const s = this.state; if (!s) return;
    this.el.classList.toggle('hidden', !s.visible); this.hud.classList.toggle('item-dock-present', s.visible);
    this.hud.classList.toggle('item-battle',s.battle);
    if (!s.visible) return;
    const groups = new Map<string, { item: Item; count: number; reason: string }>();
    for (const item of s.items) {
      if (SPECIAL_ITEM_STORAGE.has(item.defId) || (this.category !== '全部' && ITEM_DEFS[item.defId].category !== this.category)) continue;
      const id = `${item.defId}:${item.tier}`, stack = groups.get(id);
      if (stack) stack.count++; else groups.set(id, { item, count: 1, reason: s.disabled(item) });
    }
    const stacks = [...groups.values()], pages = Math.max(1, Math.ceil(stacks.length / this.columns));
    this.page = Math.max(0, Math.min(pages - 1, this.page));
    const shown = stacks.slice(this.page * this.columns, (this.page + 1) * this.columns);
    const key = JSON.stringify([this.category, this.page, this.columns, s.selected, s.hint, s.choices, shown.map(x => [x.item.uid,x.item.defId,x.item.tier,x.count,x.reason]), pages]);
    if (key === this.key) return; this.key = key;
    this.el.replaceChildren(); this.el.style.setProperty('--item-columns', String(this.columns));
    const toolbar = document.createElement('nav'); toolbar.className = 'item-dock-toolbar'; toolbar.setAttribute('aria-label', '物品分類與翻頁');
    for (const category of ['全部', ...Object.keys(CATEGORY_STYLE)]) {
      const b = document.createElement('button'); b.textContent = category; b.dataset.category = category;
      b.className = category === this.category ? 'on' : ''; b.setAttribute('aria-pressed', String(category === this.category)); toolbar.append(b);
    }
    const pager = document.createElement('span'); pager.className = 'item-dock-pager';
    for (const [label, delta] of [['上一排', -1], ['下一排', 1]] as const) {
      const b = document.createElement('button'); b.textContent = delta < 0 ? '‹' : '›'; b.setAttribute('aria-label',label); b.dataset.page = String(delta); b.disabled = delta < 0 ? !this.page : this.page === pages - 1; pager.append(b);
      if (delta < 0) { const count = document.createElement('span'); count.textContent = `${this.page + 1}/${pages}`; pager.append(count); }
    }
    toolbar.append(pager); this.el.append(toolbar);
    const names = document.createElement('div'); names.className = 'item-dock-names'; names.setAttribute('aria-label','物品簡稱');
    const row = document.createElement('div'); row.className = 'item-dock-row';
    for (const { item, count, reason } of shown) {
      const caption=document.createElement('span');caption.textContent=shortItemName(item.defId);caption.className=`item-short-name${reason?' unavailable':''}${s.selected===item.uid?' selected':''}`;names.append(caption);
      const d = ITEM_DEFS[item.defId], b = document.createElement('button'); b.className = 'item-slot'; b.dataset.uid = item.uid;
      b.disabled = !!reason; b.classList.toggle('selected', s.selected === item.uid);
      b.setAttribute('aria-label', `${itemName(item.defId,item.tier)} ×${count}${reason ? '，' + reason : ''}`);
      b.setAttribute('aria-pressed',String(s.selected === item.uid)); b.title = `${itemName(item.defId,item.tier)} ×${count}\n${d.desc(item.tier)}\n${requirementText(item)}${reason ? '\n' + reason : ''}`;
      b.style.setProperty('--item-tier', d.price.length > 1 ? TIER_COLORS[item.tier] : CATEGORY_STYLE[d.category].color);
      const img = document.createElement('img'); img.src = itemIconUrl(item.defId); img.alt = d.name; img.draggable = false; b.append(img);
      if (d.price.length > 1) { const badge = document.createElement('small'); badge.className = 'item-grade'; badge.textContent = PILL_GRADES[item.tier]; b.append(badge); }
      const qty = document.createElement('span'); qty.className = 'item-quantity'; qty.textContent = String(count); b.append(qty); row.append(b);
    }
    if (!shown.length) { const empty = document.createElement('span'); empty.className = 'item-dock-empty'; empty.textContent = '沒有此類物品'; row.append(empty); }
    this.el.append(names,row);
    const hint = document.createElement('div'); hint.className = 'item-dock-hint'; const text = document.createElement('span'); text.textContent = s.hint; hint.append(text);
    if (s.selected) { const cancel = document.createElement('button'); cancel.dataset.cancel = 'true'; cancel.textContent = '取消 · Esc'; hint.append(cancel); }
    this.el.append(hint);
    if (s.choices.length) {
      const tray = document.createElement('div'); tray.className = 'item-target-tray'; tray.setAttribute('aria-label', '物品施放者與目標');
      for (const choice of s.choices) {
        const b = document.createElement('button'); b.dataset.choice = choice.id; b.setAttribute('aria-disabled',String(!!choice.disabled)); b.className = `${choice.selected?'selected ':''}${choice.disabled?'unavailable':''}`; b.dataset.tip = choice.tip || choice.name;
        if (choice.img) { const image = document.createElement('img'); image.src = choice.img; image.alt = ''; b.append(image); }
        const name = document.createElement('span'); name.textContent = choice.name; b.append(name); b.setAttribute('aria-label',choice.name); tray.append(b);
      }
      this.el.prepend(tray);
    }
  }
}

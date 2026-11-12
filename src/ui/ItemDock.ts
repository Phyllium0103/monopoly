import type { Item } from '../game/types';
import { ITEM_DEFS, PILL_GRADES, itemName } from '../data/items';
import { CATEGORY_STYLE } from './ItemUI';
import { itemIconUrl } from './Icons';
import { SPECIAL_ITEM_STORAGE } from '../systems/DirectItems';
import { requirementText } from '../systems/ItemSystem';
import { shortItemName } from '../data/itemLabels';
import { sortItemStacks, type ItemStack } from './itemDockOrder';
import { uiViewportSize } from './UiViewport';
import './item-dock.css';
import './technique-roster.css';
import { itemDetail, enableItemDetails } from './ItemDetail';

export interface ItemDockChoice { id: string; name: string; img?: string; tip?: string; tipHtml?: string; disabled?: boolean; selected?: boolean }
export interface ItemDockState {
  items: Item[]; visible: boolean; battle: boolean; selected: string | null; hint: string;
  choices: ItemDockChoice[];
  disabled(item: Item): string;
  pick(item: Item): void; choose(id: string): void; cancel(): void;
}
/** One image row showing 15 stacks at a time (10 on small windows); drag or wheel to scroll the rest. */
export class ItemDock {
  readonly el = document.createElement('section');
  private category = '全部'; private columns = 15;
  private state: ItemDockState | null = null; private key = '';
  private drag: { x:number; y:number; scroll:number; pointerId:number; moved:boolean } | null = null;
  private list: HTMLElement | null = null;
  private suppressClick = false;
  constructor(private hud: HTMLElement) {
    enableItemDetails();
    this.el.className = 'item-dock hidden'; this.el.setAttribute('aria-label', '物品快捷列');
    hud.append(this.el);
    new ResizeObserver(() => {
      const { scale } = uiViewportSize();
      const width = this.el.getBoundingClientRect().width / scale;
      const columns = width >= 720 ? 15 : 10;
      if (columns !== this.columns) { this.columns = columns; this.key = ''; this.paint(); }
      this.updateEdges();
      const height = this.el.classList.contains('hidden') ? 0 : this.el.getBoundingClientRect().height / scale;
      hud.style.setProperty('--item-dock-height', `${Math.round(height)}px`);
      hud.parentElement?.style.setProperty('--item-dock-height', `${Math.round(height)}px`);
    }).observe(this.el);
    this.el.addEventListener('click',event=>{
      if(this.suppressClick){this.suppressClick=false;event.preventDefault();event.stopImmediatePropagation();}
    },true);
    this.el.addEventListener('wheel',event=>{
      const list=this.list;
      if(!list||list.scrollWidth<=list.clientWidth||(event.target as HTMLElement).closest('.item-target-tray'))return;
      event.preventDefault();event.stopPropagation();
      const delta=Math.abs(event.deltaX)>Math.abs(event.deltaY)?event.deltaX:event.deltaY;
      list.scrollLeft+=event.deltaMode===1?delta*16:delta;
    },{passive:false});
    this.el.addEventListener('pointerdown',event=>{
      if(event.button!==0||!this.list||!(event.target as HTMLElement).closest('.item-dock-list'))return;
      this.drag={x:event.clientX,y:event.clientY,scroll:this.list.scrollLeft,pointerId:event.pointerId,moved:false};
    });
    this.el.addEventListener('pointermove',event=>{
      const d=this.drag,list=this.list;if(!d||!list||d.pointerId!==event.pointerId)return;
      const dx=event.clientX-d.x;
      if(!d.moved&&Math.abs(dx)>6&&Math.abs(dx)>Math.abs(event.clientY-d.y)){
        d.moved=true;this.el.setPointerCapture(event.pointerId);this.el.classList.add('dragging');
      }
      // 介面整體有縮放，換回邏輯座標，物品才會緊貼著滑鼠
      if(d.moved){event.preventDefault();list.scrollLeft=d.scroll-dx/uiViewportSize().scale;}
    });
    const endDrag=()=>{
      const d=this.drag;this.drag=null;this.el.classList.remove('dragging');
      if(d?.moved){this.suppressClick=true;setTimeout(()=>{this.suppressClick=false;},0);}
    };
    this.el.addEventListener('pointerup',event=>{if(this.drag?.pointerId===event.pointerId)endDrag();});
    this.el.addEventListener('pointercancel',event=>{if(this.drag?.pointerId===event.pointerId)endDrag();});
    this.el.addEventListener('scroll',()=>this.updateEdges(),{capture:true,passive:true});
    this.el.addEventListener('click', event => {
      const b = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
      if (!b || !this.state || b.disabled) return;
      if (b.dataset.category) { this.category = b.dataset.category; if (this.list) this.list.scrollLeft = 0; this.state.cancel(); this.paint(); }
      else if (b.dataset.uid) { const item = this.state.items.find(i => i.uid === b.dataset.uid); if (item) this.state.pick(item); }
      else if (b.dataset.choice) this.state.choose(b.dataset.choice);
      else if (b.dataset.cancel) this.state.cancel();
    });
  }
  /** 左右還有物品時，該側邊緣淡出提示 */
  private updateEdges(){
    const list=this.list;if(!list)return;
    const max=list.scrollWidth-list.clientWidth;
    list.classList.toggle('more-left',list.scrollLeft>1);
    list.classList.toggle('more-right',list.scrollLeft<max-1);
  }
  render(state: ItemDockState) { this.state = state; this.paint(); }
  private paint() {
    const s = this.state; if (!s) return;
    this.el.classList.toggle('hidden', !s.visible); this.hud.classList.toggle('item-dock-present', s.visible);
    this.hud.classList.toggle('item-battle',s.battle);
    if (!s.visible) return;
    const groups = new Map<string, ItemStack>();
    for (const item of s.items) {
      if (SPECIAL_ITEM_STORAGE.has(item.defId) || (this.category !== '全部' && ITEM_DEFS[item.defId].category !== this.category)) continue;
      const id = `${item.defId}:${item.tier}`, stack = groups.get(id);
      if (stack) stack.count++; else groups.set(id, { item, count: 1, reason: s.disabled(item) });
    }
    const shown = sortItemStacks([...groups.values()]);
    const key = JSON.stringify([this.category, this.columns, s.selected, s.hint, s.choices, shown.map(x => [x.item.uid,x.item.defId,x.item.tier,x.count,x.reason])]);
    if (key === this.key) return; this.key = key;
    const scrollLeft = this.list?.scrollLeft ?? 0;
    this.el.replaceChildren(); this.el.style.setProperty('--item-columns', String(this.columns));
    this.el.style.setProperty('--item-count', String(Math.max(1, shown.length)));
    const toolbar = document.createElement('nav'); toolbar.className = 'item-dock-toolbar'; toolbar.setAttribute('aria-label', '物品分類');
    for (const category of ['全部', ...Object.keys(CATEGORY_STYLE)]) {
      const b = document.createElement('button'); b.textContent = category; b.dataset.category = category;
      b.className = category === this.category ? 'on' : ''; b.setAttribute('aria-pressed', String(category === this.category)); toolbar.append(b);
    }
    this.el.append(toolbar);
    const names = document.createElement('div'); names.className = 'item-dock-names'; names.setAttribute('aria-label','物品簡稱');
    const row = document.createElement('div'); row.className = 'item-dock-row';
    for (const { item, count, reason } of shown) {
      const caption=document.createElement('span');caption.textContent=shortItemName(item.defId);caption.className=`item-short-name${reason?' unavailable':''}${s.selected===item.uid?' selected':''}`;names.append(caption);
      const d = ITEM_DEFS[item.defId], b = document.createElement('button'); b.className = 'item-slot'; b.dataset.uid = item.uid;
      b.disabled = !!reason; b.classList.toggle('selected', s.selected === item.uid);
      b.setAttribute('aria-label', `${itemName(item.defId,item.tier)} ×${count}${reason ? '，' + reason : ''}`);
      b.setAttribute('aria-pressed',String(s.selected === item.uid)); b.title = `${itemName(item.defId,item.tier)} ×${count}\n${d.desc(item.tier)}\n${requirementText(item)}${reason ? '\n' + reason : ''}`;
      const borderColors = ['#4d9463', '#367bb9', '#8854ad', '#b98826'];
      b.style.setProperty('--item-tier', d.price.length > 1 ? borderColors[item.tier] : 'transparent');
      b.dataset.itemDetail = itemDetail(item.defId,item.tier,`持有 ${count} 件${reason?' · '+reason:''}`);
      b.removeAttribute('title');
      const img = document.createElement('img'); img.src = itemIconUrl(item.defId); img.alt = d.name; img.draggable = false; b.append(img);
      if (d.price.length > 1) { const badge = document.createElement('small'); badge.className = 'item-grade'; badge.textContent = PILL_GRADES[item.tier]; b.append(badge); }
      const qty = document.createElement('span'); qty.className = 'item-quantity'; qty.textContent = String(count); b.append(qty); row.append(b);
    }
    if (!shown.length) { const empty = document.createElement('span'); empty.className = 'item-dock-empty'; empty.textContent = '沒有此類物品'; row.append(empty); }
    const list = document.createElement('div'); list.className = 'item-dock-list'; list.append(names, row);
    this.list = list; this.el.append(list); list.scrollLeft = scrollLeft; this.updateEdges();
    const hint = document.createElement('div'); hint.className = 'item-dock-hint'; const text = document.createElement('span'); text.textContent = s.hint; hint.append(text);
    if (s.selected) { const cancel = document.createElement('button'); cancel.dataset.cancel = 'true'; cancel.textContent = '取消 · Esc'; hint.append(cancel); }
    this.el.append(hint);
    if (s.choices.length) {
      const tray = document.createElement('div'); tray.className = 'item-target-tray'; tray.setAttribute('aria-label', '物品施放者與目標');
      for (const choice of s.choices) {
        const b = document.createElement('button'); b.dataset.choice = choice.id; b.setAttribute('aria-disabled',String(!!choice.disabled)); b.className = `${choice.selected?'selected ':''}${choice.disabled?'unavailable':''}`; b.dataset.tip = choice.tip || choice.name;
        if (choice.tipHtml) b.dataset.tipHtml = choice.tipHtml;
        if (choice.img) { const image = document.createElement('img'); image.src = choice.img; image.alt = ''; b.append(image); }
        const name = document.createElement('span'); name.textContent = choice.name; b.append(name); b.setAttribute('aria-label',choice.name); tray.append(b);
      }
      this.el.prepend(tray);
    }
  }
}

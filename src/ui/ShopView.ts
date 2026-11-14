import { bagHasRoom } from '../systems/EquipmentInventory';
import { techniqueIconUrl, armorItemDetail, techniqueItemDetail } from './RosterEquipment';
import './shop.css';
import './shop-fullscreen.css';
import './shop-counter.css';
import './shop-scenes.css';
import './shop-wallet.css';
import './shop-trade.css';
import { assetUrl } from '../data/assetUrl';
import { generalArtUrl } from '../data/generalArt';
import { itemName, techniqueBaseName, tierName } from '../data/items';
import type { Lord, General } from '../game/types';
import { fmtStones } from '../game/Currency';
import { SHOP_NAMES, SHOP_REFRESH_COSTS, type Offer, type ShopKind } from '../systems/ShopSystem';
import type { Dialog } from './Dialog';
import { itemInfoHtml } from './ItemUI';
import { detailCard, itemDetail, enableItemDetails } from './ItemDetail';
import { generalBlock, generalBrief, generalHoverTable } from './GeneralInfo';
import { beastIconUrl, equipIconUrl, itemIconUrl, portraitUrl } from './Icons';
import type { ShopAction, ShopPromptData } from '../engine/prompts';

const offerGroup = (o: Offer) => o.kind === 'revive' ? '還魂' : o.group;
const groupsOf = (offers: Offer[], kind?: ShopKind) => [...new Set([...offers.map(offerGroup).filter((g): g is string => !!g), ...(kind==='herb'&&offers.some(o=>o.kind==='revive'&&o.general.status==='dead')?['還魂']:[])])];

/** Measured painted ledge tops, in percentages of the complete scene. */
export const SHOP_STAGING:Record<ShopKind,{left:number;right:number;shelves:[number,number]}>={
  treasure:{left:29,right:89,shelves:[42,62.2]},herb:{left:28,right:91,shelves:[41.4,60.3]},
  forge:{left:33,right:91,shelves:[39.9,58.6]},library:{left:8,right:70,shelves:[47.5,64.3]},
  beast:{left:34,right:94,shelves:[43.4,60.7]},merchant:{left:29,right:89,shelves:[41.1,58.7]},
  tavern:{left:10.2,right:77.8,shelves:[63,63]},
};

/**
 * 商店介面：依引擎送來的資料繪製，玩家每按一次就回傳一個動作；
 * 引擎處理完再送來新的資料，視窗保持開著（分頁、捲動位置不變），直到離開。
 */
export class ShopPanel {
  private detail: HTMLDialogElement | null = null;
  private inventoryEvents: AbortController | null = null;
  private refreshView:{kind:ShopKind;tab:string;page:number}|null=null;
  private session: {
    body: HTMLDivElement;
    close: () => void;
    data: ShopPromptData;
    lord: Lord;
    resolve: ((a: ShopAction) => void) | null;
    mode: 'buy' | 'sell';
    tab: string;
    keepScroll: number;
    lastView: string;
    page: number;
  } | null = null;

  constructor(private dialog: Dialog, private inspectGeneral?: (g: General) => HTMLElement) { enableItemDetails(); }

  get isOpen() {
    return !!this.session;
  }

  /** 顯示商店並等待玩家的下一個動作 */
  ask(lord: Lord, data: ShopPromptData): Promise<ShopAction> {
    return new Promise((resolve) => {
      if (this.session && this.session.data.shopKind === data.shopKind) {
        const s = this.session;
        this.refreshView=null;
        // A transaction changes availability, balance and bag contents, not the scene.
        // Keep decoded merchandise images and their DOM in place between replies.
        const patch = s.mode === 'buy' && s.data.refreshes === data.refreshes &&
          !s.body.querySelector('.shop-row[data-kind=general],.shop-row[data-kind=revive]') &&
          s.data.offers.length === data.offers.length && s.data.offers.every((o,i)=>
            offerUid(o) === offerUid(data.offers[i]) && o.kind === data.offers[i].kind &&
            o.label === data.offers[i].label && o.price === data.offers[i].price && o.group === data.offers[i].group);
        s.data = data;
        s.lord = lord;
        s.resolve = resolve;
        const groups = groupsOf(data.offers, data.shopKind);
        if (!groups.includes(s.tab)&&!(data.shopKind==='herb'&&s.tab==='還魂')) s.tab = groups[0] ?? '';
        if (patch) this.updateTransaction(); else this.render();
        return;
      }
      const saved=this.refreshView?.kind===data.shopKind?this.refreshView:null;this.refreshView=null;
      this.close();
      const kind = data.shopKind;
      void this.dialog.custom<void>(
        SHOP_NAMES[kind],
        (body, done) => {
          this.session = { body, close: () => done(), data, lord, resolve, mode: 'buy', tab: saved?.tab??groupsOf(data.offers,kind)[0] ?? '', keepScroll: 0, lastView: '', page: saved?.page??0 };
          this.render();
        },
        true,
        () => this.act({ type: 'leave' }),
      );
    });
  }

  /** 關閉視窗（離開商店或流程中斷時） */
  close() {
    this.inventoryEvents?.abort();
    this.closeDetail();
    const s = this.session;
    if (!s) return;
    this.session = null;
    s.close();
  }

  private act(a: ShopAction) {
    const s = this.session;
    const r = s?.resolve;
    if (!s || !r) return;
    s.resolve = null;
    if(a.type==='refresh')this.refreshView={kind:s.data.shopKind,tab:s.tab,page:s.page};
    if(a.type==='leave')this.refreshView=null;
    if (a.type === 'buy') {
      const row=s.body.querySelector<HTMLElement>(`.shop-row[data-offer-index="${a.index}"]`);
      row?.classList.add('purchase-pending');
      row?.setAttribute('aria-busy','true');
    }
    s.body.querySelectorAll<HTMLButtonElement>('button').forEach(b=>b.disabled=true);
    if (a.type === 'leave') this.close();
    // Let the immediate acknowledgement paint before synchronous local engine work.
    if(a.type==='buy')requestAnimationFrame(()=>setTimeout(()=>r(a),0)); else r(a);
  }

  private updateTransaction() {
    const s=this.session;if(!s)return;
    const {body,data,lord}=s;
    // Read scroll offsets before changing styles/text to avoid forced layout mid-patch.
    const bagScroll=[...body.querySelectorAll<HTMLElement>('.shop-items-grid,.shop-equipment-grid')].map(e=>[e.className,e.scrollTop] as const);
    this.closeDetail();
    body.querySelector('.shop-wallet b')!.textContent=fmtStones(lord.stones);
    const sold=new Set(data.sold);
    body.querySelectorAll<HTMLElement>('.shop-row[data-offer-index]').forEach(row=>{
      const index=Number(row.dataset.offerIndex),o=data.offers[index];
      row.classList.remove('purchase-pending');row.removeAttribute('aria-busy');
      row.classList.toggle('sold',sold.has(index));
      const b=row.querySelector<HTMLButtonElement>('.sr-actions button')!;
      const full=(o.kind==='equipment'||o.kind==='technique')&&!bagHasRoom(lord);
      b.textContent=sold.has(index)?'售罄':'購買';
      b.disabled=sold.has(index)||full||lord.stones<o.price;
      this.purchaseHint(b.parentElement!,full&&!sold.has(index));
    });
    body.querySelectorAll<HTMLButtonElement>('.shop-tab,.shop-keeper-talk,.shop-pagination button').forEach(b=>b.disabled=false);
    const pageButtons=body.querySelectorAll<HTMLButtonElement>('.shop-pagination button');
    if(pageButtons.length){pageButtons[0].disabled=s.page===0;pageButtons[1].disabled=s.page>=Number(body.querySelector('.shop-pagination')!.getAttribute('data-pages'))-1;}
    const actions=body.querySelectorAll<HTMLButtonElement>('.dialog-buttons button');
    const cost=SHOP_REFRESH_COSTS[data.refreshes];
    actions[0].disabled=cost===undefined||lord.stones<cost;actions[1].disabled=false;
    const list=body.querySelector<HTMLElement>('.shop-workspace>.shop-list')!;
    body.querySelector('.shop-sale-strip')?.remove();
    this.renderInventory(body,list,data);
    this.mountInventory(body,body.querySelector<HTMLElement>('.dialog-buttons')!);
    for(const [name,top] of bagScroll){if(!top)continue;const grid=body.querySelector<HTMLElement>('.'+name);if(grid)grid.scrollTop=top;}
  }

  private mountInventory(body:HTMLElement,actions:HTMLElement) {
    const sale=document.createElement('section');sale.className='shop-sale-strip';
    const equipment=body.querySelector('.shop-equipment-tray'),inventory=body.querySelector('.shop-inventory');
    if(equipment)sale.append(equipment);if(inventory)sale.append(inventory);
    if(!sale.childElementCount)return;
    const label=document.createElement('div');label.className='shop-sale-heading';label.innerHTML='<strong>隨身行囊</strong>';sale.prepend(label);
    const status=sale.querySelector('.shop-sale-status')??body.querySelector('.shop-sale-status');if(status)sale.append(status);
    body.insertBefore(sale,actions);
  }

  private purchaseHint(actions:HTMLElement,full:boolean) {
    if(full)actions.dataset.itemDetail='<article class="item-detail-notice"><strong>行囊已滿</strong><p>先裝備或出售一件仙衣、功法，空出格子即可購買。</p></article>';
    else delete actions.dataset.itemDetail;
  }

  private render() {
    this.closeDetail();
    const s = this.session;
    if (!s) return;
    const { body, data, lord } = s;
    const kind = data.shopKind;
    body.closest('.dialog')!.classList.add('shop-window');
    (body.closest('.dialog') as HTMLElement).dataset.shop = kind;
    (body.closest('.dialog') as HTMLElement).dataset.signMount = ['beast','merchant'].includes(kind)?'hanging':'wall';
    (body.closest('.dialog') as HTMLElement).style.setProperty('--shop-scene',`url("${assetUrl('art/shops/scenes/'+kind+'.webp')}")`);
    // 買賣之後只更新內容；停留在同一個分頁時保留清單的捲動位置
    const view = `${s.mode}|${s.tab}`;
    const old = body.querySelector('.shop-list') as HTMLElement | null;
    if (old) s.keepScroll = old.scrollTop;
    if (view !== s.lastView) s.keepScroll = 0;
    s.lastView = view;
    const busy = !s.resolve;
    const groups = groupsOf(data.offers,kind);
    const reviving=kind==='herb'&&s.tab==='還魂';
    (body.closest('.dialog') as HTMLElement).classList.toggle('revival-sanctum',reviving);
    if(reviving)(body.closest('.dialog') as HTMLElement).style.setProperty('--shop-scene',`url("${assetUrl('art/shops/scenes/revival.webp')}")`);
    body.innerHTML = `<div class="wallet shop-wallet"><span>持有靈石</span><b>${fmtStones(lord.stones)}</b></div>`;
    if (s.mode === 'buy' && groups.length > 1) {
      const tabs = document.createElement('div');
      tabs.className = 'shop-tabs';
      for (const g of groups) {
        const t = document.createElement('button');
        t.className = `shop-tab ${g === s.tab ? 'on' : ''}`;
        t.textContent = `${g}（${data.offers.filter((o) => offerGroup(o) === g && (o.kind!=='revive'||o.general.status==='dead')).length}）`;
        t.setAttribute('aria-pressed',String(g===s.tab));
        t.onclick = () => {
          s.tab = g;
          s.page = 0;
          this.render();
        };
        tabs.appendChild(t);
      }
      body.appendChild(tabs);
    }
    const sold = new Set(data.sold);
    const list = document.createElement('div');
    list.className = 'shop-list';
    const visibleOffers: Offer[] = s.mode === 'sell' ? data.sellStock : data.offers;
    const matches = visibleOffers.map((o,i)=>({o,i})).filter(({o,i})=>(groups.length <= 1 || offerGroup(o) === s.tab)&&!(o.kind==='revive'&&(sold.has(i)||o.general.status!=='dead')));
    const pageSize = matches.some(({o}) => o.kind === 'general' || o.kind === 'revive') ? 4 : 10;
    list.classList.toggle('shop-people', matches.some(({o}) => o.kind === 'general' || o.kind === 'revive'));
    (body.closest('.dialog') as HTMLElement).classList.toggle('people-market',list.classList.contains('shop-people'));
    const pages = Math.max(1, Math.ceil(matches.length / pageSize));
    s.page = Math.min(s.page,pages-1);
    const shown = new Set(matches.slice(s.page*pageSize,s.page*pageSize+pageSize).map(({i})=>i));
    let staged=0;
    visibleOffers.forEach((o, i) => {
      if (!shown.has(i)) return;
      if (s.mode === 'buy' && groups.length > 1 && offerGroup(o) !== s.tab) return;
      const row = document.createElement('div');
      row.className = `shop-row ${s.mode === 'buy' && sold.has(i) ? 'sold' : ''}`;
      row.dataset.kind = o.kind;
      row.dataset.offerIndex = String(i);
      const isPerson=o.kind==='general'||o.kind==='revive';
      const stage=SHOP_STAGING[kind],slot=staged++,columns=isPerson?4:5;
      if(o.kind==='revive')row.style.setProperty('--mirror-x',[36.2,51.6,67,82.7][slot]+'%');
      const centers=kind==='tavern'?[18.5,35.3,52.6,69.4]:null;
      const x=centers?.[slot]??stage.left+(isPerson?(slot+.5)/Math.min(pageSize,matches.length):(slot%columns+.5)/columns)*(stage.right-stage.left);
      row.style.setProperty('--stall-x',x+'%');
      row.style.setProperty('--stall-y',(isPerson?kind==='tavern'?63:stage.shelves[0]+6:stage.shelves[Math.floor(slot/columns)])+'%');
      row.style.setProperty('--stall-width',((stage.right-stage.left)/columns-1.5)+'%');
      row.classList.toggle('revive-blocked',o.kind==='revive'&&data.revivedOther);
      const displayName = kind==='library'&&o.kind==='technique'?`${tierName(o.technique.tier,'階')}・${techniqueBaseName(o.technique)}`:o.label;
      const main = o.kind === 'item' ? `<div class="sr-main item-row"><div class="item-title">${itemName(o.item.defId, o.item.tier)}</div><small>${itemInfoHtml(o.item.defId, o.item.tier)}</small></div>`
        : o.kind === 'general' ? `<div class="sr-main"><b>${o.label}</b>${generalBlock(o.general, { note: o.general.origin === lord.id ? '<span class="tavern-perk">本國將領優惠</span>' : '' })}</div>`
          : o.kind === 'revive' ? `<div class="sr-main"><b>${o.label}</b>${generalBrief(o.general, '', { note: o.sub.split('｜').slice(1).join('｜') })}</div>`
            : `<div class="sr-main"><b>${displayName}</b><small>${o.sub}</small></div>`;
      const iconSrc = o.kind === 'general' ? generalArtUrl(o.general) : offerIcon(o);
      const portrait = iconSrc ? `<img class="sr-icon${o.kind === 'general' || o.kind === 'revive' ? ' general-portrait' : ''}" src="${iconSrc}" alt="" onerror="this.style.visibility='hidden'">` : '';
      const iconHtml=o.kind==='revive'?`<div class="shop-soul">${portrait}</div>`:portrait;
      row.innerHTML = `${iconHtml}<div class="shop-product-sign">${main}<div class="sr-price">${s.mode === 'sell' ? '+' : ''}${fmtStones(o.price)}</div></div>`;
      row.tabIndex = 0;
      if(isPerson)row.setAttribute('role', 'button');
      row.setAttribute('aria-label', `${o.label}，查看詳情`);
      const picture=row.querySelector<HTMLElement>('.sr-icon');
      if(picture){
        if(o.kind!=='general'&&o.kind!=='revive') picture.dataset.itemDetail=offerDetail(o,'buy');
        else picture.dataset.itemDetail=generalHoverTable(o.general,undefined,undefined,o.kind==='revive'?o.sub.split('｜').slice(1).join('<br>'):'',o.price,o.kind==='revive'?'還魂價格':'招募價格');
      }
      if (o.kind !== 'general' && o.kind !== 'revive') {
        const info = row.querySelector('small');
        if (info) { info.classList.add('shop-product-info'); row.setAttribute('aria-label', `${o.label}，${o.price}靈石`); }
      }
      // 按鈕固定放在右側一欄（招募在上、鎖定在下），文字變化不會擠壓左邊資訊
      const actions = document.createElement('div');
      actions.className = 'sr-actions';
      row.appendChild(actions);
      const b = document.createElement('button');
      b.className = 'btn primary mini';
      actions.appendChild(b);
      const otherRevive = o.kind === 'revive';
      const unavailable = o.kind === 'general' && (!!o.general.owner || o.general.status === 'dead');
      const blocked = unavailable || sold.has(i) || (kind === 'tavern' && data.recruited >= data.recruitLimit) || (otherRevive && data.revivedOther);
      b.textContent = sold.has(i) ? (o.kind === 'revive' ? '已復活' : '售罄') : kind === 'tavern' ? '招募' : o.kind === 'revive' ? '復活' : '購買';
      b.disabled = busy || blocked || lord.stones < o.price;
      const full=!sold.has(i)&&(o.kind==='equipment'||o.kind==='technique')&&!bagHasRoom(lord);
      if(full)b.disabled=true;
      this.purchaseHint(actions,full);
      if (otherRevive && data.revivedOther && !sold.has(i)) b.textContent = '一次一人';
      if (s.mode === 'sell') {
        b.textContent = '出售';
        b.disabled = busy;
      }
      b.onclick = async () => {
        if (s.mode === 'sell') return this.act({ type: 'sell', index: i });
        // 已有靈獸時需要再按一次確認
        if (o.kind === 'beast' && s.lord.beast) {
          if(!await this.confirmBeast(o.label))return;
          if(this.session!==s||!s.resolve)return;
        }
        this.act({ type: 'buy', index: i });
      };
      if (kind === 'tavern' && o.kind === 'general') {
        const locked = !!lord.tavernLocked?.includes(o.general.id);
        const lock = document.createElement('button'); lock.className = 'btn mini';
        // 切換：已鎖定時再按一次就是取消（價格不會再漲），不能連按累加
        lock.textContent = locked ? '已鎖定' : '鎖定';
        lock.classList.toggle('on', locked);
        lock.title = locked ? '點擊取消鎖定' : '鎖定後，刷新或下次進入聽風樓時這位仍會出現，招募價屆時 ×1.2';
        lock.disabled = busy || sold.has(i) || unavailable;
        lock.onclick = () => this.act({ type: 'lock', index: i });
        actions.appendChild(lock);
      }
      if(isPerson){
        row.onclick = e => { if (!(e.target as HTMLElement).closest('.sr-actions')) this.openDetail(o, actions, row); };
        row.onkeydown = e => { if(e.target===row&&(e.key==='Enter'||e.key===' ')){e.preventDefault();this.openDetail(o,actions,row);} };
      }
      list.appendChild(row);
    });
    if (!matches.length && s.tab!=='還魂') list.innerHTML = `<p class="muted">${s.mode === 'sell' ? '行囊中沒有本店可收購的物品。' : '目前沒有可購買的項目。'}</p>`;
    body.appendChild(list);
    const pagination = document.createElement('nav'); pagination.className='shop-pagination';
    pagination.dataset.pages=String(pages);
    if (pages > 1) {
      for (const direction of [-1,1]) {
        const button=document.createElement('button');button.className='btn mini';button.textContent=direction<0?'上一頁':'下一頁';
        button.disabled=s.page+direction<0||s.page+direction>=pages;
        button.onclick=()=>{s.page+=direction;this.render();};pagination.appendChild(button);
      }
      const label=document.createElement('span');label.textContent=`${s.page+1} / ${pages}`;pagination.insertBefore(label,pagination.lastChild);
    }
    body.appendChild(pagination);
    this.renderInventory(body, list, data);
    const row = document.createElement('div');
    row.className = 'dialog-buttons';
    const cost = SHOP_REFRESH_COSTS[data.refreshes];
    const refresh = document.createElement('button');
    refresh.className = 'btn primary';
    refresh.textContent = cost === undefined ? '刷新額度已用完（2/2）' : `刷新 ${fmtStones(cost)}（${data.refreshes}/2）`;
    refresh.disabled = busy || cost === undefined || lord.stones < cost;
    refresh.onclick = () => this.act({ type: 'refresh' });
    row.appendChild(refresh);
    const leave = document.createElement('button');
    leave.className = 'btn';
    leave.textContent = '離開';
    leave.disabled = busy;
    leave.onclick = () => this.act({ type: 'leave' });
    row.appendChild(leave);
    body.appendChild(row);
    const workspace=document.createElement('div');workspace.className='shop-workspace';
    const market=document.createElement('section');market.className='shop-market';
    const inventory=body.querySelector('.shop-inventory');
    const equipment=body.querySelector('.shop-equipment-tray');
    for(const child of [...body.children]) if(child!==inventory&&child!==row&&child!==equipment) market.appendChild(child);
    const keeper=document.createElement('aside');keeper.className='shop-keeper';
    const identities:Record<ShopKind,[string,string]>={treasure:['金掌櫃','四海珍奇，待君識寶。'],herb:['青蘅醫者','草木有靈，願君安康。'],forge:['鐵娘子','百煉成器，一諾千金。'],library:['守卷先生','書藏萬法，靜候有緣。'],tavern:['聽風樓主','一盞清茶，邀天下英雄。'],beast:['馴靈客','山林有伴，萬里同行。'],merchant:['西域行商','走過千山，帶來奇珍。']};
    keeper.innerHTML=`<div><small>${SHOP_NAMES[kind]}</small><h3>${identities[kind][0]}</h3><p>${identities[kind][1]}</p></div>`;
    const conversations: Record<ShopKind,string[]> = {
      treasure:['寶物各有用處，合你心意的，才是真正的珍寶。','陣法護住一城，符籙扭轉一局。主公今日想備哪一手？','行囊裡用不上的物件，也能在我這裡換些盤纏。'],
      herb:['征途再急，也別忘了照看將士的傷。','草木可以入藥，人心卻要慢慢養。願主公麾下皆能平安。','若有故人未歸，不妨去復活名簿看看。每次造訪，我只能救回一人。'],
      forge:['槌要握穩，火要看準。兵甲和做人一樣，容不得虛的。','這些衣甲都是仔細打磨過的。挑合身的，才能護住要害。','穿不上的仙衣、暫不用的功法，都拿來看看，我給你估個實價。'],
      library:['修行之道千萬條，與自身相合的，方能走得長遠。','先看增益，再讀功法的本領。選定之前，多思量一步。','書卷遇見有緣人，才算不負墨香。主公請慢慢挑。'],
      tavern:['風聲傳得快，英雄卻要當面識。主公看中了哪一位？','有些人擅衝鋒，有些人善理城。知人善任，勝過千金。','若怕錯過中意的人，可以先鎖定。下回來，我替你留座。'],
      beast:['小傢伙們認的是心意，可不是官印。主公先放鬆些。','山路遠，有個懂你的靈獸作伴，連風聲都不寂寞。','結伴便要善待。挑選之前，先看看牠能如何助你。'],
      merchant:['沙海看星，蜀道聽雨。我這一袋貨，可走了不少路。','天下物件各有去處。你用不上的，也許正是別人苦尋的。','買賣講個爽快，旅途圖個平安。主公慢挑，我不趕路。'],
    };
    const talk=document.createElement('button');talk.type='button';talk.className='shop-keeper-talk';talk.setAttribute('aria-label',`與${identities[kind][0]}交談`);
    keeper.prepend(talk);
    const speech=document.createElement('p');speech.className='shop-keeper-speech';speech.setAttribute('role','status');speech.hidden=true;keeper.appendChild(speech);
    let dialogueIndex=0;talk.onclick=()=>{speech.hidden=false;speech.textContent=conversations[kind][dialogueIndex++%conversations[kind].length];};
    workspace.append(keeper,market,list);body.prepend(workspace);
    this.mountInventory(body,row);
    for(const node of body.querySelectorAll<HTMLElement>('.sr-main,.shop-product-info')) {
      const walker=document.createTreeWalker(node,NodeFilter.SHOW_TEXT);
      while(walker.nextNode()) walker.currentNode.textContent=walker.currentNode.textContent!.replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu,'');
    }
    // 按鈕列都加進去、版面確定後才還原捲動位置（太早設定會被截成 0 或中間）
    const restore = s.keepScroll;
    list.scrollTop = restore;
    requestAnimationFrame(() => { list.scrollTop = restore; });
  }

  private renderInventory(body: HTMLElement, counter: HTMLElement, data: ShopPromptData) {
    this.inventoryEvents?.abort();this.inventoryEvents=new AbortController();
    const equipment=document.createElement('section');equipment.className='shop-equipment-tray';
    equipment.setAttribute('aria-label','可出售仙衣與功法');equipment.innerHTML='<div class="shop-equipment-grid"></div>';
    const inventory = document.createElement('section');
    inventory.className = 'shop-inventory';
    inventory.setAttribute('aria-label','可出售物品');inventory.innerHTML = '<p class="shop-sale-status" role="status" aria-live="polite"></p><div class="shop-items-grid"></div>';
    const selected = new Set<number>();
    const status = inventory.querySelector('.shop-sale-status')!;
    const showStatus=()=>{const total=[...selected].reduce((sum,i)=>sum+data.sellStock[i].price,0);status.innerHTML=`<span>左鍵選取並點擊貨架批量賣出 · 右鍵直接賣出</span><strong>選取總價 ${fmtStones(total)}</strong>`;};
    showStatus();
    const sellSelected = () => {
      if (!selected.size || !this.session?.resolve) return;
      const indices = [...selected]; selected.clear();
      counter.classList.remove('shop-sale-target');
      this.act(indices.length===1?{type:'sell',index:indices[0]}:{type:'sellBatch',indices});
    };
    counter.addEventListener('click', e => { if (selected.size) { e.preventDefault(); e.stopImmediatePropagation(); sellSelected(); } }, {capture:true,signal:this.inventoryEvents.signal});
    const append = (parent: Element, uid: string, name: string, icon: string) => {
      const index = data.sellStock.findIndex(o => offerUid(o) === uid);
      const cell = document.createElement('button'); cell.type = 'button'; cell.className = 'shop-bag-cell';
      cell.innerHTML = `<img src="${icon}" alt="" draggable="false"><span></span>`;
      cell.querySelector('span')!.textContent = name;
      cell.title = index < 0 ? `${name}：本店不收購` : `${name}：售價 ${fmtStones(data.sellStock[index].price)}`;
      cell.setAttribute('aria-label',cell.title);
      if(index>=0) { cell.dataset.itemDetail=offerDetail(data.sellStock[index],'sell');cell.removeAttribute('title'); }
      cell.classList.toggle('not-accepted',index < 0);
      cell.onclick = () => {
        if(index<0)return;
        if(selected.has(index))selected.delete(index);else selected.add(index);
        cell.classList.toggle('selected',selected.has(index));cell.setAttribute('aria-pressed',String(selected.has(index)));
        counter.classList.toggle('shop-sale-target',!!selected.size);
        showStatus();
      };
      cell.oncontextmenu = e => {e.preventDefault(); if(index >= 0) {if(!selected.has(index)){selected.clear();selected.add(index);}sellSelected();}};
      parent.appendChild(cell);
    };
    const items = inventory.querySelector('.shop-items-grid')!;
    for(const offer of data.sellStock.filter(o=>o.kind!=='equipment'&&o.kind!=='technique')) append(items,offerUid(offer),offer.label,offerIcon(offer));
    const gear=equipment.querySelector('.shop-equipment-grid')!;
    for(const offer of data.sellStock.filter(o=>o.kind==='equipment'||o.kind==='technique'))append(gear,offerUid(offer),offer.label,offerIcon(offer));
    while(gear.childElementCount<20){const cell=document.createElement('span');cell.className='shop-bag-cell empty';gear.append(cell);}
    if(!items.childElementCount) { items.textContent='暫無可出售物品'; (items as HTMLElement).style.display='block'; }
    body.onkeydown=e=>{if(e.key==='Escape'&&selected.size){e.stopPropagation();selected.clear();counter.classList.remove('shop-sale-target');body.querySelectorAll('.selected').forEach(el=>{el.classList.remove('selected');el.setAttribute('aria-pressed','false');});showStatus();}};
    if(data.sellStock.some(o=>o.kind!=='equipment'&&o.kind!=='technique'))body.appendChild(inventory);
    if(data.sellStock.some(o=>o.kind==='equipment'||o.kind==='technique')){body.appendChild(equipment);if(!status.isConnected)body.appendChild(status);}
  }

  private closeDetail() { this.detail?.close();this.detail?.remove();this.detail=null; }

  private confirmBeast(name:string):Promise<boolean> {
    this.closeDetail();
    return new Promise(resolve=>{
      const modal=document.createElement('dialog');modal.className='beast-replacement';this.detail=modal;
      modal.innerHTML='<h2>更換靈獸</h2><p>購入新靈獸後，舊靈獸將會放生。</p><strong></strong><div><button class="btn beast-keep">保留舊靈獸</button><button class="btn primary beast-replace">放生並購買</button></div>';
      modal.querySelector('strong')!.textContent=name;
      let answered=false;const finish=(yes:boolean)=>{if(answered)return;answered=true;if(this.detail===modal)this.detail=null;modal.close();modal.remove();resolve(yes);};
      modal.querySelector('.beast-keep')!.addEventListener('click',()=>finish(false));
      modal.querySelector('.beast-replace')!.addEventListener('click',()=>finish(true));
      modal.addEventListener('cancel',e=>{e.preventDefault();finish(false);});modal.addEventListener('close',()=>finish(false));
      document.body.append(modal);modal.showModal();
    });
  }

  private openDetail(o: Offer, actions: HTMLElement, source: HTMLElement) {
    if (!this.session?.resolve) return;
    this.closeDetail();
    const modal=document.createElement('dialog');modal.className='shop-detail';this.detail=modal;
    const person=o.kind==='general'||o.kind==='revive';
    const note=o.kind==='revive'?o.sub.split('｜').slice(1).join('<br>'):o.kind==='general'&&o.general.origin===this.session.lord.id?'本國將領優惠':'';
    modal.innerHTML=`<button class="shop-detail-close" aria-label="關閉詳情">×</button><div class="shop-detail-art"><img src="${person?generalArtUrl(o.general):offerIcon(o)}" alt=""></div><section class="shop-detail-copy"><small>${person?(o.kind==='revive'?'還魂 · 故人歸來':'聽風 · 英雄入席'):o.group??'珍品'}</small><h2>${o.label}</h2>${person?generalBlock(o.general,{note}):offerDetail(o,'buy')}<div class="shop-detail-actions"></div></section>`;
    const target=modal.querySelector('.shop-detail-actions')!;
    if(person&&this.inspectGeneral){
      modal.classList.add('shop-roster-detail');
      modal.querySelector('.shop-detail-art')!.remove();
      const content=document.createElement('div');content.className='general-modal-content';
      content.append(this.inspectGeneral(o.general));
      const price=document.createElement('span');price.className='dossier-recruit-price';price.textContent=`${o.kind==='revive'?'還魂':'招募'} ${fmtStones(o.price)}`;content.querySelector('.dossier-name>span')?.append('　',price);
      const copy=modal.querySelector('.shop-detail-copy')!;
      copy.querySelector('.gb')?.remove();copy.insertBefore(content,target);
      // Anchor the close control to the actual book, matching the roster's inner corner.
      content.querySelector('.dossier-book')?.append(modal.querySelector('.shop-detail-close')!);
      if(note){const info=document.createElement('p');info.className='shop-detail-reason';info.innerHTML=note;(content.querySelector('.folio-cultivation-record')??copy).appendChild(info);}
    }
    for(const original of actions.querySelectorAll<HTMLButtonElement>('button')) {
      const button=original.cloneNode(true) as HTMLButtonElement;
      if(original===actions.firstElementChild)button.textContent=`${original.textContent} · ${fmtStones(o.price)}`;
      if(original!==actions.firstElementChild&&o.kind==='general'){
        const locked=!!this.session.lord.tavernLocked?.includes(o.general.id);
        button.innerHTML=`<strong>${locked?'解除鎖定':'鎖定武將'}</strong><small>下次招募×1.2倍</small>`;
        button.setAttribute('aria-label',`${locked?'解除鎖定':'鎖定武將'}，下次招募×1.2倍`);
      }else{const parts=button.textContent!.split(' · ');button.innerHTML=`<strong>${parts[0]}</strong>${parts[1]?'<b>'+parts[1]+'</b>':''}`;}
      button.onclick=()=>{this.closeDetail();original.click();};target.append(button);
      if(original===actions.firstElementChild&&original.disabled&&o.kind!=='general'){const reason=document.createElement('p');reason.className='shop-detail-reason';reason.textContent=original.title||(this.session.lord.stones<o.price?'靈石不足':original.textContent==='售罄'?'此物品已售罄':'本次無法購買或復活此項目');modal.querySelector('.shop-detail-copy')!.insertBefore(reason,target);}
    }
    modal.querySelector('.shop-detail-close')!.addEventListener('click',()=>{this.closeDetail();source.focus();});
    modal.addEventListener('keydown',e=>e.stopPropagation());
    modal.addEventListener('cancel',e=>{e.preventDefault();this.closeDetail();source.focus();});
    const walker=document.createTreeWalker(modal,NodeFilter.SHOW_TEXT);
    while(walker.nextNode())walker.currentNode.textContent=walker.currentNode.textContent!.replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu,'');
    document.body.append(modal);modal.showModal();
  }
}

function offerUid(o: Offer): string {
  return o.kind==='item'?o.item.uid:o.kind==='equipment'?o.equipment.uid:o.kind==='technique'?o.technique.uid:o.kind==='beast'?o.beast.uid:'';
}
function offerDetail(o:Offer,mode:'buy'|'sell'):string {
  const footer={label:mode==='sell'?'出售可得':'購買價格',price:fmtStones(o.price)};
  if(o.kind==='item')return itemDetail(o.item.defId,o.item.tier,footer);
  if(o.kind==='technique')return techniqueItemDetail(o.technique,false,footer);
  if(o.kind==='equipment')return armorItemDetail(o.equipment,footer);
  return detailCard(o.label,'靈獸',offerIcon(o),`<p>${o.sub.replace(/｜/g,'<br>').replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu,'')}</p>`,footer);
}
function offerIcon(o: Offer): string {
  return o.kind==='item'?itemIconUrl(o.item.defId):o.kind==='equipment'?equipIconUrl(o.equipment):o.kind==='technique'?techniqueIconUrl(o.technique):o.kind==='beast'?beastIconUrl(o.beast):o.kind==='general'||o.kind==='revive'?portraitUrl(o.general):'';
}

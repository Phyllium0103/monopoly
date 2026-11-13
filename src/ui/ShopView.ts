import { bagHasRoom } from '../systems/EquipmentInventory';
import { techniqueIconUrl } from './RosterEquipment';
import './shop.css';
import './shop-fullscreen.css';
import './shop-counter.css';
import { assetUrl } from '../data/assetUrl';
import { generalArtUrl } from '../data/generalArt';
import { itemName, equipStats } from '../data/items';
import type { Lord, General } from '../game/types';
import { fmtStones } from '../game/Currency';
import { SHOP_NAMES, SHOP_REFRESH_COSTS, type Offer, type ShopKind } from '../systems/ShopSystem';
import type { Dialog } from './Dialog';
import { itemInfoHtml } from './ItemUI';
import { detailCard, itemDetail, enableItemDetails, emphasizeTechnique } from './ItemDetail';
import { generalBlock, generalBrief } from './GeneralInfo';
import { beastIconUrl, equipIconUrl, itemIconUrl, portraitUrl } from './Icons';
import type { ShopAction, ShopPromptData } from '../engine/prompts';

const SHOP_DESC: Record<ShopKind, string> = {
  treasure: '法器、陣法、符籙，可在擲骰前或戰鬥中使用。',
  herb: '丹藥、靈根丹與還魂丹。每次造訪只能復活一位武將；自己的亡將價格減半、境界降一階，其他主公的亡將境界降兩階（天賦效果另計）。',
  forge: '販售仙衣，增加防禦與血量，部分款式提升武力或技藝；品階越高，所需境界越高。',
  library: '每位武將只能修習一種功法；五行靈根只可學對應五行功法，天靈根不限；煉丹、煉器、畫符、佈陣功法不限靈根；廢靈根不能學。',
  beast: '每位主公只能擁有一隻靈獸，新購入的會取代舊的。',
  tavern: '每次只能招募一位。本國將領價格較低。',
  merchant: '西域商隊帶來的地階、天階稀有貨品，一律 5 折，商路暢通期間再七折。',
};

const groupsOf = (offers: Offer[], kind?: ShopKind) => [...new Set([...offers.map((o) => o.group).filter((g): g is string => !!g), ...(kind==='herb'?['復活・自己的亡將','復活・其他主公的亡將']:[])])];

/**
 * 商店介面：依引擎送來的資料繪製，玩家每按一次就回傳一個動作；
 * 引擎處理完再送來新的資料，視窗保持開著（分頁、捲動位置不變），直到離開。
 */
export class ShopPanel {
  private detail: HTMLDialogElement | null = null;
  private session: {
    body: HTMLDivElement;
    close: () => void;
    data: ShopPromptData;
    lord: Lord;
    resolve: ((a: ShopAction) => void) | null;
    mode: 'buy' | 'sell';
    tab: string;
    confirmBeast: number;
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
        s.data = data;
        s.lord = lord;
        s.resolve = resolve;
        const groups = groupsOf(data.offers, data.shopKind);
        if (!groups.includes(s.tab)) s.tab = groups[0] ?? '';
        this.render();
        return;
      }
      this.close();
      const kind = data.shopKind;
      void this.dialog.custom<void>(
        SHOP_NAMES[kind],
        (body, done) => {
          this.session = { body, close: () => done(), data, lord, resolve, mode: 'buy', tab: groupsOf(data.offers,kind)[0] ?? '', confirmBeast: -1, keepScroll: 0, lastView: '', page: 0 };
          this.render();
        },
        true,
        () => this.act({ type: 'leave' }),
      );
    });
  }

  /** 關閉視窗（離開商店或流程中斷時） */
  close() {
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
    if (a.type === 'leave') this.close();
    r(a);
  }

  private render() {
    this.closeDetail();
    const s = this.session;
    if (!s) return;
    const { body, data, lord } = s;
    const kind = data.shopKind;
    body.closest('.dialog')!.classList.add('shop-window');
    (body.closest('.dialog') as HTMLElement).dataset.shop = kind;
    // 買賣之後只更新內容；停留在同一個分頁時保留清單的捲動位置
    const view = `${s.mode}|${s.tab}`;
    const old = body.querySelector('.shop-list') as HTMLElement | null;
    if (old) s.keepScroll = old.scrollTop;
    if (view !== s.lastView) s.keepScroll = 0;
    s.lastView = view;
    const busy = !s.resolve;
    const groups = groupsOf(data.offers,kind);
    body.innerHTML = `${kind === 'treasure' ? '' : `<p class="dialog-text">${kind === 'tavern' ? `每次最多招募 ${data.recruitLimit} 位。本國將領價格較低。鎖定後刷新或下次進入會保留，保留時招募價 ×1.2。` : SHOP_DESC[kind]}</p>`}<div class="wallet">持有靈石：<b>${fmtStones(lord.stones)}</b></div>`;
    if (s.mode === 'sell') {
      const note = document.createElement('p');
      note.className = 'muted';
      note.textContent = '僅收購本店對應物品；已裝備的仙衣請先卸下。靈獸出售後會離隊。';
      body.appendChild(note);
    }
    if (s.mode === 'buy' && groups.length > 1) {
      const tabs = document.createElement('div');
      tabs.className = 'shop-tabs';
      for (const g of groups) {
        const t = document.createElement('button');
        t.className = `shop-tab ${g === s.tab ? 'on' : ''}`;
        t.textContent = `${g}（${data.offers.filter((o) => o.group === g).length}）`;
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
    const matches = visibleOffers.map((o,i)=>({o,i})).filter(({o,i})=>(groups.length <= 1 || o.group === s.tab)&&!(o.kind==='revive'&&(sold.has(i)||o.general.status!=='dead')));
    const pageSize = matches.some(({o}) => o.kind === 'general' || o.kind === 'revive') ? 4 : 10;
    list.classList.toggle('shop-people', matches.some(({o}) => o.kind === 'general' || o.kind === 'revive'));
    const pages = Math.max(1, Math.ceil(matches.length / pageSize));
    s.page = Math.min(s.page,pages-1);
    const shown = new Set(matches.slice(s.page*pageSize,s.page*pageSize+pageSize).map(({i})=>i));
    visibleOffers.forEach((o, i) => {
      if (!shown.has(i)) return;
      if (s.mode === 'buy' && groups.length > 1 && o.group !== s.tab) return;
      const row = document.createElement('div');
      row.className = `shop-row ${s.mode === 'buy' && sold.has(i) ? 'sold' : ''}`;
      row.dataset.kind = o.kind;
      const isPerson=o.kind==='general'||o.kind==='revive';
      row.classList.toggle('revive-blocked',o.kind==='revive'&&data.revivedOther);
      const main = o.kind === 'item' ? `<div class="sr-main item-row"><div class="item-title">${itemName(o.item.defId, o.item.tier)}</div><small>${itemInfoHtml(o.item.defId, o.item.tier)}</small></div>`
        : o.kind === 'general' ? `<div class="sr-main"><b>${o.label}</b>${generalBlock(o.general, { note: o.general.origin === lord.id ? '<span class="tavern-perk">本國將領優惠</span>' : '' })}</div>`
          : o.kind === 'revive' ? `<div class="sr-main"><b>${o.label}</b>${generalBrief(o.general, '', { note: o.sub.split('｜').slice(1).join('｜') })}</div>`
            : `<div class="sr-main"><b>${o.label}</b><small>${o.sub}</small></div>`;
      const iconSrc = o.kind === 'general' ? generalArtUrl(o.general) : offerIcon(o);
      const iconHtml = iconSrc ? `<img class="sr-icon${o.kind === 'general' || o.kind === 'revive' ? ' general-portrait' : ''}" src="${iconSrc}" alt="" onerror="this.style.visibility='hidden'">` : '';
      row.innerHTML = `${iconHtml}${main}<div class="sr-price">${s.mode === 'sell' ? '+' : ''}${fmtStones(o.price)}</div>`;
      row.tabIndex = 0;
      if(isPerson)row.setAttribute('role', 'button');
      row.setAttribute('aria-label', `${o.label}，查看詳情`);
      if(o.kind!=='general'&&o.kind!=='revive') row.dataset.itemDetail=offerDetail(o,`購買價格 · ${fmtStones(o.price)}`);
      else row.dataset.itemDetail=detailCard(o.general.name,'武將',portraitUrl(o.general),generalBlock(o.general,{note:o.kind==='revive'?o.sub.split('｜').slice(1).join('<br>'):''}));
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
      if ((o.kind === 'equipment' || o.kind === 'technique') && !bagHasRoom(lord)) { b.disabled = true; b.textContent = '行囊已滿'; b.title = '請先裝備或出售物品，空出一格'; }
      if (s.confirmBeast === i) b.textContent = '放生舊靈獸並購買？';
      if (otherRevive && data.revivedOther && !sold.has(i)) b.textContent = '一次一人';
      if (s.mode === 'sell') {
        b.textContent = '出售';
        b.disabled = busy;
      }
      b.onclick = () => {
        if (s.mode === 'sell') return this.act({ type: 'sell', index: i });
        // 已有靈獸時需要再按一次確認
        if (o.kind === 'beast' && lord.beast && s.confirmBeast !== i) {
          s.confirmBeast = i;
          this.render();
          return;
        }
        s.confirmBeast = -1;
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
    if (!matches.length) list.innerHTML = `<p class="muted">${s.tab.startsWith('復活')?'無可復活武將':s.mode === 'sell' ? '行囊中沒有本店可收購的物品。' : '目前沒有可購買的項目。'}</p>`;
    body.appendChild(list);
    const pagination = document.createElement('nav'); pagination.className='shop-pagination';
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
    keeper.innerHTML=`<img src="${assetUrl('art/shops/keeper-'+kind+'.webp')}" alt="${identities[kind][0]}"><div><small>${SHOP_NAMES[kind]}</small><h3>${identities[kind][0]}</h3><p>${identities[kind][1]}</p></div>`;
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
    keeper.querySelector('img')!.replaceWith(talk);talk.appendChild(Object.assign(document.createElement('img'),{src:assetUrl('art/shops/keeper-'+kind+'.webp'),alt:identities[kind][0]}));
    const speech=document.createElement('p');speech.className='shop-keeper-speech';speech.setAttribute('role','status');speech.hidden=true;keeper.appendChild(speech);
    let dialogueIndex=0;talk.onclick=()=>{speech.hidden=false;speech.textContent=conversations[kind][dialogueIndex++%conversations[kind].length];};
    workspace.append(keeper,market);body.prepend(workspace);
    const sale=document.createElement('section');sale.className='shop-sale-strip';
    if(equipment)sale.append(equipment);if(inventory)sale.append(inventory);
    if(sale.childElementCount)body.insertBefore(sale,row);
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
    const equipment=document.createElement('section');equipment.className='shop-equipment-tray';
    equipment.innerHTML='<header>仙衣與功法 <small>共用行囊 · 20 格</small></header><div class="shop-equipment-grid"></div>';
    const inventory = document.createElement('section');
    inventory.className = 'shop-inventory';
    inventory.innerHTML = '<header><h3>可出售物品</h3><span>選取後點貨架出售 · 或右鍵出售</span></header><p class="shop-sale-status" role="status">僅顯示本店收購的物品。</p><div class="shop-items-grid"></div>';
    const selected = new Set<number>();
    const status = inventory.querySelector('.shop-sale-status')!;
    const sellSelected = () => {
      if (!selected.size || !this.session?.resolve) return;
      const indices = [...selected]; selected.clear();
      counter.classList.remove('shop-sale-target');
      this.act(indices.length===1?{type:'sell',index:indices[0]}:{type:'sellBatch',indices});
    };
    counter.addEventListener('click', e => { if (selected.size) { e.preventDefault(); e.stopImmediatePropagation(); sellSelected(); } }, true);
    const append = (parent: Element, uid: string, name: string, icon: string) => {
      const index = data.sellStock.findIndex(o => offerUid(o) === uid);
      const cell = document.createElement('button'); cell.type = 'button'; cell.className = 'shop-bag-cell';
      cell.innerHTML = `<img src="${icon}" alt="" draggable="false"><span></span>`;
      cell.querySelector('span')!.textContent = name;
      cell.title = index < 0 ? `${name}：本店不收購` : `${name}：售價 ${fmtStones(data.sellStock[index].price)}`;
      cell.setAttribute('aria-label',cell.title);
      if(index>=0) { cell.dataset.itemDetail=offerDetail(data.sellStock[index],`出售可得 · ${fmtStones(data.sellStock[index].price)}`);cell.removeAttribute('title'); }
      cell.classList.toggle('not-accepted',index < 0);
      cell.onclick = () => {
        if(index<0)return;
        if(selected.has(index))selected.delete(index);else selected.add(index);
        cell.classList.toggle('selected',selected.has(index));cell.setAttribute('aria-pressed',String(selected.has(index)));
        counter.classList.toggle('shop-sale-target',!!selected.size);
        const total=[...selected].reduce((sum,i)=>sum+data.sellStock[i].price,0);
        status.textContent=selected.size?`已選 ${selected.size} 件 · 可得 ${fmtStones(total)}，點貨架一次出售。`:'已取消選取。';
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
    body.onkeydown=e=>{if(e.key==='Escape'&&selected.size){e.stopPropagation();selected.clear();counter.classList.remove('shop-sale-target');body.querySelectorAll('.selected').forEach(el=>{el.classList.remove('selected');el.setAttribute('aria-pressed','false');});status.textContent='已取消選取。';}};
    if(data.sellStock.some(o=>o.kind!=='equipment'&&o.kind!=='technique'))body.appendChild(inventory);
    if(data.sellStock.some(o=>o.kind==='equipment'||o.kind==='technique'))body.appendChild(equipment);
  }

  private closeDetail() { this.detail?.close();this.detail?.remove();this.detail=null; }

  private openDetail(o: Offer, actions: HTMLElement, source: HTMLElement) {
    if (!this.session?.resolve) return;
    this.closeDetail();
    const modal=document.createElement('dialog');modal.className='shop-detail';this.detail=modal;
    const person=o.kind==='general'||o.kind==='revive';
    const note=o.kind==='revive'?o.sub.split('｜').slice(1).join('<br>'):o.kind==='general'&&o.general.origin===this.session.lord.id?'本國將領優惠':'';
    modal.innerHTML=`<button class="shop-detail-close" aria-label="關閉詳情">×</button><div class="shop-detail-art"><img src="${person?generalArtUrl(o.general):offerIcon(o)}" alt=""></div><section class="shop-detail-copy"><small>${person?(o.kind==='revive'?'還魂 · 故人歸來':'聽風 · 英雄入席'):o.group??'珍品'}</small><h2>${o.label}</h2>${person?generalBlock(o.general,{note}):offerDetail(o,`購買價格 · ${fmtStones(o.price)}`)}<div class="shop-detail-actions"></div></section>`;
    const target=modal.querySelector('.shop-detail-actions')!;
    if(person&&this.inspectGeneral){
      modal.classList.add('shop-roster-detail');
      modal.querySelector('.shop-detail-art')!.remove();
      const content=document.createElement('div');content.className='general-modal-content';
      content.append(this.inspectGeneral(o.general));
      const copy=modal.querySelector('.shop-detail-copy')!;
      copy.querySelector('.gb')?.remove();copy.insertBefore(content,target);
      if(note){const info=document.createElement('p');info.className='shop-detail-reason';info.innerHTML=note;copy.insertBefore(info,target);}
    }
    for(const original of actions.querySelectorAll<HTMLButtonElement>('button')) {
      const button=original.cloneNode(true) as HTMLButtonElement;
      if(original===actions.firstElementChild)button.textContent=`${original.textContent} · ${fmtStones(o.price)}`;
      button.onclick=()=>{this.closeDetail();original.click();};target.append(button);
      if(original===actions.firstElementChild&&original.disabled){const reason=document.createElement('p');reason.className='shop-detail-reason';reason.textContent=original.title||(this.session.lord.stones<o.price?'靈石不足':original.textContent==='售罄'?'此物品已售罄':o.kind==='general'?'已達本次招募上限，或此人已出仕':'本次無法購買或復活此項目');modal.querySelector('.shop-detail-copy')!.insertBefore(reason,target);}
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
function offerDetail(o:Offer,footer:string):string {
  if(o.kind==='item')return itemDetail(o.item.defId,o.item.tier,footer);
  let description=o.sub;
  if(o.kind==='technique')description=emphasizeTechnique(description);
  if(o.kind==='equipment'){const stats=equipStats(o.equipment);description=description.replace(stats,`<span class="equipment-main-bonus">${stats}</span>`);}
  return detailCard(o.label,o.kind==='equipment'?'仙衣':o.kind==='technique'?'功法':'靈獸',offerIcon(o),`<h4>能力與效果</h4><p>${description.replace(/｜/g,'<br>').replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu,'')}</p>`,footer);
}
function offerIcon(o: Offer): string {
  return o.kind==='item'?itemIconUrl(o.item.defId):o.kind==='equipment'?equipIconUrl(o.equipment):o.kind==='technique'?techniqueIconUrl(o.technique):o.kind==='beast'?beastIconUrl(o.beast):o.kind==='general'||o.kind==='revive'?portraitUrl(o.general):'';
}

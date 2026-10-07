import { lordHas } from '../data/passives';
import type { GameState, Lord } from '../game/types';
import { fmtStones } from '../game/Currency';
import { SHOP_NAMES, SHOP_REFRESH_COSTS, beginShopVisit, refreshShop, lockTavernGeneral, buy, makeSellStock, sell, type SaleOffer, type Offer, type ShopKind } from '../systems/ShopSystem';
import { TILE_INFO } from '../data/board';
import type { Dialog } from './Dialog';
import { itemInfoHtml, itemLabel } from './ItemUI';
import { beastIconUrl, equipIconUrl, itemIconUrl, portraitUrl } from './Icons';

const SHOP_DESC: Record<ShopKind, string> = {
  treasure: '法器、陣法、符籙，可在擲骰前或戰鬥中使用。',
  herb: '丹藥、靈根丹與還魂丹。丹師也能讓亡者還陽：自己麾下的亡將便宜一半、境界降一階；其他主公的亡將境界降兩階，且一次只能復活一人。',
  forge: '神器加武力、寶衣加防禦與血量。品階越高越強，也需要越高境界。',
  library: '每位武將只能修習一種功法；五行靈根只可學對應功法，天靈根不限，廢靈根不能學。',
  beast: '每位主公只能擁有一隻靈獸，新購入的會取代舊的。',
  tavern: '每次只能招募一位。本國將領價格較低。',
  merchant: '西域商隊帶來的地階、天階稀有貨品，一律 5 折，商路暢通期間再七折。',
};

/** 商店介面；可連續購買、出售，按離開結束。 */
export function openShop(dialog: Dialog, state: GameState, lord: Lord, kind: ShopKind, offers: Offer[], onBuy: (msg: string) => void): Promise<void> {
  const visit=beginShopVisit(state,lord,kind,offers);
  offers=visit.offers;
  const sold = new Set<number>();
  let mode: 'buy' | 'sell' = 'buy';
  let recruited = 0;
  const recruitLimit=lordHas(lord.id,'recruitLimit')?2:1;
  let confirmBeast = -1;
  // 分類商店（天寶商行、天工坊、百草堂）用分頁顯示
  let groups = [...new Set(offers.map((o) => o.group).filter((g): g is string => !!g))];
  let tab = groups[0] ?? '';
  let revivedOther = false;
  return dialog.custom<void>(
    `${kind === 'merchant' ? '🐫' : TILE_INFO[kind].icon} ${SHOP_NAMES[kind]}`,
    (body, done) => {
      let keepScroll = 0;
      let lastView = '';
      const render = () => {
        // 買賣之後只更新內容；停留在同一個分頁時保留清單的捲動位置
        const view = `${mode}|${tab}`;
        const old = body.querySelector('.shop-list') as HTMLElement | null;
        if (old) keepScroll = old.scrollTop;
        if (view !== lastView) keepScroll = 0;
        lastView = view;
        body.innerHTML = `<p class="dialog-text">${kind==='tavern'?`每次最多招募 ${recruitLimit} 位。本國將領價格較低。可鎖定一位，刷新及再次進入時保留；每次鎖定價格再乘 1.2。`:SHOP_DESC[kind]}</p><div class="wallet">持有靈石：<b>${fmtStones(lord.stones)}</b></div>`;
        if (kind !== 'tavern') {
          const modes = document.createElement('div');
          modes.className = 'shop-tabs';
          for (const value of ['buy', 'sell'] as const) {
            const button = document.createElement('button');
            button.className = `shop-tab ${mode === value ? 'on' : ''}`;
            button.textContent = value === 'buy' ? '購買' : '出售（成交價五成）';
            button.onclick = () => { mode = value; confirmBeast = -1; render(); };
            modes.appendChild(button);
          }
          body.appendChild(modes);
        }
        if (mode === 'sell') {
          const note = document.createElement('p');
          note.className = 'muted';
          note.textContent = '僅收購本店對應物品；已裝備的神器、寶衣請先卸下。靈獸出售後會離隊。';
          body.appendChild(note);
        }
        if (mode === 'buy' && groups.length > 1) {
          const tabs = document.createElement('div');
          tabs.className = 'shop-tabs';
          for (const g of groups) {
            const t = document.createElement('button');
            t.className = `shop-tab ${g === tab ? 'on' : ''}`;
            t.textContent = `${g}（${offers.filter((o) => o.group === g).length}）`;
            t.onclick = () => {
              tab = g;
              render();
            };
            tabs.appendChild(t);
          }
          body.appendChild(tabs);
        }
        const list = document.createElement('div');
        list.className = 'shop-list';
        const visibleOffers: Offer[] = mode === 'sell' ? makeSellStock(lord, kind) : offers;
        visibleOffers.forEach((o, i) => {
          if (mode === 'buy' && groups.length > 1 && o.group !== tab) return;
          const row = document.createElement('div');
          row.className = `shop-row ${mode === 'buy' && sold.has(i) ? 'sold' : ''}`;
          const main = o.kind === 'item' ? `<div class="sr-main item-row"><div class="item-title">${itemLabel(o.item.defId, o.item.tier)}</div><small>${itemInfoHtml(o.item.defId, o.item.tier)}</small></div>` : `<div class="sr-main"><b>${o.label}</b><small>${o.sub}</small></div>`;
          const iconSrc = o.kind === 'item' ? itemIconUrl(o.item.defId) : o.kind === 'equipment' ? equipIconUrl(o.equipment) : o.kind === 'beast' ? beastIconUrl(o.beast) : o.kind === 'general' || o.kind === 'revive' ? portraitUrl(o.general) : '';
          const iconHtml = iconSrc ? `<img class="sr-icon" src="${iconSrc}" alt="" onerror="this.style.visibility='hidden'">` : '';
          row.innerHTML = `${iconHtml}${main}<div class="sr-price">${mode === 'sell' ? '+' : ''}${fmtStones(o.price)}</div>`;
          const b = document.createElement('button');
          b.className = 'btn primary mini';
          const otherRevive = o.kind === 'revive' && !o.own;
          const unavailable=o.kind==='general' && (!!o.general.owner || o.general.status==='dead');
          const blocked = unavailable || sold.has(i) || (kind === 'tavern' && recruited >= recruitLimit) || (otherRevive && revivedOther);
          b.textContent = sold.has(i) ? (o.kind === 'revive' ? '已復活' : '已購') : kind === 'tavern' ? '招募' : o.kind === 'revive' ? '復活' : '購買';
          b.disabled = blocked || lord.stones < o.price;
          if (confirmBeast === i) b.textContent = '放生舊靈獸並購買？';
          if (otherRevive && revivedOther && !sold.has(i)) b.textContent = '一次一人';
          if (mode === 'sell') {
            b.textContent = '出售';
            b.disabled = false;
          }
          b.onclick = () => {
            if (mode === 'sell') {
              const r = sell(lord, kind, o as SaleOffer);
              if (r.ok) onBuy(r.message);
              render();
              return;
            }
            // 已有靈獸時需要再按一次確認
            if (o.kind === 'beast' && lord.beast && confirmBeast !== i) {
              confirmBeast = i;
              render();
              return;
            }
            confirmBeast = -1;
            const r = buy(state, lord, o);
            if (r.ok) {
              sold.add(i);
              if (kind === 'tavern') recruited++;
              if (o.kind === 'revive' && !o.own) revivedOther = true;
              onBuy(r.message);
            }
            render();
          };
          if(kind==='tavern' && o.kind==='general') {
            const locked=lord.tavernLockedGeneral===o.general.id;
            const lock=document.createElement('button');lock.className='btn mini';
            // 切換：已鎖定時再按一次就是取消（價格不會再漲），不能連按累加
            lock.textContent=locked?'🔒 已鎖定':'鎖定 ×1.2';
            lock.classList.toggle('on',locked);
            lock.title=locked?'點擊取消鎖定（已增加的價格保留）':'鎖定後，刷新或下次進入聽風樓時這位仍會保留；鎖定一次價格 ×1.2';
            lock.disabled=sold.has(i)||unavailable;
            lock.onclick=()=>{
              if(locked){lord.tavernLockedGeneral=null;onBuy('取消鎖定'+o.general.name+'；已增加的招募價格保留。');}
              else{const r=lockTavernGeneral(lord,o);if(r.ok)onBuy(r.message);}
              render();
            };
            row.appendChild(lock);
          }
          row.appendChild(b);
          list.appendChild(row);
        });
        if (!visibleOffers.length) list.innerHTML = `<p class="muted">${mode === 'sell' ? '行囊中沒有本店可收購的物品。' : '目前沒有可購買的項目。'}</p>`;
        body.appendChild(list);
        const row = document.createElement('div');
        row.className = 'dialog-buttons';
        const cost=SHOP_REFRESH_COSTS[visit.refreshes];
        const refresh=document.createElement('button');
        refresh.className='btn primary';
        refresh.textContent=cost===undefined?'刷新額度已用完（2/2）':`刷新 ${fmtStones(cost)}（${visit.refreshes}/2）`;
        refresh.disabled=cost===undefined||lord.stones<cost;
        refresh.onclick=()=>{
          const r=refreshShop(state,lord,visit);
          if(r.ok){
            offers=visit.offers;
            sold.clear(); confirmBeast=-1;
            groups=[...new Set(offers.map(o=>o.group).filter((g):g is string=>!!g))];
            if(!groups.includes(tab)) tab=groups[0]??'';
            onBuy(r.message);
          }
          render();
        };
        row.appendChild(refresh);
        const leave = document.createElement('button');
        leave.className = 'btn';
        leave.textContent = '離開';
        leave.onclick = () => done();
        row.appendChild(leave);
        body.appendChild(row);
        // 按鈕列都加進去、版面確定後才還原捲動位置（太早設定會被截成 0 或中間）
        const restore = keepScroll;
        list.scrollTop = restore;
        requestAnimationFrame(() => { list.scrollTop = restore; });
      };
      render();
    },
    true,
    () => undefined,
  );
}

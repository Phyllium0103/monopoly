import type { GameState, Lord } from '../game/types';
import { fmtStones } from '../game/Currency';
import { SHOP_NAMES, buy, type Offer, type ShopKind } from '../systems/ShopSystem';
import { TILE_INFO } from '../data/board';
import type { Dialog } from './Dialog';
import { itemInfoHtml, itemLabel } from './ItemUI';

const SHOP_DESC: Record<ShopKind, string> = {
  treasure: '法器、陣法、符籙，可在擲骰前或戰鬥中使用。',
  herb: '丹藥、靈根丹與還魂丹。丹師也能讓亡者還陽：自己麾下的亡將便宜一半、境界降一階；其他主公的亡將境界降兩階，且一次只能復活一人。',
  forge: '神器加武力、寶衣加防禦與血量。品階越高越強，也需要越高境界。',
  library: '每位武將只能修習一種功法，五行相生相剋。',
  beast: '每位主公只能擁有一隻靈獸，新購入的會取代舊的。',
  tavern: '每次只能招募一位。本國將領價格較低。',
  merchant: '西域商隊帶來的地階、天階稀有貨品，一律 7 折。',
};

/** 商店介面；玩家可連續購買，按離開結束 */
export function openShop(dialog: Dialog, state: GameState, lord: Lord, kind: ShopKind, offers: Offer[], onBuy: (msg: string) => void): Promise<void> {
  const sold = new Set<number>();
  let recruited = false;
  let confirmBeast = -1;
  // 分類商店（天寶商行、天工坊、百草堂）用分頁顯示
  const groups = [...new Set(offers.map((o) => o.group).filter((g): g is string => !!g))];
  let tab = groups[0] ?? '';
  let revivedOther = false;
  return dialog.custom<void>(
    `${kind === 'merchant' ? '🐫' : TILE_INFO[kind].icon} ${SHOP_NAMES[kind]}`,
    (body, done) => {
      const render = () => {
        body.innerHTML = `<p class="dialog-text">${SHOP_DESC[kind]}</p><div class="wallet">持有靈石：<b>${fmtStones(lord.stones)}</b></div>`;
        if (groups.length > 1) {
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
        offers.forEach((o, i) => {
          if (groups.length > 1 && o.group !== tab) return;
          const row = document.createElement('div');
          row.className = `shop-row ${sold.has(i) ? 'sold' : ''}`;
          const main = o.kind === 'item' ? `<div class="sr-main item-row"><div class="item-title">${itemLabel(o.item.defId, o.item.tier)}</div><small>${itemInfoHtml(o.item.defId, o.item.tier)}</small></div>` : `<div class="sr-main"><b>${o.label}</b><small>${o.sub}</small></div>`;
          row.innerHTML = `${main}<div class="sr-price">${fmtStones(o.price)}</div>`;
          const b = document.createElement('button');
          b.className = 'btn primary mini';
          const otherRevive = o.kind === 'revive' && !o.own;
          const blocked = sold.has(i) || (kind === 'tavern' && recruited) || (otherRevive && revivedOther);
          b.textContent = sold.has(i) ? (o.kind === 'revive' ? '已復活' : '已購') : kind === 'tavern' ? '招募' : o.kind === 'revive' ? '復活' : '購買';
          b.disabled = blocked || lord.stones < o.price;
          if (confirmBeast === i) b.textContent = '放生舊靈獸並購買？';
          if (otherRevive && revivedOther && !sold.has(i)) b.textContent = '一次一人';
          b.onclick = () => {
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
              if (kind === 'tavern') recruited = true;
              if (o.kind === 'revive' && !o.own) revivedOther = true;
              onBuy(r.message);
            }
            render();
          };
          row.appendChild(b);
          list.appendChild(row);
        });
        if (!offers.length) list.innerHTML = '<p class="muted">目前沒有可購買的項目。</p>';
        body.appendChild(list);
        const row = document.createElement('div');
        row.className = 'dialog-buttons';
        const leave = document.createElement('button');
        leave.className = 'btn';
        leave.textContent = '離開';
        leave.onclick = () => done();
        row.appendChild(leave);
        body.appendChild(row);
      };
      render();
    },
    true,
    () => undefined,
  );
}

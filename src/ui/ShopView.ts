import type { Lord } from '../game/types';
import { fmtStones } from '../game/Currency';
import { SHOP_NAMES, SHOP_REFRESH_COSTS, type Offer, type ShopKind } from '../systems/ShopSystem';
import { TILE_INFO } from '../data/board';
import type { Dialog } from './Dialog';
import { itemInfoHtml, itemLabel } from './ItemUI';
import { generalBlock, generalBrief } from './GeneralInfo';
import { beastIconUrl, equipIconUrl, itemIconUrl, portraitUrl } from './Icons';
import type { ShopAction, ShopPromptData } from '../engine/prompts';

const SHOP_DESC: Record<ShopKind, string> = {
  treasure: '法器、陣法、符籙，可在擲骰前或戰鬥中使用。',
  herb: '丹藥、靈根丹與還魂丹。丹師也能讓亡者還陽：自己麾下的亡將便宜一半、境界降一階；其他主公的亡將境界降兩階，且一次只能復活一人。',
  forge: '販售寶衣，增加防禦與血量，部分款式提升武力或技藝；品階越高，所需境界越高。',
  library: '每位武將只能修習一種功法；五行靈根只可學對應功法，天靈根不限，廢靈根不能學。',
  beast: '每位主公只能擁有一隻靈獸，新購入的會取代舊的。',
  tavern: '每次只能招募一位。本國將領價格較低。',
  merchant: '西域商隊帶來的地階、天階稀有貨品，一律 5 折，商路暢通期間再七折。',
};

const groupsOf = (offers: Offer[]) => [...new Set(offers.map((o) => o.group).filter((g): g is string => !!g))];

/**
 * 商店介面：依引擎送來的資料繪製，玩家每按一次就回傳一個動作；
 * 引擎處理完再送來新的資料，視窗保持開著（分頁、捲動位置不變），直到離開。
 */
export class ShopPanel {
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
  } | null = null;

  constructor(private dialog: Dialog) {}

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
        const groups = groupsOf(data.offers);
        if (!groups.includes(s.tab)) s.tab = groups[0] ?? '';
        this.render();
        return;
      }
      this.close();
      const kind = data.shopKind;
      void this.dialog.custom<void>(
        `${kind === 'merchant' ? '🐫' : TILE_INFO[kind].icon} ${SHOP_NAMES[kind]}`,
        (body, done) => {
          this.session = { body, close: () => done(), data, lord, resolve, mode: 'buy', tab: groupsOf(data.offers)[0] ?? '', confirmBeast: -1, keepScroll: 0, lastView: '' };
          this.render();
        },
        true,
        () => this.act({ type: 'leave' }),
      );
    });
  }

  /** 關閉視窗（離開商店或流程中斷時） */
  close() {
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
    const s = this.session;
    if (!s) return;
    const { body, data, lord } = s;
    const kind = data.shopKind;
    // 買賣之後只更新內容；停留在同一個分頁時保留清單的捲動位置
    const view = `${s.mode}|${s.tab}`;
    const old = body.querySelector('.shop-list') as HTMLElement | null;
    if (old) s.keepScroll = old.scrollTop;
    if (view !== s.lastView) s.keepScroll = 0;
    s.lastView = view;
    const busy = !s.resolve;
    const groups = groupsOf(data.offers);
    body.innerHTML = `<p class="dialog-text">${kind === 'tavern' ? `每次最多招募 ${data.recruitLimit} 位。本國將領價格較低。每位武將都可以各自鎖定：鎖定後，刷新或下次進入時會保留，保留時招募價 ×1.2。` : SHOP_DESC[kind]}</p><div class="wallet">持有靈石：<b>${fmtStones(lord.stones)}</b></div>`;
    if (kind !== 'tavern') {
      const modes = document.createElement('div');
      modes.className = 'shop-tabs';
      for (const value of ['buy', 'sell'] as const) {
        const button = document.createElement('button');
        button.className = `shop-tab ${s.mode === value ? 'on' : ''}`;
        button.textContent = value === 'buy' ? '購買' : '出售（成交價五成）';
        button.onclick = () => { s.mode = value; s.confirmBeast = -1; this.render(); };
        modes.appendChild(button);
      }
      body.appendChild(modes);
    }
    if (s.mode === 'sell') {
      const note = document.createElement('p');
      note.className = 'muted';
      note.textContent = '僅收購本店對應物品；已裝備的寶衣請先卸下。靈獸出售後會離隊。';
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
    visibleOffers.forEach((o, i) => {
      if (s.mode === 'buy' && groups.length > 1 && o.group !== s.tab) return;
      const row = document.createElement('div');
      row.className = `shop-row ${s.mode === 'buy' && sold.has(i) ? 'sold' : ''}`;
      const main = o.kind === 'item' ? `<div class="sr-main item-row"><div class="item-title">${itemLabel(o.item.defId, o.item.tier)}</div><small>${itemInfoHtml(o.item.defId, o.item.tier)}</small></div>`
        : o.kind === 'general' ? `<div class="sr-main"><b>${o.label}</b>${generalBlock(o.general, { note: o.general.origin === lord.id ? '<span class="tavern-perk">本國將領優惠</span>' : '' })}</div>`
          : o.kind === 'revive' ? `<div class="sr-main"><b>${o.label}</b>${generalBrief(o.general, '', { note: o.sub.split('｜').slice(1).join('｜') })}</div>`
            : `<div class="sr-main"><b>${o.label}</b><small>${o.sub}</small></div>`;
      const iconSrc = o.kind === 'item' ? itemIconUrl(o.item.defId) : o.kind === 'equipment' ? equipIconUrl(o.equipment) : o.kind === 'beast' ? beastIconUrl(o.beast) : o.kind === 'general' || o.kind === 'revive' ? portraitUrl(o.general) : '';
      const iconHtml = iconSrc ? `<img class="sr-icon${o.kind === 'general' || o.kind === 'revive' ? ' general-portrait' : ''}" src="${iconSrc}" alt="" onerror="this.style.visibility='hidden'">` : '';
      row.innerHTML = `${iconHtml}${main}<div class="sr-price">${s.mode === 'sell' ? '+' : ''}${fmtStones(o.price)}</div>`;
      // 按鈕固定放在右側一欄（招募在上、鎖定在下），文字變化不會擠壓左邊資訊
      const actions = document.createElement('div');
      actions.className = 'sr-actions';
      row.appendChild(actions);
      const b = document.createElement('button');
      b.className = 'btn primary mini';
      actions.appendChild(b);
      const otherRevive = o.kind === 'revive' && !o.own;
      const unavailable = o.kind === 'general' && (!!o.general.owner || o.general.status === 'dead');
      const blocked = unavailable || sold.has(i) || (kind === 'tavern' && data.recruited >= data.recruitLimit) || (otherRevive && data.revivedOther);
      b.textContent = sold.has(i) ? (o.kind === 'revive' ? '已復活' : '已購') : kind === 'tavern' ? '招募' : o.kind === 'revive' ? '復活' : '購買';
      b.disabled = busy || blocked || lord.stones < o.price;
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
        lock.textContent = locked ? '🔒 已鎖定' : '鎖定';
        lock.classList.toggle('on', locked);
        lock.title = locked ? '點擊取消鎖定' : '鎖定後，刷新或下次進入聽風樓時這位仍會出現，招募價屆時 ×1.2';
        lock.disabled = busy || sold.has(i) || unavailable;
        lock.onclick = () => this.act({ type: 'lock', index: i });
        actions.appendChild(lock);
      }
      list.appendChild(row);
    });
    if (!visibleOffers.length) list.innerHTML = `<p class="muted">${s.mode === 'sell' ? '行囊中沒有本店可收購的物品。' : '目前沒有可購買的項目。'}</p>`;
    body.appendChild(list);
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
    // 按鈕列都加進去、版面確定後才還原捲動位置（太早設定會被截成 0 或中間）
    const restore = s.keepScroll;
    list.scrollTop = restore;
    requestAnimationFrame(() => { list.scrollTop = restore; });
  }
}

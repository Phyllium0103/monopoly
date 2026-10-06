import type { GameState, Lord, TileKind } from '../game/types';
import { joinLord, newGeneral, nextUid, reviveGeneral } from '../game/GameState';
import { merchantStock } from './EventSystem';
import { WORLD } from './WorldMods';
import { fmtStones } from '../game/Currency';
import { ARTIFACT_IDS, ITEM_DEFS, equipDesc, itemName, makeBeast, makeEquipment, makeItem, makeTechnique, requirementOf, rollItemTier, rollTier, techniqueDesc } from '../data/items';
import { APTITUDE_NAMES, HIDDEN_SEEDS, REALMS } from '../data/generals';
import { fxText, passiveOf, lordAura, lordHas } from '../data/passives';
import { generalValue, power, realmName, recruitPrice } from './GeneralSystem';
import { originKingdom } from '../faction/Faction';
import type { Beast, Equipment, General, Item, Technique } from '../game/types';

/** 地圖上的商店，加上旅行商人事件的商隊 */
export type ShopKind = Exclude<TileKind, 'city' | 'realm' | 'road' | 'portal' | 'vein'> | 'merchant';

export type Offer = (
  | { kind: 'item'; item: Item; label: string; sub: string; price: number }
  | { kind: 'equipment'; equipment: Equipment; label: string; sub: string; price: number }
  | { kind: 'technique'; technique: Technique; label: string; sub: string; price: number }
  | { kind: 'beast'; beast: Beast; label: string; sub: string; price: number }
  | { kind: 'general'; general: General; label: string; sub: string; price: number }
  | { kind: 'revive'; general: General; label: string; sub: string; price: number; realmLoss: number; own: boolean; preserveExp?: boolean }
) & {
  /** 分頁名稱（商店分類） */
  group?: string;
};

export const SHOP_NAMES: Record<ShopKind, string> = {
  treasure: '天寶商行',
  herb: '百草堂',
  forge: '天工坊',
  library: '藏經閣',
  beast: '萬獸園',
  tavern: '聽風樓',
  merchant: '旅行商人',
};

/** 復活降階後的境界名稱 */
function realmAfter(g: General, loss: number): string {
  return REALMS[Math.max(0, g.realm - loss)];
}

const shuffle = <T,>(arr: T[]): T[] => arr.map((v) => [Math.random(), v] as const).sort((a, b) => a[0] - b[0]).map((x) => x[1]);

/** 每次造訪商店時隨機產生貨架 */
export function makeStock(state: GameState, lord: Lord, kind: ShopKind): Offer[] {
  return buildStock(state,lord,kind).map(o=>o.kind==='general'||o.kind==='revive' ? o : {...o,price:Math.round(o.price*WORLD.purchaseMult)});
}

function buildStock(state: GameState, lord: Lord, kind: ShopKind): Offer[] {
  const uid = (p: string) => nextUid(state, p);
  // 隨回合推進，高階貨品更常見
  const bias = Math.min(0.9, state.round / 40);
  switch (kind) {
    case 'merchant':
      return merchantStock(state);
    case 'herb': {
      const G1 = '丹藥';
      const potions: Offer[] = Array.from({ length: 12 }, () => {
        const pool = Object.keys(ITEM_DEFS).filter(id => ITEM_DEFS[id].category === '丹藥');
        const defId = pool[Math.floor(Math.random() * pool.length)];
        const item = makeItem(uid('i'), defId, rollItemTier(defId, bias));
        return { kind: 'item', item, label: itemName(defId, item.tier), sub: `${ITEM_DEFS[defId].desc(item.tier)}｜${requirementOf(defId, item.tier)}`, price: item.price, group: G1 };
      });
      // 丹師能讓亡者還陽，分兩頁：自己麾下的亡將（便宜一半、境界降一階），其他主公的亡將（境界降兩階、一次只能復活一人）
      const dead = Object.values(state.generals).filter((g) => g.status === 'dead' && !g.isLord);
      const reviveOffer = (g: General, own: boolean): Offer => ({
        kind: 'revive',
        general: g,
        own,
        realmLoss: !own && lordHas(lord.id,'reviveEnemyIntact') ? 0 : own ? 1 : 2,
        preserveExp: !own && lordHas(lord.id,'reviveEnemyIntact'),
        group: own ? '復活・自己的亡將' : '復活・其他主公的亡將',
        label: `🕯️ 復活 ${g.name}（${originKingdom(g.origin)}）`,
        sub: `${realmName(g)}・${APTITUDE_NAMES[g.aptitude]}｜被動【${passiveOf(g).name}】${fxText(passiveOf(g).fx)}｜復活後境界降 ${own ? 1 : 2} 階（→${realmAfter(g, own ? 1 : 2)}）、修為歸零、血量全滿，歸入你的麾下${own ? '｜自己的亡將，價格減半' : '｜一次只能復活一人'}`,
        price: lordHas(lord.id,'freeRevive') ? 0 : Math.round((recruitPrice(g, lord.id) * 1.5 * (own ? 0.5 : 1)) / 100) * 100,
      });
      const mine = dead.filter((g) => g.lastOwner === lord.id).map((g) => reviveOffer(g, true));
      const others = dead.filter((g) => g.lastOwner !== lord.id).map((g) => reviveOffer(g, false));
      return [...potions, ...mine, ...others].map(o => o.kind==='revive' ? {...o,sub: `${realmName(o.general)}｜復活後境界降 ${o.realmLoss} 階、${o.preserveExp?'修為保留':'修為歸零'}、血量全滿${o.price===0?'｜董奉：免費復活':''}`} : o);
    }
    case 'treasure': {
      const discount=Math.max(0,1-lordAura(lord.id,'partyTreasure'));
      // 每個貨架先等機率抽種類，再抽品階；不依種類品階數重抽或去重。
      return Array.from({ length: 30 }, () => {
        const defId = ARTIFACT_IDS[Math.floor(Math.random() * ARTIFACT_IDS.length)];
        const item = makeItem(uid('i'), defId, rollItemTier(defId, bias));
        return { kind: 'item', item, label: itemName(defId, item.tier), sub: ITEM_DEFS[defId].desc(item.tier) + '｜' + requirementOf(defId, item.tier), price: Math.round(item.price*discount), group: ITEM_DEFS[defId].category } as Offer;
      });
    }
    case 'forge': {
      // 神器與寶衣各 10 件
      const out: Offer[] = [];
      for (const kindE of ['weapon', 'armor'] as const) {
        for (let i = 0; i < 10; i++) {
          const e = makeEquipment(uid('e'), kindE, rollTier(bias));
          out.push({ kind: 'equipment', equipment: e, label: e.name, sub: equipDesc(e), price: e.price, group: kindE === 'weapon' ? '神器' : '寶衣' });
        }
      }
      return out;
    }
    case 'library':
      return Array.from({ length: 10 }, () => {
        const t = makeTechnique(uid('t'), rollTier(bias));
        return { kind: 'technique', technique: t, label: t.name, sub: techniqueDesc(t), price: t.price } as Offer;
      });
    case 'beast':
      return Array.from({ length: 8 }, () => {
        const b = makeBeast(uid('b'), rollTier(bias));
        return { kind: 'beast', beast: b, label: b.name, sub: b.desc, price: b.price } as Offer;
      });
    case 'tavern': {
      const free = shuffle(Object.values(state.generals).filter((g) => g.owner === null && g.status !== 'dead'));
      // 方外人物最多一名；水鏡先生隨行時也可抽尚未揭露者，不以其他方外人物補空位
      const hidden = free.filter((g) => g.origin === 'immortal');
      if (lordHas(lord.id,'unlockHidden')) {
        for (const seed of HIDDEN_SEEDS) if (!state.generals[seed.id]) hidden.push(newGeneral(seed,'immortal',null,'free',null));
      }
      const shuffledHidden=shuffle(hidden);
      const normal = free.filter((g) => g.origin !== 'immortal');
      const showHidden=lordHas(lord.id,'unlockHidden') || Math.random()<0.2;
      const pool = [...(showHidden?shuffledHidden.slice(0,1):[]), ...normal].slice(0,4);
      for (const g of pool) if (!state.generals[g.id]) state.generals[g.id]=g;
      return pool.map(
        (g) =>
          ({
            kind: 'general',
            general: g,
            label: `${g.origin === 'immortal' ? '🧙 ' : ''}${g.name}（${originKingdom(g.origin)}）`,
            sub: `${realmName(g)}・${APTITUDE_NAMES[g.aptitude]}｜被動【${passiveOf(g).name}】${fxText(passiveOf(g).fx)}｜戰力 ${power(g)}｜武${g.base.force} 防${g.base.defense} 丹${g.base.alchemy} 器${g.base.forging} 符${g.base.talisman} 陣${g.base.formation}${g.origin === lord.id ? '｜本國將領優惠' : ''}`,
            price: recruitPrice(g, lord.id),
          }) as Offer,
      );
    }
  }
}

/** 購買；回傳結果文字，失敗回傳 null */
export function buy(state: GameState, lord: Lord, offer: Offer): { ok: boolean; message: string } {
  if (lord.stones < offer.price) return { ok: false, message: '靈石不足。' };
  if (offer.kind === 'general' && offer.general.owner) return { ok: false, message: '此人已出仕。' };
  if (offer.kind === 'revive' && offer.general.status !== 'dead') return { ok: false, message: '此人已經復活了。' };
  lord.stones -= offer.price;
  switch (offer.kind) {
    case 'item':
      lord.items.push(offer.item);
      break;
    case 'equipment':
      lord.gear.push(offer.equipment);
      break;
    case 'technique':
      lord.scrolls.push(offer.technique);
      break;
    case 'beast':
      lord.beast = offer.beast;
      break;
    case 'general':
      joinLord(state, lord.id, offer.general);
      break;
    case 'revive': {
      const exp=offer.general.exp;
      reviveGeneral(state, lord.id, offer.general, 1, offer.realmLoss);
      if (offer.preserveExp) offer.general.exp=exp;
      break;
    }
  }
  return { ok: true, message: `花費 ${fmtStones(offer.price)} 購得「${offer.label}」。` };
}

export function offerValue(offer: Offer): number {
  return offer.kind === 'general' || offer.kind === 'revive' ? generalValue(offer.general) : offer.price;
}


/** 回收原價五成；只列出行囊中的物品與目前的靈獸。 */
export const SHOP_SELL_RATIO = 0.5;
export type SaleOffer = Extract<Offer, { kind: 'item' | 'equipment' | 'technique' | 'beast' }>;

export function makeSellStock(lord: Lord, kind: ShopKind): SaleOffer[] {
  const price = (n: number) => Math.max(0, Math.floor(n * SHOP_SELL_RATIO));
  const all = kind === 'merchant';
  const stock: SaleOffer[] = [];
  for (const item of lord.items) {
    const d = ITEM_DEFS[item.defId];
    if (!all && !(kind === 'herb' && d.category === '丹藥') && !(kind === 'treasure' && ['法器', '陣法', '符籙'].includes(d.category))) continue;
    stock.push({ kind: 'item', item, label: itemName(item.defId, item.tier), sub: d.desc(item.tier), price: price(item.price) });
  }
  if (all || kind === 'forge') for (const equipment of lord.gear)
    stock.push({ kind: 'equipment', equipment, label: equipment.name, sub: equipDesc(equipment), price: price(equipment.price) });
  if (all || kind === 'library') for (const technique of lord.scrolls)
    stock.push({ kind: 'technique', technique, label: technique.name, sub: techniqueDesc(technique), price: price(technique.price) });
  if ((all || kind === 'beast') && lord.beast) {
    const beast = lord.beast;
    stock.push({ kind: 'beast', beast, label: beast.name, sub: beast.desc, price: price(beast.price) });
  }
  return stock;
}

function saleUid(offer: SaleOffer): string {
  switch (offer.kind) {
    case 'item': return offer.item.uid;
    case 'equipment': return offer.equipment.uid;
    case 'technique': return offer.technique.uid;
    case 'beast': return offer.beast.uid;
  }
}

/** 再次確認物品和價錢，避免重複出售或跨店出售。 */
export function sell(lord: Lord, kind: ShopKind, offer: SaleOffer): { ok: boolean; message: string } {
  const uid = saleUid(offer);
  const owned = makeSellStock(lord, kind).find((o) => o.kind === offer.kind && saleUid(o) === uid);
  if (!owned) return { ok: false, message: '此物品不在行囊中，或店家不收購。' };
  switch (owned.kind) {
    case 'item': lord.items = lord.items.filter((i) => i.uid !== uid); break;
    case 'equipment': lord.gear = lord.gear.filter((i) => i.uid !== uid); break;
    case 'technique': lord.scrolls = lord.scrolls.filter((i) => i.uid !== uid); break;
    case 'beast': lord.beast = null; break;
  }
  lord.stones += owned.price;
  return { ok: true, message: `出售「${owned.label}」，獲得 ${fmtStones(owned.price)}。` };
}

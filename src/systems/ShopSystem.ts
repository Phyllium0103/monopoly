import type { GameState, Lord, TileKind } from '../game/types';
import { joinLord, nextUid, reviveGeneral } from '../game/GameState';
import { merchantStock } from './EventSystem';
import { fmtStones } from '../game/Currency';
import { ARTIFACT_IDS, ITEM_DEFS, PILL_IDS, equipDesc, itemName, makeBeast, makeEquipment, makeItem, makeTechnique, requirementOf, rollItemTier, rollTier, techniqueDesc } from '../data/items';
import { APTITUDE_NAMES, REALMS } from '../data/generals';
import { fxText, passiveOf } from '../data/passives';
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
  | { kind: 'revive'; general: General; label: string; sub: string; price: number; realmLoss: number; own: boolean }
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
  const uid = (p: string) => nextUid(state, p);
  // 隨回合推進，高階貨品更常見
  const bias = Math.min(0.9, state.round / 40);
  switch (kind) {
    case 'merchant':
      return merchantStock(state);
    case 'herb': {
      const G1 = '丹藥';
      const potions: Offer[] = Array.from({ length: 12 }, () => {
        const defId = PILL_IDS[Math.floor(Math.random() * PILL_IDS.length)];
        const item = makeItem(uid('i'), defId, rollItemTier(defId, bias));
        return { kind: 'item', item, label: itemName(defId, item.tier), sub: `${ITEM_DEFS[defId].desc(item.tier)}｜${requirementOf(defId, item.tier)}`, price: item.price, group: G1 };
      });
      // 常備一顆還魂丹；偶爾有提升靈根的丹藥
      const reviveItem = makeItem(uid('i'), 'revive', rollItemTier('revive', bias));
      potions.push({ kind: 'item', item: reviveItem, label: itemName('revive', reviveItem.tier), sub: `${ITEM_DEFS.revive.desc(reviveItem.tier)}｜${requirementOf('revive', reviveItem.tier)}`, price: reviveItem.price, group: G1 });
      for (const [defId, chance] of [['rootup1', 0.45], ['rootup2', 0.2]] as const) {
        if (Math.random() < chance) {
          const it = makeItem(uid('i'), defId, 0);
          potions.push({ kind: 'item', item: it, label: itemName(defId, 0), sub: `${ITEM_DEFS[defId].desc(0)}｜${requirementOf(defId, 0)}`, price: it.price, group: G1 });
        }
      }
      // 丹師能讓亡者還陽，分兩頁：自己麾下的亡將（便宜一半、境界降一階），其他主公的亡將（境界降兩階、一次只能復活一人）
      const dead = Object.values(state.generals).filter((g) => g.status === 'dead' && !g.isLord);
      const reviveOffer = (g: General, own: boolean): Offer => ({
        kind: 'revive',
        general: g,
        own,
        realmLoss: own ? 1 : 2,
        group: own ? '復活・自己的亡將' : '復活・其他主公的亡將',
        label: `🕯️ 復活 ${g.name}（${originKingdom(g.origin)}）`,
        sub: `${realmName(g)}・${APTITUDE_NAMES[g.aptitude]}｜被動【${passiveOf(g).name}】${fxText(passiveOf(g).fx)}｜復活後境界降 ${own ? 1 : 2} 階（→${realmAfter(g, own ? 1 : 2)}）、修為歸零、血量全滿，歸入你的麾下${own ? '｜自己的亡將，價格減半' : '｜一次只能復活一人'}`,
        price: Math.round((recruitPrice(g, lord.id) * 1.5 * (own ? 0.5 : 1)) / 100) * 100,
      });
      const mine = dead.filter((g) => g.lastOwner === lord.id).map((g) => reviveOffer(g, true));
      const others = dead.filter((g) => g.lastOwner !== lord.id).map((g) => reviveOffer(g, false));
      return [...potions, ...mine, ...others];
    }
    case 'treasure': {
      // 天寶商行分陣法、符籙、法器三類，每類隨機 10 種
      const out: Offer[] = [];
      for (const category of ['陣法', '符籙', '法器'] as const) {
        const pool = ARTIFACT_IDS.filter((id) => ITEM_DEFS[id].category === category);
        const seen = new Set<string>();
        for (let tries = 0; seen.size < 10 && tries < 200; tries++) {
          const defId = pool[Math.floor(Math.random() * pool.length)];
          const item = makeItem(uid('i'), defId, rollItemTier(defId, bias));
          const key = `${defId}:${item.tier}`;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push({ kind: 'item', item, label: itemName(defId, item.tier), sub: `${ITEM_DEFS[defId].desc(item.tier)}｜${requirementOf(defId, item.tier)}`, price: item.price, group: category });
        }
      }
      return out;
    }
    case 'forge': {
      // 神器與寶衣各 6 件
      const out: Offer[] = [];
      for (const kindE of ['weapon', 'armor'] as const) {
        for (let i = 0; i < 6; i++) {
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
      // 隱藏武將最多占兩個名額，不會把一般將領全擠掉；一般將領不夠時才補隱藏武將
      const hidden = free.filter((g) => g.origin === 'immortal');
      const normal = free.filter((g) => g.origin !== 'immortal');
      const pool = [...hidden.slice(0, 2), ...normal].slice(0, 4);
      for (const g of hidden.slice(2)) if (pool.length < 4) pool.push(g);
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
    case 'revive':
      reviveGeneral(state, lord.id, offer.general, 1, offer.realmLoss);
      break;
  }
  return { ok: true, message: `花費 ${fmtStones(offer.price)} 購得「${offer.label}」。` };
}

export function offerValue(offer: Offer): number {
  return offer.kind === 'general' || offer.kind === 'revive' ? generalValue(offer.general) : offer.price;
}


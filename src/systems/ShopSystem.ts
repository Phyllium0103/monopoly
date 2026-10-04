import type { GameState, Lord, TileKind } from '../game/types';
import { joinLord, nextUid, reviveGeneral } from '../game/GameState';
import { merchantStock } from './EventSystem';
import { fmtStones } from '../game/Currency';
import { ARTIFACT_IDS, ITEM_DEFS, PILL_IDS, equipDesc, itemName, makeBeast, makeEquipment, makeItem, makeTechnique, requirementOf, rollItemTier, rollTier, techniqueDesc } from '../data/items';
import { APTITUDE_NAMES } from '../data/generals';
import { fxText, passiveOf } from '../data/passives';
import { generalValue, power, realmName, recruitPrice } from './GeneralSystem';
import { originKingdom } from '../faction/Faction';
import type { Beast, Equipment, General, Item, Technique } from '../game/types';

/** 地圖上的商店，加上旅行商人事件的商隊 */
export type ShopKind = Exclude<TileKind, 'city' | 'realm' | 'road' | 'portal'> | 'merchant';

export type Offer =
  | { kind: 'item'; item: Item; label: string; sub: string; price: number }
  | { kind: 'equipment'; equipment: Equipment; label: string; sub: string; price: number }
  | { kind: 'technique'; technique: Technique; label: string; sub: string; price: number }
  | { kind: 'beast'; beast: Beast; label: string; sub: string; price: number }
  | { kind: 'general'; general: General; label: string; sub: string; price: number }
  | { kind: 'revive'; general: General; label: string; sub: string; price: number };

export const SHOP_NAMES: Record<ShopKind, string> = {
  treasure: '天寶商行',
  herb: '百草堂',
  forge: '天工坊',
  library: '藏經閣',
  beast: '萬獸園',
  tavern: '聽風樓',
  merchant: '旅行商人',
};

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
      const potions = Array.from({ length: 6 }, () => {
        const defId = PILL_IDS[Math.floor(Math.random() * PILL_IDS.length)];
        const item = makeItem(uid('i'), defId, rollItemTier(defId, bias));
        return { kind: 'item', item, label: itemName(defId, item.tier), sub: `${ITEM_DEFS[defId].desc(item.tier)}｜${requirementOf(defId, item.tier)}`, price: item.price } as Offer;
      });
      // 百草堂的丹師能讓亡者還陽：復活戰死、渡劫失敗或死在秘境的武將
      const dead = shuffle(Object.values(state.generals).filter((g) => g.status === 'dead' && !g.isLord)).slice(0, 3);
      const revives = dead.map(
        (g) =>
          ({
            kind: 'revive',
            general: g,
            label: `🕯️ 復活 ${g.name}（${originKingdom(g.origin)}）`,
            sub: `${realmName(g)}・${APTITUDE_NAMES[g.aptitude]}｜被動【${passiveOf(g).name}】${fxText(passiveOf(g).fx)}｜復活後修為歸零、血量全滿，歸入你的麾下`,
            price: Math.round((recruitPrice(g, lord.id) * 1.5) / 100) * 100,
          }) as Offer,
      );
      // 百草堂常備一顆還魂丹，可帶回去復活死去的武將
      const reviveItem = makeItem(uid('i'), 'revive', rollItemTier('revive', bias));
      const pill: Offer = { kind: 'item', item: reviveItem, label: itemName('revive', reviveItem.tier), sub: `${ITEM_DEFS.revive.desc(reviveItem.tier)}｜${requirementOf('revive', reviveItem.tier)}`, price: reviveItem.price };
      // 偶爾有提升靈根的丹藥
      const rare: Offer[] = [];
      for (const [defId, chance] of [['rootup1', 0.45], ['rootup2', 0.2]] as const) {
        if (Math.random() < chance) {
          const it = makeItem(uid('i'), defId, 0);
          rare.push({ kind: 'item', item: it, label: itemName(defId, 0), sub: `${ITEM_DEFS[defId].desc(0)}｜${requirementOf(defId, 0)}`, price: it.price });
        }
      }
      return [...potions, pill, ...rare, ...revives];
    }
    case 'treasure':
      return shuffle([...ARTIFACT_IDS])
        .slice(0, 8)
        .map((defId) => {
          const d = ITEM_DEFS[defId];
          const item = makeItem(uid('i'), defId, rollItemTier(defId, bias));
          return { kind: 'item', item, label: `${d.category}・${itemName(defId, item.tier)}`, sub: `${d.desc(item.tier)}｜${requirementOf(defId, item.tier)}`, price: item.price } as Offer;
        });
    case 'forge':
      return Array.from({ length: 6 }, (_, i) => {
        const e = makeEquipment(uid('e'), i % 2 === 0 ? 'weapon' : 'armor', rollTier(bias));
        return { kind: 'equipment', equipment: e, label: e.name, sub: equipDesc(e), price: e.price } as Offer;
      });
    case 'library':
      return Array.from({ length: 5 }, () => {
        const t = makeTechnique(uid('t'), rollTier(bias));
        return {
          kind: 'technique',
          technique: t,
          label: t.name,
          sub: techniqueDesc(t),
          price: t.price,
        } as Offer;
      });
    case 'beast':
      return Array.from({ length: 4 }, () => {
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
      reviveGeneral(state, lord.id, offer.general);
      break;
  }
  return { ok: true, message: `花費 ${fmtStones(offer.price)} 購得「${offer.label}」。` };
}

export function offerValue(offer: Offer): number {
  return offer.kind === 'general' || offer.kind === 'revive' ? generalValue(offer.general) : offer.price;
}


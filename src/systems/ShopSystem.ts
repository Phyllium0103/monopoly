import type { GameState, Lord, TileKind } from '../game/types';
import { joinLord, nextUid } from '../game/GameState';
import { merchantStock } from './EventSystem';
import { fmtStones } from '../game/Currency';
import { ARTIFACT_IDS, ITEM_DEFS, PILL_IDS, equipRealm, itemName, makeBeast, makeEquipment, makeItem, makeTechnique, requirementOf, rollItemTier, rollTier, techniqueExp, ELEMENT_NAMES } from '../data/items';
import { APTITUDE_NAMES, REALMS } from '../data/generals';
import { fxText, passiveOf } from '../data/passives';
import { generalValue, power, realmName, recruitPrice } from './GeneralSystem';
import { originKingdom } from '../faction/Faction';
import type { Beast, Equipment, General, Item, Technique } from '../game/types';

/** 地圖上的商店，加上旅行商人事件的商隊 */
export type ShopKind = Exclude<TileKind, 'city' | 'realm' | 'road'> | 'merchant';

export type Offer =
  | { kind: 'item'; item: Item; label: string; sub: string; price: number }
  | { kind: 'equipment'; equipment: Equipment; label: string; sub: string; price: number }
  | { kind: 'technique'; technique: Technique; label: string; sub: string; price: number }
  | { kind: 'beast'; beast: Beast; label: string; sub: string; price: number }
  | { kind: 'general'; general: General; label: string; sub: string; price: number };

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
    case 'herb':
      return Array.from({ length: 6 }, () => {
        const defId = PILL_IDS[Math.floor(Math.random() * PILL_IDS.length)];
        const item = makeItem(uid('i'), defId, rollItemTier(defId, bias));
        return { kind: 'item', item, label: itemName(defId, item.tier), sub: `${ITEM_DEFS[defId].desc(item.tier)}｜${requirementOf(defId, item.tier)}`, price: item.price } as Offer;
      });
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
        const stat = e.kind === 'weapon' ? `武力 +${e.value}` : `防禦 +${e.value}、血量 +${e.hp}`;
        return { kind: 'equipment', equipment: e, label: e.name, sub: `${e.kind === 'weapon' ? '神器' : '寶衣'}｜${stat}｜需${REALMS[equipRealm(e.tier)]}`, price: e.price } as Offer;
      });
    case 'library':
      return Array.from({ length: 5 }, () => {
        const t = makeTechnique(uid('t'), rollTier(bias));
        return {
          kind: 'technique',
          technique: t,
          label: t.name,
          sub: `${ELEMENT_NAMES[t.element]}屬性｜能力 +${Math.round(t.power * 100)}%｜難度 ${'★'.repeat(t.difficulty)}｜每回合修為 +${techniqueExp(t)}｜技能「${t.skillName}」×${t.skillPower}`,
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
      const pool = [...free.filter((g) => g.origin === 'immortal'), ...free.filter((g) => g.origin !== 'immortal')].slice(0, 4);
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
  }
  return { ok: true, message: `花費 ${fmtStones(offer.price)} 購得「${offer.label}」。` };
}

export function offerValue(offer: Offer): number {
  return offer.kind === 'general' ? generalValue(offer.general) : offer.price;
}


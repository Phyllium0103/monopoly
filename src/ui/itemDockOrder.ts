import { ITEM_DEFS } from '../data/items';
import type { Item } from '../game/types';

export interface ItemStack { item: Item; count: number; reason: string }
const arts=['alchemy','forging','talisman','formation'];
/** Unusable stacks come last; sort each group by art and the item's highest tier price. */
export function sortItemStacks(stacks: ItemStack[]): ItemStack[] {
  return stacks.sort((a,b)=>{
    const x=ITEM_DEFS[a.item.defId],y=ITEM_DEFS[b.item.defId];
    return Number(!!a.reason)-Number(!!b.reason)
      || arts.indexOf(x.stat)-arts.indexOf(y.stat)
      || Math.max(...x.price)-Math.max(...y.price)
      || x.name.localeCompare(y.name,'zh-Hant')
      || a.item.defId.localeCompare(b.item.defId)
      || a.item.tier-b.item.tier;
  });
}

import type { Equipment, Lord, Technique } from '../game/types';
import { compareArmor } from '../data/armorCatalog';

/** Fixed shared capacity; narrow screens wrap the same cells. */
export const EQUIPMENT_CAPACITY = 20;
export type BagItem = Equipment | Technique;
export const isArmor = (item: BagItem): item is Equipment => 'kind' in item;
export const bagItems = (lord: Lord): BagItem[] => [...lord.gear, ...lord.scrolls];
export const bagHasRoom = (lord: Lord) => lord.gear.length + lord.scrolls.length < EQUIPMENT_CAPACITY;
const families = ['metal', 'wood', 'water', 'fire', 'earth', 'alchemy', 'forging', 'talisman', 'formation'];
export function compareBagItems(a: BagItem, b: BagItem): number {
  if (isArmor(a) && isArmor(b)) return compareArmor(a, b);
  if (isArmor(a) !== isArmor(b)) return isArmor(a) ? -1 : 1;
  const x = a as Technique, y = b as Technique;
  return Math.floor(x.tier / 3) - Math.floor(y.tier / 3) || families.indexOf(x.art ?? x.element!) - families.indexOf(y.art ?? y.element!) || x.tier - y.tier;
}
/** Read-only projection; item definitions stay in gear/scrolls, cells store identity only. */
export function bagSlots(lord: Lord): (BagItem | null)[] {
  const items = new Map(bagItems(lord).map(item => [item.uid, item]));
  const slots = Array.from({ length: EQUIPMENT_CAPACITY }, (_, i) => {
    const uid = lord.equipmentSlots[i], item = uid ? items.get(uid) : undefined;
    if (item) items.delete(item.uid);
    return item ?? null;
  });
  for (const item of [...items.values()].sort(compareBagItems)) {
    const index = slots.indexOf(null);
    if (index < 0) break;
    slots[index] = item;
  }
  return slots;
}
export function syncBagSlots(lord: Lord): void { lord.equipmentSlots = bagSlots(lord).map(item => item?.uid ?? null); }
export function sortBagItems(lord: Lord): void {
  lord.equipmentSlots = bagItems(lord).sort(compareBagItems).map(item => item.uid);
  syncBagSlots(lord);
}

/** Validate the whole batch before removing anything. Unselected rewards are discarded. */
export function replaceEquipmentBatch(lord: Lord, rewards: string[], replaced: string[]): boolean {
  if (!rewards.length || rewards.length !== replaced.length || new Set(rewards).size !== rewards.length || new Set(replaced).size !== replaced.length) return false;
  const pending = lord.pendingEquipment;
  if (rewards.some(uid => !pending.some(item => item.uid === uid)) || replaced.some(uid => !bagItems(lord).some(item => item.uid === uid))) return false;
  const slots = bagSlots(lord).map(item => item?.uid ?? null);
  const incoming = rewards.map(uid => pending.find(item => item.uid === uid)!);
  lord.gear = lord.gear.filter(item => !replaced.includes(item.uid));
  lord.scrolls = lord.scrolls.filter(item => !replaced.includes(item.uid));
  incoming.forEach((item, i) => {
    slots[slots.indexOf(replaced[i])] = item.uid;
    if (isArmor(item)) lord.gear.push(item); else lord.scrolls.push(item);
  });
  lord.equipmentSlots = slots;
  lord.pendingEquipment = [];
  return true;
}
export function moveBagItem(lord: Lord, uid: string, index: number): boolean {
  if (!Number.isInteger(index) || index < 0 || index >= EQUIPMENT_CAPACITY) return false;
  const slots = bagSlots(lord).map(item => item?.uid ?? null), from = slots.indexOf(uid);
  if (from < 0) return false;
  [slots[from], slots[index]] = [slots[index], slots[from]];
  lord.equipmentSlots = slots;
  return true;
}
/** Newly awarded items wait for a choice when full; they are never silently lost or over capacity. */
export function receiveEquipment(lord: Lord, item: BagItem): boolean {
  if (bagItems(lord).some(x => x.uid === item.uid) || lord.pendingEquipment.some(x => x.uid === item.uid)) return false;
  syncBagSlots(lord);
  if (!bagHasRoom(lord)) { lord.pendingEquipment.push(item); return false; }
  if (isArmor(item)) lord.gear.push(item); else lord.scrolls.push(item);
  syncBagSlots(lord);
  return true;
}
/** Reject invalid/stale replacement commands without removing either item. Null explicitly forfeits the reward. */
export function resolveEquipmentReward(lord: Lord, uid: string, replaceUid: string | null): boolean {
  const item = lord.pendingEquipment[0];
  if (!item || item.uid !== uid) return false;
  if (replaceUid !== null) {
    const slots = bagSlots(lord), index = slots.findIndex(x => x?.uid === replaceUid);
    if (index < 0) return false;
    lord.gear = lord.gear.filter(x => x.uid !== replaceUid);
    lord.scrolls = lord.scrolls.filter(x => x.uid !== replaceUid);
    lord.equipmentSlots = slots.map((x, i) => i === index ? item.uid : x?.uid ?? null);
    if (isArmor(item)) lord.gear.push(item); else lord.scrolls.push(item);
  }
  lord.pendingEquipment.shift();
  return true;
}

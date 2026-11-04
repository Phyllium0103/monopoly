import type { City, Element, GameState, General, Item, Lord, LordId } from '../game/types';
import { freeGenerals, generalsOf, citiesOf } from '../game/GameState';
import { ITEM_DEFS } from '../data/items';
import { canUse, usableIn, type PrerollTarget } from './ItemSystem';

/** Client sends identifiers only; the engine resolves and checks every object again. */
export interface DirectItemTarget {
  generalId?: string; lordId?: LordId; cityId?: string; ownCityId?: string;
  tile?: number; dice?: number; element?: Element;
}
export const SPECIAL_ITEM_STORAGE = new Set(['talentrefund', 'talentreset', 'realmkey']);
const MOVEMENT = new Set(['teleport', 'cloud', 'cushion', 'prison']);
export const ITEM_ELEMENTS: Element[] = ['metal', 'wood', 'water', 'fire', 'earth'];
export function itemUsers(state: GameState, lord: Lord, fighterId?: string): General[] {
  const users = freeGenerals(state, lord.id);
  const fighter = fighterId && state.generals[fighterId];
  return fighter && fighter.owner === lord.id && fighter.status !== 'dead' && !users.some(g => g.id === fighter.id) ? [fighter, ...users] : users;
}
export function itemGeneralTargets(state: GameState, lord: Lord, item: Item): General[] {
  const d = ITEM_DEFS[item.defId];
  const pool = d.target === 'deadGeneral' ? Object.values(state.generals).filter(g => g.status === 'dead')
    : d.target === 'ownGeneral' ? generalsOf(state, lord.id).filter(g => g.status !== 'realm')
    : d.target === 'enemyGeneral' ? Object.values(state.lords).filter(l => l.alive && l.id !== lord.id && !l.relicJourney).flatMap(l => generalsOf(state, l.id).filter(g => g.status !== 'realm')) : [];
  return pool.filter(g => item.defId !== 'five' || !['waste', 'heaven'].includes(g.aptitude));
}
export function itemLordTargets(state: GameState, lord: Lord, item: Item): Lord[] {
  return Object.values(state.lords).filter(l => l.alive && l.id !== lord.id && !l.relicJourney)
    .filter(l => !['poison', 'bow'].includes(item.defId) || freeGenerals(state, l.id).length > 0)
    .filter(l => item.defId !== 'move' || l.items.length > 0);
}
export function itemCityTargets(state: GameState, lord: Lord, item: Item, own = false): City[] {
  if (own || ITEM_DEFS[item.defId].target === 'ownCity') return citiesOf(state, lord.id);
  return Object.values(state.lords).filter(l => l.alive && l.id !== lord.id).flatMap(l => citiesOf(state, l.id));
}
export function itemDisabledReason(state: GameState, lord: Lord, item: Item, context: 'preroll' | 'battle' | null, fighterId?: string): string {
  if (SPECIAL_ITEM_STORAGE.has(item.defId)) return '顯示於天賦／材料頁';
  if (lord.relicJourney) return '山河圖內禁止使用道具';
  if (lord.itemsLocked > 0) return '物品被封印';
  const d = ITEM_DEFS[item.defId];
  if (d.timing === 'event') return '事件發生時提示使用';
  if (!context) return '等待可使用物品的時機';
  if (!usableIn(item, context)) return context === 'battle' ? '擲骰前才能使用' : '戰鬥中才能使用';
  if (context === 'preroll' && MOVEMENT.has(item.defId) && (lord.stunned || lord.forcedTile !== null || lord.stayThisTurn)) return '目前的移動狀態不能使用';
  if (!itemUsers(state, lord, fighterId).some(g => canUse(item, g).ok)) return '沒有能力及體力足夠的施放者';
  if (context === 'preroll') {
    if (['ownGeneral', 'enemyGeneral', 'deadGeneral'].includes(d.target) && !itemGeneralTargets(state, lord, item).length) return '沒有符合條件的武將';
    if (d.target === 'lord' && !itemLordTargets(state, lord, item).length) return '沒有符合條件的敵方主公';
    if (['ownCity', 'enemyCity'].includes(d.target) && !itemCityTargets(state, lord, item).length) return '沒有符合條件的城池';
    if (item.defId === 'graft' && !citiesOf(state, lord.id).length) return '沒有己方城池可交換';
  }
  return '';
}
export function resolveItemTarget(state: GameState, lord: Lord, item: Item, input: DirectItemTarget | null | undefined): { target?: PrerollTarget; reason?: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { reason: '物品目標不正確' };
  const d = ITEM_DEFS[item.defId];
  if (['ownGeneral', 'enemyGeneral', 'deadGeneral'].includes(d.target)) {
    const general = itemGeneralTargets(state, lord, item).find(g => g.id === input.generalId);
    if (!general) return { reason: '這名武將不是有效目標' };
    if (item.defId === 'five' && !ITEM_ELEMENTS.includes(input.element!)) return { reason: '請選擇五行靈根' };
    const owner = general.owner && state.lords[general.owner];
    if (owner?.relicJourney && (general.isLord || general.status === 'free')) return { reason: '山河結界內外道具無效' };
    return { target: { general, ...(item.defId === 'five' ? { element: input.element } : {}) } };
  }
  if (d.target === 'lord') {
    const victim = itemLordTargets(state, lord, item).find(l => l.id === input.lordId);
    if (!victim) return { reason: '這位主公不是有效目標' };
    if (['confuse', 'confusing'].includes(item.defId)) {
      const tile = Number.isInteger(input.tile) && state.tiles[input.tile!];
      if (!tile || tile.kind === 'casino') return { reason: '請選擇乾坤骰閣以外的地點' };
      return { target: { lord: victim, tile: tile.index } };
    }
    return { target: { lord: victim } };
  }
  if (d.target === 'ownCity' || d.target === 'enemyCity') {
    const city = itemCityTargets(state, lord, item).find(c => c.id === input.cityId);
    if (!city) return { reason: '這座城池不是有效目標' };
    if (item.defId === 'graft') {
      const ownCity = citiesOf(state, lord.id).find(c => c.id === input.ownCityId);
      return ownCity ? { target: { city, ownCity } } : { reason: '請再選擇交換的己方城池' };
    }
    return { target: { city } };
  }
  if (d.target === 'tile') {
    const tile = Number.isInteger(input.tile) && state.tiles[input.tile!];
    return tile ? { target: { tile: tile.index } } : { reason: '地圖目標無效' };
  }
  if (d.target === 'dice') return Number.isInteger(input.dice) && input.dice! >= 1 && input.dice! <= 6 ? { target: { dice: input.dice } } : { reason: '骰子點數須為 1～6' };
  return { target: {} };
}

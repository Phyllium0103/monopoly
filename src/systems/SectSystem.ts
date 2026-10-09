import type { GameState, General, Lord } from '../game/types';
import { freeGenerals, PARTY_LIMIT } from '../game/GameState';
import { fx } from '../data/passives';

/** 每位武將每次調度的費用；自己的城池與空城免費。 */
export function sectDispatchFee(state: GameState, lord: Lord): number {
  const tile = state.tiles[lord.position];
  const city = tile?.kind === 'city' ? state.cities[tile.cityId!] : undefined;
  return city && (city.owner === lord.id || city.owner === 'neutral') ? 0 : 10;
}

export function sectTransferRequirement(state: GameState, lord: Lord, g: General) {
  const fee = sectDispatchFee(state, lord);
  if (state.over || !lord.alive || g.owner !== lord.id || !['free', 'sect'].includes(g.status))
    return { ok: false, fee, reason: '武將無法調度' };
  if (g.isLord || fx(g).fixedParty || g.ghostSourceId)
    return { ok: false, fee, reason: '此武將必須隨行' };
  if (g.status === 'sect' && freeGenerals(state, lord.id).length >= PARTY_LIMIT)
    return { ok: false, fee, reason: `隨行已滿 ${PARTY_LIMIT} 人` };
  if (lord.stones < fee) return { ok: false, fee, reason: '靈石不足，需 10 下品' };
  return { ok: true, fee, reason: '' };
}

export function transferSectGeneral(state: GameState, lord: Lord, g: General): string {
  const r = sectTransferRequirement(state, lord, g);
  if (!r.ok) throw Error(r.reason);
  lord.stones -= r.fee;
  g.status = g.status === 'free' ? 'sect' : 'free';
  g.cityId = null;
  g.secluded = false;
  return `${g.name}${g.status === 'free' ? '加入隨行' : '留守宗門'}，${r.fee ? '耗費 10 下品靈石' : '免費調度'}。`;
}

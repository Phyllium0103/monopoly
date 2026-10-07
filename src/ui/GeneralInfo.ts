import type { General } from '../game/types';
import { APTITUDE_NAMES, REALMS } from '../data/generals';
import { attack, defense, craft, expCap, maxHp, maxStamina, power } from '../systems/GeneralSystem';

/** 選將時顯示目前有效能力，包含境界、裝備與被動。 */
export function generalInfo(g: General): string {
  return `血量 ${g.hp}/${maxHp(g)}・體力 ${g.stamina}/${maxStamina(g)}・戰力 ${power(g)}<br>` +
    `${REALMS[g.realm]}・武力 ${attack(g)}・防禦 ${defense(g)}・煉丹 ${craft(g, 'alchemy')}・煉器 ${craft(g, 'forging')}・畫符 ${craft(g, 'talisman')}・佈陣 ${craft(g, 'formation')}`;
}

/** 依物品用途顯示生效目標的現況。 */
export function itemTargetInfo(g: General, defId: string): string {
  let context = '';
  if (['rootup1','rootup2','rootdown','five'].includes(defId)) context = `靈根：${APTITUDE_NAMES[g.aptitude]}・功法：${g.technique?.name ?? '未修習'}`;
  else if (['clearmind','demon','illusion'].includes(defId)) context = `心魔：${g.demon} 層${g.demon ? '（纏身）' : '（無心魔）'}`;
  else if (['qi','essence'].includes(defId)) context = `修為：${g.exp}/${Number.isFinite(expCap(g)) ? expCap(g) : '已達最高境界'}`;
  else if (defId === 'force') context = `基礎武力：${g.base.force}・目前武力：${attack(g)}`;
  else if (defId === 'guard') context = `基礎防禦：${g.base.defense}・目前防禦：${defense(g)}`;
  else if (defId === 'bone') context = `基礎血量：${g.base.hp}・血量上限：${maxHp(g)}`;
  else if (defId === 'vigor') context = `體力：${g.stamina}/${maxStamina(g)}`;
  else if (defId === 'foundation') context = `築基丹：${g.foundation ? '已服用' : '未服用'}・境界：${REALMS[g.realm]}`;
  else if (['thunderward','fiveward','breakpill'].includes(defId)) context = `護法陣減傷：${Math.round(g.ward*100)}%・破境丹減傷：${Math.round(g.breakBoost*100)}%・心魔：${g.demon} 層`;
  else if (defId === 'seven') context = `七星續命：${g.sevenLife ? '已生效' : '未生效'}`;
  else if (defId === 'reset') context = `功法：${g.technique?.name ?? '未修習'}・靈根：${APTITUDE_NAMES[g.aptitude]}`;
  else if (defId === 'revive') context = `狀態：已死亡・修為：${g.exp}`;
  return `${context ? `<b>${context}</b><br>` : ''}${generalInfo(g)}`;
}

import type { General, Item } from '../game/types';
import { STAT_NAMES } from '../data/items';
import { canUse, requirement } from '../systems/ItemSystem';
import { APTITUDE_NAMES, REALMS } from '../data/generals';
import { attack, defense, craft, expCap, maxHp, maxStamina, power } from '../systems/GeneralSystem';
import { fxText, passiveOf } from '../data/passives';

/** 選將時顯示目前有效能力，包含境界、裝備與被動。 */
export function generalInfo(g: General): string {
  return `${REALMS[g.realm]}・${APTITUDE_NAMES[g.aptitude]}｜血量 ${g.hp}/${maxHp(g)}・體力 ${g.stamina}/${maxStamina(g)}・戰力 ${power(g)}<br>` +
    `${g.weapon ? `武器：${g.weapon.name}・無視防禦 ${Math.round((g.weapon.penetration ?? 0) * 100)}%<br>` : ''}武力 ${attack(g)}・防禦 ${defense(g)}・煉丹 ${craft(g, 'alchemy')}・煉器 ${craft(g, 'forging')}・畫符 ${craft(g, 'talisman')}・佈陣 ${craft(g, 'formation')}`;
}

/** 境界標籤：境界越高顏色越鮮豔。 */
export const realmTag = (realm: number) => `<span class="gb-tag realm-tag r${realm}">${REALMS[realm]}</span>`;
/** 靈根標籤：依五行上色。 */
export const aptTag = (g: General) => `<span class="gb-tag apt-${g.aptitude}">${APTITUDE_NAMES[g.aptitude]}</span>`;
/** 標籤列：額外標籤（例如「駐守中」）＋境界＋靈根。 */
export const generalTags = (g: General, tags: string[] = []) =>
  `<span class="gb-tags">${tags.map((t) => `<span class="gb-tag">${t}</span>`).join('')}${realmTag(g.realm)}${aptTag(g)}</span>`;
/** 能力格：[名稱, 數值] 一格一項。 */
export const statCells = (cells: [string, string | number][]) =>
  `<span class="gb-stats" style="--n:${cells.length}">${cells.map(([k, v]) => `<span class="gb-cell"><i>${k}</i><em>${v}</em></span>`).join('')}</span>`;
const bar = (cls: string, k: string, v: number, max: number) =>
  `<span class="bar ${cls}"><i style="width:${Math.min(100, (v / Math.max(1, max)) * 100)}%"></i><span>${k} ${v} / ${max}</span></span>`;
/** 血量、體力兩條。 */
export const vitalBars = (g: General) => `<span class="gb-bars">${bar('hp', '血量', g.hp, maxHp(g))}${bar('sta', '體力', g.stamina, maxStamina(g))}</span>`;
/** 被動框。 */
export const passiveBox = (g: General) => {
  const p = passiveOf(g);
  return `<span class="gb-line gb-passive"><strong>【${p.name}】</strong>${fxText(p.fx)}</span>`;
};

export interface BlockOptions {
  /** 排在境界、靈根前面的標籤 */
  tags?: string[];
  /** 額外說明（放在被動上方），例如警告或用途 */
  note?: string;
}

/** 選將清單用：標籤、能力格、血量體力、武器與被動分區顯示。 */
export function generalBlock(g: General, opts: BlockOptions = {}): string {
  return `<span class="gb">${generalTags(g, opts.tags)}` +
    statCells([['戰力', power(g)], ['武力', attack(g)], ['防禦', defense(g)], ['煉丹', craft(g, 'alchemy')], ['煉器', craft(g, 'forging')], ['畫符', craft(g, 'talisman')], ['佈陣', craft(g, 'formation')]]) +
    vitalBars(g) +
    (g.weapon ? `<span class="gb-line">武器：${g.weapon.name}・無視防禦 ${Math.round((g.weapon.penetration ?? 0) * 100)}%</span>` : '') +
    (opts.note ? `<span class="gb-line gb-note">${opts.note}</span>` : '') +
    passiveBox(g) +
    `</span>`;
}

/** 只需部分資訊的清單：標籤列＋自訂內容（可含 statCells）＋被動。 */
export function generalBrief(g: General, body = '', opts: BlockOptions & { passive?: boolean } = {}): string {
  return `<span class="gb">${generalTags(g, opts.tags)}${body}` +
    (opts.note ? `<span class="gb-line gb-note">${opts.note}</span>` : '') +
    (opts.passive === false ? '' : passiveBox(g)) +
    `</span>`;
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
  // 沒有特別的欄位時，只顯示最基本的狀態
  if (!context) context = `${REALMS[g.realm]}｜血量 ${g.hp}/${maxHp(g)}・體力 ${g.stamina}/${maxStamina(g)}`;
  return `<b>${context}</b>・戰力 <b>${power(g)}</b>`;
}

/** 選使用者：只顯示這個物品用得到的能力值（含門檻）與體力（含消耗） */
export function itemUserInfo(g: General, item: Item): string {
  const r = requirement(item, g);
  const own = craft(g, r.stat);
  const enough = own >= r.min, rested = g.stamina >= r.stamina;
  const mark = (ok: boolean, text: string) => (ok ? text : `<span style="color:#b33a2a">${text}</span>`);
  return `${mark(enough, `${STAT_NAMES[r.stat]} <b>${own}</b>／需 ${r.min}`)}・${mark(rested, `體力 <b>${g.stamina}</b>／需 ${r.stamina}`)}`;
}

/** 使用者排序：能用的排前面，其次依該能力值由高到低 */
export function sortUsers(users: General[], item: Item): General[] {
  const r = requirement(item);
  return [...users].sort((a, b) => Number(canUse(item, b).ok) - Number(canUse(item, a).ok) || craft(b, r.stat) - craft(a, r.stat));
}

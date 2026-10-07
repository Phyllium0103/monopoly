import { ITEM_DEFS } from '../data/items';
import type { Beast, Equipment, General } from '../game/types';

const BASE = import.meta.env.BASE_URL;
/** 名稱前面有「黃品下・」這類品階前綴，圖示以去掉前綴的名稱命名 */
const baseName = (name: string) => name.split('・').pop() ?? name;
const url = (dir: string, name: string) => `${BASE}art/${dir}/${encodeURIComponent(name)}.png`;

/** 丹藥、陣法、符籙、法器 */
export const itemIconUrl = (defId: string) => url(`icons/${ITEM_DEFS[defId].category}`, ITEM_DEFS[defId].name);
/** 神器、寶衣 */
export const equipIconUrl = (e: Equipment) => url(`icons/${e.kind === 'weapon' ? '神器' : '寶衣'}`, baseName(e.name));
/** 靈獸 */
export const beastIconUrl = (b: Beast) => url('icons/靈獸', baseName(b.name));
/** 武將頭像 */
export const portraitUrl = (g: Pick<General, 'id'>) => `${BASE}art/generals/${g.id}.png`;

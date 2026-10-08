import { BEASTS, EQUIP_DESIGNS, ITEM_DEFS } from '../data/items';
import type { Beast, Equipment, General } from '../game/types';

const BASE = import.meta.env.BASE_URL;
/** 名稱前面有「黃品下・」這類品階前綴，圖示以去掉前綴的名稱命名 */
const baseName = (name: string) => name.split('・').pop() ?? name;
const url = (dir: string, name: string) => `${BASE}art/${dir}/${encodeURIComponent(name)}.webp`;

/** 丹藥、陣法、符籙、法器 */
export const itemIconUrl = (defId: string) => url(`icons/${ITEM_DEFS[defId].category}`, ITEM_DEFS[defId].name);
/** 神器、寶衣 */
export const equipIconUrl = (e: Equipment) => url(`icons/${e.kind === 'weapon' ? '神器' : '寶衣'}`, baseName(e.name));
/** 靈獸 */
export const beastIconUrl = (b: Beast) => url('icons/靈獸', baseName(b.name));
/** 武將頭像（小圖 128px，名冊、清單、商店用；檔案小，載得快） */
export const portraitUrl = (g: Pick<General, 'id'>) => `${BASE}art/generals/t/${g.id}.webp`;
/** 武將立繪（大圖 256px，擂台戰與地圖棋子用） */
export const portraitBigUrl = (g: Pick<General, 'id'>) => `${BASE}art/generals/${g.id}.webp`;

// ───────────────────────── 預先載入 ─────────────────────────
// GitHub Pages 上每張圖都是一次網路請求；等到彈窗打開才開始載會看到圖一張張慢慢冒出來。
// 遊戲開始後就在背景依序抓好，同時最多 10 張，不搶遊戲本身的資源。

const queued = new Set<string>();

function preload(urls: string[]) {
  const todo = urls.filter((u) => !queued.has(u));
  todo.forEach((u) => queued.add(u));
  let next = 0;
  const pump = () => {
    if (next >= todo.length) return;
    const img = new Image();
    img.decoding = 'async';
    const done = () => pump();
    img.onload = done;
    img.onerror = done;
    img.src = todo[next++];
  };
  const start = () => {
    for (let i = 0; i < 10; i++) pump();
  };
  const idle = (window as unknown as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback;
  if (idle) idle(start);
  else setTimeout(start, 300);
}

/** 依重要順序預先載入：所有武將小頭像（名冊會一次顯示很多張）→ 物品與裝備圖示 → 主公與開局武將的大圖 */
export function preloadArt(firstGeneralIds: string[], allGeneralIds: string[]) {
  const thumb = (id: string) => `${BASE}art/generals/t/${id}.webp`;
  const big = (id: string) => `${BASE}art/generals/${id}.webp`;
  preload([...firstGeneralIds, ...allGeneralIds].map(thumb));
  const icons: string[] = [];
  for (const d of Object.values(ITEM_DEFS)) icons.push(url(`icons/${d.category}`, d.name));
  for (const e of EQUIP_DESIGNS) icons.push(url(`icons/${e.kind === 'weapon' ? '神器' : '寶衣'}`, e.name));
  for (const b of BEASTS) icons.push(url('icons/靈獸', b.name));
  preload(icons);
  preload(['liubei', 'caocao', 'sunquan', 'dongzhuo', ...firstGeneralIds].map(big));
}

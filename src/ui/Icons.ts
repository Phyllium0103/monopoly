import { WEAPON_CATALOG } from '../data/weaponCatalog';
import { BEASTS, EQUIP_DESIGNS, ITEM_DEFS } from '../data/items';
import type { Beast, Equipment, General } from '../game/types';

const BASE = import.meta.env.BASE_URL;
/** 名稱前面有「黃品下・」這類品階前綴，圖示以去掉前綴的名稱命名 */
const baseName = (name: string) => name.split('・').pop() ?? name;

// ───────────────────────── 圖片包 ─────────────────────────
// 武將縮圖與物品圖示合成一個 pack.bin，只要 1 次網路請求；
// 載入後轉成瀏覽器內部的 blob 網址，之後顯示圖片完全不用再連網。
// 圖片包還沒載好（或載入失敗）時，退回逐張下載，所以不會出現空白。

const packUrls = new Map<string, string>();
let packPromise: Promise<void> | null = null;

/** 讀取圖片包；網頁一開（還在選主公畫面）就開始載 */
export function loadArtPack(): Promise<void> {
  if (packPromise) return packPromise;
  packPromise = (async () => {
    try {
      const [index, bin] = await Promise.all([
        fetch(`${BASE}art/pack.json`).then((r) => (r.ok ? (r.json() as Promise<Record<string, [number, number]>>) : Promise.reject(new Error('pack.json')))),
        fetch(`${BASE}art/pack.bin`).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error('pack.bin')))),
      ]);
      for (const [key, [off, len]] of Object.entries(index)) {
        packUrls.set(key, URL.createObjectURL(new Blob([bin.slice(off, off + len)], { type: 'image/webp' })));
      }
    } catch {
      // 失敗就之後逐張載
    }
  })();
  return packPromise;
}
void loadArtPack();

/** 優先用圖片包裡的 blob 網址，沒有才用檔案網址 */
const url = (dir: string, name: string) => packUrls.get(`${dir}/${name}`) ?? `${BASE}art/${dir}/${encodeURIComponent(name)}.webp`;

/** 丹藥、陣法、符籙、法器 */
export const itemIconUrl = (defId: string) => ['realmkey', 'realmescape'].includes(defId)
  ? `${BASE}art/icons/realm/${defId}.svg`
  : url(`icons/${ITEM_DEFS[defId].category}`, ITEM_DEFS[defId].name);
/** 專屬武器與寶衣 */
export const equipIconUrl = (e: Equipment) => e.fixedGeneralId ? `${BASE}art/icons/weapons/${WEAPON_CATALOG[e.fixedGeneralId].material}.svg` : url('icons/寶衣', baseName(e.name));
/** 靈獸 */
export const beastIconUrl = (b: Beast) => url('icons/靈獸', baseName(b.name));
/** 武將頭像（小圖 128px，名冊、清單、商店用） */
export const portraitUrl = (g: Pick<General, 'id'>) => url('generals/t', g.id);
/** 武將立繪（大圖 256px，擂台戰與地圖棋子用） */
export const portraitBigUrl = (g: Pick<General, 'id'>) => `${BASE}art/generals/${g.id}.webp`;

// ───────────────────────── 預先載入 ─────────────────────────
// 大圖（擂台戰、地圖棋子）不在圖片包裡，遊戲開始後在背景載入；
// 圖片包失敗時，縮圖與圖示也由這裡逐張補載。

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

export function preloadArt(firstGeneralIds: string[], allGeneralIds: string[]) {
  const big = (id: string) => `${BASE}art/generals/${id}.webp`;
  void loadArtPack().then(() => {
    // 圖片包沒載成功時才逐張補載
    if (packUrls.size === 0) {
      const files = [...firstGeneralIds, ...allGeneralIds].map((id) => `${BASE}art/generals/t/${id}.webp`);
      const dirs = (d: string, n: string) => `${BASE}art/icons/${d}/${encodeURIComponent(n)}.webp`;
      for (const d of Object.values(ITEM_DEFS)) files.push(dirs(d.category, d.name));
      for (const e of EQUIP_DESIGNS) files.push(dirs('寶衣', e.name));
      for (const b of BEASTS) files.push(dirs('靈獸', b.name));
      preload(files);
    }
  });
  preload(['liubei', 'caocao', 'sunquan', 'dongzhuo', ...firstGeneralIds].map(big));
}

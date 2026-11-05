# 美術與素材

這份文件說明遊戲素材的規格、來源，以及更新後要跑哪些工具。各資料夾的位置見 [project-structure.md](project-structure.md#素材資料夾)。

## 基本原則

- **原始檔與遊戲檔分開。** 原圖和未壓縮模型留在 `art-src/` 或本機素材資料夾，遊戲只載入壓縮後的 WebP 與 GLB。
- **檔名帶內容雜湊或版本。** 模型和圖集用 `-v50`、`-539ac5041bdd` 這類後綴，避免瀏覽器沿用舊快取。這些檔名不代表舊版，目前的模型都在使用。
- **所有素材網址都走 `assetUrl`（`src/data/assetUrl.ts`）。** 遊戲部署在 GitHub Pages 的子路徑 `/monopoly/`，直接寫 `/art/...` 會 404。
- **來源紀錄放在 `art-src/manifests/`。** 內含來源、SHA-256、尺寸，部分測試會讀取，改名或搬動要同步更新。
- **轉檔不在一般建置中執行。** CI 不需要 Python 影像套件，轉檔後把產物提交進版本庫。

## 素材規格總覽

| 素材 | 遊戲檔位置 | 規格 | 來源紀錄 |
|---|---|---|---|
| 武將全身圖 | `public/art/generals/full/` | 高 1024px，WebP q80 | `base-general-art.json` |
| 武將特效圖 | `public/art/generals/full-fx/` | 高 1024px，WebP q80 | `fx-general-art.json` |
| 武將頭像 | `public/art/generals/head/` | 192×192，WebP q84 | `general-head-crops.json` |
| 物品圖 | `public/art/icons/<丹藥、陣法、符籙、法器>/` | 384×384 透明 WebP q80 | `item-woodblock-assets.json` |
| 專屬武器圖 | `public/art/icons/weapon-illustrated/` | 高 384px，WebP q80 | `weapon-illustrated-assets.json`、`weapon-illustrated-generals.csv` |
| 材料圖示 | `public/art/icons/materials/` | 256×256，WebP q80 | `material-icon-assets.json` |
| 五行精靈 | `public/art/spirits/` | 動作圖集 640×640（4×4），靜止圖 160×160，WebP q80 | `elemental-spirit-assets.json` |
| 境界外框 | `public/art/realm-frames/` | 1536×1024 透明 PNG 圖集 | `realm-frames.json`、`realm-frame-generation-prompt.txt` |
| 主公動畫 | `public/art/lord-hud-runtime-*/` | 53 張 768×384，WebP q95 | `lord-actor-assets.json` |
| 骰子 | `public/art/dice/ivory-recessed.glb` | GLB，無外部貼圖 | 本文件 |
| 地圖模型 | `public/art/map-runtime/` | Meshopt + WebP，三級 LOD | `manifest.json` |

表中的來源紀錄都在 `art-src/manifests/`，地圖模型的 `manifest.json` 在 `public/art/map-runtime/`。

## 武將圖片

**構圖：** 全身站姿，身體與武器朝畫面右側，對戰時左方人物會水平翻轉。透明背景，手持《全部武將武器名稱對照》表上的專屬武器。

**使用情境：**

- 全身圖：武將名冊（黃、玄、地階武器）、擂台戰、渡劫、主公地圖棋子、點頭像放大。
- 特效圖：武器升到天階後，名冊改用這版。圖框與排版大小不變，不另製頭像。
- 頭像：選將清單、商店、技藝比試。
- 冤魂沿用原人物圖。
- 武將框比例 1145 / 1536。

**新增或更換人物：**

1. 原圖放進 `art-src/generals/base/<id>.png`，並在 `art-src/manifests/base-general-art.json`、`src/data/generalArt.ts` 補上尺寸。
2. 在 `art-src/manifests/general-head-crops.json` 加入 `"<id>": [中心x, 中心y, 邊長]`（原圖像素）。
3. 產生 WebP（需要 Pillow）：

```python
from PIL import Image
import json
crops = json.load(open('art-src/manifests/general-head-crops.json'))
for id, (cx, cy, side) in crops.items():
    im = Image.open(f'art-src/generals/base/{id}.png').convert('RGBA')
    full = im.resize((round(im.width * 1024 / im.height), 1024), Image.Resampling.LANCZOS)
    full.save(f'public/art/generals/full/{id}.webp', 'WEBP', quality=80, method=6)
    h = side / 2
    head = im.crop((round(cx - h), round(cy - h), round(cx + h), round(cy + h))).resize((192, 192), Image.Resampling.LANCZOS)
    head.save(f'public/art/generals/head/{id}.webp', 'WEBP', quality=84, method=6)
```

## 圖示

物品、寶衣、靈獸、武器、材料圖都放在 `public/art/icons/` 的各子資料夾，改完要執行 `npm run build:art-pack` 重新打包。遊戲從 `pack.bin` 讀取。

- **物品圖**：64 種，古樸版畫風格。PNG 母檔留在本機素材資料夾。
- **武器圖**：175 位武將的 115 種初階武器名稱對應 62 種外型，四階共用同一外型。名冊展開後以 128px 顯示。
- **材料圖示**：18 種，極簡平面透明圖，六組各三階。

**更新武器圖：**

```bash
python scripts/import-weapon-icons.py --source <透明版資料夾> --transparent
python scripts/shrink-weapon-icons.py
npm run build:art-pack
```

**更新材料圖示：** 執行 `node scripts/import-material-icons.mjs`。

**更新五行精靈：** 執行 `node scripts/import-elemental-spirits.mjs`。精靈採用已選定的「08 軟萌元素靈」，每種四套動作、每套 16 格，以世界座標顯示，圖框邊長為道路格的 4/3，腳底接觸點對準格中心。

## 境界外框

採用已選定的「02 白玉極簡・境界圖示遞進版」，11 個境界各一個外框。圖集視窗位置在 `src/data/realmFrames.ts`。基礎版與特效版人物共用相同外框。

## 主公動畫

原始 1774×887 圖集放在 `public/art/lord-hud/`，遊戲使用 `src/data/lordHudRuntime.ts` 指向的帶雜湊資料夾。

**重要：** 圖集的 width、height、frame rect、anchor 仍是原始邏輯像素，`textureWidth`、`textureHeight` 才是實際小圖尺寸。不要把邏輯 width 改成 768，否則人物裁切與定位會錯。

更新原始圖後，在裝有 Pillow 的環境執行 `python scripts/build-lord-hud-runtime.py`，再把新資料夾與產生的 TS 一起提交。

主公底座使用 `public/art/lord-base-images-r5/03-tall.webp`（懸浮仙峰），資訊圖示在 `public/art/lord-island-hud/`。

## 地圖

**配置：** 每格 4 世界單位，北方在 −Z。道路實體寬 3.76、厚 0.64。建築占地 8×8。原始配置保存在 `public/art/map-selected/layout-source.json`。

**相機：** 正交投影，固定方位 45°、俯角 30°，不能旋轉。視窗受地台範圍限制，最遠只能看到底圖一半寬高。

**底圖與道路：** 淺玉地形 `terrain-jade-clear-20261020.png`，四方向白玉道路貼圖 `road-arrow-*.png`，踩格變色用 `cyan-occupied.png`。

**城池：** 六階外觀依繁榮度每 50 一階。主色材質可依實例著色：劉備綠、董卓紫、曹操藍、孫權紅、無主白。

**展示建築：** 淬體武院、四藝道院、萬寶鑑定所、鬼市各四棟，配置在 `public/art/map-selected/display-facilities.json`，只有模型與滑鼠提示，沒有事件。

### 模型流程

```text
art-src/map-models/         原始 GLB
        ↓ scripts/optimize-map-models.mjs
public/art/map-selected/    遊戲配置用的選定模型
        ↓ scripts/map-runtime-tools/build.mjs
public/art/map-runtime/     壓縮後的三級 LOD，遊戲實際載入
```

遊戲目前固定載入 **LOD1**（`src/world/MapModelPool.ts` 的 `ACTIVE_MAP_LOD`），募兵司只有 LOD0。LOD1 約是 LOD0 下載量的四成，在地圖鏡頭距離看不出差異。

**重建：**

```bash
npm ci --prefix scripts/map-runtime-tools
node scripts/map-runtime-tools/build.mjs
```

工具的依賴隔離在該資料夾，不加入遊戲依賴。重建後要檢查縮放、門窗輪廓、城池換色，以及清單指向的實際檔案。

**重要：** Meshopt 頂點可能是正規化整數，`MapModelPool` 必須保留 GLB 節點矩陣並乘入實例矩陣。直接把世界座標寫回頂點會溢位，把模型壓壞。

### 屋頂配色

配色在離線時寫入模型的基礎色與貼圖，遊戲執行時沒有換色 shader。選擇結果保存在 `art-src/roof-colors/selection.json`。

| 設施 | 配色 |
|---|---|
| 百草堂 | 藥園鼠尾草 |
| 天寶商行 | 孔雀寶藍 |
| 萬獸園 | 獸紋赭金 |
| 聽風樓 | 酒旗胭脂 |
| 秘境 | 暮紫仙闕 |
| 四藝道院 | 丹砂墨緣 |
| 萬寶鑑定所 | 珍珠暖灰，含頂端採光頂 |
| 鬼市 | 幽紫墨瓦 |
| 其餘設施 | 原色 |

重新套用：在裝有 Pillow 與 NumPy 的環境執行 `python scripts/apply-roof-colors.py`。工具只讀取未換色的來源模型，輸出新檔，並把驗證報告寫到 `outputs/`（可以刪除）。

## 骰子

`public/art/dice/ivory-recessed.glb`：玉白骰子，1、4 為朱紅，其餘深黑。朝向 +Y=1、−Y=6、+X=3、−X=4、+Z=2、−Z=5。

動作由 Rapier 實際模擬，不是烘焙動畫：固定步長 1/480 秒、重力 −9.81，初始條件用 `crypto.getRandomValues`。先算完物理再播放，開始前用一個固定的立方體對稱旋轉對應引擎給的點數，落地後不再轉向或移動骰子。原速、2×、4× 分別以物理時間的 2×、4×、8× 播放。

模型、物理引擎或 WebGL 不可用時只顯示文字結果，不阻擋遊戲。

## 載入與效能

**開場讀條：** `index.html` 先顯示載入頁，`Game.prepare` 依實際完成的資源更新進度。地形、建築模型、物品包、主公立繪、人物動畫貼圖、骰子與物理 Worker，以及首次 GPU 準備都完成才進入遊戲。失敗時保留畫面並提供重新載入。模型最多三個同時載入。

**背景執行：**

- 骰子模擬、多人房主的重播、存檔序列化都在 Worker 內執行。
- Worker 不支援或失敗時退回原邏輯，不會反覆重建。

**繪圖節流：**

- 人物只在動作或位置改變時繪圖。
- 地圖靜置時上限 30 FPS，互動與移動不受限；戰鬥、賭場覆蓋時降低底圖繪製頻率。
- 高 DPI 地圖有 250 萬像素預算，透明人物與骰子畫布各 160 萬。
- 節流只影響繪圖，不停止遊戲更新。

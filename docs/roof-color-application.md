# 屋頂選色套用與 GitHub 合併

2026-11-04。先比對遠端與本地，再將 GitHub `main` 從 `ec848ca` 快轉至 `03b3a85`。遠端四筆提交包含舊資產整理、團隊天賦系統及其合併、1600×900 介面設計尺寸與側欄閱讀性調整。

本地 `src/ui/HelpView.ts` 技術問答逐位元保留；配色預覽、使用者選色及既有未追蹤主公素材都保留。沒有以本地檔案覆蓋遠端的新功能。

## 使用者選色

以使用者在 2026-11-04 匯出的 13 筆選擇為準：

| 設施 | 套用結果 |
|---|---|
| 天工坊 | 原色 |
| 百草堂 | A・藥園鼠尾草 |
| 天寶商行 | A・孔雀寶藍 |
| 藏經閣 | 原色 |
| 萬獸園 | B・獸紋赭金 |
| 聽風樓 | A・酒旗胭脂 |
| 乾坤骰殿 | 原色 |
| 秘境 | A・暮紫仙闕 |
| 淬體武院 | 未記錄新方案，沿用原色 |
| 四藝道院 | B・丹砂墨緣 |
| 萬寶鑑定所 | B・珍珠暖灰，包含頂端採光頂 |
| 鬼市 | A・幽紫墨瓦 |
| 募兵司 | 原色 |
| 山河社稷圖 | 原色 |
| 礦脈 | 無獨立屋頂，原色 |

選擇、色碼、目標材質與未換色來源檔名保存在 `art-src/roof-colors/selection.json`。原始匯出亦保存在 `outputs/roof-color-review-20261104/selected-colors.json`。

## 遊戲資產

八種設施各輸出 LOD0／LOD1／LOD2，共 24 個帶內容指紋的 GLB。更新 `public/art/map-runtime/manifest.json` 和 `src/data/mapRuntimeModels.ts`，讓遊戲直接載入新檔，避開舊模型快取。

配色在離線處理時寫入屋頂基礎色與貼圖。保留原有紋理亮度起伏、UV、法線、透明通道及 PBR 屬性；沒有新增遊戲執行時的換色 shader 或幾何副本。八種目標材質名稱在每個細節等級都核對存在。

原始選定模型與未換色 runtime 模型仍保留，預覽頁的「原有配色」因此維持換色前參考。六階城池及其陣營換色規則未改動。

當前使用的 LOD1（募兵司沿用其 LOD0）中，15 種設施合計由 20,593,868 bytes 變為 20,602,924 bytes，增加 9,056 bytes。此數字是模型檔容量，不是效能實測。

## 重現與驗證

在裝有 Pillow 與 NumPy 的隔離 Python 環境執行 `python scripts/apply-roof-colors.py`。這個工具只讀取選色清單中的未換色來源模型，輸出新檔；一般遊戲建置直接使用已產生的 GLB，不需要 Python。

每檔輸出前核對 meshes、accessors、nodes、scenes 及原有 binary 資料未變動，非屋頂材質保持一致；貼圖編碼後確認透明通道逐像素一致。完整報告為 `outputs/roof-color-review-20261104/applied-runtime-report.json`。

局部檢查：`node tests/map-runtime.cjs` 與 `npm run build` 通過。實際瀏覽器進入新版遊戲，確認地圖、新介面、天賦入口及新模型可載入，未見瀏覽器錯誤。未執行整套 `npm test` 或擴大測試。

推送至 `main` 後，既有 GitHub Pages 工作流程會自動建置並部署這批已套用配色的遊戲資產。

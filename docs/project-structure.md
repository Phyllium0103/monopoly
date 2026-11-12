# 專案結構

這份文件說明每個資料夾負責什麼，以及要改某項功能時該去哪裡找。

## 頂層資料夾

| 位置 | 負責什麼 | 會部署嗎 |
|---|---|---|
| `src/` | 遊戲全部程式碼 | 打包後部署 |
| `public/` | 遊戲執行時載入的素材，原樣複製到網站 | 會，放進來就會部署 |
| `art-src/` | 美術原始檔與資料紀錄，遊戲不直接讀取 | 不會 |
| `docs/` | 專案文件 | 不會 |
| `scripts/` | 離線工具：素材轉檔、資料匯入、產生文件 | 不會 |
| `tests/` | Node 測試 | 不會 |
| `supabase/` | 多人連線的資料庫遷移檔 | 另外手動執行 |
| `.github/workflows/` | 推到 `main` 時自動測試、建置並部署到 GitHub Pages | 不會 |

`index.html` 是唯一的遊戲入口，`vite.config.ts` 設定建置，`.env.example` 列出多人連線需要的環境變數。

## `src/` 各資料夾

依賴方向由下往上：`data` 和 `systems` 是純規則，不碰畫面；`ui`、`world`、`scene` 只負責顯示。

| 資料夾 | 負責什麼 | 代表檔案 |
|---|---|---|
| `data/` | 遊戲資料與設定表 | `generals.ts`、`itemCatalog.ts`、`talents.ts`、`board.ts` |
| `systems/` | 各系統的規則與公式 | `BattleSystem`、`CitySystem`、`ShopSystem`、`AISystem` |
| `game/` | 遊戲狀態與回合基礎 | `GameState.ts`、`types.ts`、`TurnManager.ts`、`Game.ts`、`SoloSave.ts`（單機存檔） |
| `engine/` | 整局流程，單機和多人共用 | `Engine.ts`、`server.ts`、`prompts.ts`、`view.ts` |
| `net/` | 多人連線：建房、配對、房主邏輯 | `HostRoom.ts`、`RoomService.ts`、`OnlineSession.ts`、`p2p/` |
| `world/` | 3D 地圖：地形、建築、骰子物理 | `World.ts`、`MapModelPool.ts`、`DicePhysics.ts` |
| `scene/` | Three.js 場景、相機、動畫、點選 | `SceneManager.ts`、`CameraController.ts`、`picking.ts` |
| `character/` | 地圖上的主公立繪 | `CharacterSprite.ts` |
| `ui/` | 所有介面畫面 | `GameUI.ts`、`BattleView.ts`、`ShopView.ts`、`HelpView.ts` |
| `faction/` | 四位主公的定義 | `Faction.ts` |
| `performance/` | Worker 請求與繪圖像素預算 | `WorkerRequest.ts`、`renderBudget.ts` |

`src/main.ts` 是啟動點，`src/style.css` 是全域樣式，各畫面的專用樣式放在 `src/ui/*.css`。

### 兩條重要界線

- **`systems/`、`data/`、`engine/` 不使用 Three.js 或 DOM。** 規則因此能在 Node 測試和 Worker 裡執行，也能讓多人房主重播。要顯示東西，透過 `engine/view.ts` 的 `EngineView` 介面。
- **`Engine.ts` 是單機與多人共用的流程。** 單機由 `game/Game.ts` 建立並直接播放畫面；多人由 `engine/server.ts` 用「快照 + 重播」執行，房主瀏覽器是權威端，詳見 [multiplayer.md](multiplayer.md)。所有結果都由引擎驗證，介面只負責提出請求。

## 想改某個東西時

| 想改什麼 | 去哪裡 |
|---|---|
| 武將能力、技能 | `src/data/generals.ts`、`passives.ts` |
| 物品價格、效果 | `src/data/itemCatalog.ts`，效果邏輯在 `src/systems/ItemSystem.ts`、`DirectItems.ts` |
| 天賦樹 | `src/data/talents.ts`，畫面在 `src/ui/TalentView.ts` |
| 過路費、收入、繁榮度 | `src/systems/CitySystem.ts` |
| 戰鬥規則 | `src/systems/BattleSystem.ts`，畫面在 `src/ui/BattleView.ts` |
| 商店貨架與回收 | `src/systems/ShopSystem.ts`，畫面在 `src/ui/ShopView.ts` |
| 九州風雲 | `src/systems/EventSystem.ts` |
| 驛道奇遇 | `src/systems/RoadEvents.ts` |
| 秘境 | `src/systems/RealmSystem.ts` |
| 回合開始的結算 | `src/game/TurnManager.ts` |
| 回合與落地事件的流程 | `src/engine/Engine.ts` |
| 電腦行為 | `src/systems/AISystem.ts` |
| 地圖配置 | `src/data/selectedLayout.ts`、`displayFacilities.ts` |
| 遊戲內說明 | `src/ui/HelpView.ts` |
| 多人房間規則 | `src/net/HostRoom.ts` |

規則改動要同步更新 [game-content.md](game-content.md) 和 `HelpView.ts`，資料改動要執行 `npm run docs:data`。

影響對局相容性的地圖或規則改動，要更新 `src/data/board.ts` 的 `MAP_RULES_VERSION`，舊版房間才會被拒絕進入，不會誤讀新資料。

## 素材資料夾

詳細規格見 [art-and-assets.md](art-and-assets.md)。

| 位置 | 內容 |
|---|---|
| `public/art/generals/` | 武將全身圖、特效版、頭像 |
| `public/art/icons/` | 物品、武器、材料圖示的個別檔案 |
| `public/art/pack.bin`、`pack.json` | 圖示打包檔，由 `npm run build:art-pack` 產生 |
| `public/art/map-selected/` | 地圖配置資料、底圖、道路貼圖、未壓縮模型 |
| `public/art/map-runtime/` | 遊戲實際載入的壓縮模型 |
| `public/art/lord-hud-runtime-*/` | 主公動畫的遊戲用圖集 |
| `public/art/lord-hud/` | 主公動畫原始圖，建置腳本與測試會讀取 |
| `public/art/lord-base-images-r5/`、`lord-island-hud/` | 主公底座與資訊圖示 |
| `public/art/spirits/`、`realm-frames/`、`dice/` | 五行精靈、境界外框、骰子模型 |
| `public/audio/` | 背景音樂 |
| `art-src/generals/` | 武將透明 PNG 原圖（基礎版與特效版） |
| `art-src/map-models/` | 原始地圖模型 GLB |
| `art-src/roof-colors/` | 屋頂選色清單 |
| `art-src/manifests/` | 素材來源、SHA 與處理紀錄 |

## 工具腳本

一般 `npm run build` 只會執行 `build-art-pack.mjs`，其他工具要手動執行。

| 腳本 | 用途 |
|---|---|
| `build-art-pack.mjs` | 把 `public/art/icons/` 打包成 `pack.bin` |
| `build-game-data-doc.cjs` | 產生 `docs/game-data.md`，用 `npm run docs:data` 執行 |
| `build-lord-hud-runtime.py` | 產生主公動畫的遊戲用圖集 |
| `map-runtime-tools/` | 產生地圖壓縮模型，有自己的依賴 |
| `optimize-map-models.mjs` | 更新地圖模型清單，用 `npm run optimize:models` 執行 |
| `apply-roof-colors.py` | 把選定的屋頂配色寫入模型，報告輸出到 `outputs/` |
| `import-weapon-icons.py`、`shrink-weapon-icons.py` | 匯入與縮小武器圖 |
| `import-material-icons.mjs` | 匯入材料圖示 |
| `import-elemental-spirits.mjs` | 匯入五行精靈圖 |

### 自動產生的檔案

這些檔案不要手改，要改來源後重新產生：

| 檔案 | 由誰產生 |
|---|---|
| `docs/game-data.md` | `build-game-data-doc.cjs` |
| `public/art/pack.bin`、`pack.json` | `build-art-pack.mjs` |
| `src/data/mapModels.ts` | `optimize-map-models.mjs` |
| `src/data/mapRuntimeModels.ts` | `map-runtime-tools/`、`apply-roof-colors.py` |
| `src/data/weaponIcons.ts` | `import-weapon-icons.py` |
| `src/data/lordHudRuntime.ts` | `build-lord-hud-runtime.py` |

## 測試

測試是 `tests/*.cjs`，直接用 Node 載入 `src/` 的 TypeScript。

```bash
npm test             # 主要測試，部署前會執行
npm run test:map     # 地圖規則
npm run test:dice    # 骰子
npm run test:assets  # 部署路徑與素材
npm run test:spirits # 五行精靈
node tests/<檔名>.cjs # 單獨執行
```

以下測試不在 `npm test` 內，要手動執行：`direct-breakthrough`、`direct-items`、`item-dock-order`、`item-selection`、`lord-actor-assets`、`lord-actor-hud`、`lord-hud-runtime`、`map-runtime`、`performance-workers`、`start-facing`。

## 開發用網址參數

| 參數 | 作用 |
|---|---|
| `?lord=cao\|sun\|liu\|dong` | 跳過選擇畫面，直接以該主公開局 |
| `?rounds=<輪數\|endless>` | 指定回合數，搭配 `lord` 使用 |
| `?p2p=local` | 不需要 Supabase，用兩個分頁測試多人連線 |

遊戲內右上角的「🧪 測試」按鈕可取得大量靈石、士兵、物品與材料。

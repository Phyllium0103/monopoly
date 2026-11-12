# Skill 整理與模型切換候選

## 後續清理結果

依使用者要求，已將 33 個目前不適用的 skill 從啟用目錄移除，本機剩下 103 份 SKILL.md。為保留恢復方式，原目錄移至 `C:/Users/User/.codex/skill-backups/unused-monopoly-20261113/`，不在 skill 載入路徑內。

移除清單：analog-found-footage-horror、apocalypse-worlds、body-horror-style、brutalist-mood、cosmic-eldritch-horror、dream-weirdcore-style、folk-horror-style、frutiger-aero-style、genre-action-combat、genre-metroidvania-roguelike、genre-narrative-vn、genre-open-world-sandbox、genre-puzzle-platformer、genre-racing-sports、genre-shooter、genre-soulslike、genre-stealth、genre-survival、godot-export、horror-style、indie-horror-aesthetics、liminal-space-style、mascot-logo-reconstruction、mascot-puppet-horror、neon-retrofuturism、noir-style、psx-horror-style、sci-fi-punk-worlds、unity-export、unreal-export、vehicle-artist、voxel-style、wireframe-to-3d。

以下為清理前的分類與候選調查紀錄。

檢查日期：2026-11-13。使用者層級 `C:/Users/User/.codex/skills` 共找到 136 份 SKILL.md；插件內的 skills 另外依本次聊天提供的清單檢視。沒有完整歷史使用紀錄，以下判斷是「對目前專案的用途」，不能視為從未使用過。這次沒有刪除、停用或安裝任何 skill。優先候選已下載至 `output/skill-preview/model-reasoning-router/` 供預覽，尚未啟用。

## 建議分類

| 分類 | Skills／家族 | 建議 |
| --- | --- | --- |
| 庫存與遊戲功能 | build-game-inventory、create-game-vfx、optimize-threejs-games | 保留，符合目前遊戲 |
| 圖片與參考 | imagegen、gpt-image、get-prompt-from-image | 保留，仙衣與道具圖片仍會使用 |
| 系統與操作 | skill-installer、skill-creator、openai-docs、computer-use | 保留，需要時使用 |
| Blender 製作主線 | blender-*、text-to-blender、img2threejs、modeling/materials/lighting/rendering、scene-assembly、procedural-modeling、environment-artist、prop-artist、character-artist、creature-artist | 製作地圖或角色模型時使用，目前商店 UI 不使用 |
| 動畫、UV、拓撲與輸出 | animation*、rigging、cloth-sim、physics-sim、geometry-nodes、hair-groom、retopology、sculpting、texture-*、uv-*、atlas-*、closed-surface-*、collision-proxy、lod-pipeline、asset-optimization、export-pipeline、godot-export、unity-export、unreal-export | 模型管線備用；Godot／Unity／Unreal 輸出與目前 Three.js 專案無直接需求 |
| 模型對齊與驗收 | reference-*、multiview-*、landmark-*、orthographic-*、fit-repair-*、source-part-*、contour-*、wireframe-*、mascot-logo-*、qa-review、quality-refinement-autoloop、lookdev | 有參考模型任務才啟用 |
| 美術風格庫 | 各種 *-style、*-mood、*-worlds、genre-*、visual-console-eras，以及 camera-cinematography、orbital-hud-motion、hard-surface、compositing、vfx-fx、set-dressing、vegetation-artist、vehicle-artist、character-archetypes | 主題備用，不適合整批刪除；恐怖、科幻、射擊、競速、末日等分支目前沒有需求 |
| 文件與資料插件 | documents、pdf、presentations、spreadsheets、Google Drive 系列、template-creator | 產出文件時使用，目前商店 UI 不使用 |
| 其他插件 | sites、plugin-creator、plugin-management、work-pets、visualize | 獨立網站、插件、寵物或對話視覺化時才使用；目前專案不需要 |
| 其他本機項目 | i-have-adhd；references 目錄 | 與商店 UI 無直接關聯；references 是資源目錄，不因目錄名稱就判為獨立 skill |

重複度較高的家族是 blender-materials／materials、blender-lighting／lighting、blender-rendering／rendering、blender-animation／animation，以及多個美術風格分支。它們可能互相引用，這次僅列出可整理候選，不移除檔案。

## 模型切換候選（先供檢視）

1. **model-reasoning-router**（優先考慮）
   - 來源：https://github.com/robertiuoras/Codex-skill-model-reasoning-router
   - 原始指引：https://raw.githubusercontent.com/robertiuoras/Codex-skill-model-reasoning-router/main/SKILL.md
   - 已讀取內容：依任務選擇模型與思考強度；CLI 控制器可在下一回合以指定模型續接同一任務。
   - 原始指引明示：無法改變正在執行的推論，也不能宣稱控制 Codex 可見的模型選單；桌面聊天仍由使用者或產品介面切換。
2. **codex-model-routing**
   - 來源：https://github.com/peterjohannmedina/codex-model-routing
   - 搜尋內容顯示支援 Sol／Luna／Astra 選擇、思考強度及工作分派；尚未完整審查，不列為已驗證可自動切換桌面模型。
3. **codex-model-switchboard**
   - 來源：https://github.com/Yichen-ZJU/codex-model-switchboard
   - 用於 CLI provider 切換及共享 resume 歷史，涉及橋接／代理供應商；不是目前在同一桌面聊天切換 Sol／Astra 的直接解法。

官方 curated 清單已查詢，未列出模型切換 skill。優先候選僅下載到專案預覽目錄，未放入啟用目錄，也未改寫全域設定。

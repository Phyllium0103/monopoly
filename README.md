# 仙途三國

架空三國 × 修仙 × 城池經營 × 策略桌遊 —— Three.js 本地單人 MVP。

## 啟動

```bash
npm install
npm run dev       # 開發伺服器 http://localhost:5173
npm run build     # 型別檢查 + 打包到 dist/
```

開發時可用 `?faction=wei|shu|wu|jin` 跳過選擇畫面直接開局。

## 玩法

每回合，你的三名角色各自可以：

1. **擲骰移動**（空白鍵）：點選黃色標記的格子，最多走骰子點數的步數。
2. **抵達觸發**：靈脈 ✨ 給靈氣與修為、市集 💰 給靈石、兇地 ☠ 必定觸發事件，其他地點有機率觸發隨機事件。
3. **執行一個主要行動**：佔領／攻城、招募弟子、招募軍隊、建設、閉關修煉、服用丹藥、探索秘境。

全部角色行動完後按 **結束回合**（Enter）。NPC 勢力接著行動，各勢力結算城池收入與軍糧。
30 回合後進行天下結算：`城池 × 100 + 靈石 + 軍隊 × 2 + 角色修為`。

操作：左鍵拖曳旋轉、右鍵平移、滾輪縮放、WASD／方向鍵移動視角、Esc 取消移動。

### 四大宗門

| 宗門 | 特色 |
| -- | -- |
| 魏・玄甲宗 | 軍隊容量 +30%、城防 +20%、建設成本 -25% |
| 蜀・劍閣天宗 | 英雄戰力 +30%、修煉速度 +30%、軍隊容量 -20% |
| 吳・滄瀾丹府 | 城池收入 +25%、糧草消耗 -20%、長江水路只算 1 步、丹藥 -30% |
| 晉・天機陰陽門 | 事件機率與效果 +20%、可看見敵方守軍、天機陣（不耗行動）削弱敵城 |

### 攻城

`角色戰力 + 軍隊 + 弟子支援 × 0.5`，乘上隨機係數 0.85–1.15，對上 `城防 × 2 + 守軍 + 駐守角色`。同一格的己方角色會一起出戰。

## 程式架構

```text
src/
├── main.ts
├── game/        GameState、Game（主控）、TurnManager、EventManager、types
├── world/       MapData（地圖資料）、MapGraph（路徑）、Terrain、CityMesh、World
├── faction/     Faction.ts（四大宗門的數值）
├── character/   Character（境界、戰力）、CharacterSprite（紙片人）
├── systems/     Economy、Cultivation、Recruitment、Military、Npc
├── scene/       SceneManager、CameraController、Environment、Animator
└── ui/          GameUI（HUD）、EventModal、Screens（開始與結算畫面）
```

遊戲邏輯（`systems/`、`game/` 和 `world/MapGraph.ts`）不依賴 Three.js，之後可以拿去做 NPC AI 或伺服器端驗證。

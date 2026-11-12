# 丞相，這過路費比雷劫還狠！

*Chancellor, This Toll is Worse Than Heavenly Tribulation!*

三國 × 靈氣復甦 × 大富翁 —— Three.js 策略桌遊，支援單人對電腦與多人連線。

從曹操、孫權、劉備、董卓選一位主公，擲骰走遍九州：佔城收過路費、招募 175 位武將、修煉渡劫、探索秘境，讓主公晉入真仙，或讓其他主公破產。

## 啟動

需要 Node 24。

```bash
npm install
npm run dev       # 開發伺服器 http://localhost:5173
npm test          # 主要規則與素材測試
npm run build     # 打包素材、型別檢查並輸出到 dist/
```

開發時可用 `?lord=cao|sun|liu|dong` 跳過選擇畫面直接開局。推到 `main` 會自動測試並部署到 GitHub Pages。

## 文件

| 文件 | 內容 |
|---|---|
| [專案結構](docs/project-structure.md) | 每個資料夾負責什麼、要改功能時去哪裡找 |
| [遊戲內容設定](docs/game-content.md) | 遊戲規則、公式與核心數值 |
| [完整數值表](docs/game-data.md) | 全部武將、物品、天賦、城池的數值，由程式自動產生 |
| [美術與素材](docs/art-and-assets.md) | 素材規格、來源與更新流程 |
| [多人連線](docs/multiplayer.md) | 點對點架構、Supabase 設定與已知限制 |

玩家可在遊戲內按「📖 說明」查看完整規則。

## 操作

左鍵或右鍵拖曳平移、滾輪縮放、WASD 或方向鍵移動視角。空白鍵擲骰，Esc 關閉視窗。單人遊戲在每位主公回合開始時自動存檔，關掉分頁後可從開始畫面的「繼續遊戲」接著玩。右上角可切換 1×／2×／4× 速度。

## 技術

Three.js、TypeScript、Vite，骰子物理使用 Rapier。多人連線以 WebRTC 點對點進行，對局在房主的瀏覽器上運算，Supabase 只負責房號配對。

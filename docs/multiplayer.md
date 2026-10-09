# 多人連線

兩位以上玩家（可在不同電腦、不同網路）用 5 位數房號進入同一房間，準備後開始，對局全程由伺服器裁決並即時同步。單人模式不受影響。

## 架構

```
瀏覽器（GitHub Pages）                       Supabase
┌──────────────────────────┐   RPC（房間）    ┌─────────────────────────────┐
│ LobbyView / OnlineSession│ ───────────────▶ │ PostgreSQL：rooms、room_members │
│ Game（3D 畫面、播放事件） │ ◀── Realtime ─── │  game_public、game_events     │
│                          │   回答抉擇        │                              │
│                          │ ───────────────▶ │ Edge Function「game」         │
└──────────────────────────┘                  │  └ 遊戲引擎（與單人同一份）     │
                                              └─────────────────────────────┘
```

- **遊戲引擎**（`src/engine/Engine.ts`）：完整的回合流程與規則，不碰畫面與網路。玩家的每個決定都是可序列化的「抉擇」（`prompts.ts`），畫面效果都是可重播的「事件」（`view.ts`）。單人時在瀏覽器執行；多人時在伺服器執行。
- **權威端**（`src/engine/server.ts` → 打包進 `supabase/functions/game`）：每位主公回合開始時存一份快照；玩家每回答一次，伺服器就用同一組亂數種子從快照重跑本回合、依序餵入已記錄的回答，直到下一個需要玩家回答的抉擇。骰子與所有結果只由伺服器產生，玩家只能從伺服器提供的選項中回答。
- **寫入**：只有 Edge Function（service role）能寫遊戲資料。每次寫入以版本號做樂觀鎖（`commit_game`）；同時兩個操作只有一個成功。每個回答附操作 ID，網路重試不會重複執行。
- **同步**：每次寫入插入一列 `game_events`，玩家透過 Realtime 收到後依序播放動畫，再讀取 `game_public` 的完整狀態。漏掉的版本會自動補抓；重新連線後一律重新讀取最新狀態。
- **房間操作**：建立、加入、準備、選陣營、加入／移除電腦、開始、離開、心跳，全部是 PostgreSQL RPC，在交易中鎖住房間列，避免兩人同時搶最後一個空位、重複開始等競態。

## 檔案

| 檔案 | 用途 |
|---|---|
| `src/engine/Engine.ts` | 遊戲引擎（單人與伺服器共用） |
| `src/engine/prompts.ts` | 抉擇的資料格式、驗證與斷線代打的預設回答 |
| `src/engine/view.ts`、`snapshots.ts` | 畫面事件、擂台快照、伺服器端的事件記錄 |
| `src/engine/server.ts` | 權威端：建立多人對局、快照重播、回答、代打、接手 |
| `supabase/functions/game/index.ts` | Edge Function：start、answer、continue、takeover、reclaim |
| `supabase/migrations/20261010000000_multiplayer.sql` | 資料表、索引、RLS、房間 RPC、Realtime 設定 |
| `src/net/supabase.ts` | Supabase 連線（讀取環境變數） |
| `src/net/RoomService.ts` | 匿名登入、房間 RPC、呼叫 Edge Function、Realtime 訂閱 |
| `src/net/OnlineSession.ts` | 多人流程：選單 → 大廳 → 對局；事件播放、回答、重試、補抓、代打 |
| `src/ui/LobbyView.ts` | 多人選單、加入房間、等待大廳、對局中的連線狀態列 |
| `src/game/Game.ts` | 3D 畫面與輸入；單機時執行引擎，多人時播放伺服器事件 |
| `vite.engine.config.ts` | 把引擎打包成 Deno 可用的單一模組 |
| `tests/multiplayer.cjs` | 權威端單元測試（可重現、不卡死、過時回答、代打） |
| `tests/e2e-supabase.mjs` | 對實際 Supabase 專案的端對端測試 |

## 資料表

| 表 | 內容 | 玩家權限 |
|---|---|---|
| `rooms` | 房號（字串，保留前導零）、房主、狀態 waiting／playing／closed、人數上限、回合數、建立與最後活動時間 | 成員可讀 |
| `room_members` | 暱稱、真人／電腦、陣營、房主、準備、代打中、加入與最後心跳時間 | 成員可讀 |
| `game_public` | 版本、完整狀態、等待中的抉擇、是否結束 | 成員可讀 |
| `game_events` | 每個版本的畫面事件（保留最近 300 版） | 成員可讀 |
| `game_private` | 亂數種子、快照、尚未公開的回答（密封出價） | 無 |
| `game_ops` | 已執行的操作 ID | 無 |

前端對所有表都沒有寫入權限；未加入房間的使用者讀不到任何資料。房號只在未關閉的房間間唯一（部分唯一索引），建立時碰撞會在資料庫內重試。閒置房間（等待中 2 小時、對局中 24 小時）在下次有人建房或加入時自動關閉。

## 設定步驟

1. **建立 Supabase 專案**，記下 Project URL 與 publishable key（Project Settings → API Keys）。
2. **開啟匿名登入**：Authentication → Sign In / Providers → Allow anonymous sign-ins。
3. **建立資料表**：SQL Editor 貼上 `supabase/migrations/20261010000000_multiplayer.sql` 整份執行（或 `npx supabase db push`）。
4. **部署 Edge Function**：
   ```
   npx supabase login
   npm run deploy:functions
   ```
   （`package.json` 裡的 `--project-ref` 換成自己的專案。函式以 `--no-verify-jwt` 部署，改由函式內驗證玩家身分。service role 金鑰由 Supabase 自動提供給函式，不需要也不可以放到前端。）
5. **本機環境變數**：複製 `.env.example` 為 `.env` 並填入：
   ```
   VITE_SUPABASE_URL=https://your-project-ref.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxx
   # 選填但建議設定：讓 Edge Function 在資料庫所在區域執行（Project Settings → General → Region）
   VITE_SUPABASE_REGION=ap-northeast-1
   ```
   專案區域會直接影響反應速度：在台灣遊玩時，東京（ap-northeast-1）的專案每次操作約 0.5 秒，孟買（ap-south-1）約 0.7 秒以上。
6. **GitHub Pages**：repo 的 Settings → Secrets and variables → Actions → **Variables** 新增 `VITE_SUPABASE_URL`、`VITE_SUPABASE_PUBLISHABLE_KEY` 與 `VITE_SUPABASE_REGION`。部署流程建置時會讀取；沒設定時多人按鈕停用，單人照常。

## 本機測試

```
npm run dev          # http://localhost:5173
npm test             # 規則與權威端測試
npm run test:e2e     # 對 .env 指定的 Supabase 專案做端對端測試
```

多人手動測試：開兩個不同的瀏覽器（或一般視窗＋無痕視窗，身分才會不同）→ 都選「多人遊戲」→ 一邊建立房間，另一邊輸入房號加入 → 房主可加入電腦 → 雙方按準備 → 房主開始。

## 已驗證

- 單人模式：電腦託管連打 28 輪；手動操作徵兵、名冊、使用物品、指定傳送、乾坤骰閣、商店買賣與刷新、擂台戰，皆無錯誤。
- 權威端：兩位真人＋一台電腦模擬 12 輪，重播結果每次一致，單次運算最慢約 130 ms。
- 端對端（實際 Supabase）：建房得 5 位數房號、無效房號報錯、加入與重新加入、非成員讀不到也寫不了、一般玩家不能做房主操作、人數上限、未全部準備不能開始、重複開始被拒、雙方狀態一致、非輪到的玩家與過時回答被拒、同一操作 ID 重送不會重複執行、連續進行數輪、事件依序、房主離開移交房主。
- 瀏覽器（兩個獨立身分）：大廳即時顯示加入、電腦、準備；開始後雙方進入同一局且狀態完全一致；重新整理後自動回到同一局；斷線 45 秒後房主可交由電腦代打，遊戲繼續。

## 已知限制與後續

- **斷線**：輪到斷線玩家時遊戲會等待；房主可交由電腦代打，玩家回來按「接手操作」，於下一位主公的回合開始時生效。尚未做自動逾時代打。
- **宗門調度**：多人模式只能在自己回合的整備階段使用（單人仍可隨時調度）。
- **觀戰畫面**：擂台、比試、攻城等戰鬥畫面只在參戰雙方的畫面上播放，其他玩家看紀錄。
- **資訊可見度**：對局狀態對同房玩家完全公開（與單人模式能查看所有主公資料相同）；只有密封出價在揭曉前保密。
- **運算量**：若真人都已出局、只剩電腦，伺服器每次推進最多 12 個回合，由房主的瀏覽器自動請求繼續。
- **擴充方向**：自動逾時代打、觀戰模式、房間聊天、斷線玩家的回合計時；若要完全避免重播成本，可把引擎改寫成可序列化的狀態機。

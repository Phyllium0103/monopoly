# 專屬武器透明插畫更新

175位武將的115種初階武器名稱對應62種外型，四階升級沿用相同武器種類。名冊摘要列不顯示武器；展開詳細卡片後顯示128像素武器圖。

使用者已明確指定本機程式精準去背與傘桿幾何對軸。61張從原始選定PNG只修改透明通道，保留原始RGB、方向與細節；羅傘保留接受的外側傘面角度，將可見傘桿對齊金色傘頭的中軸。原始版本仍保留。

壓縮：WebP，高度384（最大顯示128像素，3倍螢幕仍清晰）、等比例寬度、quality=80、method=6、LANCZOS；每張壓縮後透明通道與縮放PNG完全一致。透明原生PNG共88,242,845 bytes；遊戲圖共1,055,232 bytes。

對照與SHA：weapon-illustrated-generals.csv、weapon-illustrated-assets.json。弓弦內、九環、鏈環、念珠與壺柄等空洞逐類核對；白色刀刃及羽毛、象牙色器物保持不透明。

重新匯入：`python scripts/import-weapon-icons.py --source <transparent-v3-20261024資料夾> --transparent`，再執行`python scripts/shrink-weapon-icons.py`縮為384像素，最後執行`npm run build:art-pack`。

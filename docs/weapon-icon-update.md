# 專屬武器插畫更新

依目前選定的60張插畫與2張遊戲補圖，將175位武將、115種第一階名稱對應到62種外型。以第一階武器判定種類，四階升級名稱皆沿用同一種類圖片；武器名稱、升階材料與能力沒有變更。

古琴／胡笳／玉笛、各種文房器具、雙刀／日月雙刀、蛇矛／雙矛、三尖刀／偃月刀、不同杖與法器各自分開。步練師羅傘及貂蟬多節軟鞭另補同風格圖，避免以旗幡、狼牙棒代替。使節杖、藜杖、籌盤、雙手戟的外型歸類見 JSON 的 aliases。

遊戲檔案為256×256 WebP，保留選定PNG的完整構圖、原背景及斜向角度，未裁切或再旋轉。原生PNG共 99,476,204 bytes，遊戲圖共 470,130 bytes。原始PNG仍保存在本機已交付的插畫資料夾，版本和SHA記於 weapon-illustrated-assets.json。

- weapon-illustrated-generals.csv：175位武將、四階名稱與圖片逐一對照。
- weapon-illustrated-assets.json：62張圖片來源版本、原圖SHA與遊戲檔SHA。
- src/data/weaponIcons.ts：精確名稱對照，新增武器名稱時必須通過覆蓋測試。
- scripts/import-weapon-icons.py：從選定PNG重新產生遊戲WebP與對照資料。
- scripts/build-art-pack.mjs：重建共用圖片包，避免繼續讀取舊武器圖。

重建：

`python scripts/import-weapon-icons.py --source <60張選定資料夾> --supplements <game-supplements-20261024資料夾>`

`npm run build:art-pack`

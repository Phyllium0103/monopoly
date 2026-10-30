# 主公動畫的遊戲用圖集

53張動作圖已預先縮至768×384，編碼為quality95 WebP，透明通道與縮圖基準逐像素相同。原始1774×887圖集與舊選定影格保留在public/art/lord-hud，遊戲改用src/data/lordHudRuntime.ts指向的帶內容指紋資料夾。

下載容量16,393,402 → 6,320,806 bytes（約減少61.4%）。53張解碼輸入RGBA資料總量333,590,056 → 62,521,344 bytes；這是像素總量，不是實測尖峰記憶體或開場秒數。舊版在瀏覽器縮圖後的GPU貼圖本來也是768×384，故不宣稱這次GPU貼圖記憶體再減少81%。

Atlas的width/height、frame rect、anchor、pixelsPerUnit、時間與出骰點仍採原始邏輯像素，UV由比例求得。textureWidth/textureHeight記錄實際小圖尺寸。不得直接將邏輯width改成768，否則人物的裁切與定位會錯。僅移除未被影格引用的sheet項目並正確重映射索引，影格數與使用的圖片保持相同。

LordActorHud不再在載入時呼叫createImageBitmap縮圖；HTML圖片維持flipY=true。開場最多同時進行三張圖片的下載/解碼準備，逐張送進GPU；重複請求共用Promise。進度仍依實際完成數更新，錯誤會傳回載入畫面，沒有跳過必要圖片。

更新原始圖後，在已安裝Pillow的離線開發環境執行python scripts/build-lord-hud-runtime.py。產生新的內容指紋與引用，將新的資源資料夾與產生的TS一起提交。一般npm build不執行影像轉檔，CI不需要Python影像套件。

本輪只執行tests/lord-hud-runtime.cjs、tests/lord-actor-hud.cjs、tests/lord-actor-assets.cjs與production build，沒有擴大測試。實際瀏覽器載入時間未重新量測，不能承諾固定秒數。

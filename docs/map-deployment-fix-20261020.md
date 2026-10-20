# 淺玉地圖與網站資產修復

## 新畫面

底圖改為淺玉、米白、淡沙與碧海，以大面積地貌及留白取代舊版深色碎斑。使用不受場景燈光二次壓暗的底圖材質。舊版原圖保留。

固定45°方位、30°俯角；依使用者後續更正，改成縮小端限制：最遠可視範圍最多包含底圖一半寬及一半高，直式畫面與視窗縮放均重算上限。按鈕與滾輪共用限制，放大恢復原有8倍範圍，不再受半張底圖的放大限制。

四張全幅白玉道路貼圖分別為北、東、南、西；使用內建imagegen逐張製作。依實際路網出口切換貼圖，去除舊羅盤浮雕箭頭，保留實體道路厚度及踩格青色效果。

原圖與提示詞整理：工作區 outputs/map-clear-road-20261020。網站預覽：map-clear-road-20261020/index.html。

## 載入原因與修正

1. 部署在 /monopoly/ 時，原本的 /art/map-selected/*.glb 和底圖指向站台根目錄。實測根目錄模型404、/monopoly/art/map-selected/city-3.glb為200。統一透過assetUrl使用Vite BASE_URL，支援根目錄與專案子目錄。
2. 前次06ee631部署的npm test失敗，打包及deploy均skipped。selected-map測試新增了本機Windows外部Blender來源稽核，Linux CI沒有這些路徑。現在CI仍強制驗證倉庫內13個GLB標頭與SHA；本機外部原檔在存在時額外比對，或用VERIFY_EXTERNAL_SOURCES=1強制要求。沒有刪除交付檔的完整性檢查。
3. 武將圖片原本已有BASE_URL，正式站抽測liubei.webp為200；沒有把所有圖片錯誤都歸因於同一個路徑。額外以正式打包檔、嚴格/monopoly/本機HTTP預覽檢查實際名冊圖片與GLB解析，避免開發伺服器SPA回退HTML掩蓋404。

本機8778獨立建模總覽仍需要其server.mjs運行；它和GitHub Pages遊戲部署是不同服務。沒有把整份本機建模工作目錄當作正式遊戲資產。

## 驗證

npm test（CI環境）、npm run build、npm run build:engine，另用VERIFY_EXTERNAL_SOURCES=1執行tests/selected-map.cjs核對本機原GLB。新增deployment-assets檢查專案子路徑、四方向、5張不同高解析原圖及橫直式縮小下限。

正式站更新後應重新整理以取得新版JS；若失敗應保留實際URL、HTTP與瀏覽器錯誤，不能以一張載入失敗訊息推論原模型遺失。

## 後續更正：道路不顯示名稱

道路只保留內部類別「道路／岔路口」，移除個別編號地名；道路hover與一般點選不顯示浮窗或道路資訊。傳送選格仍可選道路。道路奇遇改以官道、沿途景物敘事，不引用路名；抽取機率與吉凶效果保留。

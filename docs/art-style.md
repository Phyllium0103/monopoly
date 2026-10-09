# 武將圖片

## 檔案
| 位置 | 內容 | 用途 |
|---|---|---|
| `art-src/generals/base/*.png` | 透明背景全身原圖（約 1024×1536），不部署 | 產生下面兩種圖的來源 |
| `public/art/generals/full/*.webp` | 高 1024px 全身圖，品質 80 | 擂台戰、渡劫、主公地圖棋子、點頭像放大 |
| `public/art/generals/head/*.webp` | 192×192 頭像，品質 84 | 名冊、選將清單、商店、技藝比試 |

來源檔名、武器名稱、尺寸與 SHA-256 記錄於 `docs/base-general-art.json`；頭像裁切範圍記錄於 `docs/general-head-crops.json`。

## 構圖
- 全身站姿，身體與武器朝畫面**右側**，對戰時左方人物會水平翻轉、面對面。
- 透明背景。
- 手持《全部武將武器名稱對照》表上的專屬武器。

## 新增或更換人物
1. 原圖放進 `art-src/generals/base/<id>.png`，並在 `docs/base-general-art.json`、`src/data/generalArt.ts` 補上尺寸。
2. 在 `docs/general-head-crops.json` 加入 `"<id>": [中心x, 中心y, 邊長]`（原圖像素）。
3. 產生 WebP（需要 Pillow）：

```python
from PIL import Image
import json
crops = json.load(open('docs/general-head-crops.json'))
for id, (cx, cy, side) in crops.items():
    im = Image.open(f'art-src/generals/base/{id}.png').convert('RGBA')
    full = im.resize((round(im.width * 1024 / im.height), 1024), Image.Resampling.LANCZOS)
    full.save(f'public/art/generals/full/{id}.webp', 'WEBP', quality=80, method=6)
    h = side / 2
    head = im.crop((round(cx - h), round(cy - h), round(cx + h), round(cy + h))).resize((192, 192), Image.Resampling.LANCZOS)
    head.save(f'public/art/generals/head/{id}.webp', 'WEBP', quality=84, method=6)
```

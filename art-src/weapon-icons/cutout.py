"""去背 final/*.png，輸出 cutout/<名稱>.png（1024 透明）與 public/art/icons/兵器/<分類>.webp（96px）。

背景是近乎單色的淺底，物件有粗深色外框：
1. 從圖片邊緣做容差填色，連到邊緣的淺色區就是背景（外框擋住物件內的白色，例如羽扇羽毛）。
2. 被物件圍住的背景（弓弦內、念珠圈內）不會連到邊緣，只移除顏色幾乎等於背景、面積夠大的封閉區。
3. 背景遮罩外擴 1px 去掉淺色毛邊，再縮到 96px 讓邊緣自然反鋸齒。
"""
import pathlib

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = pathlib.Path(__file__).parent
REPO = ROOT.parent.parent
FINAL = ROOT / "final"
CUTOUT = ROOT / "cutout"
ICONS = REPO / "public" / "art" / "icons" / "兵器"

EDGE_TOL = 14       # 連到邊緣的背景容差
HOLE_TOL = 5        # 封閉區平均色差須小於此值才算背景
HOLE_MIN_AREA = 400
SIZE, MARGIN = 96, 1


def background_mask(rgb):
    border = np.concatenate([rgb[:8].reshape(-1, 3), rgb[-8:].reshape(-1, 3),
                             rgb[:, :8].reshape(-1, 3), rgb[:, -8:].reshape(-1, 3)])
    bg = np.median(border, 0)
    dist = np.abs(rgb - bg).max(2)
    labels, n = ndimage.label(dist < EDGE_TOL)
    edge = np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))
    mask = np.isin(labels, edge[edge > 0])
    for i in range(1, n + 1):
        if i in edge:
            continue
        region = labels == i
        if region.sum() >= HOLE_MIN_AREA and dist[region].mean() < HOLE_TOL:
            mask |= region
    return ndimage.binary_dilation(mask, iterations=1)


def to_icon(rgba):
    box = rgba.getchannel("A").getbbox()
    obj = rgba.crop(box)
    inner = SIZE - 2 * MARGIN
    scale = inner / max(obj.size)
    obj = obj.resize((max(1, round(obj.width * scale)), max(1, round(obj.height * scale))), Image.LANCZOS)
    icon = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    icon.alpha_composite(obj, ((SIZE - obj.width) // 2, (SIZE - obj.height) // 2))
    return icon


def main():
    CUTOUT.mkdir(exist_ok=True)
    ICONS.mkdir(parents=True, exist_ok=True)
    for f in sorted(FINAL.glob("*.png")):
        rgb = np.asarray(Image.open(f).convert("RGB")).astype(int)
        alpha = np.where(background_mask(rgb), 0, 255).astype(np.uint8)
        rgba = Image.fromarray(np.dstack([rgb.astype(np.uint8), alpha]), "RGBA")
        rgba.save(CUTOUT / f.name)
        name = f.stem.split("_", 1)[1]
        to_icon(rgba).save(ICONS / f"{name}.webp", quality=90, method=6, exact=True)
        print(name)


if __name__ == "__main__":
    main()

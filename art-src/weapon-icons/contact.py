"""把 raw/ 的候選圖拼成總覽表 sheets/<id>.png 或指定清單的總表。"""
import pathlib
import sys

from PIL import Image, ImageDraw

ROOT = pathlib.Path(__file__).parent
RAW = ROOT / "raw"


def sheet(files, dest, cell=256, cols=4):
    rows = (len(files) + cols - 1) // cols
    im = Image.new("RGB", (cols * cell, rows * (cell + 20)), "white")
    d = ImageDraw.Draw(im)
    for i, f in enumerate(files):
        x, y = (i % cols) * cell, (i // cols) * (cell + 20)
        im.paste(Image.open(f).convert("RGB").resize((cell, cell)), (x, y))
        d.text((x + 4, y + cell + 4), f.stem, fill="black")
    dest.parent.mkdir(exist_ok=True)
    im.save(dest)


if __name__ == "__main__":
    prefixes = sys.argv[1].split(",")
    out = ROOT / "sheets" / f"{sys.argv[2] if len(sys.argv) > 2 else prefixes[0]}.png"
    files = sorted(f for p in prefixes for f in RAW.glob(f"{p}*_s*.png"))
    sheet(files, out)
    print(out)

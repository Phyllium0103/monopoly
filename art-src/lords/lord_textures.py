"""產生主公模型用的貼圖（系統 Python + Pillow + numpy 執行）。

python art-src/lords/lord_textures.py [cao|sun|liu|dong ...]   （省略則四位全做）
輸出到 art-src/lords/tex/<主公>/：
  robe_*   內袍／胸甲（菱格暗紋或鱗甲，可平鋪）
  outer_*  外袍與大袖（暗紋，可平鋪）
  cape_*   披風（橫向平鋪、縱向一張到底，可帶下緣金焰）
  trim_*   回紋金邊條（橫向平鋪）
  plate_*  黑漆底金色祥雲（肩甲、冠、靴甲，可平鋪）
  strand_* 鬍鬚與眉毛的髮絲；fur_* 毛皮（董卓）
  face_col 手繪五官（正面平面投影）
  apron_col / blade_col  取自 art-src/generals/base/<立繪>.png，或程式繪製的劍身
*_nrm 為 OpenGL 法線圖，*_orm 為 R=遮蔽 G=粗糙 B=金屬。
"""
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
GOLD = np.array([216, 169, 74], float)
GOLD_DARK = np.array([120, 82, 30], float)

LORDS = {
    'cao': dict(art='caocao', robe=('lattice', (24, 22, 27)), outer=('lattice', (24, 22, 27)),
                cape=((158, 24, 30), True), apron=(574, 615, 740, 1245), blade=('crop', (150, 708, 210, 1470)),
                strand=((12, 11, 13), (26, 24, 27)), iris=((48, 26, 12), (98, 58, 26), (132, 82, 40))),
    'sun': dict(art='sunquan', robe=('lattice', (26, 22, 30)), outer=('damask', (74, 40, 82)),
                cape=((112, 22, 38), False), apron=(572, 630, 740, 1300), blade=('proc', (30, 140, 90)),
                strand=((34, 16, 10), (58, 28, 16)), iris=((30, 48, 26), (62, 96, 52), (96, 132, 70))),
    'liu': dict(art='liubei', robe=('scale', (30, 30, 32)), outer=('damask', (226, 216, 194)),
                cape=((96, 18, 26), False), apron=(515, 600, 705, 1330), blade=('proc', (216, 169, 74)),
                strand=((12, 11, 13), (26, 24, 27)), iris=((48, 26, 12), (98, 58, 26), (132, 82, 40))),
    'dong': dict(art='dongzhuo', robe=('scale_gold', (26, 24, 28)), outer=('damask', (74, 46, 92)),
                 cape=((108, 22, 34), False), apron=(565, 818, 748, 1335), blade=None,
                 strand=((18, 16, 18), (40, 37, 39)), iris=((40, 20, 10), (80, 42, 20), (110, 62, 30)), fur=True),
}

rng = np.random.default_rng(7)
OUT = HERE


def save(arr, name):
    Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8)).save(os.path.join(OUT, name))


def normal_from_height(h, strength):
    """h: 0..1 float，可平鋪（以 roll 取鄰點）。"""
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * strength
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * strength
    n = np.dstack([-dx, dy, np.ones_like(h)])
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    return (n * 0.5 + 0.5) * 255


def blur(h, r):
    return np.asarray(Image.fromarray((np.clip(h, 0, 1) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r)),
                      float) / 255


def tiled_draw(size, fn):
    """在 3x3 大畫布上畫再取中間，保證邊界可平鋪。"""
    w, h = size
    im = Image.new('L', (w * 3, h * 3), 0)
    d = ImageDraw.Draw(im)
    for ox in (0, w, 2 * w):
        for oy in (0, h, 2 * h):
            fn(d, ox, oy)
    return np.asarray(im.crop((w, h, 2 * w, 2 * h)), float) / 255


def noise(size, r):
    n = np.tile(rng.random((size[1], size[0])), (3, 3))
    return blur(n, r)[size[1]:2 * size[1], size[0]:2 * size[0]]


def cloud(d, cx, cy, s, width):
    """祥雲：三個捲曲的漩渦與一條雲尾。"""
    for ox, oy, r, start in ((-0.55, 0.1, 0.42, 200), (0.0, -0.25, 0.5, 160), (0.55, 0.1, 0.42, 250)):
        x, y, rr = cx + ox * s, cy + oy * s, r * s
        for k in range(3):
            q = rr * (1 - 0.3 * k)
            d.arc([x - q, y - q, x + q, y + q], start + 40 * k, start + 40 * k + 260, fill=255, width=width)
    d.line([(cx - 1.0 * s, cy + 0.45 * s), (cx + 1.0 * s, cy + 0.45 * s)], fill=255, width=width)
    d.arc([cx + 0.6 * s, cy + 0.2 * s, cx + 1.3 * s, cy + 0.9 * s], 180, 330, fill=255, width=width)


S = 1024


def fabric(kind, base, name):
    """kind: lattice 菱格花、damask 雲紋暗花（夾少量金雲）、scale 鱗片、scale_gold 金邊鱗甲。"""
    base = np.array(base, float)
    mott = noise((S, S), 6)
    weave = (np.sin(np.arange(S) * math.pi / 2)[None, :] * np.sin(np.arange(S) * math.pi / 2)[:, None]) * 0.5 + 0.5
    gold = np.zeros((S, S))
    if kind == 'lattice':
        lat = tiled_draw((S, S), lambda d, ox, oy: [
            d.line([(ox + x0, oy), (ox + x0 + S, oy + S)], fill=255, width=4) for x0 in range(-S, S, 128)] + [
            d.line([(ox + x0, oy + S), (ox + x0 + S, oy)], fill=255, width=4) for x0 in range(-S, S, 128)])

        def flowers(d, ox, oy):
            for i in range(8):
                for j in range(8):
                    cx, cy = ox + i * 128 + 64, oy + j * 128
                    for a in range(4):
                        px, py = cx + 15 * math.cos(a * math.pi / 2), cy + 15 * math.sin(a * math.pi / 2)
                        d.ellipse([px - 11, py - 11, px + 11, py + 11], fill=255)
                    d.ellipse([cx - 5, cy - 5, cx + 5, cy + 5], fill=0)

        h = np.clip(blur(np.maximum(lat * 0.8, tiled_draw((S, S), flowers)), 1.2), 0, 1)
        tone = 0.9
    elif kind == 'damask':
        h = blur(tiled_draw((S, S), lambda d, ox, oy: [
            cloud(d, ox + x + (128 if (y // 256) % 2 else 0) + 64, oy + y + 110, 70, 6)
            for y in range(0, S, 256) for x in range(0, S, 256)]), 1.2)
        gold = blur(tiled_draw((S, S), lambda d, ox, oy: [
            cloud(d, ox + x + 64, oy + y + 240, 50, 5) for y in range(0, S, 512) for x in range(256, S, 512)]), 1.0)
        tone = 0.35
    else:
        def scales(d, ox, oy):
            for j in range(-1, 17):
                for i in range(-1, 17):
                    cx, cy = ox + i * 64 + (32 if j % 2 else 0), oy + j * 64
                    d.arc([cx - 34, cy - 30, cx + 34, cy + 38], 0, 180, fill=255, width=6)

        h = blur(tiled_draw((S, S), scales), 1.0)
        tone = 0.9
        if kind == 'scale_gold':
            gold, h = h * 0.9, h
    hi = base * (1 + tone) + 6 if kind != 'damask' else base * 1.35 + 10
    col = base[None, None, :] * (0.85 + 0.3 * mott[..., None]) * (0.95 + 0.08 * weave[..., None])
    col = col * (1 - h[..., None]) + hi[None, None, :] * h[..., None]
    if kind == 'damask' and base.mean() > 128:  # 淺色（白袍）的暗花改為偏暗
        col = base[None, None, :] * (0.95 + 0.08 * mott[..., None]) * (1 - 0.12 * h[..., None])
    col = col * (1 - gold[..., None]) + GOLD[None, None, :] * (0.8 + 0.3 * mott[..., None]) * gold[..., None]
    save(col, name + '_col.png')
    save(normal_from_height(h * 0.6 + weave * 0.15 + gold, 3.0), name + '_nrm.png')
    if gold.any():
        save(np.dstack([255 * np.ones_like(gold), 255 * (0.75 - 0.4 * gold), 255 * gold]), name + '_orm.png')
    elif os.path.exists(os.path.join(OUT, name + '_orm.png')):
        os.remove(os.path.join(OUT, name + '_orm.png'))


def trim():
    TW, TH = 1024, 128
    key = Image.new('L', (TW * 3, TH), 0)
    d = ImageDraw.Draw(key)
    for i in range(TW * 3 // 64):
        x = i * 64
        pts = [(x + 8, 96), (x + 8, 32), (x + 56, 32), (x + 56, 80), (x + 24, 80), (x + 24, 48), (x + 40, 48),
               (x + 40, 64)]
        d.line(pts, fill=255, width=7, joint='curve')
        d.line([(x + 56, 96), (x + 72, 96)], fill=255, width=7)
    for y in (14, 114):
        d.line([(0, y), (TW * 3, y)], fill=255, width=5)
    h = 1 - blur(np.asarray(key.crop((TW, 0, 2 * TW, TH)), float) / 255, 0.8)
    mott = noise((TW, TH), 2)
    col = GOLD[None, None, :] * (0.8 + 0.35 * mott[..., None]) * h[..., None] + GOLD_DARK[None, None, :] * 0.4 * (
        1 - h[..., None])
    save(col, 'trim_col.png')
    save(normal_from_height(h, 4.0), 'trim_nrm.png')
    save(np.dstack([255 * (0.6 + 0.4 * h), 255 * (0.32 + 0.4 * (1 - h)), 255 * (0.3 + 0.7 * h)]), 'trim_orm.png')


def plate():
    g = blur(tiled_draw((S, S), lambda d, ox, oy: [
        cloud(d, ox + x + (128 if j % 2 else 0) + 64, oy + y + 120, 82, 7)
        for j, y in enumerate(range(0, S, 256)) for x in range(0, S, 256)]), 1.0)
    mott = noise((S, S), 3)
    col = np.array([20, 18, 22], float)[None, None, :] * (0.85 + 0.3 * mott[..., None]) * (1 - g[..., None]) + \
        GOLD[None, None, :] * (0.75 + 0.4 * mott[..., None]) * g[..., None]
    save(col, 'plate_col.png')
    save(normal_from_height(blur(g, 1.5), 5.0), 'plate_nrm.png')
    save(np.dstack([255 * np.ones_like(g), 255 * (0.55 - 0.25 * g), 255 * g]), 'plate_orm.png')


def cape(base, flames):
    CW = CH = 1024
    dam = blur(tiled_draw((CW, CH), lambda d, ox, oy: [
        cloud(d, ox + x + (96 if (y // 192) % 2 else 0), oy + y + 90, 56, 5)
        for y in range(0, CH, 192) for x in range(0, CW, 192)]), 1.2)
    deco = Image.new('L', (CW * 3, CH), 0)
    d = ImageDraw.Draw(deco)
    if flames:
        for i in range(3 * CW // 170):
            cx = i * 170 + 85
            for k, (dx, hgt, wid) in enumerate(((0, 170, 46), (-38, 120, 30), (38, 125, 30))):
                x0, y0 = cx + dx, 960
                poly = [(x0 - wid * (1 - t) + 10 * math.sin(t * 5 + k), y0 - hgt * t) for t in np.linspace(0, 1, 18)]
                poly += [(x0 + wid * (1 - t) + 10 * math.sin(t * 5 + k + 1), y0 - hgt * t) for t in np.linspace(1, 0, 18)]
                d.polygon(poly, fill=255)
    else:
        for i in range(3 * CW // 256):
            cloud(d, i * 256 + 128, 905, 60, 7)
        d.rectangle([0, 945, CW * 3, 955], fill=255)
    d.rectangle([0, 975, CW * 3, 1000], fill=255)
    fl = blur(np.asarray(deco.crop((CW, 0, 2 * CW, CH)), float) / 255, 1.0)
    mott = noise((CW, CH), 2.5)
    red = np.array(base, float)[None, None, :] * (0.82 + 0.3 * mott[..., None]) * (1 - 0.25 * dam[..., None])
    col = red * (1 - fl[..., None]) + GOLD[None, None, :] * (0.8 + 0.3 * mott[..., None]) * fl[..., None]
    save(col, 'cape_col.png')
    save(normal_from_height(dam * 0.5 + fl, 4.0), 'cape_nrm.png')
    save(np.dstack([255 * np.ones_like(fl), 255 * (0.68 - 0.36 * fl), 255 * fl]), 'cape_orm.png')


def strands(name, base, hi, count=260, contrast=1.0):
    SW = 512
    st = np.zeros((SW, SW))
    for _ in range(count):
        x = rng.integers(0, SW)
        w = rng.integers(1, 4)
        st[:, max(0, x - w):x + w] += rng.random() * 0.8 + 0.2
    st = np.clip(blur(np.clip(st, 0, 1), 1.0) * 1.4, 0, 1) * (0.75 + 0.5 * noise((SW, SW), 12))
    col = np.array(base, float)[None, None, :] + st[..., None] * np.array(hi, float)[None, None, :] * contrast
    save(col, name + '_col.png')
    save(normal_from_height(st, 4.0 * contrast), name + '_nrm.png')


FW = 2048
SKIN = (234, 180, 140)


def P(x, z):
    return ((0.5 + x / 0.36) * FW, (1 - (z - 1.35) / 0.36) * FW)


def soft(img, shape, color, alpha, radius):
    lay = Image.new('L', img.size, 0)
    ImageDraw.Draw(lay).ellipse([*P(shape[0] - shape[2], shape[1] + shape[3]),
                                 *P(shape[0] + shape[2], shape[1] - shape[3])], fill=int(255 * alpha))
    img.paste(Image.new('RGB', img.size, color), (0, 0), lay.filter(ImageFilter.GaussianBlur(radius)))


def stroke(d, pts, widths, color):
    """可變寬度的筆畫：以小圓串起。"""
    for (x0, z0), (x1, z1), w0, w1 in zip(pts, pts[1:], widths, widths[1:]):
        n = max(12, int(math.hypot(x1 - x0, z1 - z0) / 0.36 * FW))
        for k in range(n):
            t = k / (n - 1)
            cx, cy = P(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t)
            r = (w0 + (w1 - w0) * t) / 0.36 * FW / 2
            d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=color)


def face(iris):
    """正面平面投影：u = 0.5 + x/0.36，v = (z-1.35)/0.36。"""
    img = Image.new('RGB', (FW, FW), SKIN)
    for sx in (1, -1):
        soft(img, (sx * 0.056, 1.527, 0.045, 0.022), (205, 140, 105), 0.35, 28)   # 眼窩
        soft(img, (sx * 0.06, 1.552, 0.05, 0.008), (190, 125, 95), 0.3, 18)       # 眉下陰影
        soft(img, (sx * 0.088, 1.478, 0.03, 0.016), (238, 150, 120), 0.22, 40)    # 腮紅
    soft(img, (0, 1.476, 0.02, 0.005), (180, 115, 85), 0.35, 10)                  # 鼻下陰影
    soft(img, (0, 1.437, 0.02, 0.006), (200, 118, 98), 0.6, 6)                    # 下唇
    d = ImageDraw.Draw(img)
    for sx in (1, -1):
        stroke(d, [(sx * 0.02, 1.483), (sx * 0.034, 1.466), (sx * 0.042, 1.452)], [0.0016, 0.0022, 0.001],
               (196, 128, 96))
        stroke(d, [(sx * 0.005, 1.546), (sx * 0.008, 1.558)], [0.0012, 0.0016], (196, 132, 100))  # 皺眉紋
    stroke(d, [(-0.027, 1.448), (-0.01, 1.445), (0.012, 1.446), (0.029, 1.455)], [0.0018, 0.0026, 0.0026, 0.0016],
           (110, 52, 40))
    for sx in (1, -1):
        up = [(0.027, 1.519), (0.04, 1.531), (0.058, 1.537), (0.076, 1.536), (0.088, 1.531)]
        lo = [(0.088, 1.531), (0.076, 1.519), (0.057, 1.513), (0.039, 1.513), (0.027, 1.519)]
        mask = Image.new('L', img.size, 0)
        ImageDraw.Draw(mask).polygon([P(sx * x, z) for x, z in up + lo[1:-1]], fill=255)
        eye = Image.new('RGB', img.size, (246, 240, 230))
        de = ImageDraw.Draw(eye)
        ic = (sx * 0.052, 1.523)
        for r, c in ((0.0122, iris[0]), (0.0108, iris[1]), (0.0075, iris[2]), (0.0052, (14, 8, 6))):
            de.ellipse([*P(ic[0] - r, ic[1] + r), *P(ic[0] + r, ic[1] - r)], fill=c)
        hl = (ic[0] - sx * 0.003, ic[1] + 0.004)
        de.ellipse([*P(hl[0] - 0.0028, hl[1] + 0.0028), *P(hl[0] + 0.0028, hl[1] - 0.0028)], fill=(255, 255, 255))
        img.paste(eye, (0, 0), mask)
        stroke(d, [(sx * x, z) for x, z in up] + [(sx * 0.098, 1.539)], [0.0024, 0.004, 0.005, 0.0055, 0.005, 0.0015],
               (18, 12, 12))                                                                 # 上眼線與眼尾
        stroke(d, [(sx * x, z + 0.0062) for x, z in up[1:4]], [0.0008, 0.0012, 0.0008], (150, 92, 70))  # 雙眼皮
        stroke(d, [(sx * 0.06, 1.5128), (sx * 0.076, 1.5185), (sx * 0.088, 1.5305)], [0.0008, 0.0014, 0.0008],
               (90, 50, 36))
    img.resize((1024, 1024), Image.LANCZOS).save(os.path.join(OUT, 'face_col.png'))


def blade_proc(inlay):
    """銀色劍身：兩側刃線、中央一串菱形鑲嵌。"""
    W, H = 96, 1220
    img = Image.new('RGB', (W, H), (205, 210, 218))
    d = ImageDraw.Draw(img)
    for x, c in ((6, (240, 244, 248)), (W - 7, (240, 244, 248)), (20, (170, 176, 186)), (W - 21, (170, 176, 186))):
        d.line([(x, 0), (x, H)], fill=c, width=3)
    for y in range(40, H - 120, 70):
        dm = [(W / 2, y), (W / 2 + 14, y + 30), (W / 2, y + 60), (W / 2 - 14, y + 30)]
        d.polygon(dm, fill=tuple(int(v) for v in GOLD))
        d.polygon([(W / 2, y + 10), (W / 2 + 8, y + 30), (W / 2, y + 50), (W / 2 - 8, y + 30)], fill=inlay)
    img.save(os.path.join(OUT, 'blade_col.png'))


def build(lord):
    global OUT
    cfg = LORDS[lord]
    OUT = os.path.join(HERE, 'tex', cfg['art'])
    os.makedirs(OUT, exist_ok=True)
    fabric(*cfg['robe'], 'robe')
    fabric(*cfg['outer'], 'outer')
    trim()
    plate()
    cape(*cfg['cape'])
    strands('strand', *cfg['strand'])
    if cfg.get('fur'):
        strands('fur', (22, 20, 22), (52, 48, 50), count=420, contrast=1.2)
    face(cfg['iris'])
    art = Image.open(os.path.join(HERE, '..', 'generals', 'base', cfg['art'] + '.png')).convert('RGBA')
    bg = Image.new('RGBA', art.size, (24, 22, 27, 255))
    bg.alpha_composite(art)
    bg = bg.convert('RGB')
    apron = bg.crop(cfg['apron']).resize((256, 896), Image.LANCZOS)
    apron = ImageEnhance.Brightness(ImageEnhance.Color(ImageEnhance.Contrast(apron).enhance(1.35)).enhance(1.25)).enhance(
        0.85)
    apron.save(os.path.join(OUT, 'apron_col.png'))
    if cfg['blade'] and cfg['blade'][0] == 'crop':
        bg.crop(cfg['blade'][1]).resize((96, 1220), Image.LANCZOS).save(os.path.join(OUT, 'blade_col.png'))
    elif cfg['blade']:
        blade_proc(cfg['blade'][1])
    print('textures ->', OUT)


for lord in (sys.argv[1:] or LORDS):
    build(lord)

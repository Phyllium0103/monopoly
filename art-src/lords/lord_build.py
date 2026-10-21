"""主公 3D 棋子：在 Blender 內以程式建模、貼圖、綁骨並製作走路／待機動作。

先執行 lord_textures.py 產生 tex/<立繪名>/，再在 Blender 內執行本檔（MCP execute_code 或 blender --python）。
ARGS = [貼圖根目錄, 主公代號 cao|sun|liu|dong]。會清空目前場景，重建 SM_Char_<名>_*、RIG_Char_<名> 與動作 Walk、Idle。
角色面向 -Y（glTF 匯出後面向 +Z），腳底在 z=0，身高約 2.0（含冠）。
"""
import math
import os

import bmesh
import bpy
from mathutils import Euler, Matrix, Quaternion, Vector

try:
    TEX_ROOT, LORD = ARGS[0], ARGS[1]  # noqa: F821 — 由呼叫端注入
except (NameError, IndexError):
    TEX_ROOT, LORD = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'tex'), 'cao'

# 每位主公的差異：配色、冠、鬍鬚、武器、體型與配件
LORDS = {
    'cao': dict(name='CaoCao', art='caocao', outer='#1c1a1d', red='#a3161c', tassel='#a3161c', hair='#161417',
                gray=True, crown='cao', beard='cao', weapon='sword', chest=True, buckle='lion', sword_gem='gem'),
    'sun': dict(name='SunQuan', art='sunquan', outer='#4b2a52', red='#8e1a2a', tassel='#8e1a2a', hair='#4a2416',
                gray=False, crown='sun', beard='sun', weapon='sword', chest=True, buckle='lion', sword_gem='gem_green',
                jade=True),
    'liu': dict(name='LiuBei', art='liubei', outer='#e6dcc6', red='#5e1018', tassel='#161416', hair='#161417',
                gray=True, crown='liu', beard='liu', weapon='twin', chest=False, buckle='emerald', sword_gem='gem_green',
                ponytail=True),
    'dong': dict(name='DongZhuo', art='dongzhuo', outer='#4a2c5c', red='#8a1a22', tassel='#8a1a22', hair='#1e1c1e',
                 gray=False, crown='dong', beard='dong', weapon='bow', chest=False, buckle='demon', bulk=1.22, fur=True),
}
CFG = LORDS[LORD]
NAME = CFG['name']
BULK = CFG.get('bulk', 1.0)
TEX = os.path.join(TEX_ROOT, CFG['art'])

# ---------------------------------------------------------------- 場景重置
for ob in list(bpy.data.objects):
    bpy.data.objects.remove(ob, do_unlink=True)
for coll in (bpy.data.meshes, bpy.data.armatures, bpy.data.materials, bpy.data.actions, bpy.data.cameras,
             bpy.data.lights, bpy.data.images):
    for block in list(coll):
        if block.users == 0 or isinstance(block, (bpy.types.Action, bpy.types.Image)):
            coll.remove(block)

scene = bpy.context.scene
scene.render.fps = 24


# ---------------------------------------------------------------- 材質
def srgb(h):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c] + [1.0]


# 名稱: (顏色, 金屬, 粗糙, 貼圖前綴, 法線強度)
MAT_DEFS = {
    'robe': ('#1c1a1d', 0.0, 0.8, 'robe', 0.6),
    'outer': (CFG['outer'], 0.0, 0.8, 'outer', 0.6),
    'robe_dark': ('#0f0e10', 0.0, 0.85, None, 0),
    'trim': ('#d8a94a', 0.9, 0.35, 'trim', 1.0),
    'gold': ('#d8a94a', 0.95, 0.3, None, 0),
    'plate': ('#1c1a1d', 0.5, 0.45, 'plate', 0.8),
    'cape': ('#a3161c', 0.0, 0.65, 'cape', 0.5),
    'cape_in': ('#4a0a0e', 0.0, 0.7, None, 0),
    'red': (CFG['red'], 0.0, 0.6, None, 0),
    'tassel': (CFG['tassel'], 0.0, 0.6, None, 0),
    'fur': ('#2a2628', 0.0, 0.8, 'fur', 1.0),
    'wood': ('#3a1e2c', 0.1, 0.5, None, 0),
    'string': ('#d8d0c0', 0.0, 0.5, None, 0),
    'apron': ('#ffffff', 0.0, 0.6, 'apron', 0),
    'blade': ('#ffffff', 0.85, 0.22, 'blade', 0),
    'skin': ('#eab48c', 0.0, 0.55, None, 0),
    'skin_shade': ('#c98f6a', 0.0, 0.6, None, 0),
    'face': ('#eab48c', 0.0, 0.55, 'face', 0),
    'hair': (CFG['hair'], 0.0, 0.5, None, 0),
    'gray_hair': ('#cfccc8', 0.0, 0.4, None, 0),
    'white': ('#ece6d8', 0.0, 0.6, None, 0),
    'beard': ('#161417', 0.0, 0.55, 'strand', 0.6),
    'gem': ('#d0141c', 0.2, 0.12, None, 0),
    'gem_green': ('#127a4a', 0.2, 0.12, None, 0),
}
MATS = list(MAT_DEFS)
materials = {}


def load_img(name, non_color):
    path = os.path.join(TEX, name + '.png')
    if not os.path.exists(path):
        return None
    img = bpy.data.images.load(path, check_existing=True)
    if non_color:
        img.colorspace_settings.name = 'Non-Color'
    return img


for name, (hexc, metal, rough, tex, nrm_strength) in MAT_DEFS.items():
    m = bpy.data.materials.new(NAME + '_' + name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = srgb(hexc)
    bsdf.inputs['Metallic'].default_value = metal
    bsdf.inputs['Roughness'].default_value = rough
    m.diffuse_color = srgb(hexc)
    if tex:
        col = load_img(tex + '_col', False)
        if col:
            n = nt.nodes.new('ShaderNodeTexImage')
            n.image = col
            n.location = (-600, 300)
            nt.links.new(n.outputs['Color'], bsdf.inputs['Base Color'])
        orm = load_img(tex + '_orm', True)
        if orm:
            n = nt.nodes.new('ShaderNodeTexImage')
            n.image = orm
            n.location = (-800, 0)
            sep = nt.nodes.new('ShaderNodeSeparateColor')
            sep.location = (-500, 0)
            nt.links.new(n.outputs['Color'], sep.inputs['Color'])
            nt.links.new(sep.outputs['Green'], bsdf.inputs['Roughness'])
            nt.links.new(sep.outputs['Blue'], bsdf.inputs['Metallic'])
        nrm = load_img(tex + '_nrm', True)
        if nrm and nrm_strength:
            n = nt.nodes.new('ShaderNodeTexImage')
            n.image = nrm
            n.location = (-800, -300)
            nm = nt.nodes.new('ShaderNodeNormalMap')
            nm.inputs['Strength'].default_value = nrm_strength
            nm.location = (-500, -300)
            nt.links.new(n.outputs['Color'], nm.inputs['Color'])
            nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
    materials[name] = m

# ---------------------------------------------------------------- 幾何累積器
V, F, FM, FS, VW, UV = [], [], [], [], [], []


def rotm(rot):
    if rot is None:
        return Matrix.Identity(3)
    if isinstance(rot, Matrix):
        return rot
    if isinstance(rot, Quaternion):
        return rot.to_matrix()
    return Euler([math.radians(a) for a in rot]).to_matrix()


def xf(verts, loc=(0, 0, 0), rot=None, scale=(1, 1, 1)):
    R = rotm(rot)
    return [R @ Vector((v[0] * scale[0], v[1] * scale[1], v[2] * scale[2])) + Vector(loc) for v in verts]


def planar_uv(pts, dens):
    a, b, c = pts[0], pts[1], pts[2]
    n = (b - a).cross(c - a)
    ax = max(range(3), key=lambda i: abs(n[i]))
    i, j = [k for k in range(3) if k != ax]
    return [(p[i] * dens, p[j] * dens) for p in pts]


def add(part, mat, w, smooth=True, keep=None, uvfn=None, dens=4.0):
    verts, faces = part[0], part[1]
    uvs = part[2] if len(part) > 2 else None
    flags = part[3] if len(part) > 3 else [smooth] * len(faces)
    verts = [Vector(v) for v in verts]
    if uvs is None:
        uvs = [None] * len(faces)
    if keep is not None:
        sel = [k for k, f in enumerate(faces) if keep(sum((verts[i] for i in f), Vector()) / len(f))]
        faces, uvs, flags = [faces[k] for k in sel], [uvs[k] for k in sel], [flags[k] for k in sel]
        used = sorted({i for f in faces for i in f})
        remap = {o: n for n, o in enumerate(used)}
        verts = [verts[i] for i in used]
        faces = [[remap[i] for i in f] for f in faces]
    base = len(V)
    V.extend(verts)
    for f, uv, sm in zip(faces, uvs, flags):
        F.append([i + base for i in f])
        FM.append(MATS.index(mat(sum((verts[i] for i in f), Vector()) / len(f)) if callable(mat) else mat))
        FS.append(sm)
        if uvfn is not None:
            uv = [uvfn(verts[i]) for i in f]
        elif uv is None:
            uv = planar_uv([verts[i] for i in f], dens)
        UV.extend(uv)
    for co in verts:
        VW.append(w(co) if callable(w) else {w: 1.0})


# ---------------------------------------------------------------- 曲線插值：讓輪廓與路徑平滑
def spline(pts, k):
    """Catmull-Rom 細分：每段插入 k-1 個點並保留原控制點。"""
    pts = [Vector(p) for p in pts]
    if k <= 1 or len(pts) < 3:
        return pts
    P = [pts[0] * 2 - pts[1]] + pts + [pts[-1] * 2 - pts[-2]]
    out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        for j in range(k):
            t = j / k
            out.append(0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t +
                              (3 * p1 - p0 - 3 * p2 + p3) * t ** 3))
    out.append(pts[-1])
    return out


def lin(vals, k):
    """與 spline 對應的線性插值（半徑、UV、方向等）。"""
    if k <= 1 or len(vals) < 3:
        return list(vals)
    out = []
    for a, b in zip(vals, vals[1:]):
        out += [a + (b - a) * (j / k) for j in range(k)]
    return out + [vals[-1]]


# ---------------------------------------------------------------- 基本形體（皆回傳 verts, faces, uvs）
def sphere(seg=16, rings=10, loc=(0, 0, 0), size=(1, 1, 1), rot=None, urep=1.0, vrep=1.0):
    verts = [(0, 0, 1)]
    for r in range(1, rings):
        th = math.pi * r / rings
        for s in range(seg):
            ph = 2 * math.pi * s / seg
            verts.append((math.sin(th) * math.cos(ph), math.sin(th) * math.sin(ph), math.cos(th)))
    verts.append((0, 0, -1))

    def uv(s, r):
        return (s / seg * urep, (1 - r / rings) * vrep)

    faces, uvs = [], []
    for s in range(seg):
        faces.append([0, 1 + s, 1 + (s + 1) % seg])
        uvs.append([uv(s + 0.5, 0), uv(s, 1), uv(s + 1, 1)])
    for r in range(rings - 2):
        a, b = 1 + r * seg, 1 + (r + 1) * seg
        for s in range(seg):
            faces.append([a + s, b + s, b + (s + 1) % seg, a + (s + 1) % seg])
            uvs.append([uv(s, r + 1), uv(s, r + 2), uv(s + 1, r + 2), uv(s + 1, r + 1)])
    last = len(verts) - 1
    a = 1 + (rings - 2) * seg
    for s in range(seg):
        faces.append([a + s, last, a + (s + 1) % seg])
        uvs.append([uv(s, rings - 1), uv(s + 0.5, rings), uv(s + 1, rings - 1)])
    return xf(verts, loc, rot, size), faces, uvs


def box(size, loc=(0, 0, 0), rot=None):
    sx, sy, sz = (s / 2 for s in size)
    verts = [(x, y, z) for x in (-sx, sx) for y in (-sy, sy) for z in (-sz, sz)]
    faces = [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]]
    return xf(verts, loc, rot), faces


def rbox(size, loc=(0, 0, 0), rot=None, bevel=0.01, segments=3):
    """倒角方塊：倒角面平滑著色，大平面保持平整（避免整面出現漸層）。"""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
    res = bmesh.ops.bevel(bm, geom=list(bm.edges) + list(bm.verts), offset=bevel, segments=segments, profile=0.5,
                          affect='EDGES')
    new_faces = set(res['faces'])
    bm.verts.index_update()
    verts = [v.co.copy() for v in bm.verts]
    faces = [[v.index for v in f.verts] for f in bm.faces]
    flags = [f in new_faces for f in bm.faces]
    bm.free()
    return xf(verts, loc, rot), faces, None, flags


def lathe(rings, seg=32, a0=0.0, a1=360.0, cap0=False, cap1=False, wobble=None, zmod=None, urep=1.0, vscale=None,
          smooth=3):
    """rings: (z, rx, ry[, cx, cy])。v 沿輪廓弧長：vscale 給定時為每公尺重複數，否則正規化（頂端 v=1）。
    smooth>1 時以 Catmull-Rom 在各環之間補環，讓輪廓不再有折角。"""
    full = abs(a1 - a0) >= 360
    n = seg if full else seg + 1
    grid = []
    for ri, ring in enumerate(rings):
        z, rx, ry = ring[:3]
        cx, cy = (ring[3], ring[4]) if len(ring) > 3 else (0.0, 0.0)
        row = []
        for s in range(n):
            th = math.radians(a0 + (a1 - a0) * s / seg)
            k = wobble(th, z) if wobble else 1.0
            zz = zmod(th, ri, z) if zmod else z
            row.append(Vector((cx + rx * k * math.cos(th), cy + ry * k * math.sin(th), zz)))
        grid.append(row)
    k = smooth if len(rings) >= 3 else 1
    cols = [spline([grid[r][s] for r in range(len(rings))], k) for s in range(n)]
    nr = len(cols[0])
    verts, faces, uvs = [cols[s][r] for r in range(nr) for s in range(n)], [], []
    cum = [0.0]
    for r in range(1, len(rings)):
        z0, rx0, ry0 = rings[r - 1][:3]
        z1, rx1, ry1 = rings[r][:3]
        cum.append(cum[-1] + math.hypot(z1 - z0, (rx1 + ry1 - rx0 - ry0) / 2))
    tot = cum[-1] or 1.0
    vs = lin([(-c * vscale) if vscale else (1 - c / tot) for c in cum], k)
    for r in range(nr - 1):
        for s in range(seg):
            a, b = r * n + s, r * n + (s + 1) % n
            faces.append([a, b, b + n, a + n])
            u0, u1 = s / seg * urep, (s + 1) / seg * urep
            uvs.append([(u0, vs[r]), (u1, vs[r]), (u1, vs[r + 1]), (u0, vs[r + 1])])
    if full and cap0:
        faces.append(list(range(n))[::-1])
        uvs.append(None)
    if full and cap1:
        last = (nr - 1) * n
        faces.append(list(range(last, last + n)))
        uvs.append(None)
    return verts, faces, uvs


def orient(part, p0, p1, droop=None):
    """把沿 +Z（z=0→1 對應長度）建好的形體擺到 p0→p1。droop(t) 讓截面中心往世界下方偏移（大袖下垂）。"""
    p0, p1 = Vector(p0), Vector(p1)
    d = p1 - p0
    q = Vector((0, 0, 1)).rotation_difference(d.normalized())
    down = q.inverted() @ Vector((0, 0, -1))
    down.z = 0
    if down.length > 1e-6:
        down.normalize()
    out = []
    for v in part[0]:
        lv = Vector((v[0], v[1], v[2] * d.length))
        if droop:
            lv += down * droop(v[2])
        out.append(q @ lv + p0)
    return (out,) + tuple(part[1:])


def tube(pts, rx, ry=None, seg=10, hint=(0, 0, 1), caps=True, radii=None, ulen=4.0, vrep=1.0, smooth=None):
    """沿折線掃出橢圓截面。hint 可為向量、向量串列或函式，決定 ry 的方向。
    控制點稀疏（3～12 個）時預設以 Catmull-Rom 細分路徑，彎曲處不再有折角。"""
    ry = rx if ry is None else ry
    pts = [Vector(p) for p in pts]
    k = smooth if smooth is not None else (2 if 3 <= len(pts) <= 12 else 1)
    if k > 1 and len(pts) >= 3:
        if radii:
            radii = lin(list(radii), k)
        if isinstance(hint, list):
            hint = [h.normalized() for h in lin([Vector(h) for h in hint], k)]
        pts = spline(pts, k)
    verts, faces, uvs = [], [], []
    cum = [0.0]
    for i in range(1, len(pts)):
        cum.append(cum[-1] + (pts[i] - pts[i - 1]).length)
    for i, p in enumerate(pts):
        t = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        h = hint(p) if callable(hint) else (hint[i] if isinstance(hint, list) else hint)
        side = t.cross(Vector(h))
        if side.length < 1e-5:
            side = t.cross(Vector((1, 0, 0)))
        side.normalize()
        up = side.cross(t).normalized()
        k = radii[i] if radii else 1.0
        for s in range(seg):
            a = 2 * math.pi * s / seg
            verts.append(p + side * rx * k * math.cos(a) + up * ry * k * math.sin(a))
    for i in range(len(pts) - 1):
        for s in range(seg):
            a, b = i * seg + s, i * seg + (s + 1) % seg
            faces.append([a, b, b + seg, a + seg])
            u0, u1 = cum[i] * ulen, cum[i + 1] * ulen
            uvs.append([(u0, s / seg * vrep), (u0, (s + 1) / seg * vrep), (u1, (s + 1) / seg * vrep),
                        (u1, s / seg * vrep)])
    if caps:
        faces.append(list(range(seg))[::-1])
        last = (len(pts) - 1) * seg
        faces.append(list(range(last, last + seg)))
        uvs += [None, None]
    return verts, faces, uvs


def ell_band(C, R, E, th0, th1, ph0, ph1, nth=10, nph=32, thick=0.008, urep=3, vrep=1):
    """橢球上切出的帶狀甲片（有厚度）：θ 由頂端起算，φ 為經度（度）。回傳 verts, faces, uvs，以及下緣點串。"""
    C, E = Vector(C), Vector(E)

    def pt(th, ph, k):
        th, ph = math.radians(th), math.radians(ph)
        return C + R @ Vector((E.x * k * math.sin(th) * math.cos(ph), E.y * k * math.sin(th) * math.sin(ph),
                               E.z * k * math.cos(th)))

    inner_k = 1 - thick / max(E)
    rows = [(th0 + (th1 - th0) * i / nth) for i in range(nth + 1)]
    cols = [(ph0 + (ph1 - ph0) * j / nph) for j in range(nph + 1)]
    verts = [pt(th, ph, 1.0) for th in rows for ph in cols] + [pt(th, ph, inner_k) for th in rows for ph in cols]
    m, n = nph + 1, len(rows) * (nph + 1)
    faces, uvs = [], []
    for i in range(nth):
        for j in range(nph):
            a = i * m + j
            q = [a, a + 1, a + 1 + m, a + m]
            uv = [(j / nph * urep, 1 - i / nth * vrep), ((j + 1) / nph * urep, 1 - i / nth * vrep),
                  ((j + 1) / nph * urep, 1 - (i + 1) / nth * vrep), (j / nph * urep, 1 - (i + 1) / nth * vrep)]
            faces += [q, [k + n for k in q[::-1]]]
            uvs += [uv, uv[::-1]]
    ring = [j for j in range(m)] + [i * m + nph for i in range(1, nth + 1)] + \
           [nth * m + j for j in range(nph - 1, -1, -1)] + [i * m for i in range(nth - 1, 0, -1)]
    for k in range(len(ring)):
        a, b = ring[k], ring[(k + 1) % len(ring)]
        faces.append([a, b, b + n, a + n])
        uvs.append(None)
    return (verts, faces, uvs), [pt(th1, ph, 1.0) for ph in cols]


def prism(outline, thick, center, side, up, normal):
    """2D 輪廓（side, up 座標）沿 normal 擠出厚度，正面朝 normal。"""
    side, up, normal, center = Vector(side), Vector(up), Vector(normal), Vector(center)
    n = len(outline)
    verts = [center + side * u + up * v for u, v in outline] + [center + side * u + up * v - normal * thick for u, v in outline]
    cu = sum(u for u, _ in outline) / n
    cv = sum(v for _, v in outline) / n
    verts += [center + side * cu + up * cv, center + side * cu + up * cv - normal * thick]
    f, b = 2 * n, 2 * n + 1
    faces = [[f, i, (i + 1) % n] for i in range(n)] + [[b, n + (i + 1) % n, n + i] for i in range(n)]
    faces += [[i, n + i, n + (i + 1) % n, (i + 1) % n] for i in range(n)]
    return verts, faces


def ring_pts(cx, cy, z, rx, ry, n=32, a0=0, a1=360):
    full = abs(a1 - a0) >= 360
    m = n if full else n + 1
    pts = [(cx + rx * math.cos(math.radians(a0 + (a1 - a0) * i / n)),
            cy + ry * math.sin(math.radians(a0 + (a1 - a0) * i / n)), z) for i in range(m)]
    return pts + ([pts[0]] if full else [])


def smoothstep(e0, e1, x):
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


def basis(normal):
    normal = Vector(normal).normalized()
    side = normal.cross(Vector((0, 0, 1)))
    if side.length < 1e-4:
        side = Vector((1, 0, 0))
    side.normalize()
    return side, side.cross(normal).normalized()


def gem(c, s, mat='gem', normal=(0, -1, 0)):
    side, up = basis(normal)
    R = Matrix((side, -Vector(normal).normalized(), up)).transposed()
    return sphere(4, 2, c, (s, s * 0.45, s * 1.25), R)


def lion(c, s, bone, facing=(0, -1, 0)):
    """金色獸首：臉、鬃毛、口鼻、紅眼。"""
    c, facing = Vector(c), Vector(facing).normalized()
    side, up = basis(facing)
    R = Matrix((side, -facing, up)).transposed()
    add(sphere(14, 10, c, (s, s * 0.7, s * 0.95), R), 'gold', bone)
    for k in range(10):
        a = 2 * math.pi * (k + 0.5) / 10
        d = side * math.cos(a) + up * math.sin(a)
        add(tube([c + d * s * 0.7 - facing * s * 0.1, c + d * s * 1.08 + d.cross(facing) * s * 0.18],
                 s * 0.42, s * 0.2, seg=6, radii=[1.0, 0.25], hint=facing), 'gold', bone)
    add(sphere(10, 8, c + facing * s * 0.6 - up * s * 0.3, (s * 0.5, s * 0.35, s * 0.32), R), 'gold', bone)
    for sx in (1, -1):
        add(sphere(6, 4, c + facing * s * 0.62 + side * sx * s * 0.36 + up * s * 0.18, (s * 0.15,) * 3), 'gem', bone)
        add(tube([c + facing * s * 0.6 + side * sx * s * 0.12 + up * s * 0.38,
                  c + facing * s * 0.55 + side * sx * s * 0.6 + up * s * 0.5], s * 0.12, seg=5, radii=[1, 0.4]), 'gold',
            bone)
    add(sphere(6, 4, c + facing * s * 0.95 - up * s * 0.22, (s * 0.15, s * 0.1, s * 0.1)), 'gem', bone)


# ---------------------------------------------------------------- 骨架關鍵點
HIP_Z, WAIST_Z, CHEST_Z, SHOULDER_Z, NECK_Z = 0.84, 0.92, 1.12, 1.30, 1.38
HEAD_C = Vector((0, 0, 1.53))
HEAD_R = Vector((0.15, 0.142, 0.165))
SHW = 0.22 * (1 + (BULK - 1) * 0.5)
HANG = (Vector((SHW, 0.0, 1.29)), Vector((SHW + 0.09, 0.02, 1.04)), Vector((SHW + 0.12, -0.03, 0.80)))  # 自然下垂
HOLD = (Vector((SHW, 0.0, 1.29)), Vector((SHW + 0.1, 0.02, 1.05)), Vector((SHW + 0.16, -0.20, 0.99)))   # 前臂平舉握物
HIPS = (Vector((SHW, 0.0, 1.29)), Vector((SHW + 0.16, 0.06, 1.05)), Vector((0.2 * BULK + 0.03, -0.07, 0.93)))  # 叉腰


def mirror(pts):
    return tuple(Vector((-p.x, p.y, p.z)) for p in pts)


L_POSE, R_POSE = {'sword': (HANG, HOLD), 'twin': (HOLD, HOLD), 'bow': (HOLD, HIPS)}[CFG['weapon']]
L_SHOULDER, L_ELBOW, L_WRIST = L_POSE
R_SHOULDER, R_ELBOW, R_WRIST = mirror(R_POSE)
LEG_X = 0.1

BONES = {
    'root': ((0, 0, 0), (0, 0, 0.25), None),
    'hips': ((0, 0, HIP_Z), (0, 0, WAIST_Z + 0.04), 'root'),
    'spine': ((0, 0, WAIST_Z + 0.04), (0, 0, CHEST_Z), 'hips'),
    'chest': ((0, 0, CHEST_Z), (0, 0, NECK_Z - 0.04), 'spine'),
    'neck': ((0, 0, NECK_Z - 0.04), (0, 0, 1.43), 'chest'),
    'head': ((0, 0, 1.43), (0, 0, 1.75), 'neck'),
    'upper_arm.L': (tuple(L_SHOULDER), tuple(L_ELBOW), 'chest'),
    'forearm.L': (tuple(L_ELBOW), tuple(L_WRIST), 'upper_arm.L'),
    'hand.L': (tuple(L_WRIST), tuple(L_WRIST + Vector((0.01, -0.01, -0.1))), 'forearm.L'),
    'upper_arm.R': (tuple(R_SHOULDER), tuple(R_ELBOW), 'chest'),
    'forearm.R': (tuple(R_ELBOW), tuple(R_WRIST), 'upper_arm.R'),
    'hand.R': (tuple(R_WRIST), tuple(R_WRIST + Vector((-0.01, -0.08, 0))), 'forearm.R'),
    'thigh.L': ((LEG_X, 0, HIP_Z - 0.02), (LEG_X, 0, 0.46), 'hips'),
    'shin.L': ((LEG_X, 0, 0.46), (LEG_X, 0.01, 0.1), 'thigh.L'),
    'foot.L': ((LEG_X, 0.01, 0.1), (LEG_X, -0.13, 0.03), 'shin.L'),
    'thigh.R': ((-LEG_X, 0, HIP_Z - 0.02), (-LEG_X, 0, 0.46), 'hips'),
    'shin.R': ((-LEG_X, 0, 0.46), (-LEG_X, 0.01, 0.1), 'thigh.R'),
    'foot.R': ((-LEG_X, 0.01, 0.1), (-LEG_X, -0.13, 0.03), 'shin.R'),
    'skirt.F': ((0, 0, HIP_Z - 0.02), (0, -0.22, 0.3), 'hips'),
    'skirt.B': ((0, 0, HIP_Z - 0.02), (0, 0.22, 0.3), 'hips'),
    'cape.1': ((0, 0.16, 1.24), (0, 0.24, 0.72), 'chest'),
    'cape.2': ((0, 0.24, 0.72), (0, 0.34, 0.12), 'cape.1'),
    'ribbons': ((0, 0.08, 1.70), (0, 0.18, 1.30), 'head'),
}


# ---------------------------------------------------------------- 權重
def skirt_w(co):
    """下袍：髖部以下依前後方位分給 skirt.F / skirt.B，走路時前擺跟著前腳、後擺跟著後腳。"""
    t = smoothstep(WAIST_Z, 0.72, co.z)
    r = math.hypot(co.x, co.y) or 1.0
    f = smoothstep(0.15, 0.85, 0.5 - 0.5 * co.y / r)
    return {'hips': 1 - t, 'skirt.F': t * f, 'skirt.B': t * (1 - f)}


def cape_w(co):
    """披風：上段跟胸口、中下段由 cape.1/cape.2 飄動；髖部以下逐漸改跟下袍後擺 skirt.B，
    後腳把袍子往後帶時披風一起被帶開，不會讓後擺從披風穿出。"""
    if co.z > 1.18:
        w = {'chest': 1.0}
    elif co.z > 0.72:
        t = smoothstep(1.18, 0.9, co.z)
        w = {'chest': 1 - t, 'cape.1': t}
    else:
        t = smoothstep(0.72, 0.4, co.z)
        w = {'cape.1': 1 - t, 'cape.2': t}
    r = math.hypot(co.x, co.y) or 1.0
    k = 0.92 * smoothstep(0.92, 0.6, co.z) * (0.45 + 0.55 * smoothstep(-0.1, 0.7, co.y / r))
    w = {b: x * (1 - k) for b, x in w.items()}
    w['skirt.B'] = w.get('skirt.B', 0) + k
    return w


def ribbon_w(co):
    t = smoothstep(1.68, 1.45, co.z)
    return {'head': 1 - t, 'ribbons': t}


def torso_w(co):
    return {'chest': 1.0} if co.z > 1.05 else ({'spine': 1.0} if co.z > 0.95 else {'hips': 1.0})


# ---------------------------------------------------------------- 頭部（雕塑過的頭型）
def head_deform(p):
    """p 為相對頭心的座標：方下顎、眉骨、顴骨、眼窩、下巴。"""
    x, y, z = p
    front = smoothstep(-0.02, -0.11, y)
    x *= 1 + 0.07 * smoothstep(0.02, -0.1, z)
    y -= 0.011 * math.exp(-((z - 0.032) / 0.016) ** 2) * front * smoothstep(0.12, 0.06, abs(x))
    y += 0.004 * math.exp(-(((abs(x) - 0.055) / 0.024) ** 2 + ((z + 0.004) / 0.016) ** 2)) * front
    y -= 0.007 * math.exp(-(((abs(x) - 0.085) / 0.025) ** 2 + ((z + 0.03) / 0.02) ** 2)) * front
    y -= 0.012 * math.exp(-((x / 0.04) ** 2 + ((z + 0.13) / 0.03) ** 2)) * front
    y = y * (1 - 0.04 * front)
    return Vector((x, y, z))


def surf(x, z):
    """臉部表面在 (x, z) 的 y 值（世界座標）。"""
    x0 = x / (1 + 0.07 * smoothstep(0.02, -0.1, z - HEAD_C.z))  # 反推下顎加寬前的 x
    lx, lz = x0 / HEAD_R.x, (z - HEAD_C.z) / HEAD_R.z
    y0 = -HEAD_R.y * math.sqrt(max(0.0, 1 - lx * lx - lz * lz))
    return head_deform(Vector((x0, y0, z - HEAD_C.z))).y + HEAD_C.y


def on_face(x, z, lift=0.0):
    p = Vector((x, surf(x, z), z))
    return p + (p - HEAD_C).normalized() * lift


def face_n(p):
    return (Vector(p) - HEAD_C).normalized()


def lerp_pts(pts, a):
    """控制點折線上依參數 a∈[0,1] 取點（控制點等距分佈於參數上）。"""
    f = a * (len(pts) - 1)
    i = min(int(f), len(pts) - 2)
    t = f - i
    return tuple(pts[i][k] + (pts[i + 1][k] - pts[i][k]) * t for k in range(2))


def face_patch(U, L, na, nt, thick, uvmap, lift0=0.0012, jag=None):
    """貼合臉面的殼：U、L 為上/下緣控制點 (x, z)，thick(a, t) 為厚度，uvmap(a, t) 為 UV。"""
    top, bot = [], []
    for i in range(na + 1):
        a = i / na
        (ux, uz), (lx, lz) = lerp_pts(U, a), lerp_pts(L, a)
        if jag:
            lz -= jag(a)
        for j in range(nt + 1):
            t = j / nt
            x, z = ux + (lx - ux) * t, uz + (lz - uz) * t
            top.append(on_face(x, z, lift0 + thick(a, t)))
            bot.append(on_face(x, z, lift0 * 0.4))
    n = len(top)
    idx = lambda i, j: i * (nt + 1) + j
    faces, uvs = [], []
    for i in range(na):
        for j in range(nt):
            q = [idx(i, j), idx(i + 1, j), idx(i + 1, j + 1), idx(i, j + 1)]
            ab = [(i / na, j / nt), ((i + 1) / na, j / nt), ((i + 1) / na, (j + 1) / nt), (i / na, (j + 1) / nt)]
            faces.append(q)
            uvs.append([uvmap(a, t) for a, t in ab])
            faces.append([k + n for k in q[::-1]])
            uvs.append([uvmap(a, t) for a, t in ab[::-1]])
    ring = [idx(i, 0) for i in range(na + 1)] + [idx(na, j) for j in range(1, nt + 1)] +            [idx(i, nt) for i in range(na - 1, -1, -1)] + [idx(0, j) for j in range(nt - 1, 0, -1)]
    for k in range(len(ring)):
        p, q = ring[k], ring[(k + 1) % len(ring)]
        faces.append([p, q, q + n, p + n])
        uvs.append(None)
    return top + bot, faces, uvs


def swap_uv(part):
    return part[0], part[1], [None if uv is None else [(v, u) for u, v in uv] for uv in part[2]]


FACE_UV = lambda p: (0.5 + p.x / 0.36, (p.z - 1.35) / 0.36)
hv, hf, huv = sphere(56, 40, (0, 0, 0), HEAD_R)
add(([head_deform(v) + HEAD_C for v in hv], hf, huv),
    lambda c: 'face' if c.y < -0.03 and 1.37 < c.z < 1.66 else 'skin', 'head', uvfn=FACE_UV)
add(tube([(0, 0, 1.33), (0, 0, 1.45)], 0.056, seg=16), 'skin', 'neck')
for sx in (1, -1):  # 耳朵與耳窩
    add(sphere(14, 10, (sx * 0.148, 0.012, 1.515), (0.02, 0.036, 0.05), (0, 0, sx * 12)), 'skin', 'head')
    add(sphere(10, 8, (sx * 0.162, 0.008, 1.512), (0.008, 0.022, 0.033), (0, 0, sx * 12)), 'skin_shade', 'head')

# 鼻：一體成形的鼻樑與鼻頭、鼻翼
n0, ntip = on_face(0, 1.556, -0.004), Vector((0, surf(0, 1.492) - 0.024, 1.492))
add(orient(lathe([(0, 0.0075, 0.006), (0.35, 0.0085, 0.008), (0.7, 0.011, 0.011), (0.92, 0.0145, 0.014),
                  (1.0, 0.0125, 0.012), (1.07, 0.0, 0.0)], 16), n0, ntip), 'skin', 'head')
for sx in (1, -1):
    add(sphere(12, 8, (sx * 0.0155, surf(0.0155, 1.486) - 0.007, 1.486), (0.011, 0.01, 0.0095)), 'skin', 'head')

# 眉、八字鬍、絡腮鬍：貼合臉面的殼，髮絲貼圖沿生長方向。各主公鬍型不同：
#   曹操：絡腮短鬚＋尖山羊鬍；孫權：滿臉方鬍；劉備：細鬢鬚＋長鬚垂胸；董卓：濃密大鬍子垂到胸前
BEARD = CFG['beard']
BROW_T = {'dong': 0.0065, 'sun': 0.005}.get(BEARD, 0.0045)
MUST_T = {'dong': 0.011, 'sun': 0.009}.get(BEARD, 0.0075)
JAW = {
    'cao': ([(0.0, 1.436), (0.03, 1.436), (0.055, 1.444), (0.085, 1.452), (0.112, 1.48), (0.13, 1.53), (0.136, 1.585)],
            [(0.0, 1.392), (0.04, 1.398), (0.075, 1.414), (0.105, 1.44), (0.128, 1.48), (0.141, 1.53), (0.143, 1.585)],
            0.012, 0.006, 0.007),
    'sun': ([(0.0, 1.437), (0.03, 1.437), (0.06, 1.452), (0.09, 1.482), (0.115, 1.512), (0.132, 1.55), (0.137, 1.59)],
            [(0.0, 1.372), (0.045, 1.38), (0.085, 1.405), (0.115, 1.445), (0.135, 1.495), (0.143, 1.55), (0.144, 1.59)],
            0.017, 0.008, 0.008),
    'liu': ([(0.0, 1.434), (0.04, 1.43), (0.08, 1.442), (0.112, 1.48), (0.132, 1.535), (0.137, 1.58)],
            [(0.0, 1.41), (0.04, 1.405), (0.08, 1.42), (0.118, 1.462), (0.14, 1.525), (0.143, 1.58)],
            0.006, 0.004, 0.003),
    'dong': ([(0.0, 1.437), (0.03, 1.437), (0.06, 1.458), (0.088, 1.49), (0.11, 1.52), (0.13, 1.56), (0.138, 1.6)],
             [(0.0, 1.38), (0.05, 1.385), (0.09, 1.41), (0.12, 1.45), (0.138, 1.5), (0.145, 1.56), (0.146, 1.6)],
             0.026, 0.014, 0.012),
}[BEARD]
for sx in (1, -1):
    m = lambda pts: [(sx * x, z) for x, z in pts]
    add(swap_uv(face_patch(m([(0.016, 1.553), (0.035, 1.566), (0.06, 1.578), (0.085, 1.582), (0.108, 1.574)]),
                           m([(0.018, 1.541), (0.035, 1.551), (0.06, 1.563), (0.085, 1.569), (0.108, 1.567)]), 12, 4,
                           lambda a, t: BROW_T * (1 - 0.5 * a) * math.sin(math.pi * t) ** 0.4 + 0.0004,
                           lambda a, t: (t, a * 3))), 'beard', 'head')
    add(swap_uv(face_patch(m([(0.004, 1.473), (0.03, 1.47), (0.055, 1.461), (0.073, 1.446), (0.086, 1.428),
                              (0.09, 1.413)]),
                           m([(0.004, 1.463), (0.03, 1.459), (0.052, 1.45), (0.068, 1.438), (0.08, 1.423),
                              (0.088, 1.412)]), 14, 4,
                           lambda a, t: MUST_T * (1 - 0.55 * a) * math.sin(math.pi * t) ** 0.5 + 0.0004,
                           lambda a, t: (t, a * 3))), 'beard', 'head')
    add(face_patch(m(JAW[0]), m(JAW[1]), 24, 6,
                   lambda a, t: (JAW[2] - (JAW[2] - JAW[3]) * a) * smoothstep(0, 0.35, t),
                   lambda a, t: (a * 6, t * 1.5), jag=lambda a: JAW[4] * abs(math.sin(a * math.pi * 7))),
        'beard', 'head')
chin = on_face(0, 1.428, 0.008)
if BEARD == 'cao':  # 尖山羊鬍
    goatee = ([chin, Vector((0, surf(0, 1.405) - 0.014, 1.405)), Vector((0, -0.158, 1.372)), Vector((0, -0.163, 1.335))],
              0.024, 0.014, [1.0, 1.05, 0.65, 0.08])
elif BEARD == 'sun':  # 方而短
    goatee = ([chin, Vector((0, surf(0, 1.4) - 0.02, 1.4)), Vector((0, -0.168, 1.37)), Vector((0, -0.168, 1.35))],
              0.04, 0.016, [1.0, 1.0, 0.8, 0.3])
elif BEARD == 'liu':  # 長鬚垂胸
    goatee = ([chin, Vector((0, surf(0, 1.4) - 0.016, 1.4)), Vector((0, -0.165, 1.33)), Vector((0, -0.172, 1.26)),
               Vector((0, -0.17, 1.2))], 0.028, 0.012, [1.0, 1.1, 0.85, 0.5, 0.08])
else:  # 董卓：大把鬍子垂到胸口
    goatee = ([chin, Vector((0, surf(0, 1.39) - 0.03, 1.39)), Vector((0, -0.19, 1.31)), Vector((0, -0.2, 1.23)),
               Vector((0, -0.19, 1.16))], 0.1, 0.035, [0.6, 1.0, 1.0, 0.75, 0.15])
add(swap_uv(tube(goatee[0], goatee[1], goatee[2], seg=14, hint=(0, -1, 0), radii=goatee[3], ulen=8)), 'beard', 'head')
if BEARD == 'dong':  # 鬍鬚外緣一撮撮下垂
    for k in range(9):
        x = -0.1 + 0.2 * k / 8
        top = Vector((x, surf(x, 1.4) - 0.02 - 0.015 * (1 - abs(x) / 0.1), 1.4 - 0.02 * abs(x) / 0.1))
        add(swap_uv(tube([top, top + Vector((x * 0.25, -0.03, -0.1)), top + Vector((x * 0.4, -0.035, -0.18 + 0.05 * abs(x) / 0.1))],
                         0.022, 0.01, seg=8, hint=(0, -1, 0), radii=[1.0, 0.9, 0.12], ulen=8)), 'beard', 'head')

# ---------------------------------------------------------------- 頭髮：底層髮殼＋一束束髮絲
HC_H, HR = Vector((0, 0.006, 1.535)), Vector((0.163, 0.157, 0.178))
BUN = Vector((0, 0.03, 1.685))
add(sphere(48, 32, HC_H, HR * 0.99), 'hair', 'head',
    keep=lambda c: c.z > 1.618 - 0.2 * smoothstep(-0.06, 0.1, c.y) - 0.02 * abs(c.x) / 0.15)


def sph_dir(az, el):
    az, el = math.radians(az), math.radians(el)
    return Vector((math.cos(el) * math.cos(az), math.cos(el) * math.sin(az), math.sin(el)))


def on_hair(d, off):
    return HC_H + Vector((d.x * HR.x, d.y * HR.y, d.z * HR.z)) * (1 + off)


def strand(az0, el0, az1=90, el1=80, n=9, width=0.036, thick=0.008, bulge=0.035, mat='hair', end=None):
    a, b = sph_dir(az0, el0), sph_dir(az1, el1)
    pts = [on_hair(a.slerp(b, i / (n - 1)), 0.004 + bulge * math.sin(math.pi * i / (n - 1))) for i in range(n)]
    if end is not None:
        pts[-1] = Vector(end)
    radii = [(0.08 + 0.92 * smoothstep(0, 0.35, i / (n - 1))) * (1 - 0.55 * i / (n - 1)) for i in range(n)]
    add(tube(pts, width, thick, seg=6, hint=lambda p: (p - HC_H).normalized(), radii=radii, smooth=1), mat, 'head')


for k in range(17):  # 前額往後梳
    az = -168 + 156 * k / 16
    el = 33 - 22 * (1 - abs(math.sin(math.radians(az)))) ** 1.3
    strand(az, el, 90, 78, mat='gray_hair' if CFG['gray'] and -170 < az < -150 else 'hair', bulge=0.03 + 0.015 * (k % 2))
for k in range(17):  # 兩側與腦後往上收
    az = -12 + 204 * k / 16
    b = max(0.0, math.sin(math.radians(az)))
    strand(az, 4 - 44 * b ** 0.8, 90, 72, bulge=0.03 + 0.015 * (k % 2))
# 髮髻與纏繞
add(sphere(16, 10, BUN, (0.062, 0.062, 0.052)), 'hair', 'head')
for k in range(6):
    a = 2 * math.pi * k / 6
    pts = [BUN + Vector((0.064 * math.cos(a + t), 0.064 * math.sin(a + t), 0.03 * math.cos(t * 1.5) - 0.01))
           for t in (0, 0.5, 1.0, 1.5)]
    add(tube(pts, 0.016, 0.006, seg=6, hint=lambda p: (p - BUN).normalized(), radii=[0.4, 1, 1, 0.4]), 'hair', 'head')

if CFG.get('ponytail'):  # 劉備：長髮由髮髻垂到背後
    tail_w = lambda co: {'head': 1 - smoothstep(1.5, 1.3, co.z), 'chest': smoothstep(1.5, 1.3, co.z)}
    for k, dx in enumerate((-0.05, -0.017, 0.017, 0.05)):
        pts = [BUN + Vector((dx * 0.6, 0.04, -0.01)), Vector((dx, 0.17, 1.55)), Vector((dx * 1.3, 0.2, 1.4)),
               Vector((dx * 1.5, 0.22, 1.25)), Vector((dx * 1.4, 0.24, 1.12))]
        add(tube(pts, 0.03, 0.009, seg=6, hint=(0, 1, 0), radii=[0.6, 1.0, 1.0, 0.85, 0.2]), 'hair', tail_w)

# ---------------------------------------------------------------- 冠：曹操方冠、孫權短冠垂紅纓、劉備平頂冕垂綠珠、董卓紫色高冠
CROWN = CFG['crown']
CW, CD, CHT, CZ, CTILT = {'cao': (0.2, 0.15, 0.26, 1.83, -10), 'sun': (0.19, 0.14, 0.2, 1.8, -8),
                          'liu': (0.19, 0.14, 0.2, 1.8, -4), 'dong': (0.22, 0.17, 0.32, 1.86, -8)}[CROWN]
CROWN_MAT = 'outer' if CROWN == 'dong' else 'plate'
CROWN_R = Euler((math.radians(CTILT), 0, 0)).to_matrix()
crown_c = Vector((0, 0.03, CZ))
add(lathe([(1.655, 0.088, 0.078, 0, 0.03), (1.715, 0.094, 0.084, 0, 0.03)], 32, cap0=True, cap1=True, urep=3,
          vscale=None), 'trim', 'head')
add(rbox((CW, CD, CHT), crown_c, CROWN_R, bevel=0.012), CROWN_MAT, 'head', smooth=False, dens=3.2)
hx, hy, hz = CW / 2, CD / 2, CHT / 2
corners = [crown_c + CROWN_R @ Vector((x, y, z)) for x in (-hx, hx) for y in (-hy, hy) for z in (-hz, hz)]
for a, b in [(0, 1), (2, 3), (4, 5), (6, 7), (0, 2), (1, 3), (4, 6), (5, 7), (0, 4), (1, 5), (2, 6), (3, 7)]:
    add(tube([corners[a], corners[b]], 0.0085, seg=6), 'gold', 'head')
if CROWN == 'liu':  # 平頂冕板，兩側垂綠珠串
    board = crown_c + CROWN_R @ Vector((0, 0, hz + 0.012))
    add(rbox((0.36, 0.24, 0.02), board, CROWN_R, bevel=0.006), 'plate', 'head', smooth=False, dens=3.2)
    bc = [board + CROWN_R @ Vector((x, y, 0)) for x, y in ((-0.18, -0.12), (0.18, -0.12), (0.18, 0.12), (-0.18, 0.12))]
    add(tube(bc + [bc[0]], 0.008, seg=6, caps=False), 'gold', 'head')
    for sx in (1, -1):
        for y in (-0.1, 0.1):
            top = board + CROWN_R @ Vector((sx * 0.165, y, -0.01))
            add(tube([top, top - Vector((0, 0, 0.2))], 0.0025, seg=4), 'gold', 'head')
            for k in range(6):
                add(sphere(8, 6, top - Vector((0, 0, 0.03 + 0.034 * k)), (0.012,) * 3), 'gem_green', 'head')
else:
    top_c = crown_c + CROWN_R @ Vector((0, -0.025, hz + 0.01))
    TR = Euler((math.radians(CTILT - 12), 0, 0)).to_matrix()
    add(rbox((CW + 0.035, CD + 0.075, 0.028), top_c, TR, bevel=0.008), CROWN_MAT, 'head', smooth=False, dens=3.2)
    tc = [top_c + TR @ Vector((x, y, 0.0)) for x, y in
          ((-(CW + 0.035) / 2, -(CD + 0.075) / 2), ((CW + 0.035) / 2, -(CD + 0.075) / 2),
           ((CW + 0.035) / 2, (CD + 0.075) / 2), (-(CW + 0.035) / 2, (CD + 0.075) / 2))]
    add(tube(tc + [tc[0]], 0.009, seg=6, caps=False), 'gold', 'head')
# 冠前火焰金飾與寶石
fs = 1.35 if CROWN == 'dong' else 1.0
fl = [(0, 0.075), (0.02, 0.04), (0.045, 0.05), (0.04, 0.015), (0.06, 0.0), (0.035, -0.02), (0.02, -0.045), (0, -0.03),
      (-0.02, -0.045), (-0.035, -0.02), (-0.06, 0.0), (-0.04, 0.015), (-0.045, 0.05), (-0.02, 0.04)]
front_z = CZ - hz + 0.05 * fs
front_y = crown_c.y - hy * math.cos(math.radians(CTILT)) - (front_z - CZ) * math.sin(math.radians(CTILT)) - 0.014
add(prism([(u * fs, v * fs) for u, v in fl], 0.012, (0, front_y, front_z), (1, 0, 0), (0, 0.15, 1), (0, -1, 0)), 'gold',
    'head', smooth=False)
add(gem((0, front_y - 0.011, front_z), 0.022 * fs), 'gem_green' if CROWN == 'liu' else 'gem', 'head', smooth=False)
for sx in (1, -1):
    add(gem((sx * 0.032 * fs, front_y - 0.008, front_z - 0.015), 0.008, normal=(0, -1, 0)), 'gem_green', 'head',
        smooth=False)
# 橫簪、冠纓
PIN_Z = 1.735
add(tube([(-0.27, 0.0, PIN_Z), (0.27, 0.0, PIN_Z)], 0.011, seg=8), 'gold', 'head')
for sx in (1, -1):
    add(gem((sx * 0.29, 0.0, PIN_Z), 0.022, normal=(sx, 0, 0)), 'gold', 'head', smooth=False)
    add(gem((sx * 0.29, -0.004, PIN_Z), 0.01, normal=(0, -1, 0)), 'gem', 'head', smooth=False)
    for k, r in enumerate((0.016, 0.012, 0.012)):
        add(sphere(8, 6, (sx * (0.2 + 0.026 * k), 0.0, PIN_Z), (r,) * 3), 'gold', 'head')
    if CROWN in ('sun', 'dong'):  # 簪頭垂紅流蘇
        add(tube([(sx * 0.29, 0.0, PIN_Z - 0.02), (sx * 0.29, 0.0, 1.5)], 0.004, seg=5), 'tassel', 'head')
        add(sphere(8, 6, (sx * 0.29, 0.0, 1.5), (0.014,) * 3), 'gold', 'head')
        add(lathe([(1.49, 0.01, 0.01, sx * 0.29, 0.0), (1.42, 0.022, 0.022, sx * 0.29, 0.0),
                   (1.32, 0.03, 0.03, sx * 0.29, 0.0)], 16, cap0=True, cap1=True,
                  wobble=lambda th, z: 1 + 0.18 * abs(math.sin(4 * th)) * (1.49 - z) * 6), 'tassel', 'head')
    rib = [(sx * 0.2, 0.03, 1.71), (sx * 0.22, 0.1, 1.6), (sx * 0.26, 0.17, 1.48), (sx * 0.3, 0.22, 1.36),
           (sx * 0.34, 0.26, 1.24)]
    add(tube(rib, 0.03, 0.005, hint=(0, 1, 0), radii=[0.7, 1.0, 1.0, 0.95, 0.8]), 'red', ribbon_w)
    add(tube([Vector(rib[-1]) + Vector((0, 0.01, 0.02)), Vector(rib[-1]) + Vector((sx * 0.004, 0.012, -0.02))], 0.026,
             0.008, hint=(0, 1, 0)), 'gold', ribbon_w)

# ---------------------------------------------------------------- 軀幹、交領、胸飾
torso = lathe([(WAIST_Z - 0.02, 0.17, 0.125), (1.0, 0.18, 0.13), (CHEST_Z, 0.21, 0.145), (1.24, 0.235, 0.15),
               (SHOULDER_Z, 0.23, 0.14), (1.35, 0.15, 0.1), (1.38, 0.07, 0.07)], 40, cap1=True, urep=3, vscale=2.5)
add(torso, 'robe', torso_w)
for pts, mat, r in [
    ([(0.06, -0.045, 1.38), (0.032, -0.122, 1.29), (-0.035, -0.149, 1.18), (-0.09, -0.152, 1.06)], 'white', 0.022),
    ([(-0.06, -0.045, 1.38), (-0.028, -0.126, 1.28), (0.02, -0.147, 1.2)], 'white', 0.02),
    ([(0.085, -0.03, 1.375), (0.058, -0.126, 1.29), (-0.02, -0.157, 1.17), (-0.08, -0.16, 1.05)], 'robe_dark', 0.026),
    ([(-0.085, -0.03, 1.375), (-0.053, -0.127, 1.29), (-0.005, -0.153, 1.2)], 'robe_dark', 0.024),
]:
    add(tube(pts, r, 0.006, hint=(0, -1, 0.2), seg=8), mat, 'chest')
for pts in ([(0.1, -0.025, 1.373), (0.072, -0.132, 1.29), (-0.012, -0.164, 1.17), (-0.072, -0.167, 1.05)],
            [(-0.1, -0.025, 1.373), (-0.067, -0.133, 1.29), (0.004, -0.16, 1.2)]):
    add(tube(pts, 0.009, 0.004, hint=(0, -1, 0.2), seg=6, ulen=6, vrep=2), 'trim', 'chest')
if CFG['chest']:  # 曹操、孫權：紅繩、胸前獸首、綠寶菱形、紅流蘇
    # 紅繩、繩結
    for sx in (1, -1):
        add(tube([(sx * 0.17, -0.08, 1.31), (sx * 0.1, -0.15, 1.2), (sx * 0.02, -0.166, 1.14)], 0.008, seg=6), 'red',
            'chest')
        add(tube([(sx * 0.005, -0.17, 1.14), (sx * 0.03, -0.18, 1.115), (sx * 0.012, -0.175, 1.1)], 0.007, seg=6), 'red',
            'chest')
    add(sphere(12, 8, (0, -0.17, 1.135), (0.022, 0.016, 0.022)), 'red', 'chest')
    # 胸前獸首、金鏈、綠寶菱形、紅流蘇
    for sx in (1, -1):
        lion((sx * 0.13, -0.142, 1.255), 0.028, 'chest', facing=(sx * 0.3, -1, 0.15))
        add(tube([(sx * 0.13, -0.155, 1.22), (sx * 0.125, -0.16, 1.18)], 0.004, seg=5), 'gold', 'chest')
        add(gem((sx * 0.125, -0.163, 1.16), 0.022, normal=(0, -1, 0)), 'gold', 'chest', smooth=False)
        add(gem((sx * 0.125, -0.172, 1.16), 0.011, normal=(0, -1, 0)), 'gem_green', 'chest', smooth=False)
        add(sphere(8, 6, (sx * 0.125, -0.165, 1.125), (0.014,) * 3), 'gold', 'chest')
        add(lathe([(1.115, 0.01, 0.01, sx * 0.125, -0.168), (1.06, 0.02, 0.02, sx * 0.125, -0.172),
                   (0.96, 0.03, 0.03, sx * 0.125, -0.178)], 16, cap0=True, cap1=True,
                  wobble=lambda th, z: 1 + 0.18 * abs(math.sin(4 * th)) * (1.1 - z) * 6), 'red', 'chest')

# ---------------------------------------------------------------- 肩甲：三層黑漆金雲、回紋鑲邊、鉚釘、肩獸
for sx in (1, -1):
    # 同一個橢球切出頂蓋與兩層向下、向外遞增的甲片，層與層互相覆蓋，看起來是一整副肩甲而不是三顆半球
    SC = Vector((sx * (SHW + 0.035), 0.0, 1.2))
    SR = Euler((0, math.radians(sx * 28), 0)).to_matrix()
    out_ph = 0 if sx > 0 else 180
    for k, (th0, th1, sc) in enumerate(((0.5, 50, 1.0), (40, 74, 1.07), (64, 98, 1.14))):
        E = Vector((0.13, 0.16, 0.12)) * sc
        ph0, ph1 = (out_ph - 180, out_ph + 180) if k == 0 else (out_ph - 118, out_ph + 118)
        part, lower = ell_band(SC, SR, E, th0, th1, ph0, ph1, nth=5 if k else 7, nph=28, thick=0.007)
        add(part, 'plate', 'chest')
        if k:
            add(tube(lower, 0.011, 0.006, seg=6, hint=lambda q, c=SC: (q - c).normalized(), caps=True, ulen=5,
                     vrep=2), 'trim', 'chest')
            for i in range(1, 8):
                ph = ph0 + (ph1 - ph0) * i / 8
                th = th1 - 6
                d = SR @ Vector((E.x * math.sin(math.radians(th)) * math.cos(math.radians(ph)),
                                 E.y * math.sin(math.radians(th)) * math.sin(math.radians(ph)),
                                 E.z * math.cos(math.radians(th))))
                add(sphere(6, 4, SC + d * 1.02, (0.007,) * 3), 'gold', 'chest')
    lion((sx * 0.235, -0.03, 1.355), 0.032, 'chest', facing=(sx * 0.5, -1, 0.35))
    if CFG.get('fur'):  # 董卓肩獸帶角
        for dx in (-0.018, 0.018):
            base = Vector((sx * 0.235 + dx, -0.03, 1.385))
            add(tube([base, base + Vector((sx * 0.01 + dx, 0.0, 0.05)), base + Vector((sx * 0.03 + dx, 0.01, 0.08))],
                     0.012, seg=8, radii=[1.0, 0.6, 0.1]), 'gold', 'chest')
if CFG.get('fur'):  # 董卓：毛皮領圍繞肩頸
    for k in range(70):
        a = 2 * math.pi * k / 70
        for layer, (rx, ry, z) in enumerate(((0.17, 0.13, 1.37), (0.21, 0.16, 1.33))):
            p0 = Vector((rx * math.cos(a), ry * math.sin(a), z + 0.01 * math.sin(5 * a)))
            out = Vector((math.cos(a), math.sin(a), 0.0))
            tip = p0 + out * (0.07 + 0.02 * ((k * 7) % 3)) + Vector((0, 0, -0.03 - 0.04 * layer))
            add(swap_uv(tube([p0, (p0 + tip) / 2 + Vector((0, 0, 0.015)), tip], 0.026, 0.012, seg=6,
                             hint=lambda q: Vector((q.x, q.y, 0.3)).normalized(), radii=[1.0, 0.85, 0.1], ulen=6,
                             smooth=1)),
                'fur', 'chest')

# ---------------------------------------------------------------- 腰帶
add(lathe([(0.872, 0.194, 0.146), (0.968, 0.194, 0.146)], 40, urep=4, vscale=None), 'plate', 'hips')
for z in (0.872, 0.968):
    add(tube(ring_pts(0, 0, z, 0.197, 0.149, 40), 0.009, 0.006, seg=6, caps=False, ulen=5, vrep=2), 'trim', 'hips')
for k in range(10):
    a = math.radians(-90 + 36 * k)
    if k in (0,):
        continue
    p = Vector((0.2 * math.cos(a), 0.152 * math.sin(a), 0.92))
    rot = Euler((0, 0, a + math.pi / 2)).to_matrix()
    add(rbox((0.05, 0.012, 0.06), p, rot, bevel=0.004), 'gold', 'hips', smooth=False)
    add(gem(p + rot @ Vector((0, -0.008, 0)), 0.012, normal=rot @ Vector((0, -1, 0))), 'gem' if k % 2 else 'gem_green',
        'hips', smooth=False)
if CFG['buckle'] == 'emerald':  # 劉備：金框大綠寶
    add(rbox((0.1, 0.022, 0.09), (0, -0.155, 0.918), bevel=0.008), 'gold', 'hips', smooth=False)
    add(rbox((0.06, 0.02, 0.055), (0, -0.168, 0.918), bevel=0.01), 'gem_green', 'hips', smooth=False)
else:
    bs = 0.075 if CFG['buckle'] == 'demon' else 0.052
    lion((0, -0.165, 0.918), bs, 'hips')
    if CFG['buckle'] == 'demon':  # 董卓：帶角獸首
        for sx in (1, -1):
            b0 = Vector((sx * 0.04, -0.2, 0.975))
            add(tube([b0, b0 + Vector((sx * 0.03, -0.01, 0.04)), b0 + Vector((sx * 0.06, 0.0, 0.05))], 0.012, seg=8,
                     radii=[1.0, 0.6, 0.1]), 'gold', 'hips')
for sx in (1, -1):  # 腰側紅綬與流蘇
    add(sphere(10, 8, (sx * 0.17, -0.11, 0.87), (0.025, 0.02, 0.025)), 'tassel', 'hips')
    for dx in (-0.012, 0.012):
        add(tube([(sx * 0.17 + dx, -0.12, 0.86), (sx * (0.16 + dx), -0.2, 0.72), (sx * (0.15 + dx), -0.23, 0.6)],
                 0.012, 0.004, hint=(0, -1, 0), seg=6), 'tassel', 'hips')
    if CFG.get('jade'):  # 孫權：玉璧
        disc = [Vector((sx * 0.15 + 0.028 * math.cos(t), -0.236, 0.6 + 0.028 * math.sin(t)))
                for t in [2 * math.pi * i / 20 for i in range(21)]]
        add(tube(disc, 0.011, 0.004, seg=6, hint=(0, -1, 0), caps=False), 'gem_green', 'hips')
    else:
        add(gem((sx * 0.15, -0.235, 0.58), 0.02, normal=(0, -1, 0)), 'gold', 'hips', smooth=False)
        add(gem((sx * 0.15, -0.244, 0.58), 0.01, normal=(0, -1, 0)), 'gem_green', 'hips', smooth=False)
    add(lathe([(0.56, 0.01, 0.01, sx * 0.15, -0.238), (0.5, 0.022, 0.022, sx * 0.15, -0.242),
               (0.4, 0.032, 0.032, sx * 0.15, -0.25)], 16, cap0=True, cap1=True,
              wobble=lambda th, z: 1 + 0.18 * abs(math.sin(4 * th)) * (0.56 - z) * 6), 'tassel', 'hips')


# ---------------------------------------------------------------- 下袍：內袍、前擺（立繪金龍）、外袍尖擺、紅襯
def skirt_ry(z):
    """內袍在正前方（含皺褶起伏）的半徑。"""
    rs = sorted((zz, ry) for zz, _, ry in skirt_rings)
    z = min(max(z, rs[0][0]), rs[-1][0])
    for (z0, r0), (z1, r1) in zip(rs, rs[1:]):
        if z0 <= z <= z1:
            ry = r0 + (r1 - r0) * (z - z0) / (z1 - z0)
            return ry * (1 + 0.035 * (0.9 - z))


skirt_rings = [(0.9, 0.18, 0.13), (0.75, 0.24, 0.2), (0.55, 0.3, 0.25), (0.35, 0.34, 0.285), (0.16, 0.37, 0.31)]
add(lathe(skirt_rings, 48, wobble=lambda th, z: 1 + 0.035 * (0.9 - z) * math.sin(7 * th), urep=5, vscale=2.5),
    'robe', skirt_w)
add(tube(ring_pts(0, 0, 0.17, 0.377, 0.318, 48), 0.014, 0.006, seg=6, caps=False, ulen=5, vrep=2), 'trim', skirt_w)
add(lathe([(0.45, 0.28, 0.235), (0.3, 0.32, 0.268), (0.17, 0.352, 0.295), (0.11, 0.39, 0.33)], 48,
          wobble=lambda th, z: 1 + 0.03 * math.sin(5 * th + 1)), 'red', skirt_w)

# 前擺：直接使用立繪的金龍前擺
AZ = [0.88, 0.78, 0.68, 0.58, 0.48, 0.38, 0.3, 0.24, 0.195, 0.155]


def apron_hw(z):
    return 0.125 if z >= 0.24 else max(0.004, 0.125 * (z - 0.15) / 0.09)


cols = 7
av, af, auv = [], [], []
for layer, dy in ((0, 0.0), (1, 0.012)):
    for z in AZ:
        for c in range(cols):
            u = c / (cols - 1)
            av.append(Vector(((u * 2 - 1) * apron_hw(z), -skirt_ry(z) - 0.02 + dy, z)))
nrow = len(AZ)
for r in range(nrow - 1):
    for c in range(cols - 1):
        a = r * cols + c
        af.append([a, a + 1, a + 1 + cols, a + cols])
        auv.append(None)
        b = nrow * cols + a
        af.append([b + cols, b + 1 + cols, b + 1, b])
        auv.append(None)
add((av, af, auv), 'apron', skirt_w, uvfn=lambda p: ((p.x / 0.125 + 1) / 2, (p.z - 0.15) / 0.73))
edge = [r * cols for r in range(nrow)] + [r * cols + cols - 1 for r in range(nrow)][::-1]
ef = [[edge[i], edge[(i + 1) % len(edge)], edge[(i + 1) % len(edge)] + nrow * cols, edge[i] + nrow * cols]
      for i in range(len(edge))]
add((av, ef), 'robe_dark', skirt_w, keep=lambda c: True)

# 外袍：前方開口，尖角下擺，外黑內紅，下緣金雲帶
OUT_A0, OUT_A1 = -62.0, 242.0


def hem_z(th, base, depth, period):
    p = ((math.degrees(th) - OUT_A0) % period) / period
    return base + depth * abs(2 * p - 1)


outer_rings = [(0.92, 0.195, 0.148), (0.75, 0.255, 0.212), (0.55, 0.315, 0.265), (0.4, 0.348, 0.293), (0.25, 0.37, 0.312)]


def outer_zmod(th, ri, z):
    return hem_z(th, 0.2, 0.1, 50.67) if ri == len(outer_rings) - 1 else z


ow = lambda th, z: 1 + 0.035 * (0.9 - z) * math.sin(7 * th)
add(lathe(outer_rings, 48, OUT_A0, OUT_A1, wobble=ow, zmod=outer_zmod, urep=5, vscale=2.5), 'outer', skirt_w)
ov, of, ouv = lathe([(z, rx - 0.01, ry - 0.01) for z, rx, ry in outer_rings], 48, OUT_A0, OUT_A1, wobble=ow,
                    zmod=outer_zmod)
add((ov, [f[::-1] for f in of]), 'red', skirt_w)
band = [(0.37, 0.362, 0.305), (0.25, 0.381, 0.321)]
add(lathe(band, 48, OUT_A0, OUT_A1, wobble=ow, zmod=lambda th, ri, z: hem_z(th, 0.2, 0.1, 50.67) if ri else
          hem_z(th, 0.2, 0.1, 50.67) + 0.13, urep=6, vscale=3), 'plate', skirt_w)
hem_pts = [Vector(v) * Vector((1.012, 1.012, 1)) for v in lathe(outer_rings, 48, OUT_A0, OUT_A1, wobble=ow,
                                                                 zmod=outer_zmod)[0][-49:]]
add(tube(hem_pts, 0.012, 0.006, seg=6, ulen=5, vrep=2,
         hint=lambda p: Vector((p.x, p.y, 0)).normalized() if Vector((p.x, p.y)).length > 1e-4 else Vector((0, -1, 0))),
    'trim', skirt_w)
for a in (OUT_A0, OUT_A1):
    th = math.radians(a)
    pts = [Vector((rx * 1.012 * math.cos(th), ry * 1.012 * math.sin(th), z)) for z, rx, ry in outer_rings[:-1]]
    pts.append(Vector((0.37 * 1.012 * math.cos(th), 0.312 * 1.012 * math.sin(th), hem_z(th, 0.2, 0.1, 50.67))))
    add(tube(pts, 0.013, 0.006, seg=6, ulen=5, vrep=2, hint=(math.cos(th), math.sin(th), 0)), 'trim', skirt_w)

# ---------------------------------------------------------------- 披風：外紅金焰、內暗紅、鋸齒下緣
cape_r = [(1.34, 0.2, 0.15, 0, 0.0), (1.22, 0.29, 0.21, 0, 0.02), (0.85, 0.38, 0.29, 0, 0.04), (0.4, 0.46, 0.36, 0, 0.06),
          (0.12, 0.52, 0.42, 0, 0.08)]
cape_wob = lambda th, z: 1 + 0.07 * (1.3 - z) * math.sin(6 * th)


def cape_zmod(th, ri, z):
    if ri != len(cape_r) - 1:
        return z
    p = ((math.degrees(th) + 8) % 24) / 24
    return 0.05 + 0.07 * abs(2 * p - 1)


outer = lathe(cape_r, 48, a0=-8, a1=188, wobble=cape_wob, zmod=cape_zmod, urep=3)
inner = lathe([(z, rx - 0.014, ry - 0.014, cx, cy) for z, rx, ry, cx, cy in cape_r], 48, a0=-8, a1=188,
              wobble=cape_wob, zmod=cape_zmod)
add(outer, 'cape', cape_w)
add((inner[0], [f[::-1] for f in inner[1]]), 'cape_in', cape_w)
add(tube([Vector(v) for v in outer[0][-49:]], 0.012, 0.006, seg=6, ulen=5, vrep=2), 'trim', cape_w)
for i in (0, 48):  # 披風前緣金邊
    add(tube([Vector(outer[0][r * 49 + i]) for r in range(len(outer[0]) // 49)], 0.011, 0.006, seg=6, ulen=5,
             vrep=2), 'trim',
        cape_w)


# ---------------------------------------------------------------- 手臂：下垂大袖、護腕、手指
def frame(d, palm):
    d = Vector(d).normalized()
    n = (Vector(palm) - d * Vector(palm).dot(d)).normalized()
    return d, n, d.cross(n)


def finger(base, dirs, lens, r, bone):
    pts = [Vector(base)]
    for dv, ln in zip(dirs, lens):
        pts.append(pts[-1] + Vector(dv).normalized() * ln)
    add(tube(pts, r, r * 0.85, seg=8, radii=[1.0] + [0.92] * (len(pts) - 2) + [0.8]), 'skin', bone)
    add(sphere(8, 6, pts[-1], (r * 0.8,) * 3), 'skin', bone)


def arm(shoulder, elbow, wrist, side, flare):
    s = 'L' if side > 0 else 'R'
    d = (wrist - elbow).normalized()
    sl0, sl1 = elbow - d * 0.03, wrist + d * 0.02
    o = 0.1 + 0.075 * flare
    droop = lambda t: 0.06 * flare * smoothstep(0.2, 1.0, t)
    dn = (Vector((0, 0, -1)) - d * Vector((0, 0, -1)).dot(d)).normalized()
    bell_r = lambda t: (0.1 + (0.1 + 0.035 * flare - 0.1) * t / 0.5 if t < 0.5 else
                        0.1 + 0.035 * flare + (o * 0.97 - 0.1 - 0.035 * flare) * (t - 0.5) / 0.35 if t < 0.85 else
                        o * 0.97 + (o - o * 0.97) * (t - 0.85) / 0.15)
    u = (elbow - shoulder).normalized()
    path = [shoulder - u * 0.04, shoulder + (elbow - shoulder) * 0.5, elbow - u * 0.01]
    radii = [0.082, 0.09, 0.098]
    for t in (0.12, 0.35, 0.6, 0.85, 1.0):
        path.append(sl0 + (sl1 - sl0) * t + dn * droop(t))
        radii.append(bell_r(t))
    fore_w = lambda co: smoothstep(-0.05, 0.06, (co - elbow).dot(d))
    add(tube(path, 1.0, 1.0, seg=32, radii=radii, caps=False, ulen=2.5, vrep=1.5, hint=Vector((0, 0, 1)).cross(d)),
        'outer', lambda co: {'upper_arm.' + s: 1 - fore_w(co), 'forearm.' + s: fore_w(co)})
    add(orient(lathe([(0.78, o * 0.975, o * 0.975), (0.96, o * 1.012, o * 1.012)], 28, urep=4, vscale=3), sl0, sl1,
               droop), 'plate', 'forearm.' + s)
    add(orient(lathe([(0.55, 0.095 + 0.015 * flare, 0.095 + 0.015 * flare), (1, o - 0.016, o - 0.016)], 28), sl0,
               sl1 - d * 0.005, droop), 'red', 'forearm.' + s)
    add(orient(lathe([(0.6, 0.1 + 0.018 * flare, 0.1 + 0.018 * flare), (0.995, o - 0.007, o - 0.007)], 28), sl0,
               sl1 - d * 0.004, droop), 'white', 'forearm.' + s)
    q = Vector((0, 0, 1)).rotation_difference(d)
    dn = q.inverted() @ Vector((0, 0, -1))
    dn.z = 0
    dn.normalize()
    ring = [sl1 + q @ (Vector(((o + 0.003) * math.cos(a), (o + 0.003) * math.sin(a), 0)) + dn * droop(1.0))
            for a in [2 * math.pi * i / 32 for i in range(33)]]
    add(tube(ring, 0.012, 0.007, seg=6, caps=False, ulen=5, vrep=2), 'trim', 'forearm.' + s)
    # 護腕
    add(orient(lathe([(0, 0.043, 0.043), (1, 0.04, 0.04)], 16, urep=2, vscale=4), wrist - d * 0.13, wrist - d * 0.01),
        'plate', 'forearm.' + s)
    for t in (0.02, 0.06, 0.1):
        c = wrist - d * t
        add(tube([c + q @ Vector((0.045 * math.cos(a), 0.045 * math.sin(a), 0)) for a in
                  [2 * math.pi * i / 16 for i in range(17)]], 0.005, seg=5, caps=False), 'gold', 'forearm.' + s)


L_KIND, R_KIND = {'sword': ('hang', 'hold'), 'twin': ('hold', 'hold'), 'bow': ('hold', 'hips')}[CFG['weapon']]
FLARE = {'hang': 1.0, 'hold': 0.35, 'hips': 0.55}
arm(L_SHOULDER, L_ELBOW, L_WRIST, 1, FLARE[L_KIND])
arm(R_SHOULDER, R_ELBOW, R_WRIST, -1, FLARE[R_KIND])


def open_hand(side, elbow, wrist):
    """自然下垂、掌心朝內、手指微彎。"""
    bone = 'hand.' + ('L' if side > 0 else 'R')
    d, n, sd = frame(wrist - elbow, Vector((-side, 0, 0)))
    sd = sd * side  # 讓 -sd 恆指向前方（拇指側）
    palm_c = wrist + d * 0.045
    add(sphere(14, 10, palm_c, (0.042, 0.017, 0.05), Matrix((sd, n, d)).transposed()), 'skin', bone)
    for k, off in enumerate((-0.027, -0.009, 0.009, 0.026)):
        base = palm_c + d * 0.045 + sd * off
        ln = (0.026, 0.02, 0.016) if k in (1, 2) else (0.022, 0.017, 0.014)
        finger(base, (d, d + n * 0.5, d + n * 1.2), ln, 0.0085 if k < 3 else 0.0075, bone)
    finger(palm_c - sd * 0.035 + n * 0.012, (d * 0.6 - sd * 0.6 + n * 0.5, d + n * 0.6), (0.022, 0.018), 0.0095, bone)


def grip_frame(wrist, mx):
    """握持物（劍、弓）的握把座標系：mx=1 右手、-1 左手（鏡像）。"""
    top = wrist + Vector((-0.005 * mx, -0.06, 0.07))
    R = Matrix.Rotation(math.radians(7 * mx), 3, 'Y')
    return lambda z, x=0.0, y=0.0: top + R @ Vector((x * mx, y, z)), top, R


def fist_grip(pt, bone):
    """四指環握直立握把、掌心在外、拇指壓上。"""
    for z in (-0.025, -0.05, -0.075, -0.1):
        pts = [pt(z, 0.027 * math.cos(math.radians(a)), 0.027 * math.sin(math.radians(a))) for a in range(165, 395, 25)]
        add(tube(pts, 0.0105, 0.0095, seg=8, radii=[1.1] + [1.0] * (len(pts) - 2) + [0.85]), 'skin', bone)
    add(sphere(14, 10, pt(-0.062, -0.03, 0.018), (0.024, 0.03, 0.05)), 'skin', bone)
    add(tube([pt(-0.02, -0.025, 0.02), pt(-0.012, -0.012, -0.022), pt(-0.02, 0.012, -0.028)], 0.011, seg=8,
             radii=[1.1, 1.0, 0.85]), 'skin', bone)


def fist_hip(side, elbow, wrist):
    """叉腰的拳頭。"""
    bone = 'hand.' + ('L' if side > 0 else 'R')
    d = (wrist - elbow).normalized()
    c = wrist + d * 0.045
    add(sphere(14, 10, c, (0.045, 0.05, 0.055)), 'skin', bone)
    for k in range(4):
        add(sphere(8, 6, c + d * 0.04 + Vector((0, 0, 0.03 - 0.02 * k)), (0.016, 0.015, 0.011)), 'skin', bone)


def sword(wrist, mx, gem_mat):
    bone = 'hand.' + ('R' if mx > 0 else 'L')
    pt, top, R = grip_frame(wrist, mx)
    add(tube([pt(0.02), pt(-0.13)], 0.018, seg=12), 'robe_dark', bone)
    helix = [pt(0.015 - 0.14 * i / 60, 0.0195 * math.cos(i * 0.7), 0.0195 * math.sin(i * 0.7)) for i in range(61)]
    add(tube(helix, 0.0035, seg=5), 'gold', bone)
    add(gem(pt(0.055), 0.035, normal=(0, -1, 0)), 'gold', bone, smooth=False)
    add(gem(pt(0.055) + Vector((0, -0.012, 0)), 0.016, normal=(0, -1, 0)), gem_mat, bone, smooth=False)
    add(tube([pt(0.025, 0.024 * math.cos(a), 0.024 * math.sin(a)) for a in [2 * math.pi * i / 16 for i in range(17)]],
             0.005, seg=5, caps=False), 'gold', bone)
    gc = pt(-0.15)
    add(rbox((0.075, 0.048, 0.06), gc, R, bevel=0.008), 'gold', bone, smooth=False)
    for sx in (1, -1):  # 劍格兩側捲曲的龍爪
        pts = [pt(-0.15, sx * 0.03), pt(-0.14, sx * 0.075), pt(-0.155, sx * 0.108), pt(-0.185, sx * 0.118),
               pt(-0.205, sx * 0.1)]
        add(tube(pts, 0.016, 0.012, seg=8, radii=[1.1, 1.0, 0.85, 0.6, 0.25]), 'gold', bone)
        add(tube([pt(-0.13, sx * 0.05), pt(-0.1, sx * 0.065)], 0.008, seg=6, radii=[1, 0.2]), 'gold', bone)
        add(sphere(8, 6, pt(-0.15, sx * 0.042, 0), (0.012,) * 3), 'gold', bone)
    for sy in (-1, 1):
        add(gem(gc + Vector((0, sy * 0.027, 0)), 0.022, normal=(0, sy, 0)), gem_mat, bone, smooth=False)
    add(tube([pt(-0.185), pt(-0.215)], 0.026, 0.01, seg=8, radii=[1.0, 0.7]), 'gold', bone)
    bv, bfc, _ = lathe([(-0.18, 0.034, 0.008), (-0.5, 0.032, 0.008), (-0.8, 0.029, 0.008), (-0.9, 0.0, 0.002)], 4,
                       smooth=1)
    buv = [[((Vector(bv[i]).x + 0.034) / 0.068, (Vector(bv[i]).z + 0.9) / 0.72) for i in f] for f in bfc]
    add(([top + R @ Vector(v) for v in bv], bfc, buv), 'blade', bone, smooth=False)
    fist_grip(pt, bone)


def bow(wrist):
    """董卓左手持大弓：弓面朝前，弓臂向外鼓、末端反曲，弦在靠身體一側；金飾尖角、紅繩纏把、紅流蘇。"""
    pt, top, R = grip_frame(wrist, -1)
    c = pt(-0.06)
    prof = [(0.0, 0.0), (0.03, 0.15), (0.075, 0.35), (0.1, 0.55), (0.1, 0.7), (0.07, 0.8), (0.035, 0.85)]
    # x 往外（+x）為弓背，弦在 -x 側
    pts = [c + Vector((x, 0, -z)) for x, z in reversed(prof[1:])] + [c + Vector((x, 0, z)) for x, z in prof]
    radii = [0.45, 0.6, 0.75, 0.85, 0.9, 1.0, 1.15, 1.0, 0.9, 0.85, 0.75, 0.6, 0.45]
    add(tube(pts, 0.017, 0.032, seg=10, hint=(0, 1, 0), radii=radii), 'wood', 'hand.L')
    for sz in (1, -1):
        tip = c + Vector((0.035, 0, sz * 0.85))
        add(prism([(0, 0.11), (0.03, 0.02), (0.012, -0.03), (-0.012, -0.03), (-0.03, 0.02)], 0.012,
                  tip + Vector((0, 0.006, 0)), (1, 0, 0), (0.3, 0, sz), (0, -1, 0)), 'gold', 'hand.L', smooth=False)
        for zz, x in ((0.35, 0.075), (0.55, 0.1)):
            ring_c = c + Vector((x, 0, sz * zz))
            add(tube([ring_c + Vector((0.022 * math.cos(a), 0.036 * math.sin(a), 0)) for a in
                      [2 * math.pi * i / 16 for i in range(17)]], 0.006, seg=5, caps=False), 'gold', 'hand.L')
            add(prism([(0, 0.07), (0.022, 0.0), (0, -0.015), (-0.022, 0.0)], 0.01, ring_c + Vector((0.02, 0.005, 0)),
                      (0, 0, sz), (1, 0, 0.4 * sz), (0, -1, 0)), 'gold', 'hand.L', smooth=False)
    add(tube([c + Vector((0.035, 0, 0.84)), c + Vector((-0.06, 0, 0)), c + Vector((0.035, 0, -0.84))], 0.0028, seg=5),
        'string', 'hand.L')
    wrap = [c + Vector((0.03 * math.cos(i * 0.8), 0.03 * math.sin(i * 0.8), 0.14 - 0.28 * i / 50)) for i in range(51)]
    add(tube(wrap, 0.004, seg=5), 'red', 'hand.L')
    for zz, x in ((0.62, 0.105), (0.45, 0.09)):
        t0 = c + Vector((x + 0.015, 0.0, zz))
        add(tube([t0, t0 - Vector((0, 0, 0.12))], 0.0035, seg=4), 'tassel', 'hand.L')
        add(lathe([(t0.z - 0.12, 0.01, 0.01, t0.x, t0.y), (t0.z - 0.18, 0.022, 0.022, t0.x, t0.y),
                   (t0.z - 0.26, 0.028, 0.028, t0.x, t0.y)], 14, cap0=True, cap1=True), 'tassel', 'hand.L')
    fist_grip(pt, 'hand.L')


if L_KIND == 'hang':
    open_hand(1, L_ELBOW, L_WRIST)
if CFG['weapon'] in ('sword', 'twin'):
    sword(R_WRIST, 1, CFG.get('sword_gem', 'gem'))
if CFG['weapon'] == 'twin':
    sword(L_WRIST, -1, CFG.get('sword_gem', 'gem'))
if CFG['weapon'] == 'bow':
    bow(L_WRIST)
    fist_hip(-1, R_ELBOW, R_WRIST)

# ---------------------------------------------------------------- 腿、脛甲、靴
for sx in (1, -1):
    s = 'L' if sx > 0 else 'R'
    lx = sx * LEG_X
    add(tube([(lx, 0, HIP_Z), (lx, 0, 0.46)], 0.075, seg=14, radii=[1.0, 0.85]), 'robe_dark', 'thigh.' + s)
    add(tube([(lx, 0, 0.5), (lx, 0.01, 0.1)], 0.064, seg=14, radii=[1.0, 0.85]), 'robe_dark', 'shin.' + s)
    for z0, z1 in ((0.45, 0.33), (0.35, 0.23), (0.25, 0.12)):
        r0, r1 = 0.07 - (0.46 - z0) * 0.03, 0.074 - (0.46 - z1) * 0.025
        add(lathe([(z0, r0, r0 * 0.95, lx, 0.0), (z1, r1, r1 * 0.95, lx, -0.004)], 20, a0=-200, a1=20, urep=1.5,
                  vscale=None), 'plate', 'shin.' + s)
        add(tube(ring_pts(lx, -0.004, z1, r1 + 0.003, r1 * 0.95 + 0.003, 20, -200, 20), 0.007, 0.004, seg=5,
                 caps=False, ulen=6, vrep=2), 'trim', 'shin.' + s)
    knee = [(0, 0.05), (0.035, 0.0), (0, -0.06), (-0.035, 0.0)]
    add(prism(knee, 0.01, (lx, -0.075, 0.47), (1, 0, 0), (0, 0.3, 1), (0, -1, 0.1)), 'trim', 'shin.' + s,
        smooth=False, dens=12)
    add(sphere(16, 10, (lx, -0.045, 0.05), (0.062, 0.118, 0.052)), 'robe_dark', 'foot.' + s, keep=lambda c: c.z > 0.0)
    add(sphere(16, 10, (lx, -0.1, 0.047), (0.06, 0.07, 0.047), urep=3, vrep=1.5), 'plate', 'foot.' + s,
        keep=lambda c: c.z > 0.0 and c.y < -0.075)
    add(tube([(lx, -0.165, 0.03), (lx, -0.19, 0.04), (lx, -0.2, 0.065)], 0.016, 0.01, seg=8, radii=[1.0, 0.7, 0.3]),
        'gold', 'foot.' + s)
    add(rbox((0.13, 0.25, 0.022), (lx, -0.05, 0.011), bevel=0.008), 'gold', 'foot.' + s, smooth=False)
    add(tube(ring_pts(lx, 0.005, 0.1, 0.06, 0.058, 20), 0.008, 0.005, seg=5, caps=False, ulen=6, vrep=2), 'trim',
        'foot.' + s)

if CFG.get('fur'):  # 董卓：膝上一圈毛皮
    for sx in (1, -1):
        s_ = 'L' if sx > 0 else 'R'
        for k in range(18):
            a = 2 * math.pi * k / 18
            p0 = Vector((sx * LEG_X + 0.07 * math.cos(a), 0.065 * math.sin(a), 0.47))
            out = Vector((math.cos(a), math.sin(a), 0))
            add(swap_uv(tube([p0, p0 + out * 0.04 + Vector((0, 0, -0.03)), p0 + out * 0.055 + Vector((0, 0, -0.08))],
                             0.022, 0.01, seg=6, hint=lambda q, a=a: Vector((math.cos(a), math.sin(a), 0)),
                             radii=[1.0, 0.8, 0.1], ulen=6, smooth=1)), 'fur', 'shin.' + s_)

# ---------------------------------------------------------------- 體型：董卓的大肚腩（只作用在軀幹、下袍、披風上的頂點）
if BULK > 1:
    TORSO_BONES = {'hips', 'spine', 'chest', 'skirt.F', 'skirt.B', 'cape.1', 'cape.2'}
    for i, w in enumerate(VW):
        if max(w, key=w.get) not in TORSO_BONES:
            continue
        v = V[i]
        k = (BULK - 1) * smoothstep(1.42, 1.12, v.z) * smoothstep(0.05, 0.85, v.z)
        belly = 0.05 * (BULK - 1) / 0.22 * math.exp(-((v.z - 1.0) / 0.14) ** 2) * smoothstep(0.0, -0.1, v.y)
        V[i] = Vector((v.x * (1 + k), v.y * (1 + k) - belly, v.z))

# ---------------------------------------------------------------- 建立網格
mesh = bpy.data.meshes.new(f'SM_Char_{NAME}_All')
mesh.from_pydata([tuple(v) for v in V], [], F)
for m in MATS:
    mesh.materials.append(materials[m])
mesh.polygons.foreach_set('material_index', FM)
mesh.polygons.foreach_set('use_smooth', FS)
uvl = mesh.uv_layers.new(name='UVMap')
uvl.data.foreach_set('uv', [c for uv in UV for c in uv])
bm = bmesh.new()
bm.from_mesh(mesh)
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
bm.to_mesh(mesh)
bm.free()
mesh.validate()
body = bpy.data.objects.new(f'SM_Char_{NAME}_All', mesh)
scene.collection.objects.link(body)

# ---------------------------------------------------------------- 骨架
arm_data = bpy.data.armatures.new(f'RIG_Char_{NAME}')
rig = bpy.data.objects.new(f'RIG_Char_{NAME}', arm_data)
scene.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
win = bpy.context.window_manager.windows[0]
with bpy.context.temp_override(window=win, active_object=rig, object=rig):
    bpy.ops.object.mode_set(mode='EDIT')
    for name, (h, t, parent) in BONES.items():
        eb = arm_data.edit_bones.new(name)
        eb.head, eb.tail = h, t
        eb.roll = 0
    for name, (h, t, parent) in BONES.items():
        if parent:
            eb = arm_data.edit_bones[name]
            eb.parent = arm_data.edit_bones[parent]
            eb.use_connect = False
    bpy.ops.object.mode_set(mode='OBJECT')

groups = {name: body.vertex_groups.new(name=name) for name in BONES}
buckets = {}
for i, w in enumerate(VW):
    tot = sum(w.values())
    for b, x in w.items():
        if x > 1e-4:
            buckets.setdefault((b, round(x / tot, 3)), []).append(i)
for (b, x), idx in buckets.items():
    groups[b].add(idx, x, 'REPLACE')
body.parent = rig
mod = body.modifiers.new('Armature', 'ARMATURE')
mod.object = rig


# ---------------------------------------------------------------- 動作
def world_rot(bone, axis, deg):
    """以世界軸（角色站姿下）表示的旋轉，轉成骨骼本地四元數。"""
    R = rig.data.bones[bone].matrix_local.to_3x3()
    W = Matrix.Rotation(math.radians(deg), 3, axis)
    return (R.inverted() @ W @ R).to_quaternion()


def world_loc(bone, vec):
    R = rig.data.bones[bone].matrix_local.to_3x3()
    return R.inverted() @ Vector(vec)


def pose_key(frame, rots, locs=None, key=True):
    for pb in rig.pose.bones:
        pb.rotation_mode = 'QUATERNION'
        q = Quaternion()
        for axis, deg in rots.get(pb.name, []):
            q = world_rot(pb.name, axis, deg) @ q
        pb.rotation_quaternion = q
        pb.location = world_loc(pb.name, (locs or {}).get(pb.name, (0, 0, 0)))
        if not key:
            continue
        pb.keyframe_insert('rotation_quaternion', frame=frame, group=pb.name)
        pb.keyframe_insert('location', frame=frame, group=pb.name)


FOOT_VERTS = [i for i, w in enumerate(VW) if max(w, key=w.get).startswith('foot.')]


def foot_min_z():
    bpy.context.view_layer.update()
    ev = body.evaluated_get(bpy.context.evaluated_depsgraph_get())
    em = ev.to_mesh()
    z = min(em.vertices[i].co.z for i in FOOT_VERTS)
    ev.to_mesh_clear()
    return z


def make_action(name, length, step, fn, ground=False):
    """ground=True 時每格量腳底最低點，調整髖部高度讓支撐腳剛好踩地。"""
    rig.animation_data_create()
    rig.animation_data.action = None
    for f in range(0, length + 1, step):
        rots, locs = fn(2 * math.pi * f / length)
        if ground:
            pose_key(f, rots, locs, key=False)
            locs = dict(locs, hips=(0, 0, -foot_min_z()))
        pose_key(f, rots, locs)
    act = rig.animation_data.action
    act.name = name
    act.use_fake_user = True
    act.use_frame_range = True
    act.frame_start, act.frame_end = 0, length
    act.use_cyclic = True
    track = rig.animation_data.nla_tracks.new()
    track.name = name
    track.strips.new(name, 0, act)
    track.mute = True
    rig.animation_data.action = None
    return act


def ARM_WALK(c):
    """走路時的手臂：空手擺臂，持物的手只小幅擺動，叉腰的手不動。"""
    rots = {}
    if L_KIND == 'hang':
        rots.update({'upper_arm.L': [('X', 20 * c), ('Y', -6)], 'forearm.L': [('X', -12 - 10 * max(0.0, -c))]})
    elif L_KIND == 'hold':
        rots['upper_arm.L'] = [('X', 5 * c)]
    if R_KIND == 'hold':
        rots['upper_arm.R'] = [('X', -5 * c)]
    return rots


def ARM_IDLE(s):
    if L_KIND == 'hang':
        return {'upper_arm.L': [('X', 2 * s), ('Y', -4)], 'forearm.L': [('X', -14)]}
    return {}


# 下袍後擺要跟著後腳往後擺，彎起的小腿也要包住：取「大腿角 + KNEE_K × 膝角」。
# KNEE_K 用 qa_walk.py 量過：0.1 小腿會穿出、0.25 起歸零；取 0.25 讓後擺與披風擺幅最小。
KNEE_K = 0.25


def walk(p):
    c, s = math.cos(p), math.sin(p)
    thL, thR = -32 * c, 32 * c
    knL, knR = 6 + 45 * max(0.0, -s), 6 + 45 * max(0.0, s)
    rots = {
        'skirt.F': [('X', min(thL, thR) - 4)],
        'skirt.B': [('X', max(thL + KNEE_K * knL, thR + KNEE_K * knR) + 2)],
        'thigh.L': [('X', thL)], 'thigh.R': [('X', thR)],
        'shin.L': [('X', knL)], 'shin.R': [('X', knR)],
        'foot.L': [('X', -0.6 * (thL + knL) + 6 * c)], 'foot.R': [('X', -0.6 * (thR + knR) - 6 * c)],
        'hips': [('Z', 5 * c), ('Y', 2 * s)],
        'spine': [('X', -3)],
        'chest': [('Z', -8 * c)],
        'head': [('Z', 3 * c), ('X', 1.5 * math.cos(2 * p))],
        **ARM_WALK(c),
        'cape.1': [('X', 8 + 3 * math.cos(2 * p))],
        'cape.2': [('X', 8 + 5 * math.cos(2 * p - 1.2))],
        'ribbons': [('X', 10 + 6 * math.cos(2 * p - 0.8))],
    }
    return rots, {}


def idle(p):
    s = math.sin(p)
    rots = {
        'chest': [('X', -1.5 * s)],
        'head': [('X', 1.2 * math.sin(p - 0.6)), ('Z', 2 * math.sin(p))],
        **ARM_IDLE(s),
        'cape.1': [('X', 2 + 1.5 * math.sin(p - 1))],
        'cape.2': [('X', 2 + 2.5 * math.sin(p - 1.8))],
        'ribbons': [('X', 4 + 4 * math.sin(p - 1.2))],
    }
    return rots, {'hips': (0, 0, -0.004 * (1 - math.cos(p)))}


make_action('Idle', 48, 4, idle)
walk_act = make_action('Walk', 24, 1, walk, ground=True)
rig.animation_data.action = walk_act
scene.frame_start, scene.frame_end = 0, 23
scene.frame_set(0)
# ---------------------------------------------------------------- 依 character-artist 規範拆成身體／衣服／盔甲／武器
BODY_M = {'skin', 'skin_shade', 'face', 'hair', 'gray_hair', 'beard', 'fur'}
ARMOR_M = {'plate', 'gold', 'trim', 'gem', 'gem_green'}
dom = [max(w, key=w.get) for w in VW]
WEAPON_HANDS = {'sword': {'hand.R'}, 'twin': {'hand.R', 'hand.L'}, 'bow': {'hand.L'}}[CFG['weapon']]


def part_of(poly):
    mat = MATS[poly.material_index]
    if mat in BODY_M:
        return 'Body'
    if mat in ('blade', 'wood', 'string') or (mat != 'skin' and all(dom[i] in WEAPON_HANDS for i in poly.vertices)):
        return 'Weapon'
    return 'Armor' if mat in ARMOR_M else 'Cloth'


owner = [part_of(p) for p in mesh.polygons]
for part in ('Body', 'Cloth', 'Armor', 'Weapon'):
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if owner[f.index] != part], context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    pm = bpy.data.meshes.new(f'SM_Char_{NAME}_' + part)
    bm.to_mesh(pm)
    bm.free()
    for m in mesh.materials:
        pm.materials.append(m)
    ob = bpy.data.objects.new(f'SM_Char_{NAME}_' + part, pm)
    scene.collection.objects.link(ob)
    for g in body.vertex_groups:
        ob.vertex_groups.new(name=g.name)
    ob.parent = rig
    ob.modifiers.new('Armature', 'ARMATURE').object = rig
    # 清掉沒用到的材質槽
    used = {p.material_index for p in pm.polygons}
    for k in range(len(pm.materials) - 1, -1, -1):
        if k not in used:
            pm.materials.pop(index=k)
bpy.data.objects.remove(body, do_unlink=True)
bpy.data.meshes.remove(mesh)
rig.animation_data.action = walk_act
scene.frame_set(0)
tris = sum(len(f) - 2 for f in F)
print('verts', len(V), 'faces', len(F), 'tris', tris, 'bones', len(BONES))

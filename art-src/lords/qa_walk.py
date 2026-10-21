"""走路穿模檢查（在 Blender 內執行）：逐格找出從袍子穿出的腿部頂點、穿出披風的下袍頂點、陷入地面的腳。

ARGS[0]（可省略）：動作名稱，預設 Walk。輸出每格的穿出頂點數與所屬骨骼，以及腳底最低點。
判定方式：從髖部中心沿水平方向射向待測頂點，若途中先碰到外層布料（腿→下袍與披風；下袍→披風），代表該頂點穿到外側。
"""
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

try:
    ACTION = ARGS[0]  # noqa: F821
except (NameError, IndexError):
    ACTION = 'Walk'

rig = next(o for o in bpy.data.objects if o.name.startswith('RIG_Char_'))
parts = [o for o in bpy.data.objects if o.name.startswith('SM_Char_')]
CLOTH = {'robe', 'outer', 'red', 'plate', 'trim', 'apron', 'cape', 'cape_in', 'robe_dark'}
LEG_BONES = {'thigh.L', 'thigh.R', 'shin.L', 'shin.R', 'foot.L', 'foot.R'}
CLOTH_BONES = {'hips', 'skirt.F', 'skirt.B', 'cape.1', 'cape.2'}
SKIRT_BONES = {'hips', 'skirt.F', 'skirt.B'}

info = []
for ob in parts:
    me = ob.data
    mat_names = [m.name.split('_', 1)[1] for m in me.materials]
    gname = {g.index: g.name for g in ob.vertex_groups}
    dom, wt, capeish = [], [], []
    for v in me.vertices:
        best = max(v.groups, key=lambda g: g.weight, default=None)
        dom.append(gname[best.group] if best else None)
        wt.append(best.weight if best else 0)
        capeish.append(any(gname[g.group] in ('cape.1', 'cape.2') and g.weight > 0 for g in v.groups))
    legs, cloth, skirt, cape = set(), [], set(), []
    for p in me.polygons:
        vs = list(p.vertices)
        mat = mat_names[p.material_index]
        if all(dom[i] in LEG_BONES and wt[i] > 0.99 for i in vs):
            legs.update(vs)
        elif mat in CLOTH and all(dom[i] in CLOTH_BONES for i in vs):
            cloth.append(p.index)
            if mat in ('cape', 'cape_in'):
                cape.append(p.index)
            elif all(dom[i] in SKIRT_BONES and not capeish[i] for i in vs):
                skirt.update(vs)
    info.append((ob, dom, legs, cloth, skirt, cape))

act = bpy.data.actions[ACTION]
rig.animation_data.action = act
f0, f1 = int(act.frame_range[0]), int(act.frame_range[1])
total = total_cape = 0
for f in range(f0, f1):
    bpy.context.scene.frame_set(f)
    dg = bpy.context.evaluated_depsgraph_get()
    co, tris, ctris, legs, skirt = [], [], [], [], []
    for ob, dom, lv, cp, sv, kp in info:
        ev = ob.evaluated_get(dg)
        em = ev.to_mesh()
        base = len(co)
        co += [ev.matrix_world @ v.co for v in em.vertices]
        for pis, dst in ((cp, tris), (kp, ctris)):
            for pi in pis:
                vs = list(em.polygons[pi].vertices)
                for k in range(1, len(vs) - 1):
                    dst.append((base + vs[0], base + vs[k], base + vs[k + 1]))
        legs += [(base + i, dom[i]) for i in lv]
        skirt += [(base + i, dom[i]) for i in sv]
        ev.to_mesh_clear()
    bvh = BVHTree.FromPolygons(co, tris)
    cbvh = BVHTree.FromPolygons(co, ctris)
    hip = rig.matrix_world @ rig.pose.bones['hips'].head
    out, low = {}, 9.0
    for i, b in legs:
        p = co[i]
        low = min(low, p.z)
        if p.z < 0.1 or p.z > 0.8:
            continue
        o = Vector((hip.x, hip.y, p.z))
        d = p - o
        dist = d.length
        if dist < 1e-4:
            continue
        if bvh.ray_cast(o, d / dist, dist - 0.003)[0] is not None:
            out[b] = out.get(b, 0) + 1
    cape_out = {}
    for i, b in skirt:
        p = co[i]
        if p.z > 1.0:
            continue
        o = Vector((hip.x, hip.y, p.z))
        d = p - o
        dist = d.length
        if dist > 1e-4 and cbvh.ray_cast(o, d / dist, dist - 0.003)[0] is not None:
            cape_out[b] = cape_out.get(b, 0) + 1
    n, nc = sum(out.values()), sum(cape_out.values())
    total += n
    total_cape += nc
    print(f'frame {f:02d}: legs_out={n:4d} {out}  skirt_through_cape={nc:4d} {cape_out}  foot_min_z={low:+.3f}')
print('TOTAL legs_out', total, 'skirt_through_cape', total_cape)

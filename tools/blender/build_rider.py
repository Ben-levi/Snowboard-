"""Builds the Snow Crew rider models with Blender (bpy) and exports glTF.

Usage (from the repo root):
    python3 -m venv tools/blender/.venv && tools/blender/.venv/bin/pip install "bpy==4.5.*"
    tools/blender/.venv/bin/python tools/blender/build_rider.py [--render DIR] [--only snowboard|ski]

Style: smooth, semi-realistic rider mid-carve in a colour-blocked outfit (orange/blue
jacket with the hood up, green cargo pants, black gloves, mirrored goggles, graffiti board).

Every part is grouped under an empty named after an app gear section
(head, upper, hands, lower, feet, equipment, extras); child meshes and materials are
named "<section>-<part>" so the app can map taps and highlights by name.
"""
import argparse
import math
import os
import sys
import tempfile

import bpy  # must come first: it makes bmesh/mathutils importable
import bmesh
import numpy as np
from mathutils import Euler, Matrix, Vector

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT_DIR = os.path.join(ROOT, 'public', 'models')

# Change these to restyle the rider.
PALETTE = {
    'skin': '#e8b596',
    'jacket': '#ff7a1a',
    'jacket_panel': '#2f8fd8',
    'jacket_cuff': '#39d353',
    'logo': '#f4f6f8',
    'zip': '#1d2027',
    'glove': '#15171c',
    'pants': '#3ddc3a',
    'pocket': '#2fbf2d',
    'boot': '#ff7a1a',
    'boot_dark': '#15171c',
    'boot_shell': '#2a2e37',
    'helmet': '#1d2129',
    'goggle_frame': '#1e5fd0',
    'lens': '#8fd3ff',
    'gaiter': '#262a33',
    'board_edge': '#15171c',
    'binding': '#ff7a1a',
    'strap': '#15171c',
    'pole': '#2b2f3a',
    'backpack': '#262a33',
    'backpack_accent': '#2f8fd8',
}
GRAFFITI = ['#ff7a1a', '#2fd3ff', '#ff3d9a', '#ffe23d', '#3ddc3a', '#ffffff', '#6a5cff']


# ---------------------------------------------------------------- helpers

def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_rgb(h):
    h = h.lstrip('#')
    return [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]


def hex_rgba(h):
    return (*[srgb_to_linear(c) for c in hex_rgb(h)], 1.0)


_materials = {}


def material(name, color='#ffffff', rough=0.6, metal=0.0, coat=0.0, image=None, sheen=0.0):
    """Material named "<section>" or "<section>-<detail>"."""
    if name in _materials:
        return _materials[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = hex_rgba(color)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    bsdf.inputs['Coat Weight'].default_value = coat
    bsdf.inputs['Sheen Weight'].default_value = sheen
    if image is not None:
        tex = nt.nodes.new('ShaderNodeTexImage')
        tex.image = image
        nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    _materials[name] = m
    return m


def reset_scene():
    global _cloth_tex
    bpy.ops.wm.read_factory_settings(use_empty=True)
    _materials.clear()
    _cloth_tex = None


def link(obj, parent=None):
    bpy.context.scene.collection.objects.link(obj)
    if parent is not None:
        obj.parent = parent
    return obj


def group(name, parent=None):
    return link(bpy.data.objects.new(name, None), parent)


def bake(obj):
    """Apply all modifiers by replacing the mesh with its evaluated copy."""
    dg = bpy.context.evaluated_depsgraph_get()
    mesh = bpy.data.meshes.new_from_object(obj.evaluated_get(dg))
    old = obj.data
    obj.modifiers.clear()
    obj.data = mesh
    if old.users == 0:
        bpy.data.meshes.remove(old)
    return obj


def shade(obj, smooth=True):
    for p in obj.data.polygons:
        p.use_smooth = smooth
    return obj


_cloth_tex = None


def cloth_folds(obj, strength=0.008, scale=0.09):
    """Soft fabric folds: low-strength noise displacement along normals."""
    global _cloth_tex
    if _cloth_tex is None:
        _cloth_tex = bpy.data.textures.new('cloth', 'CLOUDS')
        _cloth_tex.noise_scale = scale
        _cloth_tex.noise_depth = 1
    d = obj.modifiers.new('folds', 'DISPLACE')
    d.texture = _cloth_tex
    d.strength = strength
    d.mid_level = 0.5
    bake(obj)


def skin_mesh(name, verts, edges, radii, mat, parent, subdiv=2, folds=0.0):
    """Organic tube shape grown from a vertex skeleton with the Skin modifier."""
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([Vector(v) for v in verts], edges, [])
    obj = link(bpy.data.objects.new(name, mesh), parent)
    obj.modifiers.new('skin', 'SKIN')
    for i, r in enumerate(radii):
        rx, ry = (r, r) if isinstance(r, (int, float)) else r
        mesh.skin_vertices[0].data[i].radius = (rx, ry)
    mesh.skin_vertices[0].data[0].use_root = True
    sub = obj.modifiers.new('subsurf', 'SUBSURF')
    sub.levels = sub.render_levels = subdiv
    bake(obj)
    if folds:
        cloth_folds(obj, folds)
    shade(obj)
    obj.data.materials.append(mat)
    return obj


def prim(kind, name, mat, parent, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1), smooth=True, **kw):
    """Primitive via bmesh (no operator context needed)."""
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    if kind == 'sphere':
        bmesh.ops.create_uvsphere(bm, u_segments=kw.get('u', 24), v_segments=kw.get('v', 16), radius=1)
    elif kind == 'cyl':
        bmesh.ops.create_cone(bm, cap_ends=True, segments=kw.get('segments', 16),
                              radius1=1, radius2=kw.get('top', 1), depth=2)
    elif kind == 'cube':
        bmesh.ops.create_cube(bm, size=2)
    elif kind == 'torus':
        _torus(bm, kw.get('major', 1), kw.get('minor', 0.2), kw.get('seg', 32), kw.get('ring', 10),
               kw.get('arc', 2 * math.pi))
    if kw.get('keep'):
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not kw['keep'](v.co)], context='VERTS')
    bm.to_mesh(mesh)
    bm.free()
    obj = link(bpy.data.objects.new(name, mesh), parent)
    obj.location = loc
    obj.rotation_euler = Euler(rot) if not isinstance(rot, Euler) else rot
    obj.scale = scale
    if kw.get('bevel'):
        b = obj.modifiers.new('bevel', 'BEVEL')
        b.width = kw['bevel']
        b.segments = kw.get('bevel_segments', 3)
        b.limit_method = 'NONE'
    if kw.get('solidify'):
        s = obj.modifiers.new('solidify', 'SOLIDIFY')
        s.thickness = kw['solidify']
    if kw.get('subdiv'):
        s = obj.modifiers.new('subsurf', 'SUBSURF')
        s.levels = s.render_levels = kw['subdiv']
    if obj.modifiers:
        bake(obj)
    shade(obj, smooth)
    obj.data.materials.append(mat)
    return obj


def _torus(bm, major, minor, seg, ring, arc):
    closed = abs(arc - 2 * math.pi) < 1e-6
    n = seg if closed else seg + 1
    rows = []
    for i in range(n):
        a = arc * i / seg
        c = Vector((math.cos(a) * major, math.sin(a) * major, 0))
        out = Vector((math.cos(a), math.sin(a), 0))
        rows.append([bm.verts.new(c + out * (math.cos(b) * minor) + Vector((0, 0, math.sin(b) * minor)))
                     for b in (2 * math.pi * j / ring for j in range(ring))])
    for i in range(n if closed else n - 1):
        r0, r1 = rows[i], rows[(i + 1) % n]
        for j in range(ring):
            bm.faces.new((r0[j], r0[(j + 1) % ring], r1[(j + 1) % ring], r1[j]))
    if not closed:
        bm.faces.new(list(reversed(rows[0])))
        bm.faces.new(rows[-1])


def dist_to_segment(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / ab.length_squared))
    return (p - (a + ab * t)).length


def paint_faces(obj, rules):
    """Colour-block a baked mesh: rules = [(material, predicate(center, normal))], first match wins."""
    slots = {}
    for mat, _ in rules:
        if mat.name not in slots:
            obj.data.materials.append(mat)
            slots[mat.name] = len(obj.data.materials) - 1
    for p in obj.data.polygons:
        c, n = obj.matrix_world @ p.center, p.normal
        for mat, pred in rules:
            if pred(c, n):
                p.material_index = slots[mat.name]
                break


def rotate_about(p, pivot, angle_z):
    return (Matrix.Rotation(angle_z, 3, 'Z') @ (Vector(p) - Vector(pivot))) + Vector(pivot)


# ---------------------------------------------------------------- graffiti texture

def graffiti_image(name, w=1024, h=256, seed=7):
    """Loud multicolour board graphic: stripes, outlined blobs, tags and splatter."""
    rng = np.random.default_rng(seed)
    pal = np.array([hex_rgb(c) for c in GRAFFITI])
    img = np.zeros((h, w, 3))
    img[:] = hex_rgb('#141a2e')
    yy, xx = np.mgrid[0:h, 0:w].astype(float)

    stripes = ((xx * 0.8 + yy) // 26) % 3 == 0
    img[stripes & (xx < w * 0.28)] = pal[2] * 0.85
    img[stripes & (xx > w * 0.72)] = pal[1] * 0.85

    for _ in range(38):
        cx, cy = rng.uniform(0, w), rng.uniform(0, h)
        rx, ry = rng.uniform(25, 90), rng.uniform(18, 70)
        ang = rng.uniform(0, math.pi)
        dx, dy = xx - cx, yy - cy
        u = (dx * math.cos(ang) + dy * math.sin(ang)) / rx
        v = (-dx * math.sin(ang) + dy * math.cos(ang)) / ry
        wob = 1 + 0.18 * np.sin(np.arctan2(v, u) * rng.integers(3, 7))
        r = np.sqrt(u * u + v * v) / wob
        img[(r < 1.12) & (r >= 1)] = 0.02
        img[r < 1] = pal[rng.integers(len(pal))]

    for _ in range(7):
        cy, amp, freq = rng.uniform(40, h - 40), rng.uniform(10, 35), rng.uniform(40, 90)
        x0 = rng.uniform(0, w * 0.7)
        band = (np.abs(yy - (cy + amp * np.sin((xx - x0) / freq * math.pi))) < 7) & (xx > x0) & (xx < x0 + rng.uniform(150, 350))
        img[band] = 0.02
        img[band & (np.abs(yy - (cy + amp * np.sin((xx - x0) / freq * math.pi))) < 4.5)] = pal[rng.integers(len(pal))]

    for _ in range(260):
        cx, cy, r = rng.uniform(0, w), rng.uniform(0, h), rng.uniform(1.5, 6)
        img[(xx - cx) ** 2 + (yy - cy) ** 2 < r * r] = pal[rng.integers(len(pal))]

    rgba = np.concatenate([img, np.ones((h, w, 1))], axis=2)
    im = bpy.data.images.new(name, w, h, alpha=False)
    im.pixels.foreach_set(rgba[::-1].astype(np.float32).ravel())
    path = os.path.join(tempfile.gettempdir(), f'{name}.png')
    im.filepath_raw = path
    im.file_format = 'PNG'
    im.save()
    im.pack()
    return im


# ---------------------------------------------------------------- rider

def build_rider(kind):
    board = kind == 'snowboard'
    rig = group('rider')

    # ---- pose landmarks (metres, Z up; rider faces -Y, board nose towards -X)
    if board:
        ankle = [Vector((-0.27, 0, 0.17)), Vector((0.27, 0, 0.17))]
        knee = [Vector((-0.23, -0.2, 0.47)), Vector((0.19, -0.17, 0.46))]
        hip = [Vector((-0.11, 0.08, 0.8)), Vector((0.11, 0.08, 0.8))]
        pelvis = Vector((0, 0.08, 0.84))
        twist = math.radians(-26)         # upper body turned towards the nose (-X)
    else:
        ankle = [Vector((-0.11, 0, 0.16)), Vector((0.11, 0, 0.16))]
        knee = [Vector((-0.06, -0.2, 0.49)), Vector((0.15, -0.19, 0.49))]
        hip = [Vector((-0.1, 0.07, 0.82)), Vector((0.1, 0.07, 0.82))]
        pelvis = Vector((0, 0.07, 0.86))
        twist = math.radians(8)

    def up(p):  # upper-body points rotate with the twist around the pelvis
        return rotate_about(p, pelvis, twist)

    waist, chest, neck = up((0, 0.03, 1.0)), up((0, -0.03, 1.2)), up((0, -0.07, 1.38))
    head_c = up((0, -0.1, 1.53))
    sh = [up((-0.23, -0.05, 1.33)), up((0.23, -0.03, 1.33))]
    if board:  # lead arm reaches for the nose, back arm hangs low behind
        el = [up((-0.43, -0.2, 1.13)), up((0.33, 0.1, 1.08))]
        wr = [up((-0.58, -0.33, 0.95)), up((0.4, 0.2, 0.87))]
    else:      # both hands forward, pole plants
        el = [up((-0.3, -0.22, 1.1)), up((0.3, -0.22, 1.1))]
        wr = [up((-0.34, -0.42, 0.97)), up((0.36, -0.42, 0.97))]

    # ---- lower: baggy green cargo pants
    g = group('lower', rig)
    pants = material('lower', PALETTE['pants'], rough=0.8, sheen=0.3)
    v = [pelvis, hip[0], knee[0], ankle[0] + Vector((0, 0, 0.08)), hip[1], knee[1], ankle[1] + Vector((0, 0, 0.08)),
         pelvis - Vector((0, 0.02, 0.1))]
    skin_mesh('lower-pants', v, [(0, 1), (1, 2), (2, 3), (0, 4), (4, 5), (5, 6), (0, 7)],
              [0.155, 0.118, 0.1, 0.108, 0.118, 0.1, 0.108, 0.112], pants, g, folds=0.01)
    pocket = material('lower-pocket', PALETTE['pocket'], rough=0.85, sheen=0.3)
    for i, side in enumerate((-1, 1)):
        mid = hip[i].lerp(knee[i], 0.5)
        d = (knee[i] - hip[i]).normalized()
        outward = Vector((side, 0, 0))
        rot = Matrix((outward, d.cross(outward).normalized(), d)).transposed().to_euler()
        prim('cube', f'lower-cargo-{i}', pocket, g, loc=mid + outward * 0.088, rot=rot,
             scale=(0.025, 0.07, 0.08), bevel=0.02)
        prim('cube', f'lower-flap-{i}', pocket, g, loc=mid + outward * 0.1 - d * 0.075, rot=rot,
             scale=(0.018, 0.075, 0.018), bevel=0.012)

    # ---- upper: orange jacket, blue chest/sleeve panels, green cuffs, hood up
    g = group('upper', rig)
    orange = material('upper', PALETTE['jacket'], rough=0.55, sheen=0.4)
    blue = material('upper-panel', PALETTE['jacket_panel'], rough=0.55, sheen=0.4)
    green = material('upper-cuff', PALETTE['jacket_cuff'], rough=0.7)
    v = [pelvis - Vector((0, 0, 0.1)), waist, chest, neck, sh[0], el[0], wr[0], sh[1], el[1], wr[1]]
    jacket = skin_mesh('upper-jacket', v, [(0, 1), (1, 2), (2, 3), (2, 4), (4, 5), (5, 6), (2, 7), (7, 8), (8, 9)],
                       [(0.2, 0.17), (0.205, 0.165), (0.22, 0.16), 0.12, 0.1, 0.086, 0.08, 0.1, 0.086, 0.08],
                       orange, g, folds=0.012)
    jacket.data.materials.clear()
    fwd = rotate_about((0, -1, 0), (0, 0, 0), twist).normalized()
    spine = (pelvis - Vector((0, 0, 0.1)), neck)

    def on_arm(c):
        return min(dist_to_segment(c, sh[i], el[i]) for i in (0, 1)) < dist_to_segment(c, *spine) - 0.02 or \
            min(dist_to_segment(c, el[i], wr[i]) for i in (0, 1)) < 0.11

    def torso_front(c):
        axis = spine[0].lerp(spine[1], max(0, min(1, (c.z - spine[0].z) / (spine[1].z - spine[0].z))))
        return (c - axis).dot(fwd) > 0.03

    zip_mat = material('upper-zip', PALETTE['zip'], rough=0.4, metal=0.5)

    paint_faces(jacket, [
        (green, lambda c, n: min((c - wr[i]).length for i in (0, 1)) < 0.062),
        (orange, lambda c, n: on_arm(c)),
        (blue, lambda c, n: torso_front(c) and c.z < chest.z + 0.05),
        (orange, lambda c, n: True),
    ])
    # zipper: a thin tube through points ray-cast onto the jacket's front, so it hugs the fabric
    pts = []
    for k in range(14):
        t = k / 13
        axis = spine[0].lerp(neck, 0.08 + 0.8 * t)
        hit, loc, _, _ = jacket.ray_cast(axis + fwd * 0.6, -fwd)
        if hit:
            pts.append(loc + fwd * 0.004)
    if len(pts) > 2:
        skin_mesh('upper-zip', pts, [(k, k + 1) for k in range(len(pts) - 1)], [0.0055] * len(pts), zip_mat, g,
                  subdiv=1)
    prim('cube', 'upper-logo', material('upper-logo', PALETTE['logo'], rough=0.5), g,
         loc=chest + fwd * 0.182 + rotate_about((0.1, 0, 0.05), (0, 0, 0), twist),
         rot=(0, 0, twist), scale=(0.035, 0.004, 0.02), bevel=0.004)
    # hood up: a thick shell around the head with an opening for the goggles
    hood_rot = Euler((0, 0, twist * 1.6))
    hood_rot_m = hood_rot.to_matrix()

    def hood_keep(co):
        face = co.y < -0.45 and -0.72 < co.z < 0.62 and abs(co.x) < 0.8
        return not face and co.z > -0.8

    prim('sphere', 'upper-hood', orange, g, loc=head_c + hood_rot_m @ Vector((0, 0.03, 0.025)), rot=hood_rot,
         scale=(0.138, 0.15, 0.155), keep=hood_keep, solidify=0.18, subdiv=1, u=28, v=18)
    prim('torus', 'upper-hood-rim', orange, g, loc=head_c + hood_rot_m @ Vector((0, -0.075, 0.005)),
         rot=(hood_rot_m @ Matrix.Rotation(math.pi / 2, 3, 'X')).to_euler(), major=0.108, minor=0.024,
         seg=28, ring=10, scale=(1, 1.22, 1))

    # ---- head: face, goggles with mirrored lens, gaiter pulled up
    g = group('head', rig)
    headg = group('head-turn', g)
    headg.location = head_c
    headg.rotation_euler = Euler((0.08, 0, twist * 1.6))
    prim('sphere', 'head-face', material('head-skin', PALETTE['skin'], rough=0.55), headg,
         scale=(0.1, 0.108, 0.122))
    gaiter = material('head-gaiter', PALETTE['gaiter'], rough=0.85, sheen=0.3)
    prim('sphere', 'head-gaiter', gaiter, headg, loc=(0, 0.01, -0.03), scale=(0.108, 0.113, 0.12),
         keep=lambda co: co.z < -0.62, subdiv=1)
    skin = material('head-skin', PALETTE['skin'], rough=0.55)
    prim('sphere', 'head-nose', skin, headg, loc=(0, -0.104, -0.01), scale=(0.018, 0.022, 0.026), u=12, v=8)
    prim('torus', 'head-smile', material('head-mouth', '#7a2e24', rough=0.6), headg,
         loc=(0, -0.097, -0.052), rot=(-(math.pi / 2 - 0.25), 0, 0), major=0.026, minor=0.0055,
         seg=12, ring=6, arc=math.pi)
    frame = material('head', PALETTE['goggle_frame'], rough=0.35, coat=0.6)
    arc = 2.2
    prim('torus', 'head-goggle-frame', frame, headg, loc=(0, 0, 0.045), rot=(0, 0, -math.pi / 2 - arc / 2),
         major=0.108, minor=0.034, seg=24, ring=10, arc=arc, scale=(1, 1.1, 1.35))
    prim('torus', 'head-lens', material('head-lens', PALETTE['lens'], rough=0.03, metal=1.0, coat=1.0), headg,
         loc=(0, -0.006, 0.045), rot=(0, 0, -math.pi / 2 - (arc - 0.3) / 2),
         major=0.124, minor=0.026, seg=24, ring=10, arc=arc - 0.3, scale=(1, 1.1, 1.3))
    prim('torus', 'head-strap', frame, headg, loc=(0, 0.01, 0.045), major=0.118, minor=0.012,
         seg=32, ring=6, scale=(1, 1.1, 1))

    # ---- hands: black gloves with fingers
    g = group('hands', rig)
    glove = material('hands', PALETTE['glove'], rough=0.6, sheen=0.2)
    for i in (0, 1):
        d = (wr[i] - el[i]).normalized()
        q = d.to_track_quat('Z', 'Y')
        c = wr[i] + d * 0.085
        prim('sphere', f'hands-glove-{i}', glove, g, loc=c, rot=q.to_euler(), scale=(0.07, 0.052, 0.08))
        side = Vector((1, 0, 0)) if i == 0 else Vector((-1, 0, 0))
        for f in range(4):
            off = q @ Vector(((f - 1.5) * 0.03, -0.015, 0.088))
            prim('sphere', f'hands-finger-{i}-{f}', glove, g, loc=c + off, rot=q.to_euler(),
                 scale=(0.016, 0.018, 0.036), u=10, v=8)
        prim('sphere', f'hands-thumb-{i}', glove, g, loc=c + q @ Vector((0.058 * (1 if i else -1), -0.035, 0.025)),
             rot=q.to_euler(), scale=(0.018, 0.018, 0.038), u=10, v=8)

    # ---- feet: orange/black boots
    g = group('feet', rig)
    boot = material('feet', PALETTE['boot'], rough=0.45, coat=0.3)
    dark = material('feet-sole', PALETTE['boot_dark'], rough=0.8)
    for i in (0, 1):
        a = ankle[i]
        skin_mesh(f'feet-boot-{i}', [a + Vector((0, 0.02, 0.06)), a + Vector((0, 0.03, -0.07)),
                                     a + Vector((0, -0.14, -0.09))],
                  [(0, 1), (1, 2)], [0.088, 0.088, 0.072], boot, g, subdiv=2)
        prim('cube', f'feet-sole-{i}', dark, g, loc=a + Vector((0, -0.045, -0.145)), scale=(0.078, 0.155, 0.016),
             bevel=0.012)
        prim('torus', f'feet-cuff-{i}', dark, g, loc=a + Vector((0, 0.02, 0.1)), major=0.08, minor=0.014,
             seg=20, ring=6)

    # ---- extras: slim backpack
    g = group('extras', rig)
    pack = material('extras', PALETTE['backpack'], rough=0.75, sheen=0.2)
    back = rotate_about((0, 1, 0), (0, 0, 0), twist).normalized()
    pack_c = chest + back * 0.2 - Vector((0, 0, 0.02))
    prim('cube', 'extras-backpack', pack, g, loc=pack_c, rot=(-0.12, 0, twist), scale=(0.14, 0.055, 0.19),
         bevel=0.05)
    prim('cube', 'extras-stripe', material('extras-accent', PALETTE['backpack_accent'], rough=0.5), g,
         loc=pack_c + back * 0.057, rot=(-0.12, 0, twist), scale=(0.1, 0.004, 0.018), bevel=0.003)

    # ---- equipment
    g = group('equipment', rig)
    art = graffiti_image(f'{kind}-graphic')
    if board:
        _snowboard(g, art, ankle)
    else:
        _skis(g, art, ankle, el, wr)

    # carve: tilt the whole rider + gear onto an edge, then sit it back on the snow
    rig.rotation_euler = Euler((math.radians(-8), math.radians(5 if board else -4), 0))
    bpy.context.view_layer.update()
    min_z = min((o.matrix_world @ v.co).z for o in rig.children_recursive if o.type == 'MESH' for v in o.data.vertices)
    rig.location.z = -min_z
    return rig


def _board_mesh(name, length, width, nose_lift, thickness, axis='X', sidecut=0.08, segs=20):
    """Board/ski with rounded lifted tips and UVs spanning the graphic."""
    half, r = length / 2, width / 2
    straight = half - r
    pts = []
    for i in range(segs + 1):
        a = -math.pi / 2 + math.pi * i / segs
        pts.append((straight + math.cos(a) * r, math.sin(a) * r))
    for i in range(segs + 1):
        a = math.pi / 2 + math.pi * i / segs
        pts.append((-straight + math.cos(a) * r, math.sin(a) * r))
    pts = [(x, y * (1 - sidecut * math.cos(math.pi * x / (length * 0.85)))) for x, y in pts]

    def lift(x):
        t = max(0.0, (abs(x) - (half - 0.2)) / 0.2)
        return nose_lift * t * t

    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')

    def P(x, y, z):
        return (x, y, z) if axis == 'X' else (y, -x, z)

    top = [bm.verts.new(P(x, y, thickness + lift(x))) for x, y in pts]
    bot = [bm.verts.new(P(x, y, lift(x))) for x, y in pts]
    ft = bm.faces.new(top if axis == 'X' else list(reversed(top)))
    fb = bm.faces.new(list(reversed(bot)) if axis == 'X' else bot)
    for f in (ft, fb):
        for loop in f.loops:
            x, y = (loop.vert.co.x, loop.vert.co.y) if axis == 'X' else (-loop.vert.co.y, loop.vert.co.x)
            loop[uv].uv = ((x + half) / length, (y + r) / width)
    n = len(pts)
    rim = []
    for i in range(n):
        q = (bot[i], bot[(i + 1) % n], top[(i + 1) % n], top[i])
        rim.append(bm.faces.new(q if axis == 'X' else tuple(reversed(q))))
    bm.to_mesh(mesh)
    bm.free()
    return mesh, len(pts)


def _snowboard(g, art, ankle):
    graphic = material('equipment', '#ffffff', rough=0.25, coat=1.0, image=art)
    edge = material('equipment-edge', PALETTE['board_edge'], rough=0.4, metal=0.4)
    mesh, _ = _board_mesh('equipment-board', 1.58, 0.3, 0.08, 0.025)
    obj = link(bpy.data.objects.new('equipment-board', mesh), g)
    obj.data.materials.append(graphic)
    obj.data.materials.append(edge)
    for p in obj.data.polygons:
        p.material_index = 0 if len(p.vertices) > 4 else 1
    shade(obj, False)
    bind = material('equipment-binding', PALETTE['binding'], rough=0.4, coat=0.4)
    strap = material('equipment-strap', PALETTE['strap'], rough=0.6)
    for i, a in enumerate(ankle):
        x = a.x
        prim('cube', f'equipment-base-{i}', bind, g, loc=(x, -0.03, 0.035), scale=(0.085, 0.15, 0.012), bevel=0.01)
        prim('cube', f'equipment-highback-{i}', bind, g, loc=(x, 0.1, 0.15), rot=(-0.3, 0, 0),
             scale=(0.068, 0.012, 0.09), bevel=0.02)
        for k, (y, z, r) in enumerate(((-0.01, 0.2, 0.095), (-0.12, 0.1, 0.085))):
            prim('torus', f'equipment-strap-{i}-{k}', strap, g, loc=(x, y, z - 0.05), rot=(math.pi / 2, 0, 0),
                 major=r - 0.005, minor=0.012, seg=20, ring=8, arc=math.pi, scale=(1, 1, 2.6))


def _skis(g, art, ankle, el, wr):
    graphic = material('equipment', '#ffffff', rough=0.25, coat=1.0, image=art)
    edge = material('equipment-edge', PALETTE['board_edge'], rough=0.4, metal=0.4)
    bind = material('equipment-binding', PALETTE['binding'], rough=0.4, coat=0.4)
    pole = material('equipment-pole', PALETTE['pole'], rough=0.35, metal=0.7)
    for i, a in enumerate(ankle):
        mesh, _ = _board_mesh(f'equipment-ski-{i}', 1.72, 0.09, 0.1, 0.02, axis='Y', sidecut=0.15, segs=10)
        obj = link(bpy.data.objects.new(f'equipment-ski-{i}', mesh), g)
        obj.location = (a.x, -0.05, 0)
        obj.data.materials.append(graphic)
        obj.data.materials.append(edge)
        for p in obj.data.polygons:
            p.material_index = 0 if len(p.vertices) > 4 else 1
        shade(obj, False)
        prim('cube', f'equipment-binding-{i}', bind, g, loc=(a.x, -0.02, 0.04), scale=(0.045, 0.17, 0.022), bevel=0.012)
        grip = wr[i] + (wr[i] - el[i]).normalized() * 0.085 + Vector((0, 0, 0.05))
        tip = Vector((a.x * 4.4, -0.26, 0.0))  # planted out to the side, clear of the body
        d = grip - tip
        rot = d.to_track_quat('Z', 'Y').to_euler()
        prim('cyl', f'equipment-pole-{i}', pole, g, loc=(grip + tip) / 2, rot=rot,
             scale=(0.011, 0.011, d.length / 2 + 0.06), segments=10)
        prim('cyl', f'equipment-basket-{i}', bind, g, loc=tip + d.normalized() * 0.09, rot=rot,
             scale=(0.045, 0.045, 0.006), segments=16)


# ---------------------------------------------------------------- preview render (studio look)

def setup_render(out_png, yaw_deg, res=(800, 1000)):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 64
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = res
    scene.render.filepath = out_png
    # Close to how three.js renders glTF, so previews match the web app.
    scene.view_settings.view_transform = 'Khronos PBR Neutral'

    world = bpy.data.worlds.new('studio')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = hex_rgba('#2a2c36')
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.35
    scene.world = world

    # curved studio floor/backdrop (cyclorama): flat floor, quarter-circle cove, back wall
    prof = [(-8.0, 0.0), (1.0, 0.0)]
    prof += [(1.0 + 1.6 * math.sin(t), 1.6 - 1.6 * math.cos(t)) for t in (math.pi / 2 * k / 12 for k in range(1, 13))]
    prof += [(2.6, 8.0)]
    mesh = bpy.data.meshes.new('studio')
    bm = bmesh.new()
    rows = [[bm.verts.new((x, y, z)) for x in (-10, 10)] for y, z in prof]
    for k in range(len(rows) - 1):
        bm.faces.new((rows[k][0], rows[k][1], rows[k + 1][1], rows[k + 1][0]))
    bm.to_mesh(mesh)
    bm.free()
    floor = link(bpy.data.objects.new('studio', mesh))
    floor.data.materials.append(material('studio-floor', '#3a3d4a', rough=0.55))
    shade(floor)
    floor.rotation_euler = (0, 0, -math.radians(yaw_deg))  # backdrop always behind the rider

    def light(name, loc, energy, size, color):
        data = bpy.data.lights.new(name, 'AREA')
        data.energy, data.size, data.color = energy, size, hex_rgba(color)[:3]
        obj = link(bpy.data.objects.new(name, data))
        obj.location = loc
        obj.rotation_euler = (Vector((0, 0, 0.9)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()

    light('key', (-2.4, -3.0, 3.0), 520, 2.2, '#fff1e2')
    light('fill', (2.8, -2.2, 1.4), 90, 3.0, '#cfe0ff')
    light('rim-pink', (-2.0, 2.2, 1.6), 520, 1.6, '#ff4fa3')
    light('rim-blue', (2.3, 2.0, 2.2), 480, 1.6, '#4fb3ff')
    light('top', (0, 0.5, 4.0), 150, 2.0, '#ffffff')

    cam_data = bpy.data.cameras.new('cam')
    cam_data.lens = 62
    cam = link(bpy.data.objects.new('cam', cam_data))
    yaw = math.radians(yaw_deg)
    target = Vector((0, 0, 0.82))
    cam.location = target + Vector((math.sin(yaw) * -5.0, -math.cos(yaw) * 5.0, 0.55))
    cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
    scene.camera = cam


def export_glb(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    for o in list(bpy.data.objects):
        if o.name == 'studio' or o.type in ('LIGHT', 'CAMERA'):
            bpy.data.objects.remove(o)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_apply=True, export_yup=True,
                              export_materials='EXPORT', export_image_format='JPEG', export_jpeg_quality=88)
    tris = sum(len(p.vertices) - 2 for o in bpy.data.objects if o.type == 'MESH' for p in o.data.polygons)
    return tris


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    ap = argparse.ArgumentParser()
    ap.add_argument('--render', help='directory for preview PNGs')
    ap.add_argument('--only', choices=['snowboard', 'ski'])
    ap.add_argument('--views', default='0,40', help='camera yaw angles for previews')
    ap.add_argument('--no-export', action='store_true')
    args = ap.parse_args(argv)

    for kind in ('snowboard', 'ski'):
        if args.only and kind != args.only:
            continue
        if args.render:
            for yaw in (float(y) for y in args.views.split(',')):
                reset_scene()
                build_rider(kind)
                setup_render(os.path.join(args.render, f'rider-{kind}-{int(yaw)}.png'), yaw)
                bpy.ops.render.render(write_still=True)
                print('rendered', kind, yaw)
        if not args.no_export:
            reset_scene()
            build_rider(kind)
            out = os.path.join(OUT_DIR, f'rider-{kind}.glb')
            tris = export_glb(out)
            print('exported', out, os.path.getsize(out) // 1024, 'KB', tris, 'tris')


if __name__ == '__main__':
    main()

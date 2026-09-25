"""Builds the Snow Crew rider models with Blender (bpy) and exports glTF.

Usage (from the repo root):
    python3 -m venv tools/blender/.venv && tools/blender/.venv/bin/pip install "bpy==4.5.*"
    tools/blender/.venv/bin/python tools/blender/build_rider.py [--render DIR] [--only snowboard|ski]

Every part is grouped under an empty named after an app gear section
(head, upper, hands, lower, feet, equipment, extras); child meshes are named
"<section>-<part>" so the app can map taps and tint colours by name.
"""
import argparse
import math
import os
import sys

import bpy  # must come first: it makes bmesh/mathutils importable
import bmesh
from mathutils import Euler, Matrix, Vector

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT_DIR = os.path.join(ROOT, 'public', 'models')

PALETTE = {
    'skin': '#f1c1a0',
    'helmet': '#f4f6f8',
    'helmet_stripe': '#ff7a3d',
    'goggle_frame': '#23272e',
    'lens': '#ff9a3c',
    'gaiter': '#2b2f3a',
    'jacket': '#2a9d8f',
    'jacket_trim': '#e9f5f3',
    'mitten': '#ff7a3d',
    'pants': '#3a3f4b',
    'boot': '#1f2329',
    'boot_sole': '#c9ced6',
    'board': '#161a20',
    'board_graphic': '#ff7a3d',
    'binding': '#e9ecef',
    'ski': '#f4f6f8',
    'pole': '#2b2f3a',
    'backpack': '#f2b134',
    'strap': '#2b2f3a',
}


# ---------------------------------------------------------------- helpers

def hex_rgba(h):
    h = h.lstrip('#')
    srgb = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    lin = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb]
    return (*lin, 1.0)


_materials = {}


def material(name, color=None, rough=0.6, metal=0.0, clearcoat=0.0):
    """Material named "<section>" or "<section>-<detail>" so the app can tint by name."""
    if name in _materials:
        return _materials[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = hex_rgba(color)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    bsdf.inputs['Coat Weight'].default_value = clearcoat
    _materials[name] = m
    return m


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    _materials.clear()


def link(obj, parent=None):
    bpy.context.scene.collection.objects.link(obj)
    if parent is not None:
        obj.parent = parent
    return obj


def group(name):
    return link(bpy.data.objects.new(name, None))


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


def facet(obj, ratio):
    """Low-poly look: decimate and flat shade."""
    if ratio < 1:
        mod = obj.modifiers.new('decimate', 'DECIMATE')
        mod.ratio = ratio
        bake(obj)
    for p in obj.data.polygons:
        p.use_smooth = False
    return obj


def skin_mesh(name, verts, edges, radii, mat, parent, subdiv=1, ratio=0.5, root=0):
    """Organic tube shape grown from a vertex skeleton with the Skin modifier."""
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([Vector(v) for v in verts], edges, [])
    obj = link(bpy.data.objects.new(name, mesh), parent)
    obj.modifiers.new('skin', 'SKIN')
    for i, r in enumerate(radii):
        rx, ry = (r, r) if isinstance(r, (int, float)) else r
        mesh.skin_vertices[0].data[i].radius = (rx, ry)
    mesh.skin_vertices[0].data[root].use_root = True
    if subdiv:
        sub = obj.modifiers.new('subsurf', 'SUBSURF')
        sub.levels = subdiv
        sub.render_levels = subdiv
    bake(obj)
    facet(obj, ratio)
    obj.data.materials.append(mat)
    return obj


def prim(kind, name, mat, parent, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1), ratio=1.0, **kw):
    """Primitive via bmesh (no operator context needed)."""
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    if kind == 'sphere':
        bmesh.ops.create_uvsphere(bm, u_segments=kw.get('u', 16), v_segments=kw.get('v', 10), radius=1)
    elif kind == 'ico':
        bmesh.ops.create_icosphere(bm, subdivisions=kw.get('subdiv', 2), radius=1)
    elif kind == 'cyl':
        bmesh.ops.create_cone(bm, cap_ends=True, segments=kw.get('segments', 12),
                              radius1=1, radius2=kw.get('top', 1), depth=2)
    elif kind == 'cube':
        bmesh.ops.create_cube(bm, size=2)
    elif kind == 'torus':
        _torus(bm, kw.get('major', 1), kw.get('minor', 0.2), kw.get('seg', 24), kw.get('ring', 8),
               kw.get('arc', 2 * math.pi))
    bm.to_mesh(mesh)
    bm.free()
    obj = link(bpy.data.objects.new(name, mesh), parent)
    obj.location = loc
    obj.rotation_euler = Euler(rot)
    obj.scale = scale
    if kw.get('bevel'):
        b = obj.modifiers.new('bevel', 'BEVEL')
        b.width = kw['bevel']
        b.segments = kw.get('bevel_segments', 2)
        b.limit_method = 'NONE'
        bake(obj)
    facet(obj, ratio)
    if kw.get('smooth'):
        for p in obj.data.polygons:
            p.use_smooth = True
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
        row = []
        for j in range(ring):
            b = 2 * math.pi * j / ring
            p = c + out * (math.cos(b) * minor) + Vector((0, 0, math.sin(b) * minor))
            row.append(bm.verts.new(p))
        rows.append(row)
    for i in range(n if closed else n - 1):
        r0, r1 = rows[i], rows[(i + 1) % n]
        for j in range(ring):
            bm.faces.new((r0[j], r0[(j + 1) % ring], r1[(j + 1) % ring], r1[j]))
    if not closed:
        bm.faces.new(list(reversed(rows[0])))
        bm.faces.new(rows[-1])


def mirror_x(v):
    return (-v[0], v[1], v[2])


def mitten_center(elbow, wrist, side):
    w = Vector((wrist[0] * side, wrist[1], wrist[2]))
    e = Vector((elbow[0] * side, elbow[1], elbow[2]))
    d = (w - e).normalized()
    return w + d * 0.11, d


# ---------------------------------------------------------------- rider parts

def build_rider(kind):
    """kind: 'snowboard' (sideways stance on a board) or 'ski' (forward stance with poles)."""
    board = kind == 'snowboard'
    rig = group('rider')

    # Pose landmarks (metres, Z up, rider faces -Y towards the camera).
    stance = 0.27 if board else 0.13
    knee_out = 0.30 if board else 0.15
    crouch = 0.05 if board else 0.07
    ankle_z = 0.19 if board else 0.17
    lean = -0.04 if board else -0.10   # torso leans forward (towards -Y)
    hip_z = 0.86 - crouch
    chest = (0, lean, 1.24 - crouch)
    shoulder = (0.2, lean, 1.37 - crouch)
    if board:
        elbow, wrist = (0.4, lean - 0.06, 1.14 - crouch), (0.55, lean - 0.16, 0.96 - crouch)
    else:
        elbow, wrist = (0.32, lean - 0.18, 1.06 - crouch), (0.34, lean - 0.36, 0.95 - crouch)
    neck_top = (0, lean * 1.2, 1.5 - crouch)
    head_c = Vector((0, lean * 1.3, 1.67 - crouch))
    HS = 1.3  # stylised: slightly oversized head

    # lower: pelvis + baggy pants
    g = group('lower')
    g.parent = rig
    pants = material('lower', PALETTE['pants'], rough=0.85)
    v = [(0, 0, hip_z), (0.11, 0, hip_z - 0.04), (knee_out, -0.09, 0.5), (stance, 0, ankle_z + 0.07)]
    v += [mirror_x(p) for p in v[1:]]
    v += [(0, 0.01, hip_z - 0.11)]  # crotch fill
    skin_mesh('lower-pants', v, [(0, 1), (1, 2), (2, 3), (0, 4), (4, 5), (5, 6), (0, 7)],
              [0.17, 0.125, 0.112, 0.118, 0.125, 0.112, 0.118, 0.12], pants, g, ratio=0.45)

    # upper: puffy jacket body + arms + collar
    g = group('upper')
    g.parent = rig
    jacket = material('upper', PALETTE['jacket'], rough=0.55)
    v = [(0, 0, hip_z - 0.07), (0, lean * 0.5, 1.02 - crouch), chest, (0, lean, 1.43 - crouch),
         shoulder, elbow, wrist]
    v += [mirror_x(shoulder), mirror_x(elbow), mirror_x(wrist)]
    skin_mesh('upper-jacket', v,
              [(0, 1), (1, 2), (2, 3), (2, 4), (4, 5), (5, 6), (2, 7), (7, 8), (8, 9)],
              [(0.205, 0.175), (0.215, 0.175), (0.228, 0.175), 0.12, 0.105, 0.095, 0.085, 0.105, 0.095, 0.085],
              jacket, g, ratio=0.5)
    prim('torus', 'upper-hood', jacket, g, loc=(0, lean + 0.02, 1.42 - crouch), rot=(0.25, 0, 0),
         major=0.1, minor=0.045, seg=14, ring=6, scale=(1.1, 1, 1))
    trim = material('upper-trim', PALETTE['jacket_trim'], rough=0.7)
    for side in (1, -1):
        w = Vector((wrist[0] * side, wrist[1], wrist[2]))
        e = Vector((elbow[0] * side, elbow[1], elbow[2]))
        d = (w - e).normalized()
        cuff_rot = d.to_track_quat('Z', 'Y').to_euler()
        prim('cyl', f'upper-cuff-{side}', trim, g, loc=w + d * 0.03, rot=cuff_rot,
             scale=(0.075, 0.075, 0.025), segments=10)
    prim('cyl', 'upper-zip', material('upper-zip', PALETTE['gaiter']), g,
         loc=(0, lean - 0.172, 1.18 - crouch), rot=(0.12, 0, 0), scale=(0.008, 0.004, 0.2), segments=6)

    # hands: mittens with thumbs at the wrists
    g = group('hands')
    g.parent = rig
    mit = material('hands', PALETTE['mitten'], rough=0.8)
    for side in (1, -1):
        c, d = mitten_center(elbow, wrist, side)
        prim('sphere', f'hands-mitten-{side}', mit, g, loc=c, rot=d.to_track_quat('Z', 'Y').to_euler(),
             scale=(0.068, 0.058, 0.09), u=10, v=7)
        prim('sphere', f'hands-thumb-{side}', mit, g, loc=c + Vector((-0.045 * side, -0.035, 0.03)),
             scale=(0.03, 0.03, 0.045), u=8, v=6)

    # feet: chunky boots
    g = group('feet')
    g.parent = rig
    boot = material('feet', PALETTE['boot'], rough=0.7)
    sole = material('feet-sole', PALETTE['boot_sole'], rough=0.9)
    for side in (1, -1):
        x = stance * side
        skin_mesh(f'feet-boot-{side}', [(x, 0.02, ankle_z + 0.05), (x, 0.02, 0.1), (x, -0.13, 0.08)],
                  [(0, 1), (1, 2)], [0.085, 0.085, 0.07], boot, g, ratio=0.5)
        prim('cube', f'feet-sole-{side}', sole, g, loc=(x, -0.04, 0.035), scale=(0.075, 0.15, 0.018), bevel=0.01)

    # head: face, helmet, goggles, gaiter
    g = group('head')
    g.parent = rig
    face_rot = (0, 0, -0.35) if board else (0, 0, 0)   # snowboarders look down the board
    headg = group('head-turn')
    headg.parent = g
    headg.location = head_c
    headg.rotation_euler = Euler(face_rot)
    headg.scale = (HS, HS, HS)
    prim('sphere', 'head-face', material('head-skin', PALETTE['skin'], rough=0.6), headg,
         scale=(0.1, 0.105, 0.12), u=14, v=10)
    helmet = material('head', PALETTE['helmet'], rough=0.35, clearcoat=0.5)
    shell = prim('sphere', 'head-helmet', helmet, headg, loc=(0, 0.012, 0.03), scale=(0.128, 0.138, 0.13), u=16, v=12)
    _cut_below(shell, -0.02 / 0.13)
    prim('torus', 'head-stripe', material('head-stripe', PALETTE['helmet_stripe'], rough=0.4), headg,
         loc=(0, 0.02, 0.03), rot=(0, math.pi / 2, 0), major=0.132, minor=0.012, seg=20, ring=5, arc=math.pi,
         scale=(1, 1.05, 1))
    frame = material('head-goggles', PALETTE['goggle_frame'], rough=0.4)
    prim('torus', 'head-strap', frame, headg, loc=(0, 0.0, -0.005), major=0.122, minor=0.016, seg=22, ring=5,
         scale=(1, 1.08, 1))
    # goggles: curved band wrapping the front of the face, glossy lens on top
    arc = 2.0
    wrap = (0, 0, -math.pi / 2 - arc / 2)
    prim('torus', 'head-goggle-frame', frame, headg, loc=(0, 0.0, -0.005), rot=wrap,
         major=0.112, minor=0.03, seg=12, ring=6, arc=arc, scale=(1, 1.08, 1.45))
    prim('torus', 'head-lens', material('head-lens', PALETTE['lens'], rough=0.05, metal=0.8, clearcoat=1), headg,
         loc=(0, -0.004, -0.005), rot=(0, 0, -math.pi / 2 - (arc - 0.25) / 2),
         major=0.126, minor=0.022, seg=12, ring=6, arc=arc - 0.25, scale=(1, 1.08, 1.45))
    prim('cyl', 'head-gaiter', material('head-gaiter', PALETTE['gaiter'], rough=0.9), g,
         loc=(0, neck_top[1], neck_top[2] - 0.03), scale=(0.08, 0.075, 0.045), top=0.85, segments=12)
    prim('torus', 'head-smile', material('head-mouth', '#8a3b2e', rough=0.6), headg,
         loc=(0, -0.093, -0.058), rot=(math.pi / 2 - 0.2, 0, math.pi), major=0.028, minor=0.006, seg=10, ring=4,
         arc=math.pi)
    # nose peeking under the goggles
    prim('sphere', 'head-nose', material('head-skin', PALETTE['skin']), headg, loc=(0, -0.1, -0.045),
         scale=(0.02, 0.02, 0.022), u=8, v=6)

    # extras: backpack
    g = group('extras')
    g.parent = rig
    pack = material('extras', PALETTE['backpack'], rough=0.8)
    prim('cube', 'extras-backpack', pack, g, loc=(0, lean + 0.19, 1.2 - crouch), rot=(-0.08, 0, 0),
         scale=(0.15, 0.07, 0.2), bevel=0.05, bevel_segments=2)
    prim('cube', 'extras-pocket', pack, g, loc=(0, lean + 0.26, 1.13 - crouch), rot=(-0.08, 0, 0),
         scale=(0.11, 0.03, 0.08), bevel=0.02)
    strap = material('extras-strap', PALETTE['strap'], rough=0.9)
    for side in (1, -1):
        prim('torus', f'extras-strap-{side}', strap, g, loc=(0.1 * side, lean + 0.02, 1.3 - crouch),
             rot=(0, math.pi / 2, 0), major=0.15, minor=0.012, seg=16, ring=4, arc=math.pi * 1.1,
             scale=(1, 1.25, 1.2))

    # equipment
    g = group('equipment')
    g.parent = rig
    if board:
        _snowboard(g, stance)
    else:
        _skis(g, stance, elbow, wrist)
    return rig


def _cut_below(obj, z_local):
    """Remove the lower part of a mesh (helmet opening)."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < z_local], context='VERTS')
    bm.to_mesh(obj.data)
    bm.free()


def _board_outline(length, width, nose_lift, segs=16):
    """Top-down outline of a twin-tip board with rounded, lifted ends."""
    pts = []
    half = length / 2
    r = width / 2
    straight = half - r
    for i in range(segs + 1):  # right end arc
        a = -math.pi / 2 + math.pi * i / segs
        pts.append((straight + math.cos(a) * r, math.sin(a) * r))
    for i in range(segs + 1):  # left end arc
        a = math.pi / 2 + math.pi * i / segs
        pts.append((-straight + math.cos(a) * r, math.sin(a) * r))

    def lift(x):
        t = max(0.0, (abs(x) - (half - 0.18)) / 0.18)
        return nose_lift * t * t

    return pts, lift


def _snowboard(g, stance):
    mat = material('equipment', PALETTE['board'], rough=0.3, clearcoat=0.8)
    pts, lift = _board_outline(1.56, 0.29, 0.07)
    # sidecut: narrow the waist slightly
    pts = [(x, y * (1 - 0.08 * math.cos(math.pi * x / 1.3))) for x, y in pts]
    mesh = bpy.data.meshes.new('equipment-board')
    bm = bmesh.new()
    top = [bm.verts.new((x, y, 0.035 + lift(x))) for x, y in pts]
    bot = [bm.verts.new((x, y, 0.012 + lift(x))) for x, y in pts]
    bm.faces.new(top)
    bm.faces.new(list(reversed(bot)))
    n = len(pts)
    for i in range(n):
        bm.faces.new((bot[i], bot[(i + 1) % n], top[(i + 1) % n], top[i]))
    bm.to_mesh(mesh)
    bm.free()
    obj = link(bpy.data.objects.new('equipment-board', mesh), g)
    facet(obj, 1.0)
    obj.data.materials.append(mat)
    # top graphic stripe + bindings
    prim('cube', 'equipment-graphic', material('equipment-graphic', PALETTE['board_graphic'], rough=0.35), g,
         loc=(0, 0, 0.04), scale=(0.6, 0.04, 0.003))
    bind = material('equipment-binding', PALETTE['binding'], rough=0.5)
    for side in (1, -1):
        x = stance * side
        prim('cube', f'equipment-baseplate-{side}', bind, g, loc=(x, -0.03, 0.045), scale=(0.08, 0.14, 0.012),
             bevel=0.01)
        prim('cube', f'equipment-highback-{side}', bind, g, loc=(x, 0.1, 0.17), rot=(-0.25, 0, 0),
             scale=(0.075, 0.015, 0.12), bevel=0.012)
        prim('cube', f'equipment-strap-{side}', bind, g, loc=(x, -0.07, 0.14), scale=(0.09, 0.03, 0.02),
             bevel=0.01)


def _skis(g, stance, elbow, wrist):
    mat = material('equipment', PALETTE['ski'], rough=0.3, clearcoat=0.8)
    for side in (1, -1):
        x = stance * side
        pts, lift = _board_outline(1.7, 0.085, 0.09, segs=8)
        mesh = bpy.data.meshes.new(f'equipment-ski-{side}')
        bm = bmesh.new()
        # ski runs along Y: swap axes, tip lifted towards the camera (-Y)
        top = [bm.verts.new((x + y, x_, 0.03 + (lift(x_) if x_ < 0 else lift(x_) * 0.5))) for x_, y in pts]
        bot = [bm.verts.new((x + y, x_, 0.012 + (lift(x_) if x_ < 0 else lift(x_) * 0.5))) for x_, y in pts]
        bm.faces.new(list(reversed(top)))
        bm.faces.new(bot)
        n = len(pts)
        for i in range(n):
            bm.faces.new((top[i], top[(i + 1) % n], bot[(i + 1) % n], bot[i]))
        bm.to_mesh(mesh)
        bm.free()
        obj = link(bpy.data.objects.new(f'equipment-ski-{side}', mesh), g)
        facet(obj, 1.0)
        obj.data.materials.append(mat)
        prim('cube', f'equipment-graphic-{side}', material('equipment-graphic', PALETTE['board_graphic']), g,
             loc=(x, -0.35, 0.032), scale=(0.02, 0.35, 0.002))
        prim('cube', f'equipment-binding-{side}', material('equipment-binding', PALETTE['binding']), g,
             loc=(x, 0.0, 0.05), scale=(0.045, 0.16, 0.02), bevel=0.01)
        # poles from the mittens down to the snow
        w, _ = mitten_center(elbow, wrist, side)
        w = w + Vector((0, 0, 0.06))  # grip pokes out of the top of the mitten
        tip = Vector((0.42 * side, -0.35, 0.02))
        d = w - tip
        pole_mat = material('equipment-pole', PALETTE['pole'], rough=0.4, metal=0.6)
        prim('cyl', f'equipment-pole-{side}', pole_mat, g, loc=(w + tip) / 2,
             rot=d.to_track_quat('Z', 'Y').to_euler(), scale=(0.011, 0.011, d.length / 2 + 0.08), segments=8)
        prim('cyl', f'equipment-basket-{side}', pole_mat, g, loc=tip + d.normalized() * 0.08,
             rot=d.to_track_quat('Z', 'Y').to_euler(), scale=(0.045, 0.045, 0.006), segments=10)


# ---------------------------------------------------------------- preview render

def setup_render(out_png, yaw_deg, res=(800, 1000)):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 48
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = res
    scene.render.filepath = out_png
    # Matches three.js/glTF viewers closely, so previews show what the web app will.
    scene.view_settings.view_transform = 'Khronos PBR Neutral'

    world = bpy.data.worlds.new('sky')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = hex_rgba('#cfe6ff')
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.85
    scene.world = world

    snow = material('snow', '#ffffff', rough=0.9)
    prim('cyl', 'snow', snow, None, loc=(0, 0, -0.01), scale=(3, 3, 0.01), segments=48)

    def light(name, loc, energy, size, color='#ffffff'):
        data = bpy.data.lights.new(name, 'AREA')
        data.energy = energy
        data.size = size
        data.color = hex_rgba(color)[:3]
        obj = link(bpy.data.objects.new(name, data))
        obj.location = loc
        obj.rotation_euler = (Vector((0, 0, 0.9)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()

    light('key', (-2.2, -2.6, 3.2), 380, 2.5, '#fff4e6')
    light('fill', (2.6, -1.8, 1.6), 120, 3, '#dbe9ff')
    light('rim', (0.5, 2.8, 2.6), 300, 2, '#ffffff')

    cam_data = bpy.data.cameras.new('cam')
    cam_data.lens = 70
    cam = link(bpy.data.objects.new('cam', cam_data))
    yaw = math.radians(yaw_deg)
    target = Vector((0, 0, 0.85))
    cam.location = target + Vector((math.sin(yaw) * -5.2, -math.cos(yaw) * 5.2, 1.3))
    cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
    scene.camera = cam


def export_glb(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    for o in list(bpy.data.objects):
        if o.name in ('snow',) or o.type in ('LIGHT', 'CAMERA'):
            bpy.data.objects.remove(o)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_apply=True,
                              export_yup=True, export_materials='EXPORT')


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    ap = argparse.ArgumentParser()
    ap.add_argument('--render', help='directory for preview PNGs')
    ap.add_argument('--only', choices=['snowboard', 'ski'])
    ap.add_argument('--no-export', action='store_true')
    args = ap.parse_args(argv)

    for kind in ('snowboard', 'ski'):
        if args.only and kind != args.only:
            continue
        if args.render:
            for yaw in (0, 35):
                reset_scene()
                build_rider(kind)
                setup_render(os.path.join(args.render, f'rider-{kind}-{yaw}.png'), yaw)
                bpy.ops.render.render(write_still=True)
                print('rendered', kind, yaw)
        if not args.no_export:
            reset_scene()
            build_rider(kind)
            out = os.path.join(OUT_DIR, f'rider-{kind}.glb')
            export_glb(out)
            print('exported', out, os.path.getsize(out) // 1024, 'KB')


if __name__ == '__main__':
    main()

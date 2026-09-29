"""Dresses a pro base character (Quaternius "Superhero Male", CC0) as a snowboarder or skier.

Usage (from the repo root):
    tools/blender/.venv/bin/python tools/blender/dress_rider.py [--render DIR] [--only snowboard|ski]

How it works:
- Clothes are *shells built from the character's own body surface*: faces of the jacket/pants/
  gloves/boots/hood regions are copied, pushed out along their normals and thickened, so every
  garment fits the body exactly and keeps its skin weights.
- The rider is posed by aiming bones at target directions (with a two-bone IK solve for the legs),
  then everything is baked to static meshes grouped under the app's gear-section empties
  (head, upper, hands, lower, feet, equipment, extras).
"""
import argparse
import math
import os
import sys

import bpy  # must come first: it makes bmesh/mathutils importable
import bmesh
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_rider as br  # noqa: E402  (materials, graffiti board, studio render)

HERE = os.path.dirname(os.path.abspath(__file__))
SOURCE = os.path.join(HERE, 'source', 'quaternius-superhero-male.glb')
OUT_DIR = br.OUT_DIR

PAL = dict(br.PALETTE, **br.DARK)  # dark theme by default
WEB = {'on': False}  # export mode: lighter shells (no subdivision), smooth shading does the rest

JACKET_BONES = {'spine_01', 'spine_02', 'spine_03', 'clavicle_l', 'clavicle_r',
                'upperarm_l', 'upperarm_r', 'lowerarm_l', 'lowerarm_r'}
PANTS_BONES = {'pelvis', 'thigh_l', 'thigh_r', 'calf_l', 'calf_r'}
HAND_PREFIXES = ('hand_', 'index_', 'middle_', 'pinky_', 'ring_', 'thumb_')
FOOT_BONES = {'foot_l', 'foot_r', 'ball_l', 'ball_r'}
HEAD_BONES = {'Head', 'neck_01'}
FINGER_CURL = math.radians(45)  # sign flips if the rig's finger roll differs


# ---------------------------------------------------------------- base character

def load_base():
    br.reset_scene()
    bpy.ops.import_scene.gltf(filepath=SOURCE)
    for o in list(bpy.data.objects):
        if o.type == 'MESH' and o.name in ('Icosphere', 'Hair_Buzzed', 'Eyebrows'):  # brows sit under the goggles
            bpy.data.objects.remove(o)
    bpy.data.objects['Eyes'].name = 'head-eyes'
    return bpy.data.objects['Armature'], bpy.data.objects['SuperHero_Male']


def dominant_bones(obj):
    names = {g.index: g.name for g in obj.vertex_groups}
    out = []
    for v in obj.data.vertices:
        best = max(v.groups, key=lambda g: g.weight, default=None)
        out.append(names.get(best.group) if best else None)
    return out


def region_of(bone, co, ankle_z):
    """Which garment a body vertex belongs to (rest pose, metres)."""
    if bone is None:
        return None
    if bone in HEAD_BONES:
        return 'head'
    if bone.startswith(HAND_PREFIXES):
        return 'hands'
    if bone in FOOT_BONES or (bone in ('calf_l', 'calf_r') and co.z < ankle_z + 0.13):
        return 'feet'
    if bone in JACKET_BONES or (bone == 'pelvis' and co.z > 0.99):
        return 'upper'
    if bone in PANTS_BONES:
        return 'lower'
    return None


def shell(src, name, keep_face, offset, mat, thickness, subdiv=1, drape=8, relax=6):
    """Garment from the body surface: copy the kept faces, push out along normals, drape, thicken, smooth.

    drape: smoothing passes that melt muscle detail into fabric; relax: passes that straighten the hem.
    """
    obj = src.copy()
    obj.data = src.data.copy()
    obj.name = obj.data.name = name
    bpy.context.scene.collection.objects.link(obj)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if not keep_face(f)], context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    # glTF splits vertices along UV seams; weld them so the inflated shell has no cracks
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    bm.normal_update()
    for v in bm.verts:
        v.co += v.normal * offset(v.co, v.normal)
    inner = [v for v in bm.verts if not v.is_boundary]
    for _ in range(drape):
        bmesh.ops.smooth_vert(bm, verts=inner, factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    for _ in range(relax):  # straighten jagged hems: pull boundary verts to the mean of their boundary neighbours
        for v in [v for v in bm.verts if v.is_boundary]:
            nb = [e.other_vert(v) for e in v.link_edges if e.is_boundary]
            if len(nb) == 2:
                v.co = v.co.lerp((nb[0].co + nb[1].co) / 2, 0.5)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    if thickness:
        s = obj.modifiers.new('solidify', 'SOLIDIFY')
        s.thickness = thickness
        s.offset = -1
    if subdiv and not WEB['on']:
        s = obj.modifiers.new('subsurf', 'SUBSURF')
        s.levels = s.render_levels = subdiv
    return obj


# ---------------------------------------------------------------- posing

def _upd():
    bpy.context.view_layer.update()


def aim(arm, name, direction):
    """Rotate a pose bone (about its head) so it points along a world direction."""
    _upd()
    pb = arm.pose.bones[name]
    cur = (pb.tail - pb.head).normalized()
    tgt = (arm.matrix_world.to_3x3().inverted() @ Vector(direction)).normalized()
    rot = cur.rotation_difference(tgt).to_matrix().to_4x4()
    h = pb.head.copy()
    pb.matrix = Matrix.Translation(h) @ rot @ Matrix.Translation(-h) @ pb.matrix
    _upd()


def turn(arm, name, axis, angle):
    _upd()
    pb = arm.pose.bones[name]
    h = pb.head.copy()
    pb.matrix = Matrix.Translation(h) @ Matrix.Rotation(angle, 4, axis) @ Matrix.Translation(-h) @ pb.matrix
    _upd()


def shift(arm, name, delta):
    _upd()
    pb = arm.pose.bones[name]
    m = pb.matrix.copy()
    m.translation += Vector(delta)
    pb.matrix = m
    _upd()


def leg_ik(arm, side, ankle, pole):
    """Two-bone IK: place the ankle at a world point, knee bending towards the pole direction."""
    _upd()
    thigh, calf = arm.pose.bones[f'thigh_{side}'], arm.pose.bones[f'calf_{side}']
    hip = arm.matrix_world @ thigh.head
    l1, l2 = thigh.length, calf.length
    ankle = Vector(ankle)
    d = min((ankle - hip).length, l1 + l2 - 1e-4)
    u = (ankle - hip).normalized()
    a = (l1 * l1 - l2 * l2 + d * d) / (2 * d)
    h = math.sqrt(max(l1 * l1 - a * a, 0))
    p = Vector(pole)
    perp = (p - u * p.dot(u)).normalized()
    knee = hip + u * a + perp * h
    aim(arm, f'thigh_{side}', knee - hip)
    aim(arm, f'calf_{side}', ankle - knee)


def curl_fingers(arm, side, amount):
    """Bend each finger joint about its own local X axis (towards the palm)."""
    for f in ('index', 'middle', 'ring', 'pinky'):
        for k, w in (('01', 0.7), ('02', 1.0), ('03', 0.8)):
            pb = arm.pose.bones[f'{f}_{k}_{side}']
            _upd()
            axis = (arm.matrix_world.to_3x3() @ pb.matrix.to_3x3()) @ Vector((1, 0, 0))
            turn(arm, pb.name, axis.normalized(), amount * w)
    turn(arm, f'thumb_02_{side}', ((arm.matrix_world.to_3x3() @ arm.pose.bones[f'thumb_02_{side}'].matrix.to_3x3())
                                   @ Vector((1, 0, 0))).normalized(), amount * 0.5)


def pose_snowboard(arm):
    # crouch and twist the upper body towards the nose (-X)
    shift(arm, 'pelvis', (0, 0.05, -0.2))
    for b, a in (('spine_01', -8), ('spine_02', -10), ('spine_03', -10)):
        turn(arm, b, 'Z', math.radians(a))
    turn(arm, 'spine_01', 'X', math.radians(8))       # lean forward
    for side, x in (('l', 0.27), ('r', -0.27)):
        leg_ik(arm, side, (x, 0.02, 0.125), (0.1 * (1 if side == 'l' else -1), -1, 0))
        aim(arm, f'foot_{side}', (0, -1, -0.45))
        aim(arm, f'ball_{side}', (0, -1, 0))
    # lead (right) arm reaches for the nose, back arm hangs low behind
    aim(arm, 'upperarm_r', (-0.75, -0.35, -0.55))
    aim(arm, 'lowerarm_r', (-0.6, -0.55, -0.55))
    aim(arm, 'hand_r', (-0.5, -0.55, -0.65))
    aim(arm, 'upperarm_l', (0.45, 0.35, -0.82))
    aim(arm, 'lowerarm_l', (0.35, 0.45, -0.82))
    aim(arm, 'hand_l', (0.3, 0.4, -0.85))
    turn(arm, 'Head', 'Z', math.radians(-28))
    turn(arm, 'neck_01', 'X', math.radians(6))
    for side in 'lr':
        curl_fingers(arm, side, FINGER_CURL * 0.6)


def pose_ski(arm):
    shift(arm, 'pelvis', (0, 0.07, -0.2))
    turn(arm, 'spine_01', 'X', math.radians(14))
    for b in ('spine_02', 'spine_03'):
        turn(arm, b, 'Z', math.radians(6))
    for side, x in (('l', 0.12), ('r', -0.12)):
        leg_ik(arm, side, (x, 0.0, 0.115), (0, -1, 0))
        aim(arm, f'foot_{side}', (0, -1, -0.45))
        aim(arm, f'ball_{side}', (0, -1, 0))
    for side, sx in (('l', 1), ('r', -1)):
        aim(arm, f'upperarm_{side}', (0.35 * sx, -0.35, -0.87))
        aim(arm, f'lowerarm_{side}', (0.12 * sx, -0.9, -0.3))
        aim(arm, f'hand_{side}', (0.05 * sx, -0.95, -0.2))
    turn(arm, 'Head', 'X', math.radians(-6))
    for side in 'lr':  # fists around the pole grips
        curl_fingers(arm, side, FINGER_CURL * 1.3)


# ---------------------------------------------------------------- dressing

def dress(arm, body, kind):
    board = kind == 'snowboard'
    dom = dominant_bones(body)
    rest = [v.co.copy() for v in body.data.vertices]
    ankle_z = arm.data.bones['foot_l'].head_local.z
    region = [region_of(b, co, ankle_z) for b, co in zip(dom, rest)]
    eye_z = 1.70
    neck_z = arm.data.bones['neck_01'].head_local.z
    wrist = [arm.data.bones['hand_l'].head_local, arm.data.bones['hand_r'].head_local]

    def face_region(f):
        regs = [region[v.index] for v in f.verts]
        return max(set(regs), key=regs.count)

    def face_center(f):
        return sum((rest[v.index] for v in f.verts), Vector()) / len(f.verts)

    # ---- jacket: orange puffy shell, blue chest panel and green cuffs as clean overlaid layers
    orange = br.material('upper', PAL['jacket'], rough=0.7, sheen=0.05)

    def jacket_offset(co, n):
        return 0.032 + 0.014 * max(0, 1 - abs(co.z - 1.22) / 0.3)

    jacket = shell(body, 'upper-jacket', lambda f: face_region(f) == 'upper', jacket_offset, orange, 0.012, drape=12,
                   relax=14)
    blue = br.material('upper-panel', PAL['jacket_panel'], rough=0.7, sheen=0.05)
    shoulders = [arm.data.bones['upperarm_l'].head_local, arm.data.bones['upperarm_r'].head_local]

    def yoke(f):  # colour-blocked yoke: chest/upper back above the line plus the shoulder caps
        c = face_center(f)
        near_shoulder = min((c - sh).length for sh in shoulders) < 0.16
        on_torso = dom[f.verts[0].index] in ('spine_03', 'clavicle_l', 'clavicle_r', 'spine_02')
        return face_region(f) == 'upper' and ((on_torso and c.z > 1.3) or near_shoulder)

    shell(body, 'upper-panel', yoke, lambda co, n: jacket_offset(co, n) + 0.003, blue, 0.003, drape=12, relax=16)
    green = br.material('upper-cuff', PAL['jacket_cuff'], rough=0.7)
    shell(body, 'upper-cuffs', lambda f: face_region(f) == 'upper' and min((face_center(f) - w).length for w in wrist) < 0.085,
          lambda co, n: jacket_offset(co, n) + 0.008, green, 0.006, drape=6, relax=10)

    # ---- pants: baggy green, flaring towards the boots
    pants = br.material('lower', PAL['pants'], rough=0.85, sheen=0.05)
    shell(body, 'lower-pants', lambda f: face_region(f) == 'lower',
          lambda co, n: 0.03 + 0.04 * max(0, min(1, (0.62 - co.z) / 0.45)), pants, 0.01, drape=14)

    # ---- gloves (black) and boots (orange, dark soles)
    shell(body, 'hands-gloves', lambda f: face_region(f) == 'hands', lambda co, n: 0.012,
          br.material('hands', PAL['glove'], rough=0.6, sheen=0.2), 0.004)
    boots = shell(body, 'feet-boots', lambda f: face_region(f) == 'feet',
                  lambda co, n: 0.042 if co.z > 0.03 else 0.024, br.material('feet', PAL['boot_shell'], rough=0.45, coat=0.3),
                  0.012, drape=16, relax=10)
    br.paint_faces(boots, [(br.material('feet-sole', PAL['boot_dark'], rough=0.8), lambda c, n: n.z < -0.5 or c.z < 0.035),
                           (br.material('feet-cuff', PAL['boot'], rough=0.45, coat=0.3), lambda c, n: c.z > ankle_z + 0.08),
                           (br.material('feet', PAL['boot_shell']), lambda c, n: True)])

    # ---- head: sleek helmet from the skull shape, gaiter around the neck (goggles added after posing)
    def head_face(f):
        return face_region(f) == 'head'

    def skull(f):
        c, n = face_center(f), f.normal
        # crown down to the goggle line, plus temples/ears/back like a real helmet with ear pads (never the cheeks)
        return head_face(f) and (c.z > 1.712 or (c.z > 1.625 and c.y > -0.02) or (c.z > 1.64 and abs(c.x) > 0.068))

    shell(body, 'head-helmet', skull, lambda co, n: 0.03,
          br.material('head-helmet', PAL['helmet'], rough=0.3, coat=0.8), 0.014, subdiv=2, drape=10, relax=14)
    shell(body, 'head-gaiter', lambda f: head_face(f) and face_center(f).z < neck_z + 0.04,
          lambda co, n: 0.02, br.material('head-gaiter', PAL['gaiter'], rough=0.85, sheen=0.3), 0.006, drape=6, relax=8)

    for m in body.data.materials:  # less plastic-looking skin
        b = m.node_tree.nodes.get('Principled BSDF') if m.use_nodes else None
        if b:
            b.inputs['Roughness'].default_value = 0.62
            b.inputs['Subsurface Weight'].default_value = 0.12
            b.inputs['Subsurface Radius'].default_value = (1.0, 0.35, 0.2)

    # body keeps only the visible face skin
    bm = bmesh.new()
    bm.from_mesh(body.data)
    bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if face_region(f) != 'head'], context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.to_mesh(body.data)
    bm.free()
    body.name = 'head-face'

    # ---- pose, then bake everything to static meshes
    (pose_snowboard if board else pose_ski)(arm)
    groups = {s: br.group(s) for s in ('head', 'upper', 'hands', 'lower', 'feet', 'equipment', 'extras')}
    rig = br.group('rider')
    for g in groups.values():
        g.parent = rig
    dg = bpy.context.evaluated_depsgraph_get()
    for o in [o for o in bpy.data.objects if o.type == 'MESH' and o.parent == arm]:
        mesh = bpy.data.meshes.new_from_object(o.evaluated_get(dg))
        mw = o.matrix_world.copy()
        o.modifiers.clear()
        o.parent = None
        o.data = mesh
        o.matrix_world = mw
        o.vertex_groups.clear()
        br.shade(o)
        o.parent = groups[o.name.split('-')[0]]
    head_m = arm.matrix_world @ arm.pose.bones['Head'].matrix
    spine_m = arm.matrix_world @ arm.pose.bones['spine_03'].matrix
    bpy.data.objects.remove(arm)
    _goggles(groups['head'], head_m, groups)

    # ---- gear rebuilt around the posed body: board/skis, backpack, logo
    ankles = [Vector((0.27, 0.02, 0.125)), Vector((-0.27, 0.02, 0.125))] if board else \
        [Vector((0.12, 0, 0.115)), Vector((-0.12, 0, 0.115))]
    art = br.graffiti_image(f'{kind}-graphic', colors=br.GRAFFITI_DARK, bg='#0b0c0e')
    if board:
        br._snowboard(groups['equipment'], art, ankles)
    else:
        hands = [o for o in bpy.data.objects if o.name == 'hands-gloves'][0]
        pts = [hands.matrix_world @ v.co for v in hands.data.vertices]
        left = [p for p in pts if p.x > 0]
        right = [p for p in pts if p.x < 0]
        grips = [sum(left, Vector()) / len(left), sum(right, Vector()) / len(right)]
        _ski_gear(groups['equipment'], art, ankles, grips)
    _backpack(groups['extras'], spine_m)

    rig.rotation_euler = (math.radians(-6), math.radians(4 if board else -3), 0)
    _upd()
    min_z = min((o.matrix_world @ v.co).z for o in rig.children_recursive if o.type == 'MESH' for v in o.data.vertices)
    rig.location.z = -min_z
    return rig


def _ski_gear(g, art, ankles, grips):
    graphic = br.material('equipment', '#ffffff', rough=0.25, coat=1.0, image=art)
    edge = br.material('equipment-edge', PAL['board_edge'], rough=0.4, metal=0.4)
    bind = br.material('equipment-binding', PAL['binding'], rough=0.4, coat=0.4)
    pole = br.material('equipment-pole', PAL['pole'], rough=0.35, metal=0.7)
    for i, a in enumerate(ankles):
        mesh, _ = br._board_mesh(f'equipment-ski-{i}', 1.72, 0.09, 0.1, 0.02, axis='Y', sidecut=0.15, segs=10)
        obj = br.link(bpy.data.objects.new(f'equipment-ski-{i}', mesh), g)
        obj.location = (a.x, -0.05, 0)
        obj.data.materials.append(graphic)
        obj.data.materials.append(edge)
        for p in obj.data.polygons:
            p.material_index = 0 if len(p.vertices) > 4 else 1
        br.shade(obj, False)
        br.prim('cube', f'equipment-binding-{i}', bind, g, loc=(a.x, -0.02, 0.04), scale=(0.045, 0.17, 0.022),
                bevel=0.012)
        grip = grips[i] + Vector((0, 0, 0.04))
        tip = Vector((a.x * 3.6, -0.32, 0.0))
        d = grip - tip
        rot = d.to_track_quat('Z', 'Y').to_euler()
        br.prim('cyl', f'equipment-pole-{i}', pole, g, loc=(grip + tip) / 2, rot=rot,
                scale=(0.011, 0.011, d.length / 2 + 0.05), segments=10)
        br.prim('cyl', f'equipment-basket-{i}', bind, g, loc=tip + d.normalized() * 0.09, rot=rot,
                scale=(0.045, 0.045, 0.006), segments=16)


def _backpack(g, spine_m):
    """Slim pack strapped to the upper back (spine_03 frame: +Y of the bone runs up the spine)."""
    rot = spine_m.to_3x3().normalized()
    up_axis = rot @ Vector((0, 1, 0))
    back = (rot @ Vector((0, 0, 1)))  # bone Z points to the back for this rig; checked below
    if back.y < 0:
        back = -back
    c = spine_m.to_translation() + up_axis * 0.02 + back * 0.16
    euler = rot.to_euler()
    pack = br.material('extras', PAL['backpack'], rough=0.75, sheen=0.2)
    obj = br.prim('cube', 'extras-backpack', pack, g, loc=c, scale=(0.15, 0.055, 0.19), bevel=0.045)
    obj.rotation_euler = (0, 0, euler.z) if abs(euler.z) < 1 else (0, 0, 0)
    br.prim('cube', 'extras-stripe', br.material('extras-accent', PAL['backpack_accent'], rough=0.5), g,
            loc=c + back * 0.058, rot=obj.rotation_euler, scale=(0.1, 0.004, 0.018), bevel=0.003)


def curved_patch(name, mat, parent, radius, half_angle, half_h, keep, thickness, yscale=1.12, nx=140, nz=60, bow=0.012):
    """Surface on a vertical cylinder in front of the face (-Y), trimmed by keep(u, v) with u, v in [-1, 1]."""
    if WEB['on']:  # same outline at a web-friendly density
        nx, nz = nx // 3, nz // 3
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    grid = []
    for j in range(nz + 1):
        v = -1 + 2 * j / nz
        row = []
        for i in range(nx + 1):
            u = -1 + 2 * i / nx
            a = u * half_angle
            # toric lens: curved around the face and bowed back slightly at the top and bottom
            row.append(bm.verts.new((radius * math.sin(a), -radius * math.cos(a) * yscale + bow * v * v, v * half_h)))
        grid.append(row)
    for j in range(nz):
        for i in range(nx):
            us = [-1 + 2 * (i + di) / nx for di in (0, 1)]
            vs = [-1 + 2 * (j + dj) / nz for dj in (0, 1)]
            if all(keep(u, v) for u in us for v in vs):
                bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    for _ in range(12):  # smooth the stair-stepped outline into a clean curve
        for v in [v for v in bm.verts if v.is_boundary]:
            nb = [e.other_vert(v) for e in v.link_edges if e.is_boundary]
            if len(nb) == 2:
                v.co = v.co.lerp((nb[0].co + nb[1].co) / 2, 0.5)
    bm.to_mesh(mesh)
    bm.free()
    obj = br.link(bpy.data.objects.new(name, mesh), parent)
    s = obj.modifiers.new('solidify', 'SOLIDIFY')
    s.thickness = thickness
    s.offset = 1  # thicken towards the face
    if not WEB['on']:
        sub = obj.modifiers.new('subsurf', 'SUBSURF')
        sub.levels = sub.render_levels = 1
    br.bake(obj)
    br.shade(obj)
    obj.data.materials.append(mat)
    return obj


def goggle_shape(u, v, scale=1.0):
    """Ski goggle outline: rounded rectangle (superellipse) with a notch for the nose."""
    u, v = u / scale, v / scale
    inside = abs(u) ** 2.8 + abs(v) ** 2.3 <= 1
    nose = v < -0.3 and abs(u) < 0.2 - (v + 1) * 0.1
    return inside and not nose


def _goggles(g, head_m, groups):
    """Real ski goggles: curved spherical-look lens, deep foam-backed frame, wide strap round the helmet."""
    frame = br.material('head', PAL['goggle_frame'], rough=0.45)
    foam = br.material('head-foam', '#050506', rough=1.0)
    lens = br.material('head-lens', PAL['lens_mirror'], rough=0.06, metal=0.9, coat=1.0)
    strap = br.material('head-strap', '#15171b', rough=0.8, sheen=0.3)
    accent = br.material('head-strap-accent', PAL['jacket_cuff'], rough=0.6)
    rig = br.group('head-goggles-rig', g)
    rot = head_m.to_3x3().normalized()
    fwd = rot @ Vector((0, 0, -1))
    if fwd.y > 0:
        fwd = -fwd
    up = (rot @ Vector((0, 1, 0))).normalized()
    side = up.cross(fwd).normalized()
    basis = Matrix((side, -fwd, up)).transposed()  # local X=side, Y=back, Z=up
    eye = head_m.to_translation() + up * 0.094 + fwd * 0.004
    rig.matrix_world = Matrix.Translation(eye) @ basis.to_4x4()

    ang, h = math.radians(64), 0.047
    curved_patch('head-goggle-frame', frame, rig, 0.104, ang * 1.08, h * 1.12,
                 lambda u, v: goggle_shape(u, v) and not goggle_shape(u, v, 0.86), 0.022)
    curved_patch('head-goggle-foam', foam, rig, 0.096, ang * 1.02, h * 1.02, lambda u, v: goggle_shape(u, v), 0.01)
    curved_patch('head-lens', lens, rig, 0.108, ang * 0.97, h * 0.97, lambda u, v: goggle_shape(u, v), 0.004)
    # wide strap wrapping round the back of the helmet, with a thin accent stripe
    back_arc = 2 * math.pi - 2 * ang * 1.02
    rot_z = -math.pi / 2 + ang * 1.02
    br.prim('torus', 'head-strap', strap, rig, loc=(0, 0.01, 0), rot=(0, 0, rot_z), major=0.114, minor=0.006,
            seg=40, ring=8, arc=back_arc, scale=(1, 1.1, 3.0))
    br.prim('torus', 'head-strap-stripe', accent, rig, loc=(0, 0.01, 0), rot=(0, 0, rot_z), major=0.1185,
            minor=0.0032, seg=40, ring=6, arc=back_arc, scale=(1, 1.1, 1.2))


# ---------------------------------------------------------------- main

def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    ap = argparse.ArgumentParser()
    ap.add_argument('--render', help='directory for preview PNGs')
    ap.add_argument('--only', choices=['snowboard', 'ski'])
    ap.add_argument('--views', default='0,35')
    ap.add_argument('--no-export', action='store_true')
    ap.add_argument('--thumbs', action='store_true', help='render transparent crew-card thumbnails into public/models')
    args = ap.parse_args(argv)
    for kind in ('snowboard', 'ski'):
        if args.only and kind != args.only:
            continue
        if args.render:
            for yaw in (float(y) for y in args.views.split(',')):
                arm, body = load_base()
                dress(arm, body, kind)
                br.setup_render(os.path.join(args.render, f'pro-{kind}-{int(yaw)}.png'), yaw, theme='dark')
                bpy.ops.render.render(write_still=True)
                print('rendered', kind, yaw)
        if args.thumbs:
            arm, body = load_base()
            dress(arm, body, kind)
            out = os.path.join(OUT_DIR, f'rider-{kind}-thumb.png')
            br.setup_render(out, 28, res=(240, 300), theme='dark')
            scene = bpy.context.scene
            scene.render.film_transparent = True
            scene.render.image_settings.color_mode = 'RGBA'
            scene.render.image_settings.compression = 100
            scene.cycles.samples = 64
            bpy.data.objects['studio'].hide_render = True
            cam = scene.camera
            cam.data.lens = 70
            bpy.ops.render.render(write_still=True)
            print('thumb', out, os.path.getsize(out) // 1024, 'KB')
        if not args.no_export:
            WEB['on'] = True
            arm, body = load_base()
            dress(arm, body, kind)
            out = os.path.join(OUT_DIR, f'rider-{kind}.glb')
            # drop leftover empties from the source rig (nothing renderable under them)
            for o in [o for o in bpy.data.objects if o.type == 'EMPTY']:
                if not any(c.type == 'MESH' for c in o.children_recursive):
                    bpy.data.objects.remove(o)
            tris = br.export_glb(out)
            print('exported', out, os.path.getsize(out) // 1024, 'KB', tris, 'tris')
            WEB['on'] = False


if __name__ == '__main__':
    main()

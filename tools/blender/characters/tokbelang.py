"""Tok Belang — huge, scarred, white-striped guardian tiger (docs/ASSETS.md §3). Original model, no downloads.

The body is sculpted from metaballs (capsules along a quadruped skeleton plus ellipsoids for the skull, muzzle,
cheek ruffs, chin and ears) so every part blends into one surface; it is voxel-remeshed, smoothed and decimated
to budget. A custom quadruped skeleton (bones named for procedural animation in code: gait, IK feet, spine/tail
springs) is skinned with automatic weights; any vertex left unweighted is bound to its nearest bone. Fur stripes,
face markings, eyes, nose and scars are procedural in 3D and baked to a 1024² texture (Cycles EMIT bake).
Faces −Y in Blender (= +Z in glTF/three.js). Ground at z = 0. Shoulder height ≈ 1.35 m.

Usage: blender --background --factory-startup --python tools/blender/characters/tokbelang.py -- --out <dir> [--previews <dir>]
"""

from __future__ import annotations

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import bpy  # noqa: E402
from mathutils import Euler, Vector  # noqa: E402

from lib import hk  # noqa: E402

# Joints: name -> (position, visible radius). x right, y back (tail side), z up.
# Tiger posture: the shoulder blades are the highest point; the head is carried below them on a thick neck.
J = {
    "hips": ((0.0, 0.62, 1.20), 0.29),
    "spine1": ((0.0, 0.25, 1.18), 0.30),
    "spine2": ((0.0, -0.12, 1.21), 0.33),
    "chest": ((0.0, -0.48, 1.21), 0.37),
    "neck": ((0.0, -0.80, 1.24), 0.27),
    "head": ((0.0, -1.04, 1.28), 0.23),
    "muzzle": ((0.0, -1.27, 1.17), 0.1),
    "tail1": ((0.0, 0.95, 1.16), 0.10),
    "tail2": ((0.0, 1.25, 0.95), 0.09),
    "tail3": ((0.0, 1.52, 0.78), 0.085),
    "tail4": ((0.0, 1.79, 0.62), 0.08),
    "tail5": ((0.0, 2.05, 0.55), 0.075),
    "tail6": ((0.0, 2.31, 0.63), 0.07),
}
for side, sx in (("l", -1), ("r", 1)):
    J.update(
        {
            f"shoulder_{side}": ((sx * 0.24, -0.50, 1.06), 0.21),
            f"elbow_{side}": ((sx * 0.25, -0.40, 0.66), 0.15),
            f"wrist_{side}": ((sx * 0.24, -0.50, 0.17), 0.11),
            f"paw_{side}": ((sx * 0.24, -0.64, 0.08), 0.14),
            f"hip_{side}": ((sx * 0.22, 0.62, 1.08), 0.24),
            f"knee_{side}": ((sx * 0.24, 0.36, 0.66), 0.15),
            f"hock_{side}": ((sx * 0.23, 0.78, 0.30), 0.085),
            f"hindpaw_{side}": ((sx * 0.23, 0.66, 0.08), 0.12),
        }
    )

LIMBS = [("hips", "spine1"), ("spine1", "spine2"), ("spine2", "chest"), ("chest", "neck"), ("neck", "head"), ("head", "muzzle")]
LIMBS += [(f"tail{i}", f"tail{i + 1}") for i in range(1, 6)] + [("hips", "tail1")]
for s in ("l", "r"):
    LIMBS += [
        ("chest", f"shoulder_{s}"),
        (f"shoulder_{s}", f"elbow_{s}"),
        (f"elbow_{s}", f"wrist_{s}"),
        (f"wrist_{s}", f"paw_{s}"),
        ("hips", f"hip_{s}"),
        (f"hip_{s}", f"knee_{s}"),
        (f"knee_{s}", f"hock_{s}"),
        (f"hock_{s}", f"hindpaw_{s}"),
    ]

# Extra masses: (centre, half-sizes x/y/z[, rotation XYZ in degrees]). Mirrored parts are listed for x > 0 and
# duplicated for the left side by SYMMETRIC.
HEAD_PARTS = [
    ((0.0, -1.02, 1.34), (0.24, 0.23, 0.19)),  # skull: broad, flat-topped
    ((0.0, -1.19, 1.42), (0.19, 0.07, 0.06)),  # brow ridge over the eyes
    ((0.0, -1.29, 1.18), (0.13, 0.11, 0.095)),  # muzzle, broad and short
    ((0.0, -1.33, 1.27), (0.06, 0.10, 0.05)),  # nose bridge
    ((0.0, -1.42, 1.22), (0.045, 0.03, 0.032)),  # nose tip
    ((0.0, -1.29, 1.05), (0.09, 0.09, 0.05)),  # chin / lower jaw
    ((0.0, -0.52, 1.06), (0.30, 0.30, 0.28)),  # chest depth (keel)
    ((0.0, 0.22, 1.1), (0.25, 0.32, 0.16)),  # belly, tucked up toward the hips
]
SYMMETRIC = [
    ((0.065, -1.37, 1.14), (0.068, 0.058, 0.055)),  # whisker pad
    ((0.22, -1.06, 1.18), (0.14, 0.14, 0.15)),  # cheek ruff
    ((0.25, -0.98, 1.06), (0.11, 0.12, 0.12), (0, -20, 0)),  # lower ruff flaring out
    ((0.19, -0.95, 1.54), (0.085, 0.04, 0.09), (0, 18, 0)),  # rounded ear, top tilted outward
    ((0.17, -0.50, 1.43), (0.12, 0.20, 0.16)),  # shoulder blade (withers)
    ((0.25, -0.44, 0.50), (0.12, 0.13, 0.20)),  # forearm muscle
    ((0.20, 0.55, 0.95), (0.17, 0.28, 0.30)),  # haunch
]
for centre, size, *rotation in list(SYMMETRIC):
    mirrored_rotation = [(r[0], -r[1], -r[2]) for r in rotation]
    HEAD_PARTS.append(((centre[0], centre[1], centre[2]), size, *rotation))
    HEAD_PARTS.append(((-centre[0], centre[1], centre[2]), size, *mirrored_rotation))
# Front-view anchors (x, z) for face features; ray casts put them on the real surface (place_face_features).
EYE_XZ = [(-0.11, 1.35), (0.11, 1.35)]
NOSE_XZ = (0.0, 1.22)
EYES = [(-0.11, -1.26, 1.31), (0.11, -1.26, 1.31)]
NOSE = (0.0, -1.5, 1.18)
STROKES: list[tuple] = []  # (points on the surface, width, rgba), filled by place_face_features
# Metaball surface sits inside the element radius; this factor maps visible radius -> element radius.
MB_SCALE = 1.45


def sculpt_body(coll) -> bpy.types.Object:
    mb = bpy.data.metaballs.new("tokbelang_mb")
    mb.resolution = 0.03
    mb.render_resolution = 0.03
    mb.threshold = 0.6
    obj = bpy.data.objects.new("tokbelang_mb", mb)
    coll.objects.link(obj)
    for a, b in LIMBS:
        pa, ra = Vector(J[a][0]), J[a][1]
        pb, rb = Vector(J[b][0]), J[b][1]
        direction = pb - pa
        el = mb.elements.new(type="CAPSULE")
        el.co = (pa + pb) / 2
        el.radius = (ra + rb) / 2 * MB_SCALE
        el.size_x = direction.length / 2
        el.rotation = Vector((1, 0, 0)).rotation_difference(direction.normalized())
        el.stiffness = 2.2
    for name, (pos, radius) in J.items():
        if name.startswith(("paw_", "hindpaw_")):
            # Broad, flat paws pointing forward rather than balls.
            el = mb.elements.new(type="ELLIPSOID")
            el.co = (pos[0], pos[1] - radius * 0.3, pos[2])
            el.radius = 1.0
            el.size_x, el.size_y, el.size_z = radius * MB_SCALE, radius * 1.45 * MB_SCALE, radius * 0.6 * MB_SCALE
        else:
            el = mb.elements.new(type="BALL")
            el.co = pos
            el.radius = radius * MB_SCALE
        el.stiffness = 2.0
    for centre, size, *rotation in HEAD_PARTS:
        el = mb.elements.new(type="ELLIPSOID")
        el.co = centre
        el.radius = 1.0
        el.size_x, el.size_y, el.size_z = (s * MB_SCALE for s in size)
        if rotation:
            el.rotation = Euler([math.radians(a) for a in rotation[0]]).to_quaternion()
        el.stiffness = 2.0
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.ops.object.convert(target="MESH")
    body = bpy.context.view_layer.objects.active
    body.name = "tokbelang"
    body.data.name = "tokbelang"
    remesh = body.modifiers.new("remesh", "REMESH")
    remesh.mode = "VOXEL"
    remesh.voxel_size = 0.022
    smooth = body.modifiers.new("smooth", "SMOOTH")
    smooth.factor = 0.6
    smooth.iterations = 4
    apply_modifiers(body)
    return body


def apply_modifiers(obj) -> None:
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    for mod in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=mod.name)


# Bones: name -> (head joint, tail joint, parent).
BONES = {
    "hips": ("hips", "spine1", "root"),
    "spine1": ("spine1", "spine2", "hips"),
    "spine2": ("spine2", "chest", "spine1"),
    "chest": ("chest", "neck", "spine2"),
    "neck": ("neck", "head", "chest"),
    "head": ("head", "muzzle", "neck"),
    "tail1": ("tail1", "tail2", "hips"),
    "tail2": ("tail2", "tail3", "tail1"),
    "tail3": ("tail3", "tail4", "tail2"),
    "tail4": ("tail4", "tail5", "tail3"),
    "tail5": ("tail5", "tail6", "tail4"),
}
for s in ("l", "r"):
    BONES.update(
        {
            f"upperarm_{s}": (f"shoulder_{s}", f"elbow_{s}", "chest"),
            f"forearm_{s}": (f"elbow_{s}", f"wrist_{s}", f"upperarm_{s}"),
            f"paw_{s}": (f"wrist_{s}", f"paw_{s}", f"forearm_{s}"),
            f"thigh_{s}": (f"hip_{s}", f"knee_{s}", "hips"),
            f"shin_{s}": (f"knee_{s}", f"hock_{s}", f"thigh_{s}"),
            f"hindpaw_{s}": (f"hock_{s}", f"hindpaw_{s}", f"shin_{s}"),
        }
    )


def build_armature(coll) -> bpy.types.Object:
    data = bpy.data.armatures.new("tokbelang_rig")
    rig = bpy.data.objects.new("tokbelang_rig", data)
    coll.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.select_all(action="DESELECT")
    rig.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    edit = data.edit_bones
    root = edit.new("root")
    root.head, root.tail = Vector((0, 0, 0)), Vector((0, -0.4, 0))
    for name, (head, tail, _parent) in BONES.items():
        bone = edit.new(name)
        bone.head = Vector(J[head][0])
        bone.tail = Vector(J[tail][0])
        bone.roll = 0.0
    for side, sx in (("l", -1), ("r", 1)):
        ear = edit.new(f"ear_{side}")
        ear.head, ear.tail = Vector((sx * 0.17, -0.95, 1.42)), Vector((sx * 0.21, -0.95, 1.6))
    for name, (_head, _tail, parent) in BONES.items():
        edit[name].parent = edit[parent]
    for side in ("l", "r"):
        edit[f"ear_{side}"].parent = edit["head"]
    bpy.ops.object.mode_set(mode="OBJECT")
    return rig


def bind_unweighted(body, rig) -> int:
    """Binds any vertex automatic weighting skipped to the nearest bone segment (weight 1)."""
    bones = [(b.name, rig.matrix_world @ b.head_local, rig.matrix_world @ b.tail_local) for b in rig.data.bones if b.name != "root"]
    fixed = 0
    for v in body.data.vertices:
        if any(g.weight > 1e-4 for g in v.groups):
            continue
        p = body.matrix_world @ v.co
        best, best_d = None, 1e9
        for name, a, b in bones:
            ab = b - a
            t = max(0.0, min(1.0, (p - a).dot(ab) / max(ab.length_squared, 1e-8)))
            d = (a + ab * t - p).length
            if d < best_d:
                best, best_d = name, d
        group = body.vertex_groups.get(best) or body.vertex_groups.new(name=best)
        group.add([v.index], 1.0, "REPLACE")
        fixed += 1
    return fixed


COAT = (0.95, 0.94, 0.9, 1.0)
DORSAL = (0.84, 0.83, 0.81, 1.0)
STRIPE = (0.1, 0.09, 0.1, 1.0)
SCAR = (0.82, 0.66, 0.64, 1.0)
EYE_RIM = (0.06, 0.06, 0.08, 1.0)
IRIS = (0.52, 0.74, 0.88, 1.0)  # ice blue, as real white tigers have (DECISIONS D-026)
NOSE_PINK = (0.74, 0.5, 0.5, 1.0)

# Face strokes in front view (x, z), ray-cast onto the surface along +Y: (points, width, colour).
FRONT_STROKES = []
for sx in (-1, 1):
    FRONT_STROKES += [
        ([(sx * 0.045, 1.41), (sx * 0.11, 1.44), (sx * 0.175, 1.41)], 0.012, STRIPE),  # brow arch
        ([(0.0, 1.13), (sx * 0.045, 1.115), (sx * 0.09, 1.13)], 0.008, STRIPE),  # mouth corner
        ([(sx * 0.07, 1.33), (sx * 0.055, 1.29), (sx * 0.05, 1.25)], 0.008, STRIPE),  # tear line
    ]
FRONT_STROKES += [
    ([(-0.05, z), (0.0, z + 0.012), (0.05, z)], 0.01, STRIPE) for z in (1.46, 1.49, 1.52)  # forehead bars
]
FRONT_STROKES += [([(0.0, 1.18), (0.0, 1.13)], 0.008, STRIPE)]  # philtrum
FRONT_STROKES += [  # three old claw scars across the left brow and cheek ("silent and scarred")
    ([(-0.03 - k * 0.04, 1.51), (-0.10 - k * 0.04, 1.40), (-0.15 - k * 0.04, 1.27)], 0.009, SCAR) for k in range(3)
]
# Side strokes in side view (y, z), ray-cast from each flank toward the centre line.
SIDE_STROKES = [
    ([(-1.22, 1.28), (-1.12, 1.24), (-1.0, 1.25)], 0.012, STRIPE),  # cheek stripes
    ([(-1.2, 1.2), (-1.1, 1.16), (-0.98, 1.16)], 0.012, STRIPE),
    ([(-1.16, 1.12), (-1.06, 1.08), (-0.95, 1.09)], 0.011, STRIPE),
]
SHOULDER_SCAR = ([(-0.70, 1.39), (-0.55, 1.24), (-0.40, 1.07)], 0.011, SCAR)  # right flank only


def fur_material() -> bpy.types.Material:
    """Procedural white-tiger coat in object space, baked to the atlas: tapered, slanted, broken and forked body
    stripes; white chest and belly; stripes only on the outer side of the legs; tail rings and a dark tip; dark ear
    backs with white spots; ray-cast face strokes (brows, cheeks, forehead, mouth), scars, almond eyes and nose."""
    mat = bpy.data.materials.new("tokbelang_fur_proc")
    mat.use_nodes = True
    nt = mat.node_tree
    nodes, links = nt.nodes, nt.links
    for node in list(nodes):
        nodes.remove(node)
    out = nodes.new("ShaderNodeOutputMaterial")
    emit = nodes.new("ShaderNodeEmission")
    links.new(emit.outputs["Emission"], out.inputs["Surface"])
    coord = nodes.new("ShaderNodeTexCoord")
    pos = coord.outputs["Object"]
    sep = nodes.new("ShaderNodeSeparateXYZ")
    links.new(pos, sep.inputs["Vector"])
    X, Y, Z = sep.outputs["X"], sep.outputs["Y"], sep.outputs["Z"]

    def m(op, a=None, b=None, va=None, vb=None, c=None, vc=None):
        node = nodes.new("ShaderNodeMath")
        node.operation = op
        for index, (link, value) in enumerate(((a, va), (b, vb), (c, vc))):
            if link is not None:
                links.new(link, node.inputs[index])
            elif value is not None:
                node.inputs[index].default_value = value
        return node.outputs["Value"]

    def noise(scale, detail=2.0):
        node = nodes.new("ShaderNodeTexNoise")
        node.inputs["Scale"].default_value = scale
        node.inputs["Detail"].default_value = detail
        links.new(pos, node.inputs["Vector"])
        return node.outputs["Fac"]

    def mix(colour_in, factor, rgba):
        node = nodes.new("ShaderNodeMix")
        node.data_type = "RGBA"
        links.new(factor, node.inputs["Factor"])
        if isinstance(colour_in, tuple):
            node.inputs["A"].default_value = colour_in
        else:
            links.new(colour_in, node.inputs["A"])
        node.inputs["B"].default_value = rgba
        return node.outputs["Result"]

    def ellipse(centre, radii):
        """1 inside the ellipsoid around `centre` with half-axes `radii`."""
        rel = nodes.new("ShaderNodeVectorMath")
        rel.operation = "SUBTRACT"
        links.new(pos, rel.inputs[0])
        rel.inputs[1].default_value = centre
        scaled = nodes.new("ShaderNodeVectorMath")
        scaled.operation = "MULTIPLY"
        links.new(rel.outputs["Vector"], scaled.inputs[0])
        scaled.inputs[1].default_value = tuple(1.0 / r for r in radii)
        length = nodes.new("ShaderNodeVectorMath")
        length.operation = "LENGTH"
        links.new(scaled.outputs["Vector"], length.inputs[0])
        return m("LESS_THAN", length.outputs["Value"], vb=1.0)

    def stroke(points, width):
        """1 within `width` of the polyline through `points` (3D, on the surface)."""
        best = None
        for a, b in zip(points, points[1:]):
            a, b = Vector(a), Vector(b)
            ab = b - a
            if ab.length < 1e-5:
                continue
            rel = nodes.new("ShaderNodeVectorMath")
            rel.operation = "SUBTRACT"
            links.new(pos, rel.inputs[0])
            rel.inputs[1].default_value = a
            dot = nodes.new("ShaderNodeVectorMath")
            dot.operation = "DOT_PRODUCT"
            links.new(rel.outputs["Vector"], dot.inputs[0])
            dot.inputs[1].default_value = ab.normalized()
            clamp = nodes.new("ShaderNodeClamp")
            clamp.inputs["Max"].default_value = ab.length
            links.new(dot.outputs["Value"], clamp.inputs["Value"])
            nearest = nodes.new("ShaderNodeVectorMath")
            nearest.operation = "SCALE"
            nearest.inputs[0].default_value = ab.normalized()
            links.new(clamp.outputs["Result"], nearest.inputs["Scale"])
            dist = nodes.new("ShaderNodeVectorMath")
            dist.operation = "DISTANCE"
            links.new(rel.outputs["Vector"], dist.inputs[0])
            links.new(nearest.outputs["Vector"], dist.inputs[1])
            d = dist.outputs["Value"]
            best = d if best is None else m("MINIMUM", best, d)
        return m("LESS_THAN", best, vb=width) if best is not None else None

    warp = noise(3.2, 4.0)
    fine = noise(16.0)
    gaps = noise(6.0)
    # Body stripes: lines of constant 18y + 7z slant back toward the belly; thicker over the spine, thinner low on
    # the flanks; broken into segments by noise, with thin forked companions near the back.
    phase = m("MULTIPLY_ADD", warp, vb=3.5, c=m("MULTIPLY_ADD", Y, vb=18.0, c=m("MULTIPLY", Z, vb=7.0)))
    height = m("MULTIPLY", m("SUBTRACT", Z, vb=0.90), vb=1.0 / 0.65)
    height = m("MINIMUM", m("MAXIMUM", height, vb=0.0), vb=1.0)
    threshold = m("MULTIPLY_ADD", height, va=None, vb=-0.42, c=None, vc=0.92)
    band = m("SINE", phase)
    body = m("GREATER_THAN", band, threshold)
    body = m("MULTIPLY", body, m("GREATER_THAN", gaps, vb=0.33))
    fork = m("GREATER_THAN", m("SINE", m("MULTIPLY_ADD", fine, vb=1.8, c=m("ADD", phase, vb=1.7))), vb=0.965)
    fork = m("MULTIPLY", fork, m("GREATER_THAN", Z, vb=1.27))
    body = m("MAXIMUM", body, fork)
    body = m("MULTIPLY", body, m("GREATER_THAN", Z, vb=0.92))  # white belly
    body = m("MULTIPLY", body, m("GREATER_THAN", Y, vb=-0.95))  # face has its own markings
    chest_front = m("MULTIPLY", m("LESS_THAN", Y, vb=-0.72), m("LESS_THAN", Z, vb=1.14))
    body = m("MULTIPLY", body, m("SUBTRACT", va=1.0, b=chest_front))  # white chest and throat
    leg = m("MULTIPLY", m("GREATER_THAN", m("ABSOLUTE", X), vb=0.12), m("LESS_THAN", Z, vb=0.80))
    body = m("MULTIPLY", body, m("SUBTRACT", va=1.0, b=leg))
    # Legs: a few stripes on the outer half only (|x| beyond the leg's centre line), none on the paws.
    rings = m("GREATER_THAN", m("SINE", m("MULTIPLY_ADD", warp, vb=2.5, c=m("MULTIPLY", Z, vb=20.0))), vb=0.72)
    outer = m("GREATER_THAN", m("ABSOLUTE", X), vb=0.25)
    legs = m("MULTIPLY", m("MULTIPLY", rings, leg), m("MULTIPLY", outer, m("GREATER_THAN", Z, vb=0.24)))
    # Tail rings and a dark tip.
    tail = m("GREATER_THAN", Y, vb=0.98)
    tail_rings = m("MULTIPLY", tail, m("GREATER_THAN", m("SINE", m("MULTIPLY_ADD", warp, vb=1.5, c=m("MULTIPLY", Y, vb=14.0))), vb=0.35))
    tail_tip = m("GREATER_THAN", Y, vb=2.18)
    dark = m("MAXIMUM", m("MAXIMUM", body, legs), m("MAXIMUM", tail_rings, tail_tip))
    # Ear backs dark, each with a white spot.
    ear_back = m("MULTIPLY", m("GREATER_THAN", Z, vb=1.47), m("GREATER_THAN", Y, vb=-0.965))
    ear_back = m("MULTIPLY", ear_back, m("GREATER_THAN", m("ABSOLUTE", X), vb=0.1))
    dark = m("MAXIMUM", dark, ear_back)

    colour = mix(COAT, m("MULTIPLY", m("GREATER_THAN", Z, vb=1.39), vb=0.3), DORSAL)  # soft dorsal shading
    colour = mix(colour, dark, STRIPE)
    for sx in (-1, 1):
        colour = mix(colour, ellipse((sx * 0.2, -0.925, 1.56), (0.035, 0.03, 0.035)), COAT)
    for points, width, rgba in STROKES:
        mask = stroke(points, width)
        if mask is not None:
            colour = mix(colour, mask, rgba)
    for eye in EYES:
        colour = mix(colour, ellipse(eye, (0.06, 0.04, 0.034)), EYE_RIM)
        colour = mix(colour, ellipse(eye, (0.045, 0.034, 0.026)), IRIS)
        colour = mix(colour, ellipse(eye, (0.014, 0.034, 0.016)), (0.03, 0.03, 0.04, 1.0))
    # Broad inverted-triangle nose: a wide upper lobe over a narrower lower one, outlined dark.
    nose = Vector(NOSE)
    upper, lower = nose + Vector((0, -0.004, 0.012)), nose + Vector((0, -0.006, -0.014))
    outline = m("MAXIMUM", ellipse(tuple(upper), (0.07, 0.05, 0.034)), ellipse(tuple(lower), (0.036, 0.05, 0.03)))
    fill = m("MAXIMUM", ellipse(tuple(upper), (0.06, 0.05, 0.026)), ellipse(tuple(lower), (0.028, 0.05, 0.023)))
    colour = mix(colour, outline, STRIPE)
    colour = mix(colour, fill, NOSE_PINK)
    links.new(colour, emit.inputs["Color"])
    return mat


def _surface(body, origin, direction):
    ok, location, _normal, _index = body.ray_cast(Vector(origin), Vector(direction))
    return tuple(location) if ok else None


def place_face_features(body) -> None:
    """Ray-casts eyes, nose and every face/flank stroke onto the real surface so markings follow the sculpt."""
    global EYES, NOSE
    eyes = []
    for x, z in EYE_XZ:
        hit = _surface(body, (x, -3.0, z), (0, 1, 0))
        if hit is None:
            raise RuntimeError("Eye ray missed the head")
        eyes.append(tuple(Vector(hit) + Vector((0, 0.01, 0))))
    nose = _surface(body, (NOSE_XZ[0], -3.0, NOSE_XZ[1]), (0, 1, 0))
    if nose is None:
        raise RuntimeError("Nose ray missed the muzzle")
    EYES, NOSE = eyes, nose
    STROKES.clear()
    missed = 0
    for points, width, rgba in FRONT_STROKES:
        hits = [_surface(body, (x, -3.0, z), (0, 1, 0)) for x, z in points]
        missed += hits.count(None)
        hits = [h for h in hits if h]
        if len(hits) >= 2:
            STROKES.append((hits, width, rgba))
    for sx in (-1, 1):
        flank = SIDE_STROKES + ([SHOULDER_SCAR] if sx > 0 else [])
        for points, width, rgba in flank:
            hits = [_surface(body, (sx * 3.0, y, z), (-sx, 0, 0)) for y, z in points]
            missed += hits.count(None)
            hits = [h for h in hits if h]
            if len(hits) >= 2:
                STROKES.append((hits, width, rgba))
    print(f"HK_FACE eyes={[tuple(round(c, 3) for c in e) for e in EYES]} nose={tuple(round(c, 3) for c in NOSE)} "
          f"strokes={len(STROKES)} missed_points={missed}")


def bake_fur(body, size: int = 1024) -> None:
    place_face_features(body)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.select_all(action="DESELECT")
    body.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.008)
    bpy.ops.object.mode_set(mode="OBJECT")
    proc = fur_material()
    image = bpy.data.images.new("tokbelang_fur", width=size, height=size, alpha=False)
    tex = proc.node_tree.nodes.new("ShaderNodeTexImage")
    tex.image = image
    proc.node_tree.nodes.active = tex
    body.data.materials.clear()
    body.data.materials.append(proc)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 4
    scene.render.bake.target = "IMAGE_TEXTURES"
    scene.render.bake.margin = 8
    bpy.ops.object.bake(type="EMIT")
    image.pack()
    body.data.materials.clear()
    body.data.materials.append(hk.textured_material("tokbelang_fur", image, roughness=0.85))


def main() -> None:
    args = hk.cli_args()
    out_dir = os.path.abspath(args.get("out", os.path.join(hk.REPO_DIR, "build-cache", "raw")))
    preview_dir = args.get("previews")
    hk.reset_scene(seed=1977)
    coll = hk.collection("tokbelang")
    body = sculpt_body(coll)
    dec = body.modifiers.new("budget", "DECIMATE")
    triangles = sum(len(p.vertices) - 2 for p in body.data.polygons)
    dec.ratio = min(1.0, 10500 / max(triangles, 1))
    apply_modifiers(body)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.shade_smooth()
    bake_fur(body)
    rig = build_armature(coll)
    bpy.ops.object.select_all(action="DESELECT")
    body.select_set(True)
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")
    fixed = bind_unweighted(body, rig)
    lod = hk.add_lod(body, 0.36)
    lod.parent = rig
    mod = lod.modifiers.new("rig", "ARMATURE")
    mod.object = rig
    for obj in (body, lod):
        hk.set_extras(obj, hk_character="tokbelang")
    rig["hk_rig"] = "quadruped_tiger"
    tris = sum(len(p.vertices) - 2 for p in body.data.polygons)
    lod_tris = sum(len(p.vertices) - 2 for p in lod.data.polygons)
    dims = tuple(round(d, 2) for d in body.dimensions)
    print(f"HK_TIGER triangles={tris} lod1={lod_tris} bones={len(rig.data.bones)} rebound={fixed} dims={dims}")
    hk.export_glb(os.path.join(out_dir, "tokbelang.glb"), [rig])
    if preview_dir:
        lod.hide_render = True
        base = os.path.abspath(preview_dir)
        # The tiger faces −Y: azimuth 0 looks at the face, 90 at the left side.
        hk.render_preview(os.path.join(base, "tokbelang_side.png"), [body], azimuth_deg=90, elevation_deg=6)
        hk.render_preview(os.path.join(base, "tokbelang_front.png"), [body], azimuth_deg=-35, elevation_deg=14)
        hk.render_preview(os.path.join(base, "tokbelang_face.png"), [body], size=(640, 640), azimuth_deg=0, elevation_deg=4)


main()

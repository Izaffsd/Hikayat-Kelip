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
from mathutils import Vector  # noqa: E402

from lib import hk  # noqa: E402

# Joints: name -> (position, visible radius). x right, y back (tail side), z up.
J = {
    "hips": ((0.0, 0.70, 1.06), 0.30),
    "spine1": ((0.0, 0.32, 1.10), 0.32),
    "spine2": ((0.0, -0.08, 1.14), 0.35),
    "chest": ((0.0, -0.46, 1.14), 0.38),
    "neck": ((0.0, -0.80, 1.30), 0.27),
    "head": ((0.0, -1.06, 1.44), 0.26),
    "muzzle": ((0.0, -1.36, 1.34), 0.17),
    "tail1": ((0.0, 0.98, 1.06), 0.09),
    "tail2": ((0.0, 1.28, 0.96), 0.085),
    "tail3": ((0.0, 1.58, 0.84), 0.08),
    "tail4": ((0.0, 1.86, 0.76), 0.072),
    "tail5": ((0.0, 2.12, 0.76), 0.065),
    "tail6": ((0.0, 2.36, 0.86), 0.06),
}
for side, sx in (("l", -1), ("r", 1)):
    J.update(
        {
            f"shoulder_{side}": ((sx * 0.22, -0.50, 0.98), 0.19),
            f"elbow_{side}": ((sx * 0.23, -0.44, 0.60), 0.13),
            f"wrist_{side}": ((sx * 0.22, -0.50, 0.16), 0.09),
            f"paw_{side}": ((sx * 0.22, -0.63, 0.075), 0.11),
            f"hip_{side}": ((sx * 0.22, 0.66, 0.98), 0.21),
            f"knee_{side}": ((sx * 0.23, 0.40, 0.58), 0.13),
            f"hock_{side}": ((sx * 0.22, 0.80, 0.28), 0.075),
            f"hindpaw_{side}": ((sx * 0.22, 0.66, 0.075), 0.10),
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

# Extra head/face masses: (centre, half-sizes x/y/z).
HEAD_PARTS = [
    ((0.0, -1.04, 1.46), (0.27, 0.25, 0.23)),  # skull
    ((0.0, -1.33, 1.33), (0.17, 0.15, 0.12)),  # muzzle
    ((0.0, -1.47, 1.37), (0.08, 0.05, 0.055)),  # nose bridge tip
    ((0.0, -1.27, 1.21), (0.13, 0.13, 0.07)),  # chin / jaw
    ((-0.2, -1.04, 1.30), (0.15, 0.12, 0.14)),  # cheek ruff L
    ((0.2, -1.04, 1.30), (0.15, 0.12, 0.14)),  # cheek ruff R
    ((-0.19, -0.98, 1.70), (0.08, 0.045, 0.09)),  # ear L
    ((0.19, -0.98, 1.70), (0.08, 0.045, 0.09)),  # ear R
    ((0.0, -0.5, 1.02), (0.3, 0.3, 0.34)),  # chest depth (keel)
    ((0.0, 0.35, 1.0), (0.26, 0.3, 0.24)),  # belly
]
EYES = [(-0.115, -1.255, 1.5), (0.115, -1.255, 1.5)]
NOSE = (0.0, -1.5, 1.37)
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
    for centre, size in HEAD_PARTS:
        el = mb.elements.new(type="ELLIPSOID")
        el.co = centre
        el.radius = 1.0
        el.size_x, el.size_y, el.size_z = (s * MB_SCALE for s in size)
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
        ear.head, ear.tail = Vector((sx * 0.17, -0.98, 1.6)), Vector((sx * 0.2, -0.98, 1.8))
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


def fur_material() -> bpy.types.Material:
    """Procedural tiger fur in object space: stripes, belly fade, leg rings, tail tip, ear backs, eyes, nose, scars."""
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

    def math_node(op, a=None, b=None, va=None, vb=None):
        node = nodes.new("ShaderNodeMath")
        node.operation = op
        if a is not None:
            links.new(a, node.inputs[0])
        elif va is not None:
            node.inputs[0].default_value = va
        if b is not None:
            links.new(b, node.inputs[1])
        elif vb is not None:
            node.inputs[1].default_value = vb
        return node.outputs["Value"]

    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 4.0
    noise.inputs["Detail"].default_value = 4.0
    links.new(pos, noise.inputs["Vector"])
    fine = nodes.new("ShaderNodeTexNoise")
    fine.inputs["Scale"].default_value = 18.0
    links.new(pos, fine.inputs["Vector"])

    # Body stripes: bands across the spine (along y), warped by noise; thickness varies with fine noise.
    warp = nodes.new("ShaderNodeMath")
    warp.operation = "MULTIPLY_ADD"
    links.new(noise.outputs["Fac"], warp.inputs[0])
    warp.inputs[1].default_value = 4.2
    links.new(math_node("MULTIPLY", sep.outputs["Y"], vb=21.0), warp.inputs[2])
    band = math_node("SINE", warp.outputs["Value"])
    thickness = math_node("MULTIPLY_ADD", fine.outputs["Fac"], None, vb=0.3)
    thick_node = thickness.node
    thick_node.inputs[2].default_value = 0.55
    body_dark = math_node("GREATER_THAN", band, thickness)
    # Break stripes into irregular segments with gaps, as on a real coat.
    gaps = nodes.new("ShaderNodeTexNoise")
    gaps.inputs["Scale"].default_value = 7.0
    links.new(pos, gaps.inputs["Vector"])
    body_dark = math_node("MULTIPLY", body_dark, math_node("GREATER_THAN", gaps.outputs["Fac"], vb=0.36))

    # Stripes fade toward the belly: keep only above z ≈ 0.92 on the torso.
    belly_keep = math_node("GREATER_THAN", sep.outputs["Z"], vb=0.92)
    body_dark = math_node("MULTIPLY", body_dark, belly_keep)
    # The face (in front of the ears) keeps a white muzzle: body stripes stop at y = −0.98.
    body_dark = math_node("MULTIPLY", body_dark, math_node("GREATER_THAN", sep.outputs["Y"], vb=-0.98))

    # Leg rings below the body (|x| > 0.12 and z < 0.75).
    leg_zone = math_node(
        "MULTIPLY",
        math_node("GREATER_THAN", math_node("ABSOLUTE", sep.outputs["X"]), vb=0.12),
        math_node("LESS_THAN", sep.outputs["Z"], vb=0.75),
    )
    leg_warp = nodes.new("ShaderNodeMath")
    leg_warp.operation = "MULTIPLY_ADD"
    links.new(noise.outputs["Fac"], leg_warp.inputs[0])
    leg_warp.inputs[1].default_value = 2.5
    links.new(math_node("MULTIPLY", sep.outputs["Z"], vb=23.0), leg_warp.inputs[2])
    leg_dark = math_node("MULTIPLY", math_node("GREATER_THAN", math_node("SINE", leg_warp.outputs["Value"]), vb=0.62), leg_zone)
    leg_dark = math_node("MULTIPLY", leg_dark, math_node("GREATER_THAN", sep.outputs["Z"], vb=0.2))

    # Tail rings and dark tip (tail is y > 1.0).
    tail_zone = math_node("GREATER_THAN", sep.outputs["Y"], vb=1.0)
    tail_tip = math_node("GREATER_THAN", sep.outputs["Y"], vb=2.2)

    dark = math_node("MAXIMUM", math_node("MULTIPLY", body_dark, math_node("SUBTRACT", None, leg_zone, va=1.0)), leg_dark)
    dark = math_node("MAXIMUM", dark, tail_tip)
    dark = math_node("MAXIMUM", dark, math_node("MULTIPLY", body_dark, tail_zone))

    # Ear backs dark (z > 1.66, y > −1.0).
    ear_back = math_node("MULTIPLY", math_node("GREATER_THAN", sep.outputs["Z"], vb=1.66), math_node("GREATER_THAN", sep.outputs["Y"], vb=-1.0))
    dark = math_node("MAXIMUM", dark, ear_back)

    # Face markings: thin vertical lines on the forehead, swept stripes on the cheeks.
    forehead_zone = math_node(
        "MULTIPLY",
        math_node("MULTIPLY", math_node("GREATER_THAN", sep.outputs["Z"], vb=1.55), math_node("LESS_THAN", sep.outputs["Y"], vb=-0.98)),
        math_node("LESS_THAN", math_node("ABSOLUTE", sep.outputs["X"]), vb=0.16),
    )
    fore_warp = nodes.new("ShaderNodeMath")
    fore_warp.operation = "MULTIPLY_ADD"
    links.new(noise.outputs["Fac"], fore_warp.inputs[0])
    fore_warp.inputs[1].default_value = 1.5
    links.new(math_node("MULTIPLY", sep.outputs["X"], vb=60.0), fore_warp.inputs[2])
    forehead = math_node("MULTIPLY", math_node("GREATER_THAN", math_node("SINE", fore_warp.outputs["Value"]), vb=0.7), forehead_zone)
    cheek_zone = math_node(
        "MULTIPLY",
        math_node("MULTIPLY", math_node("GREATER_THAN", math_node("ABSOLUTE", sep.outputs["X"]), vb=0.17), math_node("LESS_THAN", sep.outputs["Y"], vb=-0.9)),
        math_node("GREATER_THAN", sep.outputs["Z"], vb=1.18),
    )
    cheek_warp = nodes.new("ShaderNodeMath")
    cheek_warp.operation = "MULTIPLY_ADD"
    links.new(sep.outputs["Y"], cheek_warp.inputs[0])
    cheek_warp.inputs[1].default_value = 18.0
    links.new(math_node("MULTIPLY", sep.outputs["Z"], vb=34.0), cheek_warp.inputs[2])
    cheeks = math_node("MULTIPLY", math_node("GREATER_THAN", math_node("SINE", cheek_warp.outputs["Value"]), vb=0.72), cheek_zone)
    dark = math_node("MAXIMUM", dark, math_node("MAXIMUM", forehead, cheeks))

    base = nodes.new("ShaderNodeMix")
    base.data_type = "RGBA"
    links.new(dark, base.inputs["Factor"])
    base.inputs["A"].default_value = (0.94, 0.93, 0.9, 1.0)
    base.inputs["B"].default_value = (0.12, 0.13, 0.17, 1.0)
    colour = base.outputs["Result"]

    def spot(colour_in, centre, radius, rgba):
        delta = nodes.new("ShaderNodeVectorMath")
        delta.operation = "DISTANCE"
        links.new(pos, delta.inputs[0])
        delta.inputs[1].default_value = centre
        inside = math_node("LESS_THAN", delta.outputs["Value"], vb=radius)
        mix = nodes.new("ShaderNodeMix")
        mix.data_type = "RGBA"
        links.new(inside, mix.inputs["Factor"])
        links.new(colour_in, mix.inputs["A"])
        mix.inputs["B"].default_value = rgba
        return mix.outputs["Result"]

    for eye in EYES:
        colour = spot(colour, eye, 0.058, (0.08, 0.08, 0.1, 1.0))  # dark eye rim
        colour = spot(colour, eye, 0.045, (0.91, 0.58, 0.18, 1.0))  # amber iris
        colour = spot(colour, eye, 0.016, (0.04, 0.04, 0.05, 1.0))  # pupil
    colour = spot(colour, NOSE, 0.055, (0.55, 0.38, 0.38, 1.0))

    # Scars: three pale slashes over the left eye, one across the right shoulder.
    for start, end in (
        ((-0.06, -1.24, 1.66), (-0.16, -1.33, 1.42)),
        ((-0.11, -1.2, 1.67), (-0.21, -1.29, 1.43)),
        ((-0.16, -1.16, 1.66), (-0.25, -1.24, 1.44)),
        ((0.3, -0.75, 1.32), (0.36, -0.35, 0.98)),
    ):
        a, b = Vector(start), Vector(end)
        ab = b - a
        rel = nodes.new("ShaderNodeVectorMath")
        rel.operation = "SUBTRACT"
        links.new(pos, rel.inputs[0])
        rel.inputs[1].default_value = a
        proj = nodes.new("ShaderNodeVectorMath")
        proj.operation = "DOT_PRODUCT"
        links.new(rel.outputs["Vector"], proj.inputs[0])
        proj.inputs[1].default_value = ab.normalized()
        clamp = nodes.new("ShaderNodeClamp")
        clamp.inputs["Max"].default_value = ab.length
        links.new(proj.outputs["Value"], clamp.inputs["Value"])
        nearest = nodes.new("ShaderNodeVectorMath")
        nearest.operation = "SCALE"
        nearest.inputs[0].default_value = ab.normalized()
        links.new(clamp.outputs["Result"], nearest.inputs["Scale"])
        diff = nodes.new("ShaderNodeVectorMath")
        diff.operation = "DISTANCE"
        links.new(rel.outputs["Vector"], diff.inputs[0])
        links.new(nearest.outputs["Vector"], diff.inputs[1])
        scar = math_node("LESS_THAN", diff.outputs["Value"], vb=0.011)
        mix = nodes.new("ShaderNodeMix")
        mix.data_type = "RGBA"
        links.new(scar, mix.inputs["Factor"])
        links.new(colour, mix.inputs["A"])
        mix.inputs["B"].default_value = (0.8, 0.64, 0.62, 1.0)
        colour = mix.outputs["Result"]
    links.new(colour, emit.inputs["Color"])
    return mat


def place_face_features(body) -> None:
    """Finds the real face surface by casting rays from the front, so eyes and nose are painted on the skin."""
    global EYES, NOSE
    eyes = []
    for sx in (-1, 1):
        ok, location, _normal, _index = body.ray_cast(Vector((sx * 0.115, -3.0, 1.52)), Vector((0, 1, 0)))
        if not ok:
            raise RuntimeError("Eye ray missed the head")
        eyes.append(tuple(location + Vector((0, 0.01, 0))))
    ok, location, _normal, _index = body.ray_cast(Vector((0.0, -3.0, 1.38)), Vector((0, 1, 0)))
    if not ok:
        raise RuntimeError("Nose ray missed the muzzle")
    EYES = eyes
    NOSE = tuple(location)
    print(f"HK_FACE eyes={[tuple(round(c, 3) for c in e) for e in EYES]} nose={tuple(round(c, 3) for c in NOSE)}")


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

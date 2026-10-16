"""Kelip (the last firefly spirit) and the shadow wisp (Kelam's ink creature) — docs/ASSETS.md §3.

Both are small, static meshes animated in code: a custom vertex attribute `_sway` (0 at the body, 1 at tips) lets
TSL shaders move wings and tendrils without bones. Kelam reads as ink, never gore (CULTURE.md §1).
Faces −Y in Blender (= +Z in three.js). Exports kelip.glb and wisp.glb.

Usage: blender --background --factory-startup --python tools/blender/characters/spirits.py -- --out <dir> [--previews <dir>]
"""

from __future__ import annotations

import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import bmesh  # noqa: E402
import bpy  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Vector  # noqa: E402

from lib import hk  # noqa: E402


def set_sway(obj, values) -> None:
    """Stores per-vertex sway weights as a float attribute exported as `_sway`."""
    attr = obj.data.attributes.new("_sway", "FLOAT", "POINT")
    attr.data.foreach_set("value", values)


def metaball_mesh(name, elements, coll, resolution=0.012) -> bpy.types.Object:
    mb = bpy.data.metaballs.new(name + "_mb")
    mb.resolution = resolution
    mb.render_resolution = resolution
    mb.threshold = 0.6
    obj = bpy.data.objects.new(name + "_mb", mb)
    coll.objects.link(obj)
    for kind, centre, size in elements:
        el = mb.elements.new(type=kind)
        el.co = centre
        if kind == "BALL":
            el.radius = size
        else:
            el.radius = 1.0
            el.size_x, el.size_y, el.size_z = size
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.ops.object.convert(target="MESH")
    mesh_obj = bpy.context.view_layer.objects.active
    mesh_obj.name = name
    mesh_obj.data.name = name
    return mesh_obj


def wing_texture(size=256):
    """Translucent veined wing: pale edge, faint veins, soft alpha."""
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32) / size
    u, v = xx - 0.5, yy - 0.5
    shape = (u / 0.48) ** 2 + (v / 0.42) ** 2
    alpha = np.clip((1 - shape) * 6, 0, 1) * 0.55
    veins = (np.abs(np.sin((u * 3 + v * 9) * 6)) < 0.08) | (np.abs(np.sin(np.arctan2(v, u + 0.5) * 9)) < 0.06)
    rgb = np.ones((size, size, 3), dtype=np.float32) * np.array([0.86, 0.95, 0.78])
    rgb[veins] *= 0.7
    alpha[veins & (shape < 1)] = np.minimum(alpha[veins & (shape < 1)] + 0.25, 0.9)
    edge = (shape > 0.82) & (shape < 1.0)
    alpha[edge] = 0.85
    out = np.ones((size, size, 4), dtype=np.float32)
    out[..., :3] = rgb
    out[..., 3] = alpha
    return out


def build_kelip(coll):
    body = metaball_mesh(
        "kelip",
        [
            ("ELLIPSOID", (0, -0.075, 0.0), (0.03, 0.032, 0.03)),  # head
            ("ELLIPSOID", (0, -0.03, 0.005), (0.034, 0.04, 0.032)),  # thorax
            ("ELLIPSOID", (0, 0.05, -0.008), (0.042, 0.07, 0.038)),  # glowing abdomen
            ("ELLIPSOID", (0, 0.11, -0.016), (0.03, 0.03, 0.028)),
        ],
        coll,
        resolution=0.005,  # fine enough that the 7 cm lantern has a smooth silhouette
    )
    dec = body.modifiers.new("budget", "DECIMATE")
    dec.ratio = min(1.0, 900 / max(1, sum(len(p.vertices) - 2 for p in body.data.polygons)))
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.modifier_apply(modifier=dec.name)
    # Glow material on the abdomen (y > 0.0), dark body elsewhere.
    body_mat = hk.textured_material("kelip_body", hk.image_from_array("kelip_body", np.full((8, 8, 4), (0.16, 0.14, 0.12, 1.0), np.float32)), 0.5)
    glow = hk.emissive_material("kelip_glow", (0.62, 1.0, 0.25), 5.0)
    body.data.materials.append(body_mat)
    body.data.materials.append(glow)
    for poly in body.data.polygons:
        poly.material_index = 1 if poly.center.y > 0.012 else 0
    # Antennae: curved forward and out, ending in small clubs. Eyes: two dark beads at the front of the head.
    # Pronotum: the warm shield real fireflies carry over the head, which gives Kelip a recognisable face.
    bm = bmesh.new()
    for sx in (-1, 1):
        points = [Vector((sx * (0.01 + 0.03 * t * t), -0.095 - 0.05 * t, 0.018 + 0.05 * t - 0.018 * t * t)) for t in (0, 0.25, 0.5, 0.75, 1.0)]
        hk.add_tube(bm, points, [0.0032, 0.0028, 0.0024, 0.002, 0.0018], segments=5)
        club = bmesh.ops.create_uvsphere(bm, u_segments=6, v_segments=4, radius=0.0045)
        for v in club["verts"]:
            v.co += points[-1]
        eye = bmesh.ops.create_uvsphere(bm, u_segments=8, v_segments=6, radius=0.009)
        for v in eye["verts"]:
            v.co += Vector((sx * 0.019, -0.097, 0.002))
    ant = hk.object_from_bmesh("kelip_antennae", bm, coll)
    ant.data.materials.append(body_mat)
    shield_mat = hk.textured_material(
        "kelip_shield", hk.image_from_array("kelip_shield", np.full((8, 8, 4), (0.86, 0.46, 0.26, 1.0), np.float32)), 0.45
    )
    bm = bmesh.new()
    shield = bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=8, radius=1.0)
    for v in shield["verts"]:
        v.co = Vector((v.co.x * 0.036, v.co.y * 0.03 - 0.07, v.co.z * 0.012 + 0.026))
    shield_obj = hk.object_from_bmesh("kelip_shield", bm, coll)
    shield_obj.data.materials.append(shield_mat)
    # Wings: two pairs of quads, alpha texture, double sided.
    wing_img = hk.image_from_array("kelip_wing", wing_texture(), alpha=True)
    wing_mat = hk.textured_material("kelip_wing", wing_img, 0.4, alpha_clip=False)
    wing_mat.use_backface_culling = False
    tex = next(n for n in wing_mat.node_tree.nodes if n.type == "TEX_IMAGE")
    bsdf = wing_mat.node_tree.nodes.get("Principled BSDF")
    wing_mat.node_tree.links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    sway = []
    for sx in (-1, 1):
        # Rounded forewings and slightly smaller hindwings raised in a V; nothing trails past the abdomen.
        for y, length, lift, back, w in ((-0.035, 0.11, 0.045, 0.025, 0.062), (-0.01, 0.095, 0.025, 0.055, 0.05)):
            root = Vector((sx * 0.018, y, 0.03))
            tip = Vector((sx * (0.018 + length), y + back, 0.03 + lift))
            width = Vector((0, w, 0))
            corners = [root - width * 0.5, tip - width * 0.5, tip + width * 0.5, root + width * 0.5]
            verts = [bm.verts.new(tuple(c)) for c in corners]
            face = bm.faces.new(verts)
            for loop, coord in zip(face.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
                loop[uv].uv = coord
    wings = hk.object_from_bmesh("kelip_wings", bm, coll)
    wings.data.materials.append(wing_mat)
    for v in wings.data.vertices:
        sway.append(min(1.0, abs(v.co.x) / 0.14))
    set_sway(wings, sway)
    set_sway(body, [0.0] * len(body.data.vertices))
    set_sway(ant, [min(1.0, max(0.0, (v.co.z - 0.02) / 0.04)) for v in ant.data.vertices])
    set_sway(shield_obj, [0.0] * len(shield_obj.data.vertices))
    for part in (ant, wings, shield_obj):
        part.parent = body
    for obj in (body, ant, shield_obj):
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.ops.object.shade_smooth()
    hk.set_extras(body, hk_character="kelip", hk_light="kelip")
    return body


def build_wisp(coll, seed=7):
    rng = random.Random(seed)
    body = metaball_mesh(
        "wisp",
        [
            ("ELLIPSOID", (0, 0, 0), (0.22, 0.24, 0.26)),
            ("ELLIPSOID", (0, 0.08, 0.16), (0.14, 0.14, 0.14)),
            ("ELLIPSOID", (0, 0.2, -0.06), (0.12, 0.18, 0.1)),
        ],
        coll,
        resolution=0.03,
    )
    ink = hk.textured_material("wisp_ink", hk.image_from_array("wisp_ink", np.full((8, 8, 4), (0.05, 0.04, 0.08, 1.0), np.float32)), 0.92)
    eyes = hk.emissive_material("wisp_eyes", (0.62, 0.52, 0.95), 2.5)
    body.data.materials.append(ink)
    # Two faint violet lights sit on the body surface (found by raycast), so nothing floats.
    bm = bmesh.new()
    for sx in (-1, 1):
        ok, location, _normal, _index = body.ray_cast(Vector((sx * 0.07, -1.0, 0.07)), Vector((0, 1, 0)))
        if not ok:
            raise RuntimeError("Wisp eye ray missed the body")
        result = bmesh.ops.create_uvsphere(bm, u_segments=8, v_segments=6, radius=0.026)
        for v in result["verts"]:
            v.co += location + Vector((0, 0.012, 0))
    eye_obj = hk.object_from_bmesh("wisp_eyes", bm, coll)
    eye_obj.data.materials.append(eyes)
    # Tendrils trailing behind (+Y) and below: one continuous tapering tube each.
    bm = bmesh.new()
    tendril_sway = []
    for t in range(7):
        angle = t / 7 * math.tau + rng.uniform(-0.3, 0.3)
        start = Vector((math.cos(angle) * 0.1, 0.1, math.sin(angle) * 0.1 - 0.04))
        direction = Vector((math.cos(angle) * 0.35, 1.0, math.sin(angle) * 0.35 - 0.4)).normalized()
        length = rng.uniform(0.45, 0.8)
        steps = 9
        points, radii = [], []
        for s in range(steps + 1):
            f = s / steps
            curl = Vector((math.sin(f * 3 + t) * 0.06, 0, math.cos(f * 2.5 + t) * 0.05))
            points.append(start + direction * length * f + curl * f)
            radii.append(0.05 * (1 - f) ** 1.2 + 0.003)
        hk.add_tube(bm, points, radii, segments=7)
    tendrils = hk.object_from_bmesh("wisp_tendrils", bm, coll)
    tendrils.data.materials.append(ink)
    for v in tendrils.data.vertices:
        tendril_sway.append(min(1.0, max(0.0, (v.co.y - 0.1) / 0.7)))
    set_sway(tendrils, tendril_sway)
    set_sway(body, [0.0] * len(body.data.vertices))
    set_sway(eye_obj, [0.0] * len(eye_obj.data.vertices))
    for part in (eye_obj, tendrils):
        part.parent = body
    for obj in (body, eye_obj, tendrils):
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.ops.object.shade_smooth()
    hk.set_extras(body, hk_character="wisp", hk_material="kelam")
    return body


def export_with_attributes(path, root):
    bpy.ops.object.select_all(action="DESELECT")
    root.select_set(True)
    for child in root.children_recursive:
        child.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_extras=True,
        export_attributes=True,
        export_vertex_color="NONE",
        export_materials="EXPORT",
        export_apply=True,
    )
    print(f"HK_EXPORT {path}")


def main():
    args = hk.cli_args()
    out_dir = os.path.abspath(args.get("out", os.path.join(hk.REPO_DIR, "build-cache", "raw")))
    preview_dir = args.get("previews")
    hk.reset_scene(seed=5)
    coll = hk.collection("spirits")
    kelip = build_kelip(coll)
    wisp = build_wisp(coll)
    wisp.location = (0, 0, 0)
    for obj, name in ((kelip, "kelip"), (wisp, "wisp")):
        tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in [obj, *obj.children] if o.type == "MESH")
        print(f"HK_SPIRIT {name} triangles={tris}")
        export_with_attributes(os.path.join(out_dir, f"{name}.glb"), obj)
    if preview_dir:
        base = os.path.abspath(preview_dir)
        wisp.hide_render = True
        for child in wisp.children:
            child.hide_render = True
        hk.render_preview(os.path.join(base, "kelip.png"), [kelip, *kelip.children], size=(640, 480), azimuth_deg=-40, elevation_deg=25)
        wisp.hide_render = False
        for child in wisp.children:
            child.hide_render = False
        kelip.hide_render = True
        for child in kelip.children:
            child.hide_render = True
        hk.render_preview(os.path.join(base, "wisp.png"), [wisp, *wisp.children], size=(640, 480), azimuth_deg=-60, elevation_deg=15)


main()

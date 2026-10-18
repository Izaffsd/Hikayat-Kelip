"""Vertical-slice props (docs/ASSETS.md §5): Tok Wan's tongkat, the wau bulan glider, the hikayat book (closed,
open, torn page), the Pelita Air, and the P0 collectibles (peti, lore scroll, paper scrap).

Every prop is a root node with `hk_prop` extras (and attach points, light offsets or hinge pivots where the runtime
needs them). Z up, metres, built at the origin. Exports build-cache/raw/props_slice.glb and preview renders.

Usage: blender --background --factory-startup --python tools/blender/props/slice_props.py -- --out <dir> [--previews <dir>]
"""

from __future__ import annotations

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import bmesh  # noqa: E402
import bpy  # noqa: E402
from mathutils import Vector, geometry  # noqa: E402

from lib import hk, kit, textures  # noqa: E402
from lib.kit import MATERIALS, Piece  # noqa: E402
from lib.wau import WAU_OUTLINE, wau_uv  # noqa: E402


def build_materials() -> None:
    MATERIALS["dark_wood"] = hk.textured_material(
        "props_dark_wood", hk.image_from_array("props_dark_wood", textures.wood_planks(seed=91, planks=1, base="#4a2e1f", aged=0.12))
    )
    MATERIALS["bamboo"] = hk.textured_material(
        "props_bamboo", hk.image_from_array("props_bamboo", textures.wood_planks(seed=92, planks=1, base="#c9a86a", aged=0.25))
    )
    MATERIALS["beam"] = hk.textured_material(
        "props_beam", hk.image_from_array("props_beam", textures.wood_planks(seed=12, planks=2, base="#5a3f2b", aged=0.5))
    )
    MATERIALS["leather"] = hk.textured_material(
        "props_leather", hk.image_from_array("props_leather", textures.wood_planks(seed=93, planks=1, base="#5a3222", aged=0.1))
    )
    MATERIALS["cloth_red"] = hk.textured_material(
        "props_cloth_red", hk.image_from_array("props_cloth_red", textures.weave(seed=82, strips=6, base="#8a2e3a"))
    )
    MATERIALS["clay"] = hk.textured_material(
        "props_clay", hk.image_from_array("props_clay", textures.wood_planks(seed=71, planks=1, base="#9a5a3a", aged=0.2))
    )
    page_edge = hk.textured_material(
        "props_page_edge", hk.image_from_array("props_page_edge", textures.paper(size=128, seed=103, ink=False))
    )
    MATERIALS["page_edge"] = page_edge
    for key, seed, torn in (("page", 101, False), ("page_torn", 102, True)):
        mat = hk.textured_material(
            f"props_{key}", hk.image_from_array(f"props_{key}", textures.paper(seed=seed, torn=torn), alpha=torn),
            alpha_clip=torn,
        )
        mat.use_backface_culling = False
        MATERIALS[key] = mat
    skin = hk.textured_material(
        "props_wau_skin", hk.image_from_array("props_wau_skin", textures.wau_skin([wau_uv(x, z) for x, z in WAU_OUTLINE]))
    )
    skin.use_backface_culling = False
    MATERIALS["wau_skin"] = skin
    MATERIALS["flame"] = hk.emissive_material("props_flame", (1.0, 0.62, 0.25), 6.0)
    # The Pelita Air's panels: teal "water" glass; the runtime raises emission when it is relit.
    MATERIALS["glass_air"] = hk.emissive_material("props_pelita_air_glass", (0.35, 0.85, 0.82), 2.5)
    kit.UV_SCALE.update({"dark_wood": 1.0, "bamboo": 1.0, "leather": 0.5, "cloth_red": 0.5, "page_edge": 0.3})
    kit.GRAIN.update({"dark_wood": "u", "bamboo": "u"})
    kit.GRAIN_BOXES.update({"dark_wood"})
    kit.NO_AO.update({"wau_skin", "page", "page_torn", "glass_air"})


def lathe(piece, material, profile, segments=12, z_offset=0.0):
    """Adds a surface of revolution about Z from (radius, z) pairs (bottom to top)."""
    bm = piece.bm
    mi = piece.mi(material)
    rings = []
    for r, z in profile:
        rings.append([bm.verts.new((math.cos(a) * r, math.sin(a) * r, z + z_offset)) for a in (k / segments * math.tau for k in range(segments))])
    faces = []
    for lower, upper in zip(rings, rings[1:]):
        for k in range(segments):
            face = bm.faces.new((lower[k], lower[(k + 1) % segments], upper[(k + 1) % segments], upper[k]))
            face.material_index = mi
            faces.append(face)
    return faces


# ------------------------------------------------------------------------------------------------- props


def tongkat(coll):
    """Tok Wan's staff: dark polished wood, a carved knob with three grooves, a red cloth grip. Origin at the grip."""
    p = Piece("tongkat")
    p.cyl("dark_wood", (0, 0, -0.95), (0, 0, 0.5), 0.018, segments=8, radius_end=0.02)
    p.cyl("beam", (0, 0, -0.97), (0, 0, -0.9), 0.02, segments=8)  # worn ferrule
    lathe(p, "dark_wood", [(0.02, 0.5), (0.028, 0.53), (0.024, 0.55), (0.032, 0.58), (0.026, 0.6), (0.034, 0.63),
                          (0.03, 0.66), (0.022, 0.68), (0.0, 0.69)], segments=10)
    p.cyl("cloth_red", (0, 0, -0.12), (0, 0, 0.12), 0.023, segments=8)
    return p.finish(coll, jitter=0.0015, seed=31, hk_prop="tongkat", hk_attach="hand", hk_grip="0,0,0")


def wau_bulan(coll):
    """The wau bulan glider: layered-paper skin on a bamboo frame, with the crescent tail and the humming bow above
    the head. Faces −Y; the wings sweep back slightly. Grips under the wing spar for the glide hang."""
    p = Piece("wau_bulan")
    mi = p.mi("wau_skin")
    sweep = lambda x: 0.1 * (abs(x) / 1.22) ** 2  # noqa: E731 - wings swept back
    # Triangulate in the flat kite plane (concave outline), then apply the sweep to the vertices.
    verts = [p.bm.verts.new((x, sweep(x), z)) for x, z in WAU_OUTLINE]
    for a, b, c in geometry.tessellate_polygon([[Vector((x, z, 0.0)) for x, z in WAU_OUTLINE]]):
        face = p.bm.faces.new((verts[a], verts[b], verts[c]))
        face.material_index = mi
    bmesh.ops.recalc_face_normals(p.bm, faces=[f for f in p.bm.faces if f.material_index == mi])
    # Frame: spine, curved wing spar, crescent rib, humming bow (busur) with its string.
    hk.add_tube(p.bm, [Vector((0, 0.012, z)) for z in (-0.84, -0.3, 0.2, 0.6, 1.02)], [0.011] * 5, segments=5, material=p.mi("bamboo"))
    spar = [Vector((x, sweep(x) + 0.012, 0.6 - 0.12 * (abs(x) / 1.2) ** 1.6)) for x in (-1.18, -0.8, -0.4, 0.0, 0.4, 0.8, 1.18)]
    hk.add_tube(p.bm, spar, [0.008, 0.009, 0.01, 0.011, 0.01, 0.009, 0.008], segments=5, material=p.mi("bamboo"))
    rib = [Vector((x, sweep(x) + 0.012, z)) for x, z in ((-0.6, -0.3), (-0.45, -0.58), (0.0, -0.78), (0.45, -0.58), (0.6, -0.3))]
    hk.add_tube(p.bm, rib, [0.007] * 5, segments=5, material=p.mi("bamboo"))
    bow = [Vector((math.sin(a) * 0.42, 0.03, 1.02 + 0.1 * math.cos(a))) for a in (math.radians(d) for d in (-80, -40, 0, 40, 80))]
    hk.add_tube(p.bm, bow, [0.006] * 5, segments=4, material=p.mi("bamboo"))
    hk.add_tube(p.bm, [bow[0], bow[-1]], [0.0025, 0.0025], segments=3, material=p.mi("cloth_red"))
    finished = p.finish(coll, hk_prop="wau_bulan", hk_attach="glide", hk_grips="-0.28,0.02,0.52;0.28,0.02,0.52")
    # Skin UVs: planar over the kite plane (finish() box-maps every face; redo the skin faces).
    mesh = finished.data
    uv_layer = mesh.uv_layers.active.data
    for poly in mesh.polygons:
        if mesh.materials[poly.material_index].name != "props_wau_skin":
            continue
        for li in poly.loop_indices:
            co = mesh.vertices[mesh.loops[li].vertex_index].co
            uv_layer[li].uv = wau_uv(co.x, co.z)
    return finished


def hikayat_closed(coll):
    """Tok Wan's hand-written book, closed: leather covers and spine, cream page block, a red cloth tie."""
    p = Piece("hikayat_closed")
    w, h, t = 0.17, 0.24, 0.036
    p.box("page_edge", (0.004, 0, t / 2), (w - 0.008, h - 0.008, t - 0.008))
    for z in (0.002, t - 0.002):
        p.box("leather", (0, 0, z), (w, h, 0.004))
    p.box("leather", (-w / 2, 0, t / 2), (0.006, h, t))
    p.box("cloth_red", (0.0, 0, t / 2), (0.012, h + 0.004, t + 0.004))
    return p.finish(coll, jitter=0.0008, seed=41, hk_prop="hikayat", hk_state="closed")


def hikayat_open(coll):
    """The book lying open at a torn spread: two page panels in a shallow V with ink on both sides of the gutter."""
    p = Piece("hikayat_open")
    w, h = 0.17, 0.24
    for side in (-1, 1):
        tilt = math.radians(8) * side
        centre = (side * w / 2 * math.cos(tilt), 0, 0.012 + w / 2 * abs(math.sin(tilt)))
        p.box("leather", (centre[0] * 1.02, 0, 0.003), (w + 0.006, h + 0.006, 0.004))
        p.box("page_edge", (centre[0], 0, 0.01), (w - 0.006, h - 0.008, 0.012))
    finished = p.finish(coll, hk_prop="hikayat", hk_state="open")
    # Ink pages as separate faces on top (planar UVs so the handwriting reads).
    page = Piece("hikayat_open__pages")
    uv = page.bm.loops.layers.uv.new("UVMap")
    for side, material in ((-1, "page"), (1, "page_torn")):
        x0, x1 = (-w + 0.005, -0.003) if side < 0 else (0.003, w - 0.005)
        corners = [(x0, -h / 2 + 0.006, 0.0165), (x1, -h / 2 + 0.006, 0.0165), (x1, h / 2 - 0.006, 0.0165), (x0, h / 2 - 0.006, 0.0165)]
        face = page.bm.faces.new([page.bm.verts.new(c) for c in corners])
        face.material_index = page.mi(material)
        for loop, coord in zip(face.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
            loop[uv].uv = coord
    pages = hk.object_from_bmesh("hikayat_open__pages", page.bm, coll)
    for name in page.mats:
        pages.data.materials.append(MATERIALS[name])
    pages.parent = finished
    return finished


def page_torn(coll):
    """A single torn hikayat page (collectible; Kelip rises from it). Double-sided alpha card, origin at its centre."""
    p = Piece("page_torn")
    uv = p.bm.loops.layers.uv.new("UVMap")
    corners = [(-0.08, 0, -0.115), (0.08, 0, -0.115), (0.08, 0, 0.115), (-0.08, 0, 0.115)]
    face = p.bm.faces.new([p.bm.verts.new(c) for c in corners])
    face.material_index = p.mi("page_torn")
    for loop, coord in zip(face.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
        loop[uv].uv = coord
    obj = hk.object_from_bmesh("page_torn", p.bm, coll)
    obj.data.materials.append(MATERIALS["page_torn"])
    hk.set_extras(obj, hk_prop="page_torn", hk_collectible="page")
    return obj


def pelita_air(coll):
    """The Pelita Air (the first great light): an octagonal wooden lantern on a plinth, teal water-glass panels around
    a clay flame vessel, an upturned octagonal cap and a plain spindle finial. A lantern, not a shrine (CULTURE.md)."""
    p = Piece("pelita_air")
    sides = 8
    lathe(p, "beam", [(0.6, 0.0), (0.6, 0.12), (0.52, 0.16), (0.0, 0.16)], segments=sides)  # plinth
    for k in range(sides):
        a = (k + 0.5) / sides * math.tau
        p.cyl("dark_wood", (math.cos(a) * 0.4, math.sin(a) * 0.4, 0.16), (math.cos(a) * 0.4, math.sin(a) * 0.4, 1.36), 0.035, segments=6)
    lathe(p, "glass_air", [(0.34, 0.34), (0.34, 1.16)], segments=sides)  # glass panels (open-ended drum)
    lathe(p, "beam", [(0.43, 0.3), (0.43, 0.36), (0.0, 0.36)], segments=sides)  # floor of the chamber
    lathe(p, "beam", [(0.43, 1.14), (0.43, 1.2)], segments=sides)  # upper ring
    lathe(p, "clay", [(0.0, 0.36), (0.06, 0.36), (0.05, 0.5), (0.13, 0.58), (0.14, 0.64), (0.0, 0.62)], segments=12)
    p.cyl("flame", (0, 0, 0.62), (0, 0, 0.86), 0.06, segments=8, radius_end=0.004)
    # Cap: wide octagonal eave flaring up at the rim, rising to a spindle finial.
    lathe(p, "beam", [(0.62, 1.42), (0.56, 1.36), (0.45, 1.36), (0.0, 1.36)], segments=sides)
    lathe(p, "dark_wood", [(0.62, 1.42), (0.5, 1.47), (0.3, 1.62), (0.12, 1.76), (0.0, 1.8)], segments=sides)
    lathe(p, "dark_wood", [(0.0, 1.79), (0.045, 1.83), (0.03, 1.9), (0.05, 1.96), (0.0, 2.04)], segments=8)
    p.collider((0, 0, 0.08), (0.6, 0.6, 0.08))
    p.collider((0, 0, 0.9), (0.43, 0.43, 0.75))
    return p.finish(coll, jitter=0.002, seed=51, hk_prop="pelita_air", hk_pelita="air", hk_light="pelita_great",
                    hk_light_offset="0,0,0.74")


def peti(coll):
    """A small wooden chest (peti) whose lid is a child object hinged at the back edge (hk_hinge)."""
    body = Piece("peti")
    body.box("beam", (0, 0, 0.17), (0.6, 0.4, 0.34))
    for x in (-0.28, 0.28):
        body.box("dark_wood", (x, 0, 0.17), (0.04, 0.42, 0.36))
    body.box("clay", (0, -0.205, 0.27), (0.08, 0.02, 0.08))  # latch plate
    body.collider((0, 0, 0.2), (0.3, 0.2, 0.2))
    obj = body.finish(coll, jitter=0.002, seed=61, hk_prop="peti", hk_collectible="chest")
    lid = Piece("peti__lid")
    lid.box("beam", (0, -0.21, 0.06), (0.62, 0.42, 0.12))  # origin on the hinge line; the lid reaches forward (−Y)
    lid_obj = lid.finish(coll, jitter=0.002, seed=62, hk_hinge="x")
    lid_obj.parent = obj
    lid_obj.location = (0, 0.2, 0.34)  # hinge at the chest's back top edge; rotate about local X to open
    return obj


def lore_scroll(coll):
    """A rolled lore scroll tied with red cord (collectible)."""
    p = Piece("lore_scroll")
    p.cyl("page_edge", (-0.14, 0, 0.03), (0.14, 0, 0.03), 0.03, segments=10)
    for x in (-0.16, 0.16):
        p.cyl("dark_wood", (x * 0.95, 0, 0.03), (x * 1.08, 0, 0.03), 0.038, segments=10)
    p.cyl("cloth_red", (-0.012, 0, 0.03), (0.012, 0, 0.03), 0.033, segments=10)
    return p.finish(coll, jitter=0.0005, seed=71, hk_prop="lore_scroll", hk_collectible="lore")


BUILDERS = [tongkat, wau_bulan, hikayat_closed, hikayat_open, page_torn, pelita_air, peti, lore_scroll]


def main() -> None:
    args = hk.cli_args()
    out_dir = args.get("out", os.path.join(hk.REPO_DIR, "build-cache", "raw"))
    preview_dir = args.get("previews")
    hk.reset_scene(seed=2027)
    build_materials()
    coll = hk.collection("props_slice")
    props = [builder(coll) for builder in BUILDERS]
    meshes = [o for o in coll.all_objects if o.type == "MESH"]
    kit.shade_vertex_colours(meshes, samples=16)
    hk.export_glb(os.path.join(out_dir, "props_slice.glb"), props)
    triangles = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in meshes)
    print(f"HK_PROPS count={len(props)} meshes={len(meshes)} triangles={triangles}")
    if preview_dir:
        spacing = 0.0
        for obj in props:
            obj.location.x = spacing
            spacing += max(obj.dimensions.x, 0.4) + 0.5
        bpy.context.view_layer.update()
        hk.render_preview(os.path.join(preview_dir, "props_slice.png"), meshes, azimuth_deg=-20, elevation_deg=18)


main()

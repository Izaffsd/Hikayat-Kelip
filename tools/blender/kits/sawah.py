"""Sawah Emas kit (Chapter 2, the rice terraces) — docs/ASSETS.md §6.

The region's houses reuse the Kampung kit; this kit adds the fields: a field hut (pondok sawah) and a raised rice barn
(jelapang), two scarecrows (orang-orang), coconut palm and rain tree, tall bamboo poles that rope swings hang from,
festival kites on their stands and bunting, a sluice gate, a haystack, a bamboo fence, a plank bridge over a channel,
and the Pelita Bumi (the second great light). Built at the origin (Z up, metres) with self-AO in vertex colours,
collider empties and traversal tags as glTF extras; one GLB with one node per piece, plus preview renders.

Usage: blender --background --factory-startup --python tools/blender/kits/sawah.py -- --out <dir> [--previews <dir>]
"""

from __future__ import annotations

import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import bmesh  # noqa: E402
import bpy  # noqa: E402
from mathutils import Euler, Vector, geometry  # noqa: E402

from lib import hk, kit, textures  # noqa: E402
from lib.kit import MATERIALS, Piece  # noqa: E402
from lib.wau import WAU_OUTLINE, wau_uv  # noqa: E402

# Festival kite colourings (original combinations; the cut-paper pattern is the game's own).
KITE_PALETTES = {
    "kite_green": {"ground": "#f1e6c8", "a": "#2f6b3a", "gold": "#e0b245", "b": "#7a2a2a"},
    "kite_blue": {"ground": "#eef0e6", "a": "#24497a", "gold": "#e8c25a", "b": "#a8382e"},
    "kite_maroon": {"ground": "#efdcc0", "a": "#6e1f35", "gold": "#d9a441", "b": "#2c5a52"},
}


def build_materials() -> None:
    """Creates the kit's shared materials (one tiling texture each)."""
    M = MATERIALS
    M["bamboo"] = hk.textured_material(
        "sawah_bamboo", hk.image_from_array("sawah_bamboo", textures.wood_planks(seed=201, planks=1, base="#c9a86a", aged=0.25))
    )
    M["bamboo_old"] = hk.textured_material(
        "sawah_bamboo_old", hk.image_from_array("sawah_bamboo_old", textures.wood_planks(seed=202, planks=1, base="#a59468", aged=0.55))
    )
    M["beam"] = hk.textured_material(
        "sawah_beam", hk.image_from_array("sawah_beam", textures.wood_planks(seed=203, planks=2, base="#5a3f2b", aged=0.5))
    )
    M["planks"] = hk.textured_material("sawah_planks", hk.image_from_array("sawah_planks", textures.wood_planks(seed=204)))
    M["thatch"] = hk.textured_material("sawah_thatch", hk.image_from_array("sawah_thatch", textures.thatch(seed=205)))
    M["straw"] = hk.textured_material(
        "sawah_straw", hk.image_from_array("sawah_straw", textures.thatch(seed=206, rows=12, base="#c8a45c"))
    )
    M["weave"] = hk.textured_material(
        "sawah_weave", hk.image_from_array("sawah_weave", textures.weave(seed=207, strips=14, twill=True))
    )
    M["bark"] = hk.textured_material(
        "sawah_bark", hk.image_from_array("sawah_bark", textures.bark(seed=208, base="#6b5d4c", moss="#5a6a3a"))
    )
    M["palm_bark"] = hk.textured_material(
        "sawah_palm_bark", hk.image_from_array("sawah_palm_bark", textures.bark(seed=220, base="#9a8e7a", moss="#7a7a5a"))
    )
    M["stone"] = hk.textured_material("sawah_stone", hk.image_from_array("sawah_stone", textures.stone(seed=209)))
    M["clay"] = hk.textured_material(
        "sawah_clay", hk.image_from_array("sawah_clay", textures.wood_planks(seed=210, planks=1, base="#9a5a3a", aged=0.2))
    )
    for key, seed, colour in (("cloth", 211, "#3c5a8a"), ("cloth_b", 212, "#8a5a2e"), ("cloth_c", 213, "#2e6a4a")):
        cloth = hk.textured_material(
            f"sawah_{key}", hk.image_from_array(f"sawah_{key}", textures.weave(seed=seed, strips=6, base=colour))
        )
        cloth.use_backface_culling = False
        M[key] = cloth
    for key, seed, colour in (("flag_red", 214, "#b23a32"), ("flag_gold", 215, "#e0b245"), ("flag_green", 216, "#3a7a4a")):
        flag = hk.textured_material(
            f"sawah_{key}", hk.image_from_array(f"sawah_{key}", textures.weave(seed=seed, strips=3, base=colour))
        )
        flag.use_backface_culling = False
        M[key] = flag
    for key, palette in KITE_PALETTES.items():
        skin = hk.textured_material(
            f"sawah_{key}",
            hk.image_from_array(f"sawah_{key}", textures.wau_skin([wau_uv(x, z) for x, z in WAU_OUTLINE], size=512,
                                                                  seed=hash_seed(key), palette=palette)),
        )
        skin.use_backface_culling = False
        M[key] = skin
    frond = hk.textured_material(
        "sawah_frond", hk.image_from_array("sawah_frond", textures.palm_frond(seed=217, base="#5a8a3a", tip="#a8a84a"),
                                           alpha=True), alpha_clip=True
    )
    leaves = hk.textured_material(
        "sawah_leaves", hk.image_from_array("sawah_leaves", textures.leaf_cluster(
            seed=218, count=380, leaf=(0.03, 0.06), disc=0.46, greens=("#4f7f36", "#668f3e", "#3e6a2e", "#8aa24a")),
            alpha=True), alpha_clip=True
    )
    for mat in (frond, leaves):
        mat.use_backface_culling = False
    M["frond"] = frond
    M["leaves"] = leaves
    M["flame"] = hk.emissive_material("sawah_flame", (1.0, 0.62, 0.25), 6.0)
    # The Pelita Bumi's panels: amber "harvest" mica; the runtime raises emission when it is relit.
    M["glass_bumi"] = hk.emissive_material("sawah_pelita_bumi_glass", (0.95, 0.66, 0.24), 2.5)
    M["coconut"] = hk.textured_material(
        "sawah_coconut", hk.image_from_array("sawah_coconut", textures.wood_planks(seed=219, planks=1, base="#5a6a2a", aged=0.3))
    )
    kit.UV_SCALE.update({"palm_bark": 1.2, "bamboo": 1.0, "bamboo_old": 1.0, "straw": 1.4, "stone": 1.2, "coconut": 0.4,
                         "flag_red": 0.5, "flag_gold": 0.5, "flag_green": 0.5, "cloth_b": 1.0, "cloth_c": 1.0})
    kit.GRAIN.update({"bamboo": "u", "bamboo_old": "u", "bark": "v", "palm_bark": "v"})
    kit.NO_AO.update({"frond", "leaves", "flame", "glass_bumi", "flag_red", "flag_gold", "flag_green",
                      *KITE_PALETTES.keys()})
    kit.SLOPE_MAPPED.update({"thatch", "straw"})


def hash_seed(name: str) -> int:
    """A stable seed from a name (Python's hash() is randomised per process)."""
    return sum((i + 1) * ord(c) for i, c in enumerate(name)) % 1000


def lathe(piece, material, profile, segments=12, z_offset=0.0):
    """Adds a surface of revolution about Z from (radius, z) pairs (bottom to top)."""
    bm = piece.bm
    mi = piece.mi(material)
    rings = []
    for r, z in profile:
        rings.append([bm.verts.new((math.cos(a) * r, math.sin(a) * r, z + z_offset))
                      for a in (k / segments * math.tau for k in range(segments))])
    faces = []
    for lower, upper in zip(rings, rings[1:]):
        for k in range(segments):
            face = bm.faces.new((lower[k], lower[(k + 1) % segments], upper[(k + 1) % segments], upper[k]))
            face.material_index = mi
            faces.append(face)
    return faces


def gable_infill(p, width, depth, eave, ridge, material):
    """Closes both gable ends (y = ±depth/2) of a roof with triangles of `material` (two-sided)."""
    bm = p.bm
    mi = p.mi(material)
    half = width / 2
    for y in (-depth / 2, depth / 2):
        for offset in (-0.025, 0.025):
            verts = [bm.verts.new(v) for v in ((-half, y + offset, eave), (half, y + offset, eave), (0, y + offset, ridge - 0.06))]
            face = bm.faces.new(verts if offset > 0 else list(reversed(verts)))
            face.material_index = mi


def gable_roof(p, width, depth, eave, pitch_deg, material="thatch", collide=True):
    """A gable roof over a width × depth footprint (ridge along Y), eaves at `eave`; returns the ridge height."""
    pitch = math.radians(pitch_deg)
    half = width / 2 + 0.35
    ridge = eave + half * math.tan(pitch)
    slope_len = half / math.cos(pitch)
    thick = 0.14
    for side in (-1, 1):
        rot = Euler((0, side * pitch, 0))
        normal = rot.to_matrix() @ Vector((0, 0, 1))
        center = Vector((side * half / 2, 0, (eave + ridge) / 2)) + normal * (thick / 2)
        p.box(material, tuple(center), (slope_len + 0.05, depth + 0.6, thick), rot)
        if collide:
            p.collider(tuple(center), (slope_len / 2, depth / 2 + 0.3, thick / 2), (0, side * pitch, 0))
    p.cyl(material, (0, -(depth / 2 + 0.3), ridge + 0.12), (0, depth / 2 + 0.3, ridge + 0.12), 0.13, segments=8)
    return ridge


# ------------------------------------------------------------------------------------------------- buildings


def pondok_sawah(coll):
    """Field hut: a 2.4 m bamboo platform at 1.1 m on four posts, half walls of woven mat at the back and one side,
    an attap gable roof (eaves 2.7 m, walkable at 35°), a short ladder at the front (−Y)."""
    p = Piece("pondok_sawah")
    top = 1.1
    for x in (-1.1, 1.1):
        for y in (-1.1, 1.1):
            p.cyl("bamboo_old", (x, y, -0.4), (x, y, 2.75), 0.065, segments=6)
    for y in (-1.15, 0.0, 1.15):
        p.cyl("bamboo", (-1.25, y, top - 0.08), (1.25, y, top - 0.08), 0.05, segments=6)
    for x in range(-11, 12, 2):
        p.box("bamboo", (x * 0.105, 0, top - 0.02), (0.1, 2.5, 0.04))
    p.collider((0, 0, top - 0.06), (1.25, 1.25, 0.08))
    p.box("weave", (0, 1.15, top + 0.45), (2.4, 0.04, 0.85))
    p.box("weave", (-1.15, 0, top + 0.45), (0.04, 2.4, 0.85))
    p.collider((0, 1.15, top + 0.45), (1.2, 0.05, 0.45))
    p.collider((-1.15, 0, top + 0.45), (0.05, 1.2, 0.45))
    ridge = gable_roof(p, 2.4, 2.4, 2.7, 35)
    gable_infill(p, 2.4, 2.4, 2.7, ridge - 0.25, "weave")
    # Ladder: two rails and four rungs leaning against the front edge.
    for x in (-0.25, 0.25):
        p.cyl("bamboo", (x, -1.95, -0.05), (x, -1.2, top + 0.1), 0.03, segments=5)
    for k in range(4):
        t = (k + 0.6) / 4.6
        y = -1.95 + 0.75 * t
        z = -0.05 + (top + 0.15) * t
        p.cyl("bamboo", (-0.28, y, z), (0.28, y, z), 0.022, segments=5)
    return p.finish(coll, jitter=0.01, seed=301, hk_tags="floor,hut")


def jelapang(coll):
    """Rice barn: a 3 × 3 m plank granary raised 1.6 m on six posts with round rat guards under the floor, a small
    door, and a steep attap roof (50°: too steep to stand on, so its walls are for wall-runs)."""
    p = Piece("jelapang")
    floor = 1.6
    wall = 2.0
    for x in (-1.4, 0.0, 1.4):
        for y in (-1.4, 1.4):
            p.cyl("beam", (x, y, -0.3), (x, y, floor), 0.1, segments=6)
            # Rat guard: a wide wooden disc on the post just under the floor.
            lathe_at(p, "beam", [(0.0, -0.03), (0.26, -0.03), (0.26, 0.03), (0.0, 0.03)], (x, y, floor - 0.4),
                     segments=10)
    p.box("planks", (0, 0, floor - 0.04), (3.2, 3.2, 0.08))
    p.collider((0, 0, floor - 0.04), (1.6, 1.6, 0.06))
    for side, axis in ((-1, "x"), (1, "x"), (-1, "y"), (1, "y")):
        if axis == "x":
            p.box("planks", (side * 1.5, 0, floor + wall / 2), (0.08, 3.0, wall))
            p.collider((side * 1.5, 0, floor + wall / 2), (0.06, 1.5, wall / 2))
        elif side == -1:
            # Front wall with a door opening (0.8 m wide, 1.6 m high).
            p.box("planks", (-0.95, -1.5, floor + wall / 2), (1.1, 0.08, wall))
            p.box("planks", (0.95, -1.5, floor + wall / 2), (1.1, 0.08, wall))
            p.box("planks", (0, -1.5, floor + 1.8), (0.8, 0.08, 0.4))
            p.box("beam", (0, -1.55, floor + 1.6), (0.9, 0.08, 0.08))
            p.collider((-0.95, -1.5, floor + wall / 2), (0.55, 0.06, wall / 2))
            p.collider((0.95, -1.5, floor + wall / 2), (0.55, 0.06, wall / 2))
        else:
            p.box("planks", (0, 1.5, floor + wall / 2), (3.0, 0.08, wall))
            p.collider((0, 1.5, floor + wall / 2), (1.5, 0.06, wall / 2))
    for x in (-1.5, 1.5):
        for y in (-1.5, 1.5):
            p.box("beam", (x, y, floor + wall / 2), (0.12, 0.12, wall))
    ridge = gable_roof(p, 3.0, 3.0, floor + wall, 50)
    gable_infill(p, 3.0, 3.0, floor + wall, ridge - 0.3, "planks")
    return p.finish(coll, jitter=0.008, seed=302, hk_tags="wall,wallrun")


# ------------------------------------------------------------------------------------------------- scarecrows


def orang_orang(coll, name, seed, cloth, hat, arms_up):
    """Scarecrow: a bamboo pole and crossbar dressed in an old baju and sarung, a straw head, a conical hat (or none),
    and cloth streamers on the arms that the wind catches. 2.3 m tall."""
    rng = random.Random(seed)
    p = Piece(name)
    p.cyl("bamboo_old", (0, 0, -0.4), (0, 0, 2.05), 0.04, segments=6)
    arm_z = 1.62
    lift = 0.35 if arms_up else 0.0
    left = (-0.7, 0, arm_z + lift)
    right = (0.7, 0, arm_z + lift * 0.6)
    p.cyl("bamboo_old", left, (0, 0, arm_z), 0.03, segments=5)
    p.cyl("bamboo_old", (0, 0, arm_z), right, 0.03, segments=5)
    # Baju: a tapered torso and sleeves along the crossbar; sarung below.
    lathe(p, cloth, [(0.2, 1.05), (0.24, 1.25), (0.22, 1.55), (0.16, 1.72), (0.07, 1.78)], segments=8)
    for end in (left, right):
        p.cyl(cloth, (0, 0, arm_z), tuple(Vector(end) * 0.85 + Vector((0, 0, arm_z * 0.15))), 0.075, segments=6,
              radius_end=0.06)
    lathe(p, "cloth_b" if cloth != "cloth_b" else "cloth", [(0.15, 0.5), (0.23, 0.6), (0.24, 1.0), (0.2, 1.08)],
          segments=8)
    # Straw head and tufts poking out at the cuffs and neck.
    lathe(p, "straw", [(0.0, 1.76), (0.11, 1.8), (0.15, 1.92), (0.13, 2.04), (0.07, 2.1), (0.0, 2.12)], segments=8)
    for end in (left, right):
        tip = Vector(end)
        for k in range(4):
            spray = Vector((rng.uniform(-0.05, 0.05), rng.uniform(-0.06, 0.06), rng.uniform(-0.08, 0.02)))
            p.cyl("straw", tuple(tip * 0.88), tuple(tip + spray + (tip.normalized() * 0.12)), 0.012, segments=3,
                  radius_end=0.004)
    if hat:
        # Terendak-style conical hat, wide and shallow.
        lathe(p, "straw", [(0.36, 2.02), (0.3, 2.06), (0.16, 2.14), (0.0, 2.22)], segments=12)
    # Streamers: thin cloth strips hanging from each arm.
    for end in (left, right):
        base = Vector(end) * 0.7
        for k in range(3):
            off = Vector((rng.uniform(-0.12, 0.12), 0, 0))
            length = rng.uniform(0.35, 0.6)
            p.box("flag_red" if k % 2 else "flag_gold", tuple(base + off - Vector((0, 0, length / 2))),
                  (0.05, 0.01, length), Euler((0, rng.uniform(-0.2, 0.2), 0)))
    p.collider((0, 0, 0.8), (0.12, 0.12, 1.2))
    return p.finish(coll, jitter=0.006, seed=seed, hk_tags="prop,scarecrow")


# ------------------------------------------------------------------------------------------------- trees


def kelapa(coll):
    """Coconut palm: a slender ringed trunk curving up to 9.5 m, a crown of drooping fronds and a cluster of coconuts."""
    rng = random.Random(401)
    p = Piece("kelapa")
    fronds = Piece("kelapa__fronds")
    bend = Vector((1.4, 0.4, 0))

    def trunk_at(t):
        return Vector((bend.x * t * t, bend.y * t * t, -0.3 + 9.8 * t))

    rings = 9
    for i in range(rings):
        a, b = trunk_at(i / rings), trunk_at((i + 1) / rings)
        p.cyl("palm_bark", tuple(a), tuple(b), 0.2 - 0.06 * i / rings, segments=8, radius_end=0.2 - 0.06 * (i + 1) / rings)
        p.cyl("palm_bark", tuple(b - (b - a) * 0.06), tuple(b + (b - a) * 0.02), 0.2 - 0.06 * (i + 1) / rings + 0.025,
              segments=8)
    crown = trunk_at(1.0)
    for k in range(6):
        a = k / 6 * math.tau + rng.uniform(-0.2, 0.2)
        c = crown + Vector((math.cos(a) * 0.16, math.sin(a) * 0.16, -0.22))
        lathe_ball(p, "coconut", c, 0.12)
    uv = fronds.bm.loops.layers.uv.new("UVMap")
    mat = fronds.mi("frond")
    for f in range(18):
        yaw = f / 18 * math.tau * 1.0 + rng.uniform(-0.12, 0.12)
        length = rng.uniform(3.0, 4.2)
        rise = math.radians(rng.uniform(5, 55) if f % 3 else rng.uniform(55, 75))
        width = rng.uniform(0.85, 1.15)
        direction = Vector((math.cos(yaw), math.sin(yaw), 0))
        side = Vector((-math.sin(yaw), math.cos(yaw), 0))
        segs = 6
        rows = []
        for s in range(segs + 1):
            t = s / segs
            dist = length * t
            droop = (t**2) * length * 0.75
            centre = crown + direction * (dist * math.cos(rise)) + Vector((0, 0, dist * math.sin(rise) - droop))
            w = width * (0.3 + 0.7 * math.sin(math.pi * min(1, t * 1.05))) / 2
            rows.append((fronds.bm.verts.new(tuple(centre - side * w)), fronds.bm.verts.new(tuple(centre + side * w))))
        for s in range(segs):
            a, b = rows[s]
            c, d = rows[s + 1]
            face = fronds.bm.faces.new((a, b, d, c))
            face.material_index = mat
            for loop, (u, v) in zip(face.loops, ((0, s / segs), (1, s / segs), (1, (s + 1) / segs), (0, (s + 1) / segs))):
                loop[uv].uv = (u, v)
    p.collider((bend.x / 3, bend.y / 3, 4.6), (0.22, 0.22, 4.9))
    obj = p.finish(coll, jitter=0.01, seed=401, hk_tags="tree", hk_lod="tree")
    fronds_obj = hk.object_from_bmesh("kelapa__fronds", fronds.bm, coll)
    fronds_obj.data.materials.append(MATERIALS["frond"])
    fronds_obj.parent = obj
    fronds_obj["hk_foliage"] = True
    return obj


def lathe_at(p, material, profile, centre, segments=8):
    """A lathed surface (see `lathe`) built around the origin and moved to `centre`."""
    faces = lathe(p, material, profile, segments=segments)
    verts = {v for f in faces for v in f.verts}
    bmesh.ops.translate(p.bm, verts=list(verts), vec=Vector(centre))
    return faces


def lathe_ball(p, material, centre, radius, segments=8):
    """A small lathed sphere at `centre` (coconuts, finials)."""
    profile = [(math.sin(math.pi * k / 6) * radius, -math.cos(math.pi * k / 6) * radius) for k in range(7)]
    return lathe_at(p, material, profile, centre, segments)


def pokok_hujan(coll):
    """Rain tree (pokok hujan-hujan): a short thick trunk splitting into wide, low branches and a broad umbrella
    crown of leaf clumps that shades the festival field."""
    rng = random.Random(402)
    trunk = Piece("pokok_hujan")
    leaves = Piece("pokok_hujan__leaves")
    base_top = Vector((0, 0, 3.2))
    trunk.cyl("bark", (0, 0, -0.3), tuple(base_top), 0.55, segments=10, radius_end=0.42)
    anchors = []
    for b in range(6):
        a = b / 6 * math.tau + rng.uniform(-0.25, 0.25)
        out = Vector((math.cos(a), math.sin(a), 0))
        reach = rng.uniform(6.0, 8.5)
        start = base_top + Vector((0, 0, rng.uniform(-0.4, 0.3)))
        ctrl = start + out * reach * 0.4 + Vector((0, 0, rng.uniform(2.5, 3.5)))
        end = start + out * reach + Vector((0, 0, rng.uniform(1.6, 2.6)))

        def along(t, start=start, ctrl=ctrl, end=end):
            return start * (1 - t) ** 2 + ctrl * (2 * t * (1 - t)) + end * (t * t)

        for s in range(5):
            t0, t1 = s / 5, (s + 1) / 5
            trunk.cyl("bark", tuple(along(t0)), tuple(along(t1)), 0.3 * (1 - 0.75 * t0), segments=7,
                      radius_end=0.3 * (1 - 0.75 * t1))
            if s >= 2:
                anchors.append(along(t1))
        anchors.append(end + Vector((0, 0, 0.4)))
    uv = leaves.bm.loops.layers.uv.new("UVMap")
    mat = leaves.mi("leaves")
    centre = base_top + Vector((0, 0, 2.6))
    for anchor in anchors:
        for _ in range(3):
            c = anchor + Vector((rng.uniform(-1.2, 1.2), rng.uniform(-1.2, 1.2), rng.uniform(-0.2, 0.7)))
            outward = c - centre
            outward.z = abs(outward.z) * 0.3 + 1.2
            size = rng.uniform(2.0, 2.8)
            for _ in range(2):
                jitter = Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(0, 1)))
                kit.card(leaves, uv, mat, c, size, outward.normalized() * 0.8 + jitter * 0.5, rng.uniform(0, math.pi))
    trunk.collider((0, 0, 1.5), (0.5, 0.5, 1.8))
    obj = trunk.finish(coll, jitter=0.02, seed=402, hk_tags="tree", hk_lod="tree")
    leaves_obj = hk.object_from_bmesh("pokok_hujan__leaves", leaves.bm, coll)
    leaves_obj.data.materials.append(MATERIALS["leaves"])
    leaves_obj.parent = obj
    leaves_obj["hk_foliage"] = True
    return obj


# ------------------------------------------------------------------------------------------------- field furniture


def tiang_buluh(coll):
    """A tall bamboo pole (6 m) with a lashed fork at the top: rope swings and kite lines hang between pairs of them.
    `hk_anchor` is the rope's attach point."""
    p = Piece("tiang_buluh")
    p.cyl("bamboo", (0, 0, -0.6), (0, 0, 5.7), 0.085, segments=7, radius_end=0.07)
    for k in range(5):
        z = 0.8 + k * 1.1
        p.cyl("bamboo_old", (0, 0, z - 0.03), (0, 0, z + 0.03), 0.095, segments=7)  # nodes of the culm
    for side in (-1, 1):
        p.cyl("bamboo", (0, 0, 5.5), (side * 0.32, 0, 6.15), 0.045, segments=5)
    p.cyl("cloth", (0, 0, 5.45), (0, 0, 5.62), 0.1, segments=6)  # rope lashing
    p.collider((0, 0, 2.5), (0.09, 0.09, 3.1))
    return p.finish(coll, jitter=0.004, seed=411, hk_tags="pole", hk_anchor="0,0,5.95")


def wau_stand(coll, name, skin):
    """A festival kite on its display stand: an A-frame of bamboo holding a 2.6 m wau bulan tilted to the crowd."""
    p = Piece(name)
    for side in (-1, 1):
        p.cyl("bamboo", (side * 0.6, -0.5, -0.1), (0, 0, 2.6), 0.05, segments=6)
        p.cyl("bamboo", (side * 0.6, 0.5, -0.1), (0, 0, 2.6), 0.05, segments=6)
    p.cyl("bamboo", (-0.5, 0, 1.0), (0.5, 0, 1.0), 0.04, segments=5)
    tilt = Euler((math.radians(-12), 0, 0))
    lift = Vector((0, -0.12, 1.75))
    mi = p.mi(skin)
    verts = [p.bm.verts.new(tuple(tilt.to_matrix() @ Vector((x, 0.04 * (abs(x) / 1.22) ** 2, z)) + lift))
             for x, z in WAU_OUTLINE]
    for a, b, c in geometry.tessellate_polygon([[Vector((x, z, 0.0)) for x, z in WAU_OUTLINE]]):
        face = p.bm.faces.new((verts[a], verts[b], verts[c]))
        face.material_index = mi
    spine = [tuple(tilt.to_matrix() @ Vector((0, 0.02, z)) + lift) for z in (-0.84, 0.0, 1.02)]
    hk.add_tube(p.bm, [Vector(v) for v in spine], [0.012] * 3, segments=5, material=p.mi("bamboo"))
    p.collider((0, 0, 1.3), (0.65, 0.55, 1.3))
    obj = p.finish(coll, hk_tags="prop,kite")
    mesh = obj.data
    uv_layer = mesh.uv_layers.active.data
    inverse = tilt.to_matrix().inverted()
    for poly in mesh.polygons:
        if mesh.materials[poly.material_index].name != f"sawah_{skin}":
            continue
        for li in poly.loop_indices:
            co = inverse @ (mesh.vertices[mesh.loops[li].vertex_index].co - lift)
            uv_layer[li].uv = wau_uv(co.x, co.z)
    return obj


def bunting(coll):
    """Festival bunting: two 3.6 m bamboo poles 6 m apart with a sagging line of triangular flags."""
    p = Piece("bunting_6")
    for x in (-3.0, 3.0):
        p.cyl("bamboo", (x, 0, -0.4), (x, 0, 3.6), 0.05, segments=6)
        p.collider((x, 0, 1.6), (0.06, 0.06, 2.0))
    colours = ("flag_red", "flag_gold", "flag_green")
    count = 11
    sag = 0.6
    for k in range(count):
        t0 = (k + 0.15) / count
        t1 = (k + 0.85) / count
        tm = (t0 + t1) / 2

        def line(t):
            return Vector((-3.0 + 6.0 * t, 0, 3.45 - sag * 4 * t * (1 - t)))

        a, b, c = line(t0), line(t1), line(tm) - Vector((0, 0, 0.42))
        mi = p.mi(colours[k % 3])
        v = [p.bm.verts.new(tuple(x)) for x in (a, b, c)]
        p.bm.faces.new(v).material_index = mi
    for k in range(12):
        a = Vector((-3.0 + 6.0 * k / 12, 0, 3.45 - sag * 4 * (k / 12) * (1 - k / 12)))
        b = Vector((-3.0 + 6.0 * (k + 1) / 12, 0, 3.45 - sag * 4 * ((k + 1) / 12) * (1 - (k + 1) / 12)))
        p.cyl("cloth", tuple(a), tuple(b), 0.008, segments=3)
    return p.finish(coll, hk_tags="prop")


def pintu_air(coll):
    """Sluice gate (pintu air) across a field channel: two clay-rendered posts, a plank gate on runners and a lifting
    wheel. 1.6 m wide, 1.3 m tall."""
    p = Piece("pintu_air")
    for x in (-0.95, 0.95):
        p.box("clay", (x, 0, 0.35), (0.3, 0.6, 1.3))
        p.collider((x, 0, 0.35), (0.15, 0.3, 0.65))
    p.box("planks", (0, 0, 0.2), (1.6, 0.08, 0.9))
    p.box("beam", (0, 0, 1.05), (2.2, 0.16, 0.14))
    p.collider((0, 0, 1.05), (1.1, 0.08, 0.07))
    p.cyl("beam", (0, -0.12, 1.12), (0, -0.12, 1.5), 0.03, segments=5)
    lathe(p, "beam", [(0.22, 1.48), (0.22, 1.54), (0.17, 1.54), (0.17, 1.48)], segments=12)
    return p.finish(coll, jitter=0.006, seed=421, hk_tags="prop,vault")


def timbunan_jerami(coll):
    """Haystack: a round straw stack on a pole, 2.6 m wide and 2.4 m tall; a soft thing to land on and vault."""
    p = Piece("timbunan_jerami")
    lathe(p, "straw", [(1.25, 0.0), (1.32, 0.5), (1.22, 1.1), (0.95, 1.6), (0.55, 2.05), (0.18, 2.32), (0.0, 2.4)],
          segments=14)
    p.cyl("bamboo_old", (0, 0, 2.2), (0, 0, 2.85), 0.035, segments=5)
    p.collider((0, 0, 0.9), (1.05, 1.05, 0.9))
    p.collider((0, 0, 2.05), (0.5, 0.5, 0.3))
    return p.finish(coll, jitter=0.03, seed=431, hk_tags="prop,haystack")


def pagar_buluh(coll):
    """Bamboo fence, 3 m: posts every 0.75 m, two split-bamboo rails; waist high (vaultable)."""
    p = Piece("pagar_buluh")
    for k in range(5):
        x = -1.5 + k * 0.75
        p.cyl("bamboo_old", (x, 0, -0.3), (x, 0, 1.05), 0.04, segments=5)
    for z in (0.45, 0.9):
        p.cyl("bamboo", (-1.55, 0, z), (1.55, 0, z), 0.03, segments=5)
    p.collider((0, 0, 0.5), (1.5, 0.05, 0.5))
    return p.finish(coll, jitter=0.01, seed=441, hk_tags="fence,vault")


def titian_sawah(coll):
    """Plank bridge over a field channel: 3 m long, 0.8 m wide, top at z = 0.1, on two logs."""
    p = Piece("titian_sawah")
    for x in (-0.28, 0.28):
        p.cyl("bark", (x, -1.6, -0.12), (x, 1.6, -0.12), 0.1, segments=6)
    for k in range(10):
        y = -1.45 + k * 0.32
        p.box("planks", (0, y, 0.07), (0.85, 0.28, 0.05))
    p.collider((0, 0, 0.02), (0.42, 1.55, 0.08))
    return p.finish(coll, jitter=0.012, seed=451, hk_tags="floor,bridge")


def pelita_bumi(coll):
    """The Pelita Bumi (the second great light, the terraces' own): a laterite plinth of two courses, an earthen
    clay vessel with amber mica panels around the flame, and a four-sided barn-like canopy with flared eaves and a
    plain finial — the harvest's light, kin to the Pelita Air but of earth and grain. A lantern, not a shrine
    (CULTURE.md)."""
    p = Piece("pelita_bumi")
    p.box("stone", (0, 0, 0.2), (1.9, 1.9, 0.4))
    p.box("stone", (0, 0, 0.55), (1.45, 1.45, 0.3))
    p.collider((0, 0, 0.35), (0.95, 0.95, 0.35))
    sides = 4
    lathe(p, "clay", [(0.55, 0.7), (0.62, 0.85), (0.6, 1.0), (0.5, 1.1), (0.0, 1.1)], segments=12)
    for k in range(sides):
        a = (k + 0.5) / sides * math.tau
        p.cyl("beam", (math.cos(a) * 0.52, math.sin(a) * 0.52, 1.05), (math.cos(a) * 0.52, math.sin(a) * 0.52, 2.15),
              0.05, segments=6)
    lathe(p, "glass_bumi", [(0.42, 1.12), (0.42, 1.98)], segments=sides)
    lathe(p, "clay", [(0.0, 1.1), (0.08, 1.12), (0.07, 1.26), (0.16, 1.34), (0.17, 1.4), (0.0, 1.38)], segments=12)
    p.cyl("flame", (0, 0, 1.38), (0, 0, 1.66), 0.07, segments=8, radius_end=0.004)
    lathe(p, "beam", [(0.62, 2.12), (0.62, 2.2), (0.0, 2.2)], segments=sides)
    # Canopy: four-sided, steep in the middle and flaring out at the eaves like a jelapang's roof.
    lathe(p, "thatch", [(0.95, 2.22), (0.82, 2.3), (0.6, 2.52), (0.34, 2.82), (0.12, 3.08), (0.0, 3.14)],
          segments=sides)
    lathe(p, "beam", [(0.0, 3.1), (0.05, 3.15), (0.035, 3.26), (0.06, 3.32), (0.0, 3.44)], segments=8)
    p.collider((0, 0, 1.6), (0.6, 0.6, 0.9))
    return p.finish(coll, jitter=0.002, seed=461, hk_prop="pelita_bumi", hk_pelita="bumi", hk_light="pelita_great",
                    hk_light_offset="0,0,1.52", hk_tags="prop,pelita")


BUILDERS = [
    pondok_sawah,
    jelapang,
    lambda c: orang_orang(c, "orang_orang_a", 501, "cloth", True, False),
    lambda c: orang_orang(c, "orang_orang_b", 502, "cloth_c", False, True),
    kelapa,
    pokok_hujan,
    tiang_buluh,
    lambda c: wau_stand(c, "wau_stand_green", "kite_green"),
    lambda c: wau_stand(c, "wau_stand_blue", "kite_blue"),
    lambda c: wau_stand(c, "wau_stand_maroon", "kite_maroon"),
    bunting,
    pintu_air,
    timbunan_jerami,
    pagar_buluh,
    titian_sawah,
    pelita_bumi,
]


def vignette(pieces: dict) -> list:
    """A small field scene from linked duplicates for preview renders (not exported)."""
    coll = hk.collection("vignette")
    placed = []

    def place(name, x, y, z=0.0, rz=0.0):
        src = pieces[name]
        for obj in [src, *src.children]:
            if obj.type != "MESH":
                continue
            dup = obj.copy()
            dup.parent = None
            coll.objects.link(dup)
            dup.matrix_world = obj.matrix_world.copy()
            dup.location = Vector((x, y, z)) + (obj.matrix_world.translation if obj.parent else Vector())
            dup.rotation_euler = (0, 0, rz)
            dup.hide_render = False
            placed.append(dup)

    place("pondok_sawah", 0, 0)
    place("jelapang", -6, 3, 0, 0.3)
    place("orang_orang_a", 4, -2)
    place("orang_orang_b", 6.5, 1.5, 0, 0.6)
    place("kelapa", -9, -4)
    place("tiang_buluh", 3, 5)
    place("tiang_buluh", 9, 5)
    place("wau_stand_green", -3, -6, 0, 0.2)
    place("wau_stand_blue", 0, -7)
    place("wau_stand_maroon", 3, -6, 0, -0.2)
    place("bunting_6", 0, -9.5)
    place("pintu_air", 8, -4)
    place("timbunan_jerami", -4, 8)
    place("pagar_buluh", 9, -1, 0, math.pi / 2)
    place("titian_sawah", 11, -6, 0, math.pi / 2)
    place("pelita_bumi", 12, 4)
    place("pokok_hujan", -14, 10)
    return placed


def main() -> None:
    args = hk.cli_args()
    out_dir = args.get("out", os.path.join(hk.REPO_DIR, "build-cache", "raw"))
    preview_dir = args.get("previews")
    hk.reset_scene(seed=2028)
    build_materials()
    coll = hk.collection("sawah_kit")
    pieces = {}
    for builder in BUILDERS:
        obj = builder(coll)
        pieces[obj.name] = obj
    meshes = [o for o in coll.all_objects if o.type == "MESH"]
    kit.shade_vertex_colours(meshes)
    roots = [o for o in coll.objects if o.parent is None]
    hk.export_glb(os.path.join(out_dir, "sawah_kit.glb"), roots)
    if preview_dir:
        placed = vignette(pieces)
        for obj in coll.all_objects:
            obj.hide_render = True
        hk.render_preview(os.path.join(preview_dir, "sawah_vignette_a.png"), placed, azimuth_deg=35, elevation_deg=22)
        hk.render_preview(os.path.join(preview_dir, "sawah_vignette_b.png"), placed, azimuth_deg=210, elevation_deg=14)
    triangles = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in meshes)
    print(f"HK_KIT sawah pieces={len(pieces)} meshes={len(meshes)} triangles={triangles}")


main()

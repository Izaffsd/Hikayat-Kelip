"""Kampung Berembang modular kit (Chapter 1, prologue flood, epilogue) — docs/ASSETS.md §6.

Builds every piece at the origin (Z up, metres), bakes self-AO into vertex colours, adds collider empties
and traversal tags as glTF extras, exports one GLB with one node per piece, and renders preview images.

Usage: blender --background --factory-startup --python tools/blender/kits/kampung.py -- --out <dir> [--previews <dir>]
House grid: 3 m modules; floor top at 2.4 m; walls 2.2 m; eaves at 4.6 m; roof pitch 40°.
"""

from __future__ import annotations

import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import bmesh  # noqa: E402
import bpy  # noqa: E402
from mathutils import Euler, Vector  # noqa: E402

from lib import hk, textures  # noqa: E402

FLOOR = 2.4
WALL_H = 2.2
EAVE = FLOOR + WALL_H
PITCH = math.radians(40)
HALF_SPAN = 2.0
RIDGE = EAVE + HALF_SPAN * math.tan(PITCH)

MATERIALS: dict[str, bpy.types.Material] = {}
UV_SCALE = {"planks": 1.0, "beam": 1.0, "thatch": 1.6, "weave": 1.0, "bark": 1.5, "clay": 0.6, "cloth": 1.0, "net": 0.5}
NO_AO = {"leaves", "frond", "flame", "glow", "net", "cloth", "cloth_b", "cloth_c"}
SLOPE_MAPPED = {"thatch"}  # textures with a slope direction get slope-aligned UVs
GRAIN = {"beam": "u", "bark": "v"}  # grain/fibre direction in the texture, mapped along each element's long axis
GRAIN_BOXES = {"beam"}  # box elements that carry grain (plank infill keeps world-aligned planks)


def build_materials() -> None:
    """Creates the kit's shared materials (one tiling texture each)."""
    MATERIALS["planks"] = hk.textured_material("kampung_planks", hk.image_from_array("kampung_planks", textures.wood_planks(seed=11)))
    MATERIALS["beam"] = hk.textured_material(
        "kampung_beam", hk.image_from_array("kampung_beam", textures.wood_planks(seed=12, planks=2, base="#5a3f2b", aged=0.5))
    )
    MATERIALS["thatch"] = hk.textured_material("kampung_thatch", hk.image_from_array("kampung_thatch", textures.thatch(seed=21)))
    MATERIALS["weave"] = hk.textured_material(
        "kampung_weave", hk.image_from_array("kampung_weave", textures.weave(seed=31, strips=16, twill=True))
    )
    MATERIALS["bark"] = hk.textured_material("kampung_bark", hk.image_from_array("kampung_bark", textures.bark(seed=41)))
    MATERIALS["clay"] = hk.textured_material(
        "kampung_clay", hk.image_from_array("kampung_clay", textures.wood_planks(seed=71, planks=1, base="#9a5a3a", aged=0.2))
    )
    # Berembang leaves: small, olive, in round clumps (no square card silhouettes).
    leaf_pixels = textures.leaf_cluster(
        seed=51, count=420, leaf=(0.026, 0.05), disc=0.44, greens=("#4d7a3a", "#5f8a44", "#3c6532", "#7a9a52")
    )
    leaves = hk.textured_material(
        "kampung_leaves", hk.image_from_array("kampung_leaves", leaf_pixels, alpha=True), alpha_clip=True
    )
    frond = hk.textured_material(
        "kampung_frond", hk.image_from_array("kampung_frond", textures.palm_frond(seed=61), alpha=True), alpha_clip=True
    )
    for mat in (leaves, frond):
        mat.use_backface_culling = False
    MATERIALS["leaves"] = leaves
    MATERIALS["frond"] = frond
    MATERIALS["flame"] = hk.emissive_material("kampung_flame", (1.0, 0.62, 0.25), 6.0)
    MATERIALS["glow"] = hk.emissive_material("kampung_kelip_glow", (0.85, 0.94, 0.42), 4.0)
    # Everyday checked kain in three colours (woven checks, no specific motif).
    for key, seed, colour in (("cloth", 81, "#2e4a8a"), ("cloth_b", 82, "#8a2e3a"), ("cloth_c", 83, "#b58a2e")):
        cloth = hk.textured_material(
            f"kampung_{key}", hk.image_from_array(f"kampung_{key}", textures.weave(seed=seed, strips=6, base=colour))
        )
        cloth.use_backface_culling = False
        MATERIALS[key] = cloth
    net = hk.textured_material(
        "kampung_net", hk.image_from_array("kampung_net", textures.net(seed=33), alpha=True), alpha_clip=True
    )
    net.use_backface_culling = False
    MATERIALS["net"] = net


class Piece:
    """Accumulates geometry for one kit piece in a bmesh, with per-face materials. Beams, poles and branches remember
    their long axis so `finish` can run the wood grain or bark fibres along them (GRAIN)."""

    def __init__(self, name: str):
        self.name = name
        self.bm = bmesh.new()
        self.mats: list[str] = []
        self.colliders: list[tuple] = []
        self.elements: list[tuple] = []  # (axis, origin, is_cylinder)
        self.bm.faces.layers.int.new("grain")  # before any geometry: adding a layer later invalidates face refs

    def mi(self, material: str) -> int:
        if material not in self.mats:
            self.mats.append(material)
        return self.mats.index(material)

    def _tag(self, faces, axis, origin, cylinder):
        if axis.length < 1e-6:
            return
        layer = self.bm.faces.layers.int.get("grain")
        if layer is None:
            return
        self.elements.append((axis.normalized(), Vector(origin), cylinder))
        for face in faces:
            face[layer] = len(self.elements)

    def box(self, material, center, size, rotation=None):
        faces = hk.add_box(self.bm, center, size, rotation, self.mi(material))
        if material in GRAIN_BOXES:
            longest = max(range(3), key=lambda i: size[i])
            axis = Vector([1.0 if i == longest else 0.0 for i in range(3)])
            if rotation is not None:
                axis = Euler(rotation).to_matrix() @ axis
            self._tag(faces, axis, center, False)
        return faces

    def cyl(self, material, start, end, radius, segments=8, radius_end=None, cap=True):
        faces = hk.add_cylinder(self.bm, start, end, radius, segments, radius_end, self.mi(material), cap)
        if material in GRAIN:
            self._tag(faces, Vector(end) - Vector(start), start, True)
        return faces

    def _grain_uv(self, face, material, uv, scale) -> bool:
        """Maps a tagged face with U (or V, per GRAIN) along its element's axis; False when not applicable."""
        layer = self.bm.faces.layers.int.get("grain")
        if layer is None or not face[layer] or material not in GRAIN:
            return False
        axis, origin, cylinder = self.elements[face[layer] - 1]
        side = face.normal.cross(axis)
        if side.length < 0.3:  # end caps
            return False
        coords = []
        if cylinder:
            ref = Vector((0, 0, 1)) if abs(axis.z) < 0.9 else Vector((1, 0, 0))
            a = axis.cross(ref).normalized()
            b = axis.cross(a)
            angles = []
            for loop in face.loops:
                r = loop.vert.co - origin
                along = r.dot(axis)
                radial = r - axis * along
                angles.append((along, math.atan2(radial.dot(b), radial.dot(a)), radial.length))
            if max(t[1] for t in angles) - min(t[1] for t in angles) > math.pi:
                angles = [(s, t + math.tau if t < 0 else t, r) for s, t, r in angles]
            coords = [(s, t * max(r, 0.02)) for s, t, r in angles]
        else:
            side.normalize()
            coords = [(loop.vert.co.dot(axis), loop.vert.co.dot(side)) for loop in face.loops]
        for loop, (along, across) in zip(face.loops, coords):
            loop[uv].uv = (along / scale, across / scale) if GRAIN[material] == "u" else (across / scale, along / scale)
        return True

    def collider(self, center, half, rotation=None):
        self.colliders.append((center, half, rotation))

    def finish(self, coll, jitter: float = 0.0, seed: int = 0, **extras) -> bpy.types.Object:
        if jitter:
            hk.jitter(self.bm, jitter, seed)
        uv = self.bm.loops.layers.uv.new("UVMap")
        for face in self.bm.faces:
            material = self.mats[face.material_index]
            scale = UV_SCALE.get(material, 1.0)
            n = face.normal
            ax, ay, az = abs(n.x), abs(n.y), abs(n.z)
            if self._grain_uv(face, material, uv, scale):
                continue
            if material in SLOPE_MAPPED and 0.05 < az < 0.995:
                # U along the slope's contour (parallel to the eave), V up the slope: thatch rows follow the eave.
                down = Vector((0, 0, -1)) - n * (-n.z)
                down.normalize()
                along = n.cross(down)
                for loop in face.loops:
                    co = loop.vert.co
                    loop[uv].uv = (co.dot(along) / scale, -co.dot(down) / scale)
                continue
            for loop in face.loops:
                co = loop.vert.co
                if az >= ax and az >= ay:
                    u, v = co.x, co.y
                elif ax >= ay:
                    u, v = co.y, co.z
                else:
                    u, v = co.x, co.z
                loop[uv].uv = (u / scale, v / scale)
        obj = hk.object_from_bmesh(self.name, self.bm, coll)
        for name in self.mats:
            obj.data.materials.append(MATERIALS[name])
        for i, (center, half, rotation) in enumerate(self.colliders):
            hk.add_collider_box(obj, f"{self.name}__col{i}", center, half, rotation)
        hk.set_extras(obj, hk_piece=self.name, **extras)
        obj["hk_materials"] = ",".join(self.mats)
        return obj


# ------------------------------------------------------------------------------------------------- house pieces


def post(coll):
    p = Piece("post")
    p.cyl("beam", (0, 0, -0.6), (0, 0, FLOOR), 0.11, segments=6, radius_end=0.095)
    p.collider((0, 0, FLOOR / 2 - 0.3), (0.1, 0.1, FLOOR / 2 + 0.3))
    return p.finish(coll, jitter=0.012, seed=1, hk_tags="post")


def floor_3x3(coll):
    p = Piece("floor_3x3")
    p.box("planks", (0, 0, FLOOR - 0.03), (3.0, 3.0, 0.06))
    for y in (-1.38, 0.0, 1.38):
        p.box("beam", (0, y, FLOOR - 0.13), (3.0, 0.12, 0.14))
    for x in (-1.38, 1.38):
        p.box("beam", (x, 0, FLOOR - 0.24), (0.14, 3.0, 0.16))
    p.collider((0, 0, FLOOR - 0.1), (1.5, 1.5, 0.1))
    return p.finish(coll, hk_tags="floor")


def _wall_frame(p, width=3.0):
    half = width / 2
    for x in (-half + 0.06, half - 0.06):
        p.box("beam", (x, 0, FLOOR + WALL_H / 2), (0.12, 0.12, WALL_H))
    p.box("beam", (0, 0, FLOOR + 0.06), (width, 0.12, 0.12))
    p.box("beam", (0, 0, EAVE - 0.06), (width, 0.12, 0.12))


def wall(coll, name, infill="planks", opening=None):
    """3 m wall; `opening` = (x0, x1, z0, z1) relative to the floor for doors/windows."""
    p = Piece(name)
    _wall_frame(p)
    z_lo, z_hi = FLOOR + 0.12, EAVE - 0.12
    x_lo, x_hi = -1.38, 1.38
    if opening is None:
        p.box(infill, (0, 0, (z_lo + z_hi) / 2), (x_hi - x_lo, 0.06, z_hi - z_lo))
        p.collider((0, 0, FLOOR + WALL_H / 2), (1.5, 0.06, WALL_H / 2))
    else:
        ox0, ox1, oz0, oz1 = opening
        oz0 += FLOOR
        oz1 += FLOOR
        # Infill around the opening: left, right, below, above.
        p.box(infill, ((x_lo + ox0) / 2, 0, (z_lo + z_hi) / 2), (ox0 - x_lo, 0.06, z_hi - z_lo))
        p.box(infill, ((ox1 + x_hi) / 2, 0, (z_lo + z_hi) / 2), (x_hi - ox1, 0.06, z_hi - z_lo))
        if oz0 > z_lo + 0.01:
            p.box(infill, ((ox0 + ox1) / 2, 0, (z_lo + oz0) / 2), (ox1 - ox0, 0.06, oz0 - z_lo))
        p.box(infill, ((ox0 + ox1) / 2, 0, (oz1 + z_hi) / 2), (ox1 - ox0, 0.06, z_hi - oz1))
        # Opening trim.
        for x in (ox0, ox1):
            p.box("beam", (x, 0, (oz0 + oz1) / 2), (0.08, 0.1, oz1 - oz0))
        p.box("beam", ((ox0 + ox1) / 2, 0, oz1), (ox1 - ox0 + 0.08, 0.1, 0.08))
        if oz0 > FLOOR + 0.2:
            p.box("beam", ((ox0 + ox1) / 2, -0.04, oz0), (ox1 - ox0 + 0.16, 0.18, 0.06))
            # Shutters swung open outward (−Y side is outside).
            w = (ox1 - ox0) / 2
            for side, x in ((-1, ox0), (1, ox1)):
                rot = Euler((0, 0, math.radians(-115 * side)))
                c = Vector((x, -0.03, (oz0 + oz1) / 2)) + rot.to_matrix() @ Vector((w / 2 * side, 0, 0))
                p.box("planks", tuple(c), (w, 0.04, oz1 - oz0 - 0.04), rot)
        p.collider(((x_lo + ox0) / 2, 0, FLOOR + WALL_H / 2), ((ox0 - x_lo) / 2 + 0.06, 0.06, WALL_H / 2))
        p.collider(((ox1 + x_hi) / 2, 0, FLOOR + WALL_H / 2), ((x_hi - ox1) / 2 + 0.06, 0.06, WALL_H / 2))
        p.collider(((ox0 + ox1) / 2, 0, (oz1 + EAVE) / 2), ((ox1 - ox0) / 2, 0.06, (EAVE - oz1) / 2))
        if oz0 > FLOOR + 0.2:
            p.collider(((ox0 + ox1) / 2, 0, (FLOOR + oz0) / 2), ((ox1 - ox0) / 2, 0.06, (oz0 - FLOOR) / 2))
    return p.finish(coll, jitter=0.006, seed=hash(name) % 1000, hk_tags="wall,wallrun")


def roof_gable_3(coll):
    """One 3 m roof module, ridge along Y. Walkable (40° < the 50° climb limit)."""
    p = Piece("roof_gable_3")
    slope_len = HALF_SPAN / math.cos(PITCH)
    thick = 0.16
    for side in (-1, 1):
        rot = Euler((0, side * PITCH, 0))
        mid = Vector((side * HALF_SPAN / 2, 0, (EAVE + RIDGE) / 2))
        normal = rot.to_matrix() @ Vector((0, 0, 1))
        center = mid + normal * (thick / 2)
        p.box("thatch", tuple(center), (slope_len + 0.05, 3.0, thick), rot)
        # A thicker lip at the eave reads as layered thatch.
        lip_c = Vector((side * (HALF_SPAN - 0.1), 0, EAVE + 0.02)) + normal * thick * 0.6
        p.box("thatch", tuple(lip_c), (0.4, 3.0, thick * 1.6), rot)
        p.collider(tuple(center), (slope_len / 2, 1.5, thick / 2), (0, side * PITCH, 0))
    p.cyl("thatch", (0, -1.5, RIDGE + 0.14), (0, 1.5, RIDGE + 0.14), 0.16, segments=8)
    for side in (-1, 1):
        p.box("beam", (side * 1.4, 0, EAVE - 0.05), (0.12, 3.0, 0.1))
    return p.finish(coll, jitter=0.01, seed=7, hk_tags="roof")


def gable_end(coll):
    """Closes a roof end: a plank triangle with a lamp-amber trimmed edge board."""
    p = Piece("gable_end")
    bm = p.bm
    mat = p.mi("planks")
    verts_front = [bm.verts.new(v) for v in ((-HALF_SPAN + 0.15, 0.03, EAVE), (HALF_SPAN - 0.15, 0.03, EAVE), (0, 0.03, RIDGE - 0.08))]
    verts_back = [bm.verts.new(v) for v in ((-HALF_SPAN + 0.15, -0.03, EAVE), (HALF_SPAN - 0.15, -0.03, EAVE), (0, -0.03, RIDGE - 0.08))]
    bm.faces.new(verts_front).material_index = mat
    bm.faces.new(list(reversed(verts_back))).material_index = mat
    for i in range(3):
        j = (i + 1) % 3
        bm.faces.new((verts_front[i], verts_back[i], verts_back[j], verts_front[j])).material_index = mat
    # Edge boards along both rakes (tebar layar trim), extending past the ridge like simple crossed horns.
    for side in (-1, 1):
        start = Vector((side * (HALF_SPAN + 0.1), -0.06, EAVE - 0.05))
        end = Vector((-side * 0.25, -0.06, RIDGE + 0.32))
        mid = (start + end) / 2
        length = (end - start).length
        angle = math.atan2(end.z - start.z, (end.x - start.x) * 1)
        p.box("beam", tuple(mid), (length, 0.06, 0.12), Euler((0, -angle, 0)))
    return p.finish(coll, hk_tags="gable")


def stairs(coll):
    """Wooden stairs (tangga): 8 risers of 0.3 m, run 2.7 m (41.6°), top flush with the floor edge at y = 0."""
    p = Piece("stairs")
    steps = 8
    run = 2.7
    for i in range(steps):
        z = FLOOR * (i + 1) / steps
        y = -run + run * (i + 0.5) / steps
        p.box("planks", (0, y, z - 0.025), (0.95, run / steps + 0.02, 0.05))
    angle = math.atan2(FLOOR, run)
    length = math.hypot(FLOOR, run)
    for x in (-0.5, 0.5):
        p.box("beam", (x, -run / 2, FLOOR / 2 - 0.08), (0.08, length, 0.18), Euler((angle, 0, 0)))
    ramp_center = (0, -run / 2, FLOOR / 2 - 0.12)
    p.collider(ramp_center, (0.5, length / 2, 0.06), (angle, 0, 0))
    return p.finish(coll, jitter=0.008, seed=3, hk_tags="stairs")


def railing_3(coll):
    p = Piece("railing_3")
    for x in (-1.45, 0.0, 1.45):
        p.box("beam", (x, 0, FLOOR + 0.45), (0.08, 0.08, 0.9))
    p.box("beam", (0, 0, FLOOR + 0.88), (3.0, 0.09, 0.07))
    p.box("planks", (0, 0, FLOOR + 0.45), (3.0, 0.04, 0.06))
    p.collider((0, 0, FLOOR + 0.45), (1.5, 0.05, 0.45))
    return p.finish(coll, jitter=0.01, seed=5, hk_tags="railing")


# ------------------------------------------------------------------------------------------------- waterfront


def jetty_3(coll):
    """Jetty deck module, 2 m wide × 3 m long (along Y), deck top at 1.2 m above the water datum (z = 0)."""
    p = Piece("jetty_3")
    top = 1.2
    for i in range(10):
        y = -1.5 + 0.15 + i * 0.3
        p.box("planks", (0, y, top - 0.03), (2.1, 0.27, 0.06))
    for x in (-0.9, 0.9):
        p.box("beam", (x, 0, top - 0.14), (0.14, 3.0, 0.16))
        for y in (-1.35, 1.35):
            p.cyl("beam", (x, y, -1.6), (x, y, top - 0.06), 0.1, segments=6)
    p.collider((0, 0, top - 0.1), (1.05, 1.5, 0.1))
    return p.finish(coll, jitter=0.01, seed=9, hk_tags="jetty")


def boardwalk_3(coll):
    """Narrow titian walkway, 0.7 m × 3 m, top at 1.0 m."""
    p = Piece("boardwalk_3")
    top = 1.0
    p.box("planks", (0, 0, top - 0.025), (0.7, 3.0, 0.05))
    for y in (-1.3, 1.3):
        for x in (-0.28, 0.28):
            p.cyl("beam", (x, y, -1.2), (x, y, top - 0.05), 0.05, segments=5)
        p.box("beam", (0, y, top - 0.09), (0.7, 0.08, 0.08))
    p.collider((0, 0, top - 0.1), (0.35, 1.5, 0.1))
    return p.finish(coll, jitter=0.012, seed=10, hk_tags="boardwalk")


def bollard(coll):
    p = Piece("bollard")
    p.cyl("beam", (0, 0, 0), (0, 0, 0.55), 0.12, segments=7, radius_end=0.1)
    p.collider((0, 0, 0.275), (0.12, 0.12, 0.275))
    return p.finish(coll, jitter=0.01, seed=11, hk_tags="prop")


# ------------------------------------------------------------------------------------------------- nature


def _card(piece, uv, mat, center, size, normal, spin):
    """One square alpha card centred on `center`, facing `normal`, turned `spin` radians about it."""
    n = normal.normalized()
    ref = Vector((0, 0, 1)) if abs(n.z) < 0.9 else Vector((1, 0, 0))
    a = n.cross(ref).normalized()
    b = n.cross(a).normalized()
    ca, sa = math.cos(spin), math.sin(spin)
    a, b = a * ca + b * sa, b * ca - a * sa
    h = size / 2
    corners = (center - a * h - b * h, center + a * h - b * h, center + a * h + b * h, center - a * h + b * h)
    face = piece.bm.faces.new([piece.bm.verts.new(tuple(c)) for c in corners])
    face.material_index = mat
    for loop, (u, v) in zip(face.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
        loop[uv].uv = (u, v)


def berembang(coll, name, seed, height, spread, branches):
    """Mangrove apple (berembang, Sonneratia): leaning trunk with buttress roots, curved branches whose tips droop,
    and a broad, irregular crown of small-leaf clumps (child object; alpha cards at random tilts, never crossed
    at right angles, so the crown has no boxy silhouette)."""
    rng = random.Random(seed)
    trunk = Piece(name)
    leaves = Piece(name + "__leaves")
    lean = Vector((rng.uniform(-0.5, 0.5), rng.uniform(-0.5, 0.5), 0))
    trunk_h = height * 0.55

    def trunk_at(t):
        return Vector((lean.x * t * t, lean.y * t * t, -0.3 + (trunk_h + 0.3) * t))

    for i in range(5):
        trunk.cyl("bark", tuple(trunk_at(i / 5)), tuple(trunk_at((i + 1) / 5)), 0.34 * (1 - i / 6.5), segments=9,
                  radius_end=0.34 * (1 - (i + 1) / 6.5))
    # Flared buttress at the base.
    for k in range(5):
        a = k / 5 * math.tau + rng.uniform(-0.2, 0.2)
        foot = Vector((math.cos(a) * 0.9, math.sin(a) * 0.9, -0.3))
        trunk.cyl("bark", tuple(foot), (math.cos(a) * 0.15, math.sin(a) * 0.15, 0.9), 0.07, segments=5, radius_end=0.12)
    anchors = []
    for b in range(branches):
        a = b / branches * math.tau + rng.uniform(-0.25, 0.25)
        start = trunk_at(rng.uniform(0.6, 0.97))
        out = Vector((math.cos(a), math.sin(a), 0))
        reach = spread * rng.uniform(0.75, 1.1)
        rise = height * rng.uniform(0.24, 0.38)
        ctrl = start + out * reach * 0.45 + Vector((0, 0, rise))
        end = start + out * reach + Vector((0, 0, rise * 0.5))

        def along(t, start=start, ctrl=ctrl, end=end):
            return start * (1 - t) ** 2 + ctrl * (2 * t * (1 - t)) + end * (t * t)

        segments = 4
        for s in range(segments):
            t0, t1 = s / segments, (s + 1) / segments
            trunk.cyl("bark", tuple(along(t0)), tuple(along(t1)), 0.13 * (1 - 0.7 * t0), segments=6,
                      radius_end=0.13 * (1 - 0.7 * t1))
            if s >= 1:
                anchors.append(along(t1))
        for _ in range(2):
            base = along(rng.uniform(0.5, 0.85))
            side = Vector((-out.y, out.x, 0)) * rng.choice((-1, 1))
            tip = base + side * rng.uniform(0.6, 1.1) + out * rng.uniform(0.2, 0.5) - Vector((0, 0, rng.uniform(0.2, 0.6)))
            trunk.cyl("bark", tuple(base), tuple(tip), 0.04, segments=4, radius_end=0.015)
            anchors.append(tip)
        anchors.append(end - Vector((0, 0, rng.uniform(0.3, 0.6))))  # drooping crown edge
    crown_top = trunk_at(1.0) + Vector((rng.uniform(-0.3, 0.3), rng.uniform(-0.3, 0.3), height * 0.16))
    trunk.cyl("bark", tuple(trunk_at(1.0)), tuple(crown_top), 0.16, segments=6, radius_end=0.06)
    anchors.append(crown_top)
    trunk.collider((lean.x / 2, lean.y / 2, trunk_h / 2), (0.3, 0.3, trunk_h / 2 + 0.3))
    # One clump of three randomly tilted cards per anchor, facing mostly outward from the crown's centre.
    uv = leaves.bm.loops.layers.uv.new("UVMap")
    mat = leaves.mi("leaves")
    centre = trunk_at(1.0) + Vector((0, 0, height * 0.18))
    for anchor in anchors:
        c = anchor + Vector((rng.uniform(-0.35, 0.35), rng.uniform(-0.35, 0.35), rng.uniform(-0.25, 0.3)))
        outward = c - centre
        outward.z *= 0.6
        outward = outward.normalized() if outward.length > 1e-3 else Vector((0, 0, 1))
        size = rng.uniform(1.1, 1.7)
        for _ in range(3):
            jitter = Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-0.4, 1.0)))
            _card(leaves, uv, mat, c, size * rng.uniform(0.8, 1.05), outward * 0.7 + jitter * 0.6, rng.uniform(0, math.pi))
    obj = trunk.finish(coll, jitter=0.02, seed=seed, hk_tags="tree", hk_lod="tree")
    leaves_obj = hk.object_from_bmesh(name + "__leaves", leaves.bm, coll)
    leaves_obj.data.materials.append(MATERIALS["leaves"])
    leaves_obj.parent = obj
    leaves_obj["hk_foliage"] = True
    return obj


def pneumatophores(coll):
    """A patch of mangrove breathing roots (akar napas) for instancing around trees and mudflats."""
    rng = random.Random(77)
    p = Piece("akar_napas")
    for _ in range(46):
        a = rng.uniform(0, math.tau)
        r = rng.uniform(0.4, 2.2)
        h = rng.uniform(0.12, 0.38)
        x, y = math.cos(a) * r, math.sin(a) * r
        p.cyl("bark", (x, y, -0.05), (x + rng.uniform(-0.03, 0.03), y + rng.uniform(-0.03, 0.03), h), 0.022, segments=4, radius_end=0.008)
    return p.finish(coll, hk_tags="decal_roots")


def nipah_clump(coll):
    """Stemless nipah palm: arching fronds radiating from the mud (alpha-cut, double-sided)."""
    rng = random.Random(91)
    p = Piece("nipah_clump")
    uv = p.bm.loops.layers.uv.new("UVMap")
    mat = p.mi("frond")
    for f in range(13):
        yaw = f / 13 * math.tau + rng.uniform(-0.15, 0.15)
        length = rng.uniform(3.0, 4.2)
        rise = math.radians(rng.uniform(52, 72))
        width = rng.uniform(0.65, 0.85)
        direction = Vector((math.cos(yaw), math.sin(yaw), 0))
        side = Vector((-math.sin(yaw), math.cos(yaw), 0))
        segs = 6
        rows = []
        for s in range(segs + 1):
            t = s / segs
            dist = length * t
            droop = (t**2) * length * 0.55
            centre = direction * (dist * math.cos(rise)) + Vector((0, 0, dist * math.sin(rise) - droop))
            w = width * (0.35 + 0.65 * math.sin(math.pi * min(1, t * 1.1))) / 2
            rows.append((p.bm.verts.new(tuple(centre - side * w)), p.bm.verts.new(tuple(centre + side * w))))
        for s in range(segs):
            a, b = rows[s]
            c, d = rows[s + 1]
            face = p.bm.faces.new((a, b, d, c))
            face.material_index = mat
            for loop, (u, v) in zip(face.loops, ((0, s / segs), (1, s / segs), (1, (s + 1) / segs), (0, (s + 1) / segs))):
                loop[uv].uv = (u, v)
    obj = hk.object_from_bmesh("nipah_clump", p.bm, coll)
    obj.data.materials.append(MATERIALS["frond"])
    obj["hk_piece"] = "nipah_clump"
    obj["hk_foliage"] = True
    obj["hk_tags"] = "foliage"
    return obj


# ------------------------------------------------------------------------------------------------- props


def sampan(coll):
    """A small plank boat (4.2 m): lofted hull sections with raised, pointed ends, two thwarts and an oar."""
    p = Piece("sampan")
    bm = p.bm
    mat = p.mi("planks")
    stations = 11
    ring_pts = 7
    rings = []
    for s in range(stations):
        t = s / (stations - 1)
        y = -2.1 + 4.2 * t
        taper = math.sin(math.pi * t) ** 0.7
        half_w = 0.05 + 0.43 * taper
        depth = 0.12 + 0.24 * taper
        sheer = 0.32 + 0.16 * (abs(t - 0.5) * 2) ** 2.2
        ring = []
        for k in range(ring_pts):
            a = math.pi * k / (ring_pts - 1)
            x = -math.cos(a) * half_w
            z = sheer - math.sin(a) * depth
            ring.append(bm.verts.new((x, y, z)))
        rings.append(ring)
    for s in range(stations - 1):
        for k in range(ring_pts - 1):
            face = bm.faces.new((rings[s][k], rings[s][k + 1], rings[s + 1][k + 1], rings[s + 1][k]))
            face.material_index = mat
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    for y in (-0.7, 0.6):
        p.box("beam", (0, y, 0.24), (0.86, 0.18, 0.04))
    p.box("beam", (0.15, 0.1, 0.14), (0.06, 2.0, 0.04), Euler((0, 0, math.radians(8))))
    p.box("planks", (0.25, 1.15, 0.15), (0.16, 0.42, 0.02), Euler((0, 0, math.radians(8))))
    p.collider((0, 0, 0.2), (0.45, 2.0, 0.2))
    obj = p.finish(coll, hk_tags="boat")
    mod = obj.modifiers.new("hull", "SOLIDIFY")
    mod.thickness = 0.035
    return obj


def pelita_post(coll):
    """Oil lamp (pelita) on a post with a small roof; the flame is emissive (bloom) and tagged as a light."""
    p = Piece("pelita_post")
    p.cyl("beam", (0, 0, 0), (0, 0, 1.75), 0.06, segments=6)
    p.box("beam", (0.16, 0, 1.6), (0.36, 0.06, 0.05))
    p.cyl("clay", (0.3, 0, 1.47), (0.3, 0, 1.58), 0.07, segments=8, radius_end=0.05)
    p.cyl("flame", (0.3, 0, 1.58), (0.3, 0, 1.72), 0.03, segments=6, radius_end=0.002)
    p.box("thatch", (0.22, 0, 1.86), (0.42, 0.3, 0.06), Euler((0, math.radians(-12), 0)))
    p.collider((0, 0, 0.875), (0.07, 0.07, 0.875))
    return p.finish(coll, jitter=0.006, seed=13, hk_tags="lamp", hk_light="pelita", hk_light_offset="0.3,0,1.66")


def tempayan(coll):
    """Clay water jar, lathe-turned profile."""
    bm = bmesh.new()
    profile = [(0.0, 0.0), (0.16, 0.0), (0.24, 0.12), (0.27, 0.3), (0.23, 0.5), (0.15, 0.6), (0.16, 0.66), (0.0, 0.66)]
    segments = 14
    rings = []
    for r, z in profile:
        rings.append([bm.verts.new((math.cos(a) * r, math.sin(a) * r, z)) for a in (k / segments * math.tau for k in range(segments))])
    for i in range(len(rings) - 1):
        for k in range(segments):
            bm.faces.new((rings[i][k], rings[i][(k + 1) % segments], rings[i + 1][(k + 1) % segments], rings[i + 1][k]))
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-4)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    p = Piece("tempayan")
    p.bm.free()
    p.bm = bm
    p.mi("clay")
    p.collider((0, 0, 0.33), (0.26, 0.26, 0.33))
    return p.finish(coll, hk_tags="prop")


def net_rack(coll):
    """A-frame drying rack with a fishing net (jala) folded over the top pole, sagging between the frames."""
    p = Piece("net_rack")
    for x in (-1.3, 1.3):
        for s in (-1, 1):
            p.cyl("beam", (x, s * 0.5, 0), (x, 0, 1.9), 0.04, segments=5)
    p.cyl("beam", (-1.5, 0, 1.85), (1.5, 0, 1.85), 0.04, segments=5)
    mat = p.mi("net")
    cols, rows = 12, 6
    for side in (-1, 1):
        grid = []
        for j in range(rows + 1):
            t = j / rows  # 0 at the pole, 1 at the hem
            row = []
            for i in range(cols + 1):
                s = i / cols
                drop = (0.95 + (0.12 if side > 0 else 0.0)) * t + math.sin(math.pi * s) * 0.12 * t
                y = side * (0.05 + 0.12 * math.sin(math.pi * t * 0.8))
                row.append(p.bm.verts.new((-1.2 + 2.4 * s, y, 1.87 - drop)))
            grid.append(row)
        for j in range(rows):
            for i in range(cols):
                face = p.bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
                face.material_index = mat
    p.collider((0, 0, 0.95), (1.4, 0.4, 0.95))
    return p.finish(coll, jitter=0.01, seed=15, hk_tags="prop")


def washing_line(coll):
    p = Piece("washing_line")
    for x in (-2.0, 2.0):
        p.cyl("beam", (x, 0, 0), (x, 0, 2.0), 0.04, segments=5)
    pts = [Vector((-2.0 + 4.0 * t, 0, 1.92 - math.sin(math.pi * t) * 0.18)) for t in (i / 6 for i in range(7))]
    for a, b in zip(pts, pts[1:]):
        p.cyl("beam", tuple(a), tuple(b), 0.008, segments=4)
    for x, w, h, cloth in ((-1.1, 0.7, 0.9, "cloth"), (0.0, 0.9, 1.0, "cloth_b"), (1.05, 0.6, 0.7, "cloth_c")):
        top = 1.92 - math.sin(math.pi * (x + 2) / 4) * 0.18
        p.box(cloth, (x, 0, top - h / 2), (w, 0.01, h))
    p.collider((-2.0, 0, 1.0), (0.05, 0.05, 1.0))
    p.collider((2.0, 0, 1.0), (0.05, 0.05, 1.0))
    return p.finish(coll, jitter=0.004, seed=17, hk_tags="prop")


def pondok_kelip(coll):
    """Hidden Cahaya spot (DECISIONS D-013): a small carved lantern post with a soft firefly glow. Non-religious."""
    p = Piece("pondok_kelip")
    p.cyl("beam", (0, 0, 0), (0, 0, 0.95), 0.07, segments=8)
    p.box("beam", (0, 0, 0.98), (0.34, 0.34, 0.05))
    for x in (-0.14, 0.14):
        for y in (-0.14, 0.14):
            p.box("beam", (x, y, 1.15), (0.04, 0.04, 0.32))
    p.box("glow", (0, 0, 1.13), (0.16, 0.16, 0.2))
    p.box("thatch", (0, 0, 1.36), (0.44, 0.44, 0.07))
    p.cyl("beam", (0, 0, 1.4), (0, 0, 1.55), 0.035, segments=6, radius_end=0.005)
    p.collider((0, 0, 0.75), (0.18, 0.18, 0.75))
    return p.finish(coll, jitter=0.004, seed=19, hk_tags="cahaya_spot", hk_light="kelip", hk_light_offset="0,0,1.13")


def stall_gerai(coll):
    """Mak Som's jetty stall: posts, counter, slanted thatch roof, shelf with jars."""
    p = Piece("stall_gerai")
    for x in (-1.15, 1.15):
        for y, h in ((-0.75, 2.3), (0.75, 2.0)):
            p.box("beam", (x, y, h / 2), (0.1, 0.1, h))
    p.box("planks", (0, -0.75, 0.95), (2.4, 0.5, 0.06))
    p.box("weave", (0, -0.95, 0.47), (2.4, 0.04, 0.92))
    # Lean-to attap roof resting on the post tops: 2.3 m at the front, 2.0 m at the back.
    slope = -math.atan2(0.3, 1.5)
    p.box("thatch", (0, 0, 2.15 + 0.04 / math.cos(slope)), (2.8, 2.0, 0.08), Euler((slope, 0, 0)))
    p.box("beam", (0, -0.75, 2.27), (2.5, 0.1, 0.06))
    p.box("beam", (0, 0.75, 1.97), (2.5, 0.1, 0.06))
    p.box("planks", (0, 0.72, 1.3), (2.2, 0.3, 0.04))
    for x in (-0.7, -0.2, 0.35, 0.8):
        p.cyl("clay", (x, 0.72, 1.32), (x, 0.72, 1.52), 0.07, segments=8, radius_end=0.05)
    p.collider((0, -0.75, 0.5), (1.2, 0.3, 0.5))
    p.collider((0, 0, 2.19), (1.4, 1.0, 0.06), (slope, 0, 0))
    return p.finish(coll, jitter=0.008, seed=21, hk_tags="stall")


def crate(coll):
    p = Piece("crate")
    p.box("planks", (0, 0, 0.25), (0.55, 0.55, 0.5))
    p.collider((0, 0, 0.25), (0.275, 0.275, 0.25))
    return p.finish(coll, jitter=0.01, seed=23, hk_tags="prop,vault")


# ------------------------------------------------------------------------------------------------- prologue flood


def post_snapped(coll):
    """A stilt post snapped by the storm: shorter, leaning, with a splintered top."""
    p = Piece("post_snapped")
    lean = Euler((math.radians(9), math.radians(-6), 0))
    top = lean.to_matrix() @ Vector((0, 0, 1.55))
    p.cyl("beam", (0, 0, -0.6), tuple(top), 0.11, segments=6, radius_end=0.1)
    rng = random.Random(41)
    for k in range(5):
        a = k / 5 * math.tau
        base = top + Vector((math.cos(a) * 0.06, math.sin(a) * 0.06, -0.02))
        tip = base + Vector((rng.uniform(-0.04, 0.04), rng.uniform(-0.04, 0.04), rng.uniform(0.08, 0.22)))
        p.cyl("beam", tuple(base), tuple(tip), 0.03, segments=4, radius_end=0.004)
    p.collider((0, 0, 0.45), (0.11, 0.11, 1.05), (math.radians(9), math.radians(-6), 0))
    return p.finish(coll, jitter=0.01, seed=43, hk_tags="post,broken")


def floor_broken(coll):
    """Storm-damaged floor: planks as strips with gaps and one plank levered up."""
    p = Piece("floor_broken")
    strips = 10
    width = 3.0 / strips
    missing = {3, 7}
    for i in range(strips):
        if i in missing:
            continue
        y = -1.5 + width * (i + 0.5)
        if i == 5:
            p.box("planks", (0.2, y, FLOOR + 0.12), (2.6, width * 0.92, 0.06), Euler((math.radians(-14), math.radians(4), 0)))
        else:
            p.box("planks", (0, y, FLOOR - 0.03), (3.0, width * 0.94, 0.06))
    for y in (-1.38, 0.0, 1.38):
        p.box("beam", (0, y, FLOOR - 0.13), (3.0, 0.12, 0.14))
    for x in (-1.38, 1.38):
        p.box("beam", (x, 0, FLOOR - 0.24), (0.14, 3.0, 0.16))
    # Colliders for the intact runs of planks (gaps stay open).
    p.collider((0, -1.5 + width * 1.5, FLOOR - 0.1), (1.5, width * 1.5, 0.1))
    p.collider((0, -1.5 + width * 5.0, FLOOR - 0.1), (1.5, width * 1.0, 0.1))
    p.collider((0, -1.5 + width * 9.0, FLOOR - 0.1), (1.5, width * 1.0, 0.1))
    return p.finish(coll, jitter=0.012, seed=45, hk_tags="floor,broken")


def wall_planks_broken(coll):
    """Wall with missing planks and one hanging by a nail."""
    p = Piece("wall_planks_broken")
    _wall_frame(p)
    rows = 10
    height = (WALL_H - 0.24) / rows
    missing = {2, 3, 7}
    for r in range(rows):
        if r in missing:
            continue
        z = FLOOR + 0.12 + height * (r + 0.5)
        p.box("planks", (0, 0, z), (2.76, 0.06, height * 0.95))
    hang = Euler((0, math.radians(32), 0))
    p.box("planks", (0.55, -0.05, FLOOR + 0.12 + height * 3.0), (1.3, 0.05, height * 0.9), hang)
    p.collider((0, 0, FLOOR + WALL_H / 2), (1.5, 0.06, WALL_H / 2))
    return p.finish(coll, jitter=0.01, seed=47, hk_tags="wall,broken")


def roof_broken(coll):
    """Roof module torn open: one slab section missing, another sagging."""
    p = Piece("roof_broken")
    slope_len = HALF_SPAN / math.cos(PITCH)
    thick = 0.16
    for side in (-1, 1):
        for k, y in enumerate((-1.0, 0.0, 1.0)):
            if side == -1 and k == 1:
                continue  # the hole
            pitch = PITCH + (math.radians(12) if side == 1 and k == 2 else 0)
            rot = Euler((0, side * pitch, 0))
            mid = Vector((side * HALF_SPAN / 2, y, (EAVE + RIDGE) / 2 - (0.18 if side == 1 and k == 2 else 0)))
            normal = rot.to_matrix() @ Vector((0, 0, 1))
            centre = mid + normal * (thick / 2)
            p.box("thatch", tuple(centre), (slope_len + 0.05, 0.98, thick), rot)
            p.collider(tuple(centre), (slope_len / 2, 0.49, thick / 2), (0, side * pitch, 0))
    p.cyl("thatch", (0, -1.5, RIDGE + 0.14), (0, 0.4, RIDGE + 0.1), 0.16, segments=8)
    p.cyl("beam", (0, 0.4, RIDGE - 0.1), (0.3, 1.5, RIDGE - 0.7), 0.06, segments=5)
    return p.finish(coll, jitter=0.02, seed=49, hk_tags="roof,broken")


def debris_planks(coll):
    """Floating flood debris: loose planks and a basket, origin at the water line (the runtime bobs it)."""
    rng = random.Random(51)
    p = Piece("debris_planks")
    for _ in range(7):
        x, y = rng.uniform(-1.6, 1.6), rng.uniform(-1.6, 1.6)
        rot = Euler((math.radians(rng.uniform(-8, 8)), math.radians(rng.uniform(-6, 6)), rng.uniform(0, math.pi)))
        p.box("planks", (x, y, 0.02), (rng.uniform(1.2, 2.4), 0.22, 0.05), rot)
    p.cyl("weave", (0.6, -0.4, -0.08), (0.6, -0.4, 0.22), 0.24, segments=10, radius_end=0.28)
    return p.finish(coll, hk_tags="debris,float")


# ------------------------------------------------------------------------------------------------- build & export

BUILDERS = [
    post,
    floor_3x3,
    lambda c: wall(c, "wall_planks", "planks"),
    lambda c: wall(c, "wall_weave", "weave"),
    lambda c: wall(c, "wall_window", "weave", (-0.55, 0.55, 0.5, 1.85)),
    lambda c: wall(c, "wall_door", "planks", (-0.45, 0.45, 0.0, 1.95)),
    roof_gable_3,
    gable_end,
    stairs,
    railing_3,
    jetty_3,
    boardwalk_3,
    bollard,
    lambda c: berembang(c, "berembang_a", 301, 7.5, 2.6, 8),
    lambda c: berembang(c, "berembang_b", 302, 6.0, 2.2, 7),
    pneumatophores,
    nipah_clump,
    sampan,
    pelita_post,
    tempayan,
    net_rack,
    washing_line,
    pondok_kelip,
    stall_gerai,
    crate,
    post_snapped,
    floor_broken,
    wall_planks_broken,
    roof_broken,
    debris_planks,
]


def vertical_gradient(obj, bottom: float = 0.55, top: float = 1.0) -> None:
    """Darkens foliage toward its base (cheap stand-in for occlusion on alpha cards)."""
    attr = hk.ensure_color_attribute(obj)
    mesh = obj.data
    zs = [v.co.z for v in mesh.vertices]
    z0, z1 = min(zs), max(zs)
    values = []
    for loop in mesh.loops:
        t = (mesh.vertices[loop.vertex_index].co.z - z0) / max(z1 - z0, 1e-4)
        g = bottom + (top - bottom) * t
        values.extend((g, g, g, 1.0))
    attr.data.foreach_set("color", values)


def vignette(pieces: dict) -> list:
    """Assembles a small scene from linked duplicates for preview renders (not exported)."""
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
            placed.append(dup)

    for gx in (-1.5, 1.5):
        place("floor_3x3", gx, 0)
    for gx in (-3.0, 0.0, 3.0):
        for gy in (-1.5, 1.5):
            place("post", gx, gy)
    place("wall_door", -1.5, -1.5)
    place("wall_window", 1.5, -1.5)
    place("wall_weave", -1.5, 1.5)
    place("wall_planks", 1.5, 1.5)
    place("roof_gable_3", -1.5, 0, 0, math.pi / 2)
    place("roof_gable_3", 1.5, 0, 0, math.pi / 2)
    place("gable_end", -3.0, 0, 0, math.pi / 2)
    place("gable_end", 3.0, 0, 0, -math.pi / 2)
    place("stairs", -1.5, -1.5)
    place("jetty_3", -7.0, -4.0)
    place("jetty_3", -7.0, -1.0)
    place("jetty_3", -7.0, 2.0)
    place("sampan", -9.4, -0.5, -0.1, 0.1)
    place("pelita_post", -5.9, -3.2)
    place("berembang_a", 8.5, 4.5)
    place("berembang_b", 6.0, -6.0)
    place("akar_napas", 8.5, 4.5)
    place("nipah_clump", 4.5, 6.5)
    place("washing_line", 2.0, -5.5)
    place("tempayan", -3.6, -2.4)
    place("pondok_kelip", 5.5, -2.5)
    place("stall_gerai", -6.0, 5.5)
    place("crate", -4.4, 3.2)
    return placed


def flood_vignette(pieces: dict) -> list:
    """A storm-damaged house over flood water for previewing the prologue pieces (not exported)."""
    coll = hk.collection("flood_vignette")
    placed = []

    def place(name, x, y, z=0.0, rz=0.0):
        src = pieces[name]
        dup = src.copy()
        dup.parent = None
        coll.objects.link(dup)
        dup.location = (x, y, z)
        dup.rotation_euler = (0, 0, rz)
        dup.hide_render = False  # the kit originals are hidden for the first previews
        placed.append(dup)

    place("floor_broken", -1.5, 0)
    place("floor_3x3", 1.5, 0)
    for gx, gy in ((-3.0, -1.5), (0.0, -1.5), (3.0, -1.5), (-3.0, 1.5), (3.0, 1.5)):
        place("post", gx, gy)
    place("post_snapped", 0.0, 1.5)
    place("wall_planks_broken", -1.5, -1.5)
    place("wall_window", 1.5, -1.5)
    place("roof_broken", -1.5, 0, 0, math.pi / 2)
    place("roof_gable_3", 1.5, 0, 0, math.pi / 2)
    place("debris_planks", -4.0, -5.0, 0.4)
    place("debris_planks", 3.0, -6.0, 0.4, 1.2)
    return placed


def main() -> None:
    args = hk.cli_args()
    out_dir = args.get("out", os.path.join(hk.REPO_DIR, "build-cache", "raw"))
    preview_dir = args.get("previews")
    hk.reset_scene(seed=2026)
    build_materials()
    coll = hk.collection("kampung_kit")
    pieces = {}
    for builder in BUILDERS:
        obj = builder(coll)
        pieces[obj.name] = obj
    meshes = [o for o in coll.all_objects if o.type == "MESH"]
    for obj in meshes:
        materials = obj.get("hk_materials", "")
        if obj.get("hk_foliage") or (materials and all(m in NO_AO for m in materials.split(","))):
            vertical_gradient(obj)
    hk.bake_ao_to_vertex_colors(
        [o for o in meshes if not o.get("hk_foliage") and o.get("hk_materials") and not all(m in NO_AO for m in o["hk_materials"].split(","))],
        samples=24,
    )
    roots = [o for o in coll.objects if o.parent is None]
    hk.export_glb(os.path.join(out_dir, "kampung_kit.glb"), roots)
    if preview_dir:
        placed = vignette(pieces)
        for obj in coll.all_objects:
            obj.hide_render = True
        hk.render_preview(os.path.join(preview_dir, "kampung_vignette_a.png"), placed, azimuth_deg=35, elevation_deg=20)
        hk.render_preview(os.path.join(preview_dir, "kampung_vignette_b.png"), placed, azimuth_deg=200, elevation_deg=14)
        for obj in placed:
            obj.hide_render = True
        flooded = flood_vignette(pieces)
        hk.render_preview(os.path.join(preview_dir, "kampung_flood.png"), flooded, azimuth_deg=25, elevation_deg=18)
    triangles = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in meshes)
    print(f"HK_KIT kampung pieces={len(pieces)} meshes={len(meshes)} triangles={triangles}")


main()

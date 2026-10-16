"""Shared building blocks for modular kits and props (docs/ASSETS.md §1): the material registry, per-material UV
rules, the `Piece` geometry accumulator, alpha cards and the foliage gradient. Used by tools/blender/kits/*.py and
tools/blender/props/*.py.
"""

from __future__ import annotations

import math

import bmesh
import bpy
from mathutils import Euler, Vector

from lib import hk

MATERIALS: dict[str, bpy.types.Material] = {}
UV_SCALE = {"planks": 1.0, "beam": 1.0, "thatch": 1.6, "weave": 1.0, "bark": 1.5, "clay": 0.6, "cloth": 1.0, "net": 0.5}
NO_AO = {"leaves", "frond", "flame", "glow", "net", "cloth", "cloth_b", "cloth_c"}
SLOPE_MAPPED = {"thatch"}  # textures with a slope direction get slope-aligned UVs
GRAIN = {"beam": "u", "bark": "v"}  # grain/fibre direction in the texture, mapped along each element's long axis
GRAIN_BOXES = {"beam"}  # box elements that carry grain (plank infill keeps world-aligned planks)


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


def card(piece, uv, mat, center, size, normal, spin):
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


def shade_vertex_colours(meshes, samples: int = 24) -> None:
    """Foliage and unlit-style pieces get a vertical gradient; everything else gets baked self-AO."""
    baked = []
    for obj in meshes:
        materials = obj.get("hk_materials", "")
        if obj.get("hk_foliage") or (materials and all(m in NO_AO for m in materials.split(","))):
            vertical_gradient(obj)
        elif materials:
            baked.append(obj)
    if baked:
        hk.bake_ao_to_vertex_colors(baked, samples=samples)

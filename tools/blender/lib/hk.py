"""Shared helpers for Hikayat Kelip asset scripts (Blender 5.2 LTS, headless).

Every script is deterministic: geometry and textures depend only on fixed seeds, so `npm run assets`
rebuilds byte-stable outputs. Scripts import this module after adding tools/blender to sys.path.
"""

from __future__ import annotations

import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

TOOLS_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO_DIR = os.path.dirname(os.path.dirname(TOOLS_DIR))


def cli_args() -> dict:
    """Parses `-- --key value --flag` arguments passed after Blender's own options."""
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    out: dict = {}
    i = 0
    while i < len(argv):
        key = argv[i]
        if key.startswith("--"):
            if i + 1 < len(argv) and not argv[i + 1].startswith("--"):
                out[key[2:]] = argv[i + 1]
                i += 2
            else:
                out[key[2:]] = True
                i += 1
        else:
            i += 1
    return out


def reset_scene(seed: int = 1) -> None:
    """Empty factory scene in metres, deterministic RNG."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    random.seed(seed)


def collection(name: str) -> bpy.types.Collection:
    """Gets or creates a collection linked to the scene."""
    coll = bpy.data.collections.get(name)
    if coll is None:
        coll = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(coll)
    return coll


def object_from_bmesh(name: str, bm: bmesh.types.BMesh, coll: bpy.types.Collection | None = None) -> bpy.types.Object:
    """Creates a mesh object from a bmesh (frees the bmesh)."""
    mesh = bpy.data.meshes.new(name)
    bm.normal_update()
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    (coll or bpy.context.scene.collection).objects.link(obj)
    return obj


# ---------------------------------------------------------------------------------------------------------------
# Geometry helpers (all add into an existing bmesh and return the new faces)
# ---------------------------------------------------------------------------------------------------------------


def add_box(bm, center, size, rotation=None, material=0):
    """Adds an axis-aligned (optionally rotated) box. size = (x, y, z) full extents."""
    result = bmesh.ops.create_cube(bm, size=1.0)
    verts = result["verts"]
    m = Matrix.Diagonal((size[0], size[1], size[2], 1.0))
    if rotation is not None:
        m = rotation.to_matrix().to_4x4() @ m
    m = Matrix.Translation(Vector(center)) @ m
    bmesh.ops.transform(bm, matrix=m, verts=verts)
    faces = list({f for v in verts for f in v.link_faces})
    for f in faces:
        f.material_index = material
    return faces


def add_cylinder(bm, start, end, radius, segments=8, radius_end=None, material=0, cap=True):
    """Adds a tapered cylinder between two points."""
    start = Vector(start)
    end = Vector(end)
    axis = end - start
    length = axis.length
    r1 = radius_end if radius_end is not None else radius
    result = bmesh.ops.create_cone(
        bm,
        cap_ends=cap,
        cap_tris=False,
        segments=segments,
        radius1=radius,
        radius2=r1,
        depth=length,
    )
    verts = result["verts"]
    rot = Vector((0, 0, 1)).rotation_difference(axis.normalized())
    m = Matrix.Translation(start + axis * 0.5) @ rot.to_matrix().to_4x4()
    bmesh.ops.transform(bm, matrix=m, verts=verts)
    faces = list({f for v in verts for f in v.link_faces})
    for f in faces:
        f.material_index = material
    return faces


def add_tube(bm, points, radii, segments: int = 6, material: int = 0, cap_start: bool = True):
    """Adds one continuous tube along a polyline (rings oriented by parallel transport), tapering by `radii`.
    The last ring collapses to a point when its radius is 0. Returns the list of rings (lists of BMVerts)."""
    points = [Vector(p) for p in points]
    tangents = []
    for i in range(len(points)):
        a = points[max(i - 1, 0)]
        b = points[min(i + 1, len(points) - 1)]
        tangents.append((b - a).normalized())
    normal = tangents[0].orthogonal().normalized()
    rings = []
    for i, (p, t, r) in enumerate(zip(points, tangents, radii)):
        if i > 0:
            # Parallel transport the normal so rings do not twist.
            normal = (normal - t * normal.dot(t)).normalized()
        binormal = t.cross(normal)
        ring = []
        for k in range(segments):
            a = k / segments * math.tau
            ring.append(bm.verts.new(p + (normal * math.cos(a) + binormal * math.sin(a)) * r))
        rings.append(ring)
    for i in range(len(rings) - 1):
        for k in range(segments):
            k2 = (k + 1) % segments
            face = bm.faces.new((rings[i][k], rings[i][k2], rings[i + 1][k2], rings[i + 1][k]))
            face.material_index = material
    if cap_start:
        face = bm.faces.new(list(reversed(rings[0])))
        face.material_index = material
    tip = bm.verts.new(points[-1] + tangents[-1] * radii[-1])
    for k in range(segments):
        face = bm.faces.new((rings[-1][k], rings[-1][(k + 1) % segments], tip))
        face.material_index = material
    return rings


def jitter(bm, amount: float, seed: int, faces=None) -> None:
    """Offsets vertices by a small deterministic amount (hand-made, slightly crooked look)."""
    rng = random.Random(seed)
    verts = {v for f in faces for v in f.verts} if faces else bm.verts
    for v in sorted(verts, key=lambda v: (round(v.co.x, 4), round(v.co.y, 4), round(v.co.z, 4))):
        v.co.x += (rng.random() - 0.5) * amount
        v.co.y += (rng.random() - 0.5) * amount
        v.co.z += (rng.random() - 0.5) * amount * 0.5


def box_uv(bm, scale: float = 1.0, uv_name: str = "UVMap") -> None:
    """World-scaled box projection: each face projects on its dominant axis; 1 UV unit = `scale` metres."""
    uv_layer = bm.loops.layers.uv.get(uv_name) or bm.loops.layers.uv.new(uv_name)
    for face in bm.faces:
        n = face.normal
        ax, ay, az = abs(n.x), abs(n.y), abs(n.z)
        for loop in face.loops:
            co = loop.vert.co
            if az >= ax and az >= ay:
                u, v = co.x, co.y
            elif ax >= ay:
                u, v = co.y, co.z
            else:
                u, v = co.x, co.z
            loop[uv_layer].uv = (u / scale, v / scale)


# ---------------------------------------------------------------------------------------------------------------
# Materials and textures
# ---------------------------------------------------------------------------------------------------------------


def image_from_array(name: str, pixels, alpha: bool = False) -> bpy.types.Image:
    """Creates a packed PNG image from a float32 array of shape (h, w, 4) with values 0..1 (sRGB)."""
    height, width = pixels.shape[0], pixels.shape[1]
    image = bpy.data.images.new(name, width=width, height=height, alpha=alpha)
    image.pixels.foreach_set(pixels.astype("float32").ravel())
    image.file_format = "PNG"
    image.pack()
    return image


def textured_material(name: str, image: bpy.types.Image, roughness: float = 0.9, alpha_clip: bool = False):
    """Principled material: texture × vertex colour (AO/tint), exported as baseColorTexture + COLOR_0."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = image
    tex.interpolation = "Linear"
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = 0.0
    links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    if alpha_clip:
        # glTF exporter (4.2+) reads alpha clipping from a "Greater Than" math node: alphaMode MASK, cutoff 0.5.
        clip = nodes.new("ShaderNodeMath")
        clip.operation = "GREATER_THAN"
        clip.inputs[1].default_value = 0.5
        links.new(tex.outputs["Alpha"], clip.inputs[0])
        links.new(clip.outputs["Value"], bsdf.inputs["Alpha"])
    return mat


def emissive_material(name: str, color, strength: float = 3.0):
    """Unlit-looking emissive material (lantern flames, glow cores)."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Emission Color"].default_value = (*color, 1.0)
    bsdf.inputs["Emission Strength"].default_value = strength
    return mat


def ensure_color_attribute(obj, name: str = "Col"):
    """Adds a white byte colour attribute on face corners (target for AO bakes and tints)."""
    mesh = obj.data
    attr = mesh.color_attributes.get(name)
    if attr is None:
        attr = mesh.color_attributes.new(name=name, type="BYTE_COLOR", domain="CORNER")
        values = [1.0] * (len(mesh.loops) * 4)
        attr.data.foreach_set("color", values)
    mesh.color_attributes.active_color = attr
    mesh.color_attributes.render_color_index = list(mesh.color_attributes).index(attr)
    return attr


def bake_ao_to_vertex_colors(objects, samples: int = 24, distance: float = 1.2, strength: float = 0.75) -> None:
    """Bakes ambient occlusion of each object (self-occlusion) into its colour attribute, softened by `strength`."""
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = samples
    scene.render.bake.target = "VERTEX_COLORS"
    world = scene.world or bpy.data.worlds.new("World")
    scene.world = world
    world.light_settings.distance = distance
    for obj in objects:
        if obj.type != "MESH":
            continue
        ensure_color_attribute(obj)
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.bake(type="AO")
        attr = obj.data.color_attributes.active_color
        count = len(attr.data)
        values = [0.0] * (count * 4)
        attr.data.foreach_get("color", values)
        for i in range(count):
            for c in range(3):
                ao = values[i * 4 + c]
                values[i * 4 + c] = 1.0 - (1.0 - ao) * strength
            values[i * 4 + 3] = 1.0
        attr.data.foreach_set("color", values)


def set_extras(obj, **props) -> None:
    """Stores glTF extras (custom properties) on an object: colliders, traversal tags, LOD hints."""
    for key, value in props.items():
        obj[key] = value


def add_collider_box(parent, name: str, center, half_extents, rotation=None) -> bpy.types.Object:
    """Adds an empty whose transform defines a box collider (exported as a node with extras).
    The empty's scale holds the half extents; `rotation` is an optional Euler (radians)."""
    empty = bpy.data.objects.new(name, None)
    empty.empty_display_type = "CUBE"
    empty.location = center
    empty.scale = half_extents
    if rotation is not None:
        empty.rotation_euler = rotation
    empty.parent = parent
    empty["hk_collider"] = "box"
    for coll in parent.users_collection:
        coll.objects.link(empty)
    return empty


def add_lod(obj, ratio: float, suffix: str = "__lod1") -> bpy.types.Object:
    """Creates a decimated copy for distant rendering."""
    lod = obj.copy()
    lod.data = obj.data.copy()
    lod.name = obj.name + suffix
    for coll in obj.users_collection:
        coll.objects.link(lod)
    mod = lod.modifiers.new("lod", "DECIMATE")
    mod.ratio = ratio
    bpy.context.view_layer.objects.active = lod
    bpy.ops.object.select_all(action="DESELECT")
    lod.select_set(True)
    bpy.ops.object.modifier_apply(modifier=mod.name)
    lod["hk_lod_of"] = obj.name
    return lod


# ---------------------------------------------------------------------------------------------------------------
# Export and previews
# ---------------------------------------------------------------------------------------------------------------


def export_glb(path: str, objects=None, animations: bool = False) -> None:
    """Exports objects (or the whole scene) as GLB with extras and the active colour attribute."""
    path = os.path.abspath(path)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    if objects is not None:
        for obj in objects:
            obj.select_set(True)
            for child in obj.children_recursive:
                child.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=objects is not None,
        export_extras=True,
        export_yup=True,
        export_apply=True,
        export_vertex_color="ACTIVE",
        export_all_vertex_colors=False,
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
        export_image_format="AUTO",
        export_animations=animations,
        export_cameras=False,
        export_lights=False,
    )
    print(f"HK_EXPORT {path}")


def render_preview(path: str, objects, size=(960, 540), elevation_deg: float = 22.0, azimuth_deg: float = 35.0) -> None:
    """Renders a quick Eevee preview of objects framed by an orbit camera (for automated visual checks)."""
    scene = bpy.context.scene
    engines = {item.identifier for item in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items}
    scene.render.engine = next(e for e in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT", "BLENDER_WORKBENCH") if e in engines)
    scene.render.resolution_x, scene.render.resolution_y = size
    scene.render.film_transparent = False
    scene.view_settings.view_transform = "AgX"
    world = scene.world or bpy.data.worlds.new("World")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    bg.inputs["Color"].default_value = (0.05, 0.07, 0.14, 1.0)
    bg.inputs["Strength"].default_value = 0.9

    # Bounds of everything to frame.
    points = []
    for obj in objects:
        if obj.type == "MESH":
            points.extend(obj.matrix_world @ Vector(c) for c in obj.bound_box)
    lo = Vector((min(p.x for p in points), min(p.y for p in points), min(p.z for p in points)))
    hi = Vector((max(p.x for p in points), max(p.y for p in points), max(p.z for p in points)))
    center = (lo + hi) * 0.5
    radius = max((hi - lo).length * 0.5, 0.5)

    cam_data = bpy.data.cameras.new("PreviewCam")
    cam_data.lens = 50
    cam = bpy.data.objects.new("PreviewCam", cam_data)
    scene.collection.objects.link(cam)
    el = math.radians(elevation_deg)
    az = math.radians(azimuth_deg)
    distance = radius / math.tan(math.radians(20)) * 1.05
    cam.location = center + Vector((math.cos(el) * math.sin(az), -math.cos(el) * math.cos(az), math.sin(el))) * distance
    direction = center - cam.location
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam

    sun_data = bpy.data.lights.new("PreviewSun", "SUN")
    sun_data.energy = 3.0
    sun = bpy.data.objects.new("PreviewSun", sun_data)
    sun.rotation_euler = (math.radians(50), 0, math.radians(30))
    scene.collection.objects.link(sun)

    path = os.path.abspath(path)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam)
    bpy.data.objects.remove(sun)
    if not os.path.exists(path):
        raise RuntimeError(f"Preview render did not produce {path} (engine {scene.render.engine})")
    print(f"HK_PREVIEW {path} engine={scene.render.engine}")

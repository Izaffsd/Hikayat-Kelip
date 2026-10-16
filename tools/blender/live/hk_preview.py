"""Live-Blender preview helpers for asset reviews over the Blender MCP (docs/PRODUCTION.md, Live tool rules).

Run inside the user's interactive Blender with:
    exec(open(r"D:/dev/hikayat-kelip/tools/blender/live/hk_preview.py").read())

Everything happens in a separate scene, ``HK_Preview``. Every datablock these helpers create is recorded on that
scene, and ``finish()`` removes exactly those and switches the window back, so the user's own scene and data are
never touched. Nothing here deletes files, writes outside the project, or uses the network. Shipped assets are built
headless by ``npm run assets``; this is for looking only.
"""

import json
import math

import bpy
from mathutils import Euler, Vector

PREVIEW = "HK_Preview"
ID_COLLECTIONS = (
    "objects", "meshes", "materials", "images", "textures", "armatures", "actions", "collections", "cameras",
    "lights", "node_groups", "curves", "worlds",
)


def _snapshot():
    return {name: set(getattr(bpy.data, name).keys()) for name in ID_COLLECTIONS}


def _record(before):
    scene = bpy.data.scenes[PREVIEW]
    created = json.loads(scene.get("hk_created", "[]"))
    for name in ID_COLLECTIONS:
        for key in set(getattr(bpy.data, name).keys()) - before[name]:
            created.append([name, key])
    scene["hk_created"] = json.dumps(created)


def window():
    return bpy.context.window_manager.windows[0]


def view3d():
    for area in window().screen.areas:
        if area.type == "VIEW_3D":
            return area
    raise RuntimeError("no 3D viewport")


def ensure_scene():
    """Creates (once) and shows the preview scene; remembers the user's scene for finish()."""
    win = window()
    if PREVIEW not in bpy.data.scenes:
        before = _snapshot()
        returning = win.scene.name
        scene = bpy.data.scenes.new(PREVIEW)
        scene["hk_return_scene"] = returning
        scene["hk_created"] = "[]"
        world = bpy.data.worlds.new("HK_PreviewWorld")
        world.color = (0.05, 0.06, 0.09)
        scene.world = world
        scene.render.engine = "BLENDER_EEVEE"
        _record(before)
    win.scene = bpy.data.scenes[PREVIEW]
    return bpy.data.scenes[PREVIEW]


def clear():
    """Removes the objects and data of earlier imports (only datablocks this module created)."""
    scene = bpy.data.scenes[PREVIEW]
    created = json.loads(scene.get("hk_created", "[]"))
    keep = []
    for kind, name in created:
        if kind == "worlds":
            keep.append([kind, name])
            continue
        block = getattr(bpy.data, kind).get(name)
        if block is not None:
            getattr(bpy.data, kind).remove(block)
    scene["hk_created"] = json.dumps(keep)


def import_glb(path, label):
    """Imports a GLB into its own collection in the preview scene and returns the imported objects."""
    scene = ensure_scene()
    before = _snapshot()
    collection = bpy.data.collections.new(label)
    scene.collection.children.link(collection)
    layer = bpy.context.view_layer.layer_collection.children[collection.name]
    bpy.context.view_layer.active_layer_collection = layer
    with bpy.context.temp_override(window=window(), scene=scene):
        bpy.ops.import_scene.gltf(filepath=path)
    _record(before)
    return list(collection.all_objects)


def look(objects, azimuth=30.0, elevation=20.0, margin=1.15, shading="MATERIAL"):
    """Points the 3D viewport at the objects' bounding box (azimuth 0 looks from -Y, the front)."""
    points = []
    for obj in objects:
        if obj.type in {"MESH", "CURVE"}:
            points += [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    if not points:
        points = [obj.matrix_world.translation for obj in objects]
    low = Vector((min(p.x for p in points), min(p.y for p in points), min(p.z for p in points)))
    high = Vector((max(p.x for p in points), max(p.y for p in points), max(p.z for p in points)))
    area = view3d()
    space = area.spaces.active
    space.shading.type = shading
    r3d = space.region_3d
    r3d.view_perspective = "PERSP"
    r3d.view_location = (low + high) / 2
    radius = (high - low).length / 2
    half_fov = math.atan(18.0 / space.lens)  # viewport lens on a 36 mm sensor
    r3d.view_distance = max(0.5, radius * margin / math.sin(half_fov))
    r3d.view_rotation = Euler((math.radians(90 - elevation), 0, math.radians(azimuth)), "XYZ").to_quaternion()
    return {"center": list(r3d.view_location), "size": list(high - low)}


def _bounds(obj):
    points = []
    for o in [obj, *obj.children_recursive]:
        if o.type == "MESH":
            points += [o.matrix_world @ Vector(c) for c in o.bound_box]
    low = Vector((min(p.x for p in points), min(p.y for p in points), min(p.z for p in points)))
    high = Vector((max(p.x for p in points), max(p.y for p in points), max(p.z for p in points)))
    return low, high


def layout(rows, gap=1.5, row_gap=3.0):
    """Spreads root objects (by name) into rows along +X, rows stepping toward -Y."""
    scene = bpy.data.scenes[PREVIEW]
    y = 0.0
    for row in rows:
        x = 0.0
        depth = 0.0
        for name in row:
            obj = scene.objects[name]
            obj.location = (0, 0, 0)
            bpy.context.view_layer.update()
            low, high = _bounds(obj)
            obj.location = (x - low.x, y - low.y, 0)
            x += (high.x - low.x) + gap
            depth = max(depth, high.y - low.y)
        y -= depth + row_gap
    bpy.context.view_layer.update()


def solo(names, azimuth=30.0, elevation=20.0, margin=1.0, shading="MATERIAL", show_empties=False):
    """Shows only the named preview objects (with their children) and frames them."""
    scene = bpy.data.scenes[PREVIEW]
    keep = set()
    for name in names:
        obj = scene.objects[name]
        keep.add(obj)
        keep.update(obj.children_recursive)
    for obj in scene.objects:
        visible = obj in keep and (show_empties or obj.type != "EMPTY")
        obj.hide_set(not visible)
        obj.select_set(False)
    return look([o for o in keep if o.type == "MESH"], azimuth, elevation, margin, shading)


def finish():
    """Removes everything the preview created, the preview scene included, and shows the user's scene again."""
    if PREVIEW not in bpy.data.scenes:
        return "nothing to clean"
    scene = bpy.data.scenes[PREVIEW]
    returning = scene.get("hk_return_scene")
    created = json.loads(scene.get("hk_created", "[]"))
    if returning in bpy.data.scenes:
        window().scene = bpy.data.scenes[returning]
    bpy.data.scenes.remove(scene)
    for kind, name in created:
        block = getattr(bpy.data, kind).get(name)
        if block is not None:
            getattr(bpy.data, kind).remove(block)
    return f"removed {len(created)} datablocks and {PREVIEW}; showing {returning}"

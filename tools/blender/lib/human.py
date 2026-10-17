"""Human character helpers (docs/ASSETS.md §2): load a Quaternius Universal Base Character (CC0), conform its rest
pose to the animation rig, reshape it, and preview clips on it.

Why conform: our clips (anim_* packs, built from the Universal Animation Libraries) store absolute local bone
rotations. The base bodies use the same 65 bone names, but some rest orientations differ (spine_03 ≈ 11°, thumbs
≈ 13°, neck ≈ 6°), which would tilt the chest of every character. `conform_rest` poses each bone to the animation
rig's rest orientation, bakes that pose into the meshes and makes it the new rest pose; bone lengths (the body's
proportions) are kept.
"""

from __future__ import annotations

import math
import os

import bmesh
import bpy
from mathutils import Matrix, Vector

UBC_ROOT = os.path.join("quaternius", "ubc", "extracted", "Universal Base Characters[Standard]")
UBC_DIR = os.path.join(UBC_ROOT, "Base Characters", "Godot - UE")
UBC_TEXTURES = os.path.join(UBC_ROOT, "Base Characters", "Textures")
UBC_HAIR = os.path.join(UBC_ROOT, "Hairstyles", "Origin at 0", "glTF (Godot)")
BASES = {"male": "Superhero_Male_FullBody.gltf", "female": "Superhero_Female_FullBody.gltf"}
SKIN_TEXTURES = {"male": "T_Superhero_Male_Dark.png", "female": "T_Superhero_Female_Dark_BaseColor.png"}


def import_gltf(path: str) -> list:
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    return [o for o in bpy.data.objects if o not in before]


def load_base(raw_dir: str, sex: str) -> dict:
    """Imports a base body. Returns {"rig", "body", "eyes", "brows"}; drops the stray helper sphere."""
    objects = import_gltf(os.path.join(raw_dir, UBC_DIR, BASES[sex]))
    parts = {"rig": None, "body": None, "eyes": None, "brows": None}
    for obj in objects:
        if obj.type == "ARMATURE":
            parts["rig"] = obj
        elif obj.type == "MESH" and obj.name.lower().startswith("superhero"):
            parts["body"] = obj
        elif obj.type == "MESH" and obj.name.startswith("Eyes"):
            parts["eyes"] = obj
        elif obj.type == "MESH" and obj.name.startswith("Eyebrows"):
            parts["brows"] = obj
        elif obj.type == "MESH":
            bpy.data.objects.remove(obj, do_unlink=True)  # "Icosphere" helper, not part of the character
    missing = [k for k, v in parts.items() if v is None]
    if missing:
        raise RuntimeError(f"Base body {sex} is missing {missing}")
    return parts


def load_reference_rig(anim_glb: str):
    """Imports the animation pack (armature + actions) used as the rest-pose reference and clip source."""
    objects = import_gltf(anim_glb)
    rig = next(o for o in objects if o.type == "ARMATURE")
    for obj in objects:
        if obj.type == "MESH":
            bpy.data.objects.remove(obj, do_unlink=True)
    return rig


def angle_between(a, b) -> float:
    """Smallest rotation angle (radians) between two orientations (q and −q are the same rotation)."""
    angle = a.rotation_difference(b).angle
    return min(angle, 2 * math.pi - angle)


def _hierarchy(bones):
    ordered = []

    def visit(bone):
        ordered.append(bone)
        for child in bone.children:
            visit(child)

    for bone in bones:
        if bone.parent is None:
            visit(bone)
    return ordered


def _mode(obj, mode):
    bpy.context.view_layer.objects.active = obj
    for other in bpy.context.selected_objects:
        other.select_set(False)
    obj.select_set(True)
    if obj.mode != mode:
        bpy.ops.object.mode_set(mode=mode)


def conform_rest(rig, meshes, reference) -> float:
    """Poses `rig` so every bone's armature-space orientation equals `reference`'s rest orientation (same names),
    bakes the pose into `meshes` and applies it as the new rest pose. Returns the largest correction in degrees."""
    rig.data.pose_position = "POSE"
    reference.data.pose_position = "REST"
    _mode(rig, "POSE")
    worst = 0.0
    for bone in _hierarchy(rig.data.bones):
        ref = reference.data.bones.get(bone.name)
        if ref is None:
            continue
        pose_bone = rig.pose.bones[bone.name]
        bpy.context.view_layer.update()
        current = pose_bone.matrix.copy()
        target = (rig.matrix_world.inverted() @ reference.matrix_world @ ref.matrix_local).to_quaternion()
        worst = max(worst, angle_between(current.to_quaternion(), target))
        pose_bone.matrix = Matrix.LocRotScale(current.translation, target, current.to_scale())
    bpy.context.view_layer.update()
    _mode(rig, "OBJECT")
    for mesh in meshes:
        modifier = next((m for m in mesh.modifiers if m.type == "ARMATURE"), None)
        if modifier is None:
            continue
        _mode(mesh, "OBJECT")
        name = modifier.name
        bpy.ops.object.modifier_apply(modifier=name)
        new = mesh.modifiers.new(name, "ARMATURE")
        new.object = rig
    _mode(rig, "POSE")
    bpy.ops.pose.armature_apply(selected=False)
    _mode(rig, "OBJECT")
    return worst * 57.29578


def play(rig, action_name: str, at: float = 0.5) -> None:
    """Assigns an action (by name) to the rig and moves the scene to a point in it (0..1)."""
    action = bpy.data.actions[action_name]
    if rig.animation_data is None:
        rig.animation_data_create()
    rig.animation_data.action = action
    if action.slots:
        rig.animation_data.action_slot = action.slots[0]
    start, end = action.frame_range
    bpy.context.scene.frame_set(int(start + (end - start) * at))


# ------------------------------------------------------------------------------------------------- shape


def weights_of(mesh_obj) -> list[dict]:
    """Per-vertex {group name: weight}."""
    names = {g.index: g.name for g in mesh_obj.vertex_groups}
    return [{names[g.group]: g.weight for g in v.groups if g.weight > 1e-4} for v in mesh_obj.data.vertices]


def bone_segments(rig) -> dict:
    """Bone name -> (head, tail) in world space, rest pose."""
    return {b.name: (rig.matrix_world @ b.head_local, rig.matrix_world @ b.tail_local) for b in rig.data.bones}


def _closest_on_segment(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / max(ab.length_squared, 1e-9)))
    return a + ab * t


def reshape(meshes, rig, radial: dict, head_scale: float = 1.0) -> None:
    """Reshapes meshes without moving joints: each vertex moves toward/away from the bones it is weighted to
    (`radial` maps bone-name prefixes to a factor, e.g. {"upperarm": 0.82}); the head (and everything weighted to
    it, eyes and brows included) scales about the skull centre. Blends by skin weights, so joints stay smooth."""
    segments = bone_segments(rig)
    head_a, head_b = segments["Head"]
    skull = head_a + (head_b - head_a) * 0.45
    for mesh in meshes:
        inverse = mesh.matrix_world.inverted()
        for vertex, weights in zip(mesh.data.vertices, weights_of(mesh)):
            p = mesh.matrix_world @ vertex.co
            offset = Vector()
            for name, w in weights.items():
                if name == "Head" and head_scale != 1.0:
                    offset += (p - skull) * (head_scale - 1.0) * w
                    continue
                factor = next((f for prefix, f in radial.items() if name.startswith(prefix)), 1.0)
                if factor != 1.0 and name in segments:
                    a, b = segments[name]
                    offset += (p - _closest_on_segment(p, a, b)) * (factor - 1.0) * w
            vertex.co = inverse @ (p + offset)
        mesh.data.update()


# ------------------------------------------------------------------------------------------------- garments


def shell(source, name, keep, offset, cuts=(), smooth=0, coll=None):
    """A garment lifted from the body surface: faces whose vertices all pass `keep(index, weights, world_co)`,
    pushed out along the normals by `offset`, trimmed by `cuts` [(point, normal)] (the side the normal points to is
    removed) and smoothed. Skin weights are inherited from the body."""
    weights = weights_of(source)
    bm = bmesh.new()
    bm.from_mesh(source.data)
    world = source.matrix_world
    kept = {v.index for v in bm.verts if keep(v.index, weights[v.index], world @ v.co)}
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if not all(v.index in kept for v in f.verts)], context="FACES")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    bm.normal_update()
    for v in bm.verts:
        v.co += v.normal * offset
    local = world.inverted()
    for point, normal in cuts:
        p = local @ Vector(point)
        n = (local.to_3x3() @ Vector(normal)).normalized()
        bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=p, plane_no=n, clear_outer=True)
    for _ in range(smooth):
        bmesh.ops.smooth_vert(bm, verts=[v for v in bm.verts if not v.is_boundary], factor=0.5, use_axis_x=True,
                              use_axis_y=True, use_axis_z=True)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    (coll or source.users_collection[0]).objects.link(obj)
    obj.matrix_world = source.matrix_world.copy()
    for group in source.vertex_groups:
        obj.vertex_groups.new(name=group.name)
    return obj


def body_profile(body, centre_xy, z, segments, band=0.02, max_radius=None):
    """Polar radius of the body's outline around `centre_xy` at height z (max per angular sector), ignoring
    vertices farther than `max_radius` (e.g. shoulders around the neck)."""
    radii = [0.0] * segments
    world = body.matrix_world
    for v in body.data.vertices:
        p = world @ v.co
        if abs(p.z - z) > band:
            continue
        dx, dy = p.x - centre_xy[0], p.y - centre_xy[1]
        r = math.hypot(dx, dy)
        if max_radius and r > max_radius:
            continue
        sector = int((math.atan2(dy, dx) % math.tau) / math.tau * segments) % segments
        radii[sector] = max(radii[sector], r)
    filled = [r for r in radii if r > 0]
    fallback = max(filled) if filled else 0.15
    radii = [r if r > 0 else fallback for r in radii]
    # Smooth around the ring so gaps (between the legs) do not pinch the tube.
    for _ in range(2):
        radii = [max(radii[i], (radii[i - 1] + radii[(i + 1) % segments]) / 2) for i in range(segments)]
    return radii


def tube(body, rig, name, z_top, z_bottom, rings=8, segments=28, clearance=0.025, flare=0.12, taper=0.0, coll=None,
         centre_bone="pelvis", max_radius=None, leg_follow=0.75, fixed_weights=None, pattern_scale=0.5,
         calf_follow=0.0):
    """A wrapped garment (sampin, kain, a shirt's hem, a collar): rings fitted to the body's cross-section around
    `centre_bone` from z_top down to z_bottom, never narrower than the ring above (minus `taper`), flaring by
    `flare`. Skinning: `fixed_weights` ({bone: w}) for every vertex, or else pelvis at the top blending toward each
    thigh lower down (up to `leg_follow`) so the hem follows the legs."""
    pivot = rig.matrix_world @ rig.data.bones[centre_bone].head_local
    centre = (pivot.x, pivot.y)
    left_x = (rig.matrix_world @ rig.data.bones["thigh_l"].head_local).x
    pelvis_x = (rig.matrix_world @ rig.data.bones["pelvis"].head_local).x
    pelvis_z = (rig.matrix_world @ rig.data.bones["pelvis"].head_local).z
    left_sign = 1.0 if left_x > pelvis_x else -1.0
    bm = bmesh.new()
    deform = bm.verts.layers.deform.verify()
    uv = bm.loops.layers.uv.new("pattern")
    knee_z = (rig.matrix_world @ rig.data.bones["calf_l"].head_local).z
    names = list(fixed_weights) if fixed_weights else ["pelvis", "thigh_l", "thigh_r", "calf_l", "calf_r"]
    groups = {n: i for i, n in enumerate(names)}
    rows = []
    previous = None
    for r in range(rings + 1):
        t = r / rings
        z = z_top + (z_bottom - z_top) * t
        # `clearance` may be (top, bottom): a hem starts snug against the garment it continues and widens.
        ease = clearance[0] + (clearance[1] - clearance[0]) * t if isinstance(clearance, tuple) else clearance
        radii = [rr + ease for rr in body_profile(body, centre, z, segments, max_radius=max_radius)]
        if previous is not None:
            radii = [max(radii[i], previous[i] * (1.0 - taper)) for i in range(segments)]
        radii = [rr * (1.0 + flare * t * t) for rr in radii]
        previous = radii
        row = []
        for i in range(segments):
            a = (i + 0.5) / segments * math.tau
            v = bm.verts.new((centre[0] + math.cos(a) * radii[i], centre[1] + math.sin(a) * radii[i], z))
            if fixed_weights:
                for bone, w in fixed_weights.items():
                    v[deform][groups[bone]] = w
            else:
                side = 0.5 + 0.5 * math.tanh(left_sign * (v.co.x - pelvis_x) / 0.06)  # 1 on the character's left
                # By absolute height below the hips, so layered garments (sampin under a baju hem) share weights
                # wherever they overlap and never cut through each other in motion.
                leg = min(leg_follow, max(0.0, (pelvis_z + 0.04 - z) / 0.42))
                calf = min(calf_follow, max(0.0, (knee_z - z) / 0.3))  # share of the leg weight on the shins
                v[deform][groups["pelvis"]] = 1.0 - leg
                if leg > 0:
                    v[deform][groups["thigh_l"]] = leg * side * (1.0 - calf)
                    v[deform][groups["thigh_r"]] = leg * (1.0 - side) * (1.0 - calf)
                if leg > 0 and calf > 0:
                    v[deform][groups["calf_l"]] = leg * side * calf
                    v[deform][groups["calf_r"]] = leg * (1.0 - side) * calf
            row.append(v)
        rows.append(row)
    for r in range(rings):
        circumference = sum(math.hypot(rows[r][k].co.x - centre[0], rows[r][k].co.y - centre[1]) for k in range(segments)) * math.tau / segments
        for i in range(segments):
            j = (i + 1) % segments
            face = bm.faces.new((rows[r][i], rows[r][j], rows[r + 1][j], rows[r + 1][i]))
            for loop, (u, vv) in zip(face.loops, ((i, r), (i + 1, r), (i + 1, r + 1), (i, r + 1))):
                loop[uv].uv = (u / segments * circumference / pattern_scale, -(z_top + (z_bottom - z_top) * vv / rings) / pattern_scale)
    bm.normal_update()
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    (coll or body.users_collection[0]).objects.link(obj)
    for group in names:
        obj.vertex_groups.new(name=group)
    first = obj.data.polygons[0] if obj.data.polygons else None
    if first and first.normal.dot(Vector((first.center.x - centre[0], first.center.y - centre[1], 0))) < 0:
        obj.data.flip_normals()
    return obj

def bind(obj, rig) -> None:
    """Parents a mesh to the rig with an Armature modifier (weights already in its vertex groups)."""
    obj.parent = rig
    obj.matrix_parent_inverse = rig.matrix_world.inverted()
    modifier = obj.modifiers.new("Armature", "ARMATURE")
    modifier.object = rig


def import_hair(raw_dir: str, style: str, rig, coll=None):
    """Imports a hairstyle (modelled around the base head, origin at 0) and skins it fully to the Head bone."""
    objects = import_gltf(os.path.join(raw_dir, UBC_HAIR, f"{style}.gltf"))
    meshes = [o for o in objects if o.type == "MESH"]
    for obj in objects:
        if obj.type != "MESH":
            bpy.data.objects.remove(obj, do_unlink=True)
    for mesh in meshes:
        world = mesh.matrix_world.copy()
        mesh.parent = None
        mesh.matrix_world = world
        group = mesh.vertex_groups.get("Head") or mesh.vertex_groups.new(name="Head")
        group.add(list(range(len(mesh.data.vertices))), 1.0, "REPLACE")
        bind(mesh, rig)
        if coll:
            for c in list(mesh.users_collection):
                c.objects.unlink(mesh)
            coll.objects.link(mesh)
    return meshes

# ------------------------------------------------------------------------------------------------- texturing


def box_uv(obj, layer: str = "pattern", scale: float = 0.5) -> None:
    """Box-projected pattern UVs in object space (by face normal)."""
    mesh = obj.data
    uv = mesh.uv_layers.get(layer) or mesh.uv_layers.new(name=layer)
    for poly in mesh.polygons:
        n = poly.normal
        ax, ay, az = abs(n.x), abs(n.y), abs(n.z)
        for li in poly.loop_indices:
            co = mesh.vertices[mesh.loops[li].vertex_index].co
            if az >= ax and az >= ay:
                u, v = co.x, co.y
            elif ax >= ay:
                u, v = co.y, co.z
            else:
                u, v = co.x, co.z
            uv.data[li].uv = (u / scale, v / scale)


def _emission_material(name):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    for node in list(nodes):
        nodes.remove(node)
    out = nodes.new("ShaderNodeOutputMaterial")
    emit = nodes.new("ShaderNodeEmission")
    mat.node_tree.links.new(emit.outputs["Emission"], out.inputs["Surface"])
    return mat, emit


def _image_node(mat, image, uv_name):
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = image
    uv = nodes.new("ShaderNodeUVMap")
    uv.uv_map = uv_name
    links.new(uv.outputs["UV"], tex.inputs["Vector"])
    return tex


def skin_bake_material(name, image, tone, neck_z=None):
    """UBC skin texture re-toned (multiply by `tone`, a little more saturated). With `neck_z` (teens) the grey
    stubble painted on the base face is lifted: low-saturation pixels above the neck move to the skin mid-tone."""
    mat, emit = _emission_material(name)
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    tex = _image_node(mat, image, "UVMap")
    multiply = nodes.new("ShaderNodeMix")
    multiply.data_type = "RGBA"
    multiply.blend_type = "MULTIPLY"
    multiply.inputs["Factor"].default_value = 1.0
    links.new(tex.outputs["Color"], multiply.inputs["A"])
    multiply.inputs["B"].default_value = (*tone, 1.0)
    hsv = nodes.new("ShaderNodeHueSaturation")
    hsv.inputs["Saturation"].default_value = 1.12
    links.new(multiply.outputs["Result"], hsv.inputs["Color"])
    colour = hsv.outputs["Color"]
    if neck_z is not None:
        separate = nodes.new("ShaderNodeSeparateColor")
        separate.mode = "HSV"
        links.new(tex.outputs["Color"], separate.inputs["Color"])
        low_sat = nodes.new("ShaderNodeMath")
        low_sat.operation = "LESS_THAN"
        links.new(separate.outputs["Green"], low_sat.inputs[0])
        low_sat.inputs[1].default_value = 0.36
        coord = nodes.new("ShaderNodeTexCoord")
        xyz = nodes.new("ShaderNodeSeparateXYZ")
        links.new(coord.outputs["Object"], xyz.inputs["Vector"])
        above = nodes.new("ShaderNodeMath")
        above.operation = "GREATER_THAN"
        links.new(xyz.outputs["Z"], above.inputs[0])
        above.inputs[1].default_value = neck_z
        mask = nodes.new("ShaderNodeMath")
        mask.operation = "MULTIPLY"
        links.new(low_sat.outputs["Value"], mask.inputs[0])
        links.new(above.outputs["Value"], mask.inputs[1])
        lift = nodes.new("ShaderNodeMix")
        lift.data_type = "RGBA"
        links.new(mask.outputs["Value"], lift.inputs["Factor"])
        links.new(colour, lift.inputs["A"])
        mid = tuple(c * 0.78 for c in tone)
        lift.inputs["B"].default_value = (*mid, 1.0)
        colour = lift.outputs["Result"]
    links.new(colour, emit.inputs["Color"])
    return mat


def texture_bake_material(name, image, uv_name="UVMap", tint=None, desaturate=0.0, contrast=1.0):
    """An image sampled through `uv_name`, optionally desaturated, contrast-expanded around its mid-grey (`contrast`
    > 1 turns a pale greyscale mask into strong shading) and multiplied by `tint` (hair, brows, eyes)."""
    mat, emit = _emission_material(name)
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    tex = _image_node(mat, image, uv_name)
    colour = tex.outputs["Color"]
    if desaturate:
        hsv = nodes.new("ShaderNodeHueSaturation")
        hsv.inputs["Saturation"].default_value = 1.0 - desaturate
        links.new(colour, hsv.inputs["Color"])
        colour = hsv.outputs["Color"]
    if contrast != 1.0:
        # The UBC hair texture is a pale (~0.7) greyscale mask meant for a tinting shader: stretch it to 0..1.
        bright = nodes.new("ShaderNodeBrightContrast")
        bright.inputs["Bright"].default_value = 0.0
        bright.inputs["Contrast"].default_value = contrast
        links.new(colour, bright.inputs["Color"])
        colour = bright.outputs["Color"]
    if tint:
        mix = nodes.new("ShaderNodeMix")
        mix.data_type = "RGBA"
        mix.blend_type = "MULTIPLY"
        mix.inputs["Factor"].default_value = 1.0
        links.new(colour, mix.inputs["A"])
        mix.inputs["B"].default_value = (*tint, 1.0)
        colour = mix.outputs["Result"]
    links.new(colour, emit.inputs["Color"])
    return mat


def pattern_bake_material(name, pixels):
    """A garment pattern (numpy RGBA from lib/textures) sampled through the `pattern` UVs."""
    from lib import hk

    image = hk.image_from_array(name, pixels)
    mat, emit = _emission_material(name)
    tex = _image_node(mat, image, "pattern")
    mat.node_tree.links.new(tex.outputs["Color"], emit.inputs["Color"])
    return mat


def bake_atlas(objects, name: str, size: int = 1024):
    """Unwraps all objects together into one 'atlas' UV layout and bakes each object's emission into one image."""
    image = bpy.data.images.new(name, width=size, height=size, alpha=False)
    for obj in objects:
        uv = obj.data.uv_layers.get("atlas") or obj.data.uv_layers.new(name="atlas")
        obj.data.uv_layers.active = uv
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.004)
    bpy.ops.object.mode_set(mode="OBJECT")
    for obj in objects:
        for slot in obj.material_slots:
            mat = slot.material
            target = mat.node_tree.nodes.new("ShaderNodeTexImage")
            target.image = image
            mat.node_tree.nodes.active = target
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 2
    scene.render.bake.target = "IMAGE_TEXTURES"
    scene.render.bake.margin = 6
    scene.render.bake.use_clear = True
    bpy.ops.object.bake(type="EMIT")
    image.pack()
    return image


def delete_faces(obj, predicate) -> int:
    """Deletes faces whose vertices all satisfy predicate(index, weights, world_co) (body hidden under clothing)."""
    weights = weights_of(obj)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    world = obj.matrix_world
    doomed = [f for f in bm.faces if all(predicate(v.index, weights[v.index], world @ v.co) for v in f.verts)]
    bmesh.ops.delete(bm, geom=doomed, context="FACES")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    bm.to_mesh(obj.data)
    bm.free()
    return len(doomed)


def finish(name, rig, skin_parts, cloth_parts, atlas, tris_budget: int, lod_budget: int):
    """Swaps bake materials for the atlas (skin single-sided, cloth double-sided), keeps only the atlas UVs, joins
    everything into one skinned mesh, fits the triangle budget and adds a LOD1 mesh. Returns (mesh, lod)."""
    from lib import hk

    skin = hk.textured_material(f"{name}_skin", atlas, roughness=0.75)
    cloth = hk.textured_material(f"{name}_cloth", atlas, roughness=0.9)
    cloth.use_backface_culling = False
    for obj, material in [(o, skin) for o in skin_parts] + [(o, cloth) for o in cloth_parts]:
        obj.data.materials.clear()
        obj.data.materials.append(material)
        for uv in [uv for uv in obj.data.uv_layers if uv.name != "atlas"]:
            obj.data.uv_layers.remove(uv)
        obj.data.uv_layers["atlas"].name = "UVMap"
    parts = skin_parts + cloth_parts
    # The base body carries a COLOR_0 layer; generated garments do not, and joining fills their share with black,
    # which glTF consumers multiply into the base colour. The atlas holds all colour, so drop vertex colours.
    for obj in parts:
        for attribute in list(obj.data.color_attributes):
            obj.data.color_attributes.remove(attribute)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in parts:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = skin_parts[0]
    bpy.ops.object.join()
    mesh = bpy.context.view_layer.objects.active
    mesh.name = name
    mesh.data.name = name
    triangles = sum(len(p.vertices) - 2 for p in mesh.data.polygons)
    if triangles > tris_budget:
        decimate = mesh.modifiers.new("budget", "DECIMATE")
        decimate.ratio = tris_budget / triangles
        decimate.use_collapse_triangulate = True
        bpy.ops.object.modifier_move_to_index(modifier=decimate.name, index=0)
        bpy.ops.object.modifier_apply(modifier=decimate.name)
    bpy.ops.object.shade_smooth()
    lod = hk.add_lod(mesh, lod_budget / max(1, sum(len(p.vertices) - 2 for p in mesh.data.polygons)))
    lod.parent = rig
    if not any(m.type == "ARMATURE" for m in lod.modifiers):
        modifier = lod.modifiers.new("Armature", "ARMATURE")
        modifier.object = rig
    return mesh, lod
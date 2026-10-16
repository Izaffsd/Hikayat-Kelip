"""Prints the glTF exporter options and bake settings available in this Blender build (pipeline maintenance aid).

Usage: blender --background --factory-startup --python tools/blender/introspect_api.py
"""

import bpy
import numpy

props = bpy.ops.export_scene.gltf.get_rna_type().properties
wanted = (
    "export_format",
    "use_selection",
    "export_extras",
    "export_yup",
    "export_apply",
    "export_vertex_color",
    "export_all_vertex_colors",
    "export_active_vertex_color_when_no_material",
    "export_animations",
    "export_animation_mode",
    "export_force_sampling",
    "export_optimize_animation_size",
    "export_def_bones",
    "export_leaf_bone",
    "export_image_format",
    "export_materials",
    "export_texcoords",
    "export_normals",
    "export_tangents",
    "export_skins",
    "export_morph",
    "export_lights",
    "export_cameras",
    "export_attributes",
    "export_gpu_instances",
    "export_hierarchy_flatten_bones",
    "export_try_sparse_sk",
    "export_bake_animation",
    "export_anim_single_armature",
    "export_reset_pose_bones",
)
for name in wanted:
    if name in props:
        prop = props[name]
        extra = ""
        if prop.type == "ENUM":
            extra = " enum=" + ",".join(item.identifier for item in prop.enum_items)
        print(f"GLTF {name}: {prop.type} default={getattr(prop, 'default', None)}{extra}")
    else:
        print(f"GLTF {name}: MISSING")

bake = bpy.context.scene.render.bake
print("BAKE target enum:", ",".join(i.identifier for i in bake.bl_rna.properties["target"].enum_items))
print("CYCLES bake types:", ",".join(i.identifier for i in bpy.types.CyclesRenderSettings.bl_rna.properties["bake_type"].enum_items))
print("ENGINES:", ",".join(i.identifier for i in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items))
print("NUMPY", numpy.__version__)

"""Summarise a glTF/GLB: armatures (bones), meshes (triangles, vertex groups) and actions (frame ranges).

Usage (headless):
    blender --background --factory-startup --python tools/blender/inspect_glb.py -- <input.glb> <summary.json>
"""

import json
import sys

import bpy


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    if not argv:
        raise SystemExit("usage: inspect_glb.py -- <input.glb> [summary.json]")
    source = argv[0]
    target = argv[1] if len(argv) > 1 else None

    bpy.ops.wm.read_factory_settings(use_empty=True)
    if source.lower().endswith(".fbx"):
        bpy.ops.import_scene.fbx(filepath=source)
    else:
        bpy.ops.import_scene.gltf(filepath=source)

    summary = {"file": source, "armatures": [], "meshes": [], "actions": []}
    for obj in bpy.data.objects:
        if obj.type == "ARMATURE":
            bones = obj.data.bones
            summary["armatures"].append(
                {
                    "name": obj.name,
                    "boneCount": len(bones),
                    "roots": [b.name for b in bones if b.parent is None],
                    "bones": [
                        {"name": b.name, "parent": b.parent.name if b.parent else None, "length": round(b.length, 4)}
                        for b in bones
                    ],
                }
            )
        elif obj.type == "MESH":
            mesh = obj.data
            triangles = sum(len(p.vertices) - 2 for p in mesh.polygons)
            summary["meshes"].append(
                {
                    "name": obj.name,
                    "triangles": triangles,
                    "vertices": len(mesh.vertices),
                    "vertexGroups": len(obj.vertex_groups),
                    "materials": [m.name for m in mesh.materials if m],
                    "dimensions": [round(v, 3) for v in obj.dimensions],
                }
            )
    for action in bpy.data.actions:
        start, end = action.frame_range
        summary["actions"].append({"name": action.name, "start": int(start), "end": int(end)})

    text = json.dumps(summary, indent=1)
    if target:
        with open(target, "w", encoding="utf-8") as handle:
            handle.write(text)
    print(
        "HK_SUMMARY",
        json.dumps(
            {
                "armatures": [(a["name"], a["boneCount"]) for a in summary["armatures"]],
                "meshes": [(m["name"], m["triangles"]) for m in summary["meshes"]],
                "actions": len(summary["actions"]),
            }
        ),
    )


main()

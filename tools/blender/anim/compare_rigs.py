"""Diagnostic: compares the rest poses of two rigs (UAL1 Unreal FBX vs UAL2 GLB) bone by bone.

Prints world-space rest rotation differences (degrees), head position differences (m) and rig heights,
to decide whether clips can be copied by name or need pose-matching retargeting.
Usage: blender --background --factory-startup --python tools/blender/anim/compare_rigs.py -- --a <file> --b <file>
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import bpy  # noqa: E402

from lib import hk  # noqa: E402


def import_rig(path):
    before = set(bpy.data.objects)
    if path.lower().endswith(".fbx"):
        bpy.ops.import_scene.fbx(filepath=path)
    else:
        bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    arm = next(o for o in new if o.type == "ARMATURE")
    return arm


def main():
    args = hk.cli_args()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    a = import_rig(args["a"])
    b = import_rig(args["b"])
    for arm in (a, b):
        arm.data.pose_position = "REST"
    bpy.context.view_layer.update()
    print(f"HK_RIG a={a.name} scale={tuple(round(s, 4) for s in a.matrix_world.to_scale())} rot={tuple(round(r, 3) for r in a.matrix_world.to_euler())}")
    print(f"HK_RIG b={b.name} scale={tuple(round(s, 4) for s in b.matrix_world.to_scale())} rot={tuple(round(r, 3) for r in b.matrix_world.to_euler())}")
    worst = []
    for bone in b.data.bones:
        if bone.name not in a.data.bones:
            continue
        ma = a.matrix_world @ a.data.bones[bone.name].matrix_local
        mb = b.matrix_world @ bone.matrix_local
        angle = ma.to_quaternion().rotation_difference(mb.to_quaternion()).angle
        dist = (ma.translation - mb.translation).length
        worst.append((round(angle * 57.2958, 2), round(dist, 4), bone.name))
    worst.sort(reverse=True)
    for row in worst[:12]:
        print(f"HK_DIFF angle={row[0]} dist={row[1]} bone={row[2]}")
    head_a = (a.matrix_world @ a.data.bones["Head"].matrix_local).translation.z if "Head" in a.data.bones else -1
    head_b = (b.matrix_world @ b.data.bones["Head"].matrix_local).translation.z
    print(f"HK_HEIGHT head_z a={head_a:.3f} b={head_b:.3f}")


main()

"""Diagnostic: lists actions (name, frame range, slots, channel count) and the scene frame rate after import.

Usage: blender --background --factory-startup --python tools/blender/anim/list_actions.py -- --file <glb|fbx>
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import bpy  # noqa: E402

from lib import hk  # noqa: E402


def channel_count(action):
    total = 0
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                total += len(bag.fcurves)
    return total


def main():
    args = hk.cli_args()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    path = args["file"]
    if path.lower().endswith(".fbx"):
        bpy.ops.import_scene.fbx(filepath=path)
    else:
        bpy.ops.import_scene.gltf(filepath=path)
    scene = bpy.context.scene
    print(f"HK_FPS {scene.render.fps}/{scene.render.fps_base}")
    for action in bpy.data.actions[:6]:
        slots = [(s.identifier, s.target_id_type) for s in action.slots]
        print(f"HK_ACTION name={action.name!r} range={tuple(action.frame_range)} slots={slots} channels={channel_count(action)}")
    print("HK_NAMES " + " | ".join(a.name for a in bpy.data.actions))


main()

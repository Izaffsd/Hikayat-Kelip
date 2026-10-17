"""Authored poses for traversal states the Universal Animation Libraries lack (Phase 3): the ledge hang and the wau
glide. A pose aims bones' +Y axes at world-space directions from the rest T-pose (character facing -Y, Z up, the
character's left = +X), parents before children, then curls the fingers into a grip. Rig-agnostic for every
character on the universal rig (rest poses are conformed to the clip rig, D-027).

Used headless by build_clips.py, which bakes each pose into a short looping clip in anim_core, and live (over the
Blender MCP) to preview a pose on a character before it ships.
"""

from __future__ import annotations

import math

import bpy
from mathutils import Quaternion, Vector

FINGERS = ("index", "middle", "ring", "pinky")

# Each pose: ordered (bone, direction) aims, finger curl in degrees per joint, thumb curl, and an optional "breath"
# (degrees of spine_02 pitch at the loop's midpoint) so the loop is not frozen.
POSES: dict[str, dict] = {
    # Hanging from a ledge in front (-Y): arms up and slightly out, hands hooked over the edge, legs hanging with
    # soft knees, head tipped up toward the climb.
    "ledge_hang": {
        "aim": [
            ("spine_03", (0.0, -0.1, 1.0)),
            ("clavicle_l", (0.75, -0.1, 0.65)),
            ("clavicle_r", (-0.75, -0.1, 0.65)),
            ("upperarm_l", (0.2, -0.2, 0.96)),
            ("upperarm_r", (-0.2, -0.2, 0.96)),
            ("lowerarm_l", (0.05, -0.32, 0.95)),
            ("lowerarm_r", (-0.05, -0.32, 0.95)),
            ("hand_l", (0.0, -0.8, 0.6)),
            ("hand_r", (0.0, -0.8, 0.6)),
            ("neck_01", (0.0, -0.25, 1.0)),
            ("Head", (0.0, -0.4, 0.92)),
            ("thigh_l", (0.08, -0.14, -1.0)),
            ("thigh_r", (-0.05, -0.04, -1.0)),
            ("calf_l", (0.02, 0.22, -1.0)),
            ("calf_r", (-0.02, 0.32, -1.0)),
            ("foot_l", (0.0, -0.45, -0.9)),
            ("foot_r", (0.0, -0.4, -0.9)),
        ],
        "curl": 62,
        "thumb": 30,
        "breath": 2.0,
    },
    # Holding the wau's crossbar above the head while it carries him: arms up and a little forward, hands close
    # together, body slightly arched, legs together trailing back with bent knees. The game tilts the whole avatar
    # forward along the glide.
    "glide_hold": {
        "aim": [
            ("spine_03", (0.0, 0.08, 1.0)),
            ("clavicle_l", (0.78, -0.05, 0.6)),
            ("clavicle_r", (-0.78, -0.05, 0.6)),
            ("upperarm_l", (0.28, -0.32, 0.9)),
            ("upperarm_r", (-0.28, -0.32, 0.9)),
            ("lowerarm_l", (-0.1, -0.22, 0.97)),
            ("lowerarm_r", (0.1, -0.22, 0.97)),
            ("hand_l", (-0.2, -0.6, 0.78)),
            ("hand_r", (0.2, -0.6, 0.78)),
            ("neck_01", (0.0, -0.3, 1.0)),
            ("Head", (0.0, -0.45, 0.9)),
            ("thigh_l", (0.05, 0.22, -1.0)),
            ("thigh_r", (-0.05, 0.3, -1.0)),
            ("calf_l", (0.0, 0.62, -0.78)),
            ("calf_r", (0.0, 0.7, -0.7)),
            ("foot_l", (0.0, 0.25, -0.97)),
            ("foot_r", (0.0, 0.3, -0.95)),
        ],
        "curl": 68,
        "thumb": 35,
        "breath": 1.5,
    },
}


def aim(rig: bpy.types.Object, bone: str, direction) -> None:
    """Rotates a pose bone (shortest arc) so its +Y axis points along a world-space direction."""
    pb = rig.pose.bones[bone]
    target = (rig.matrix_world.inverted().to_3x3() @ Vector(direction)).normalized()
    current = pb.matrix.copy()
    axis = current.to_3x3().col[1].normalized()
    rotation = axis.rotation_difference(target).to_matrix()
    posed = (rotation @ current.to_3x3()).to_4x4()
    posed.translation = current.translation
    pb.matrix = posed
    bpy.context.view_layer.update()


def curl_fingers(rig: bpy.types.Object, degrees: float, thumb: float) -> None:
    """Bends every finger joint about its local X axis (a grip); the thumb less."""
    for side in ("l", "r"):
        for finger in FINGERS:
            for joint in ("01", "02", "03"):
                pb = rig.pose.bones.get(f"{finger}_{joint}_{side}")
                if pb:
                    pb.rotation_quaternion = Quaternion((1, 0, 0), math.radians(degrees)) @ pb.rotation_quaternion
        for joint in ("02", "03"):
            pb = rig.pose.bones.get(f"thumb_{joint}_{side}")
            if pb:
                pb.rotation_quaternion = Quaternion((1, 0, 0), math.radians(thumb)) @ pb.rotation_quaternion
    bpy.context.view_layer.update()


def apply_pose(rig: bpy.types.Object, name: str, breath: float = 0.0) -> None:
    """Resets the rig to rest, then applies a named pose (`breath` in 0..1 adds the pose's chest rise)."""
    spec = POSES[name]
    for pb in rig.pose.bones:
        pb.rotation_mode = "QUATERNION"
        pb.rotation_quaternion = Quaternion()
        pb.location = (0.0, 0.0, 0.0)
        pb.scale = (1.0, 1.0, 1.0)
    bpy.context.view_layer.update()
    for bone, direction in spec["aim"]:
        if bone in rig.pose.bones:
            aim(rig, bone, direction)
    curl_fingers(rig, spec["curl"], spec["thumb"])
    if breath and "spine_02" in rig.pose.bones:
        pb = rig.pose.bones["spine_02"]
        pb.rotation_quaternion = Quaternion((1, 0, 0), math.radians(-spec["breath"] * breath)) @ pb.rotation_quaternion
        bpy.context.view_layer.update()


def bake_pose_action(rig: bpy.types.Object, name: str, fps: int = 30, seconds: float = 2.0) -> bpy.types.Action:
    """Bakes a pose into a looping action: rest of the pose at the start and end, a slight breath in the middle."""
    action = bpy.data.actions.new(name)
    if rig.animation_data is None:
        rig.animation_data_create()
    rig.animation_data.action = action
    last = int(round(fps * seconds))
    for frame, breath in ((1, 0.0), (1 + last // 2, 1.0), (1 + last, 0.0)):
        apply_pose(rig, name, breath)
        for pb in rig.pose.bones:
            pb.keyframe_insert("rotation_quaternion", frame=frame, group=pb.name)
    return action

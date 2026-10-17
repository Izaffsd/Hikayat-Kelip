"""Builds the shared animation packs from the Quaternius Universal Animation Libraries 1 & 2 (CC0).

Both libraries use the same universal rig with identical rest poses (verified by compare_rigs.py), so clips
are shared by bone name without retargeting. Clips are renamed to game ids, constant location/scale channels
are stripped, and each pack is exported as an armature-only GLB (bones as nodes + animations); any character
skinned to the universal rig binds them by bone name at runtime.

Usage: blender --background --factory-startup --python tools/blender/anim/build_clips.py -- --out <dir> [--previews <dir>]
Sources (outside git): D:/dev/raw/quaternius/ual1 (Unreal FBX) and ual2 (GLB); override with --ual1/--ual2.
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import bpy  # noqa: E402
import numpy as np  # noqa: E402

from anim.poses import POSES, bake_pose_action  # noqa: E402
from lib import hk  # noqa: E402

UAL1 = r"D:\dev\raw\quaternius\ual1\extracted\Animation Library[Standard]\Unreal Engine\AL_Standard.fbx"
UAL2 = r"D:\dev\raw\quaternius\ual2\extracted\Universal Animation Library 2 [Standard]\Unreal-Godot\UAL2_Standard.glb"
FPS = 30

# game clip id -> source action name (after stripping the FBX "Rig|Rig|" prefix)
PACKS: dict[str, dict[str, str]] = {
    "anim_core": {
        "idle": "Idle_Loop",
        "walk": "Walk_Loop",
        "jog": "Jog_Fwd_Loop",
        "sprint": "Sprint_Loop",
        "jump_start": "Jump_Start",
        "jump_loop": "Jump_Loop",
        "jump_land": "Jump_Land",
        "flip_start": "NinjaJump_Start",
        "flip_loop": "NinjaJump_Idle_Loop",
        "flip_land": "NinjaJump_Land",
        "climb_up_1m_rm": "ClimbUp_1m_RM",
        "slide_start": "Slide_Start",
        "slide_loop": "Slide_Loop",
        "slide_exit": "Slide_Exit",
        "roll": "Roll",
        "roll_rm": "Roll_RM",
        "hit_chest": "Hit_Chest",
        "hit_head": "Hit_Head",
        "hit_knockback": "Hit_Knockback",
        "hit_knockback_rm": "Hit_Knockback_RM",
        "interact": "Interact",
        "push_loop": "Push_Loop",
        "pickup": "PickUp_Table",
        "chest_open": "Chest_Open",
        "lay_to_idle": "LayToIdle",
        "call_enter": "Spell_Simple_Enter",
        "call_loop": "Spell_Simple_Idle_Loop",
        "call_exit": "Spell_Simple_Exit",
        "call_release": "Spell_Simple_Shoot",
        "stance_idle": "Sword_Idle",
        "staff_attack": "Sword_Attack",
        "staff_attack_rm": "Sword_Attack_RM",
        "staff_a": "Sword_Regular_A",
        "staff_a_rec": "Sword_Regular_A_Rec",
        "staff_b": "Sword_Regular_B",
        "staff_b_rec": "Sword_Regular_B_Rec",
        "staff_c": "Sword_Regular_C",
        "staff_combo": "Sword_Regular_Combo",
        "block": "Sword_Block",
        "dash_rm": "Sword_Dash_RM",
        "hook": "Melee_Hook",
        "hook_rec": "Melee_Hook_Rec",
        "jab": "Punch_Jab",
        "cross": "Punch_Cross",
        "throw": "OverhandThrow",
    },
    "anim_villager": {
        "talk": "Idle_Talking_Loop",
        "fold_arms": "Idle_FoldArms_Loop",
        "no": "Idle_No_Loop",
        "yes": "Yes",
        "lantern_idle": "Idle_Lantern_Loop",
        "torch_idle": "Idle_Torch_Loop",
        "rail_idle": "Idle_Rail_Loop",
        "rail_call": "Idle_Rail_Call",
        "sit_enter": "Sitting_Enter",
        "sit_idle": "Sitting_Idle_Loop",
        "sit_talk": "Sitting_Talking_Loop",
        "sit_exit": "Sitting_Exit",
        "dance": "Dance_Loop",
        "kneel_work": "Fixing_Kneeling",
        "walk_carry": "Walk_Carry_Loop",
        "chop": "TreeChopping_Loop",
        "harvest": "Farm_Harvest",
        "plant": "Farm_PlantSeed",
        "water": "Farm_Watering",
        "eat": "Consume",
        "crouch_idle": "Crouch_Idle_Loop",
        "crouch_walk": "Crouch_Fwd_Loop",
    },
    "anim_cursed": {
        "cursed_idle": "Zombie_Idle_Loop",
        "cursed_walk": "Zombie_Walk_Fwd_Loop",
        "cursed_swipe": "Zombie_Scratch",
        "shield_idle": "Idle_Shield_Loop",
        "shield_break": "Idle_Shield_Break",
        "shield_bash": "Shield_OneShot",
        "shield_dash_rm": "Shield_Dash_RM",
    },
}
KEEP_LOCATION = {"root", "pelvis"}
PREVIEW_CLIPS = ["idle", "sprint", "jump_loop", "climb_up_1m_rm", "slide_loop", "staff_a", "block", "jab", "lay_to_idle", "call_loop", "rail_idle", "cursed_walk"]


def import_file(path: str) -> list:
    before = set(bpy.data.objects)
    if path.lower().endswith(".fbx"):
        bpy.ops.import_scene.fbx(filepath=path)
    else:
        bpy.ops.import_scene.gltf(filepath=path)
    return [o for o in bpy.data.objects if o not in before]


def fcurves(action):
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                yield bag, list(bag.fcurves)


def strip_constant_channels(action) -> int:
    """Removes location channels (except root/pelvis) and scale channels whose keys never change."""
    removed = 0
    for bag, curves in fcurves(action):
        for fc in curves:
            path = fc.data_path
            if not path.startswith('pose.bones["'):
                continue
            bone = path.split('"')[1]
            is_location = path.endswith(".location")
            is_scale = path.endswith(".scale")
            if not (is_scale or (is_location and bone not in KEEP_LOCATION)):
                continue
            values = np.array([kp.co[1] for kp in fc.keyframe_points])
            if values.size == 0 or float(values.max() - values.min()) < 1e-4:
                bag.fcurves.remove(fc)
                removed += 1
    return removed


def main() -> None:
    args = hk.cli_args()
    out_dir = os.path.abspath(args.get("out", os.path.join(hk.REPO_DIR, "build-cache", "raw")))
    preview_dir = args.get("previews")
    hk.reset_scene()
    # FBX first: it sets the scene to the library's 30 fps; the GLB clips are then sampled on the same timeline.
    ual1_objects = import_file(args.get("ual1", UAL1))
    bpy.context.scene.render.fps = FPS
    bpy.context.scene.render.fps_base = 1.0
    ual2_objects = import_file(args.get("ual2", UAL2))
    target = next(o for o in ual2_objects if o.type == "ARMATURE")
    mannequin = next(o for o in ual2_objects if o.type == "MESH" and o.name.startswith("Mannequin"))
    target.name = "UniversalRig"

    by_name = {}
    for action in bpy.data.actions:
        clean = action.name.split("|")[-1]
        by_name.setdefault(clean, action)

    # Drop the UAL1 rig and meshes (its actions stay alive with fake users) and stray helper meshes.
    for obj in ual1_objects + [o for o in ual2_objects if o.type == "MESH" and not o.name.startswith("Mannequin")]:
        bpy.data.objects.remove(obj, do_unlink=True)

    wanted = {source for pack in PACKS.values() for source in pack.values()}
    missing = sorted(wanted - set(by_name))
    if missing:
        raise RuntimeError(f"Missing source clips: {missing}")

    total_removed = 0
    for pack_name, clips in PACKS.items():
        for clip_id, source in clips.items():
            action = by_name[source]
            if action.get("hk_clip"):
                raise RuntimeError(f"Source {source} used twice")
            action.name = clip_id
            action["hk_clip"] = clip_id
            action["hk_pack"] = pack_name
            action.use_fake_user = True
            total_removed += strip_constant_channels(action)
    for action in list(bpy.data.actions):
        if not action.get("hk_clip"):
            bpy.data.actions.remove(action)
    print(f"HK_CLIPS kept={len(bpy.data.actions)} constant_channels_removed={total_removed}")

    # Authored poses the libraries lack (anim/poses.py): baked on the clip rig as short loops, shipped in anim_core.
    for pose_name in POSES:
        action = bake_pose_action(target, pose_name, fps=FPS)
        action["hk_clip"] = pose_name
        action["hk_pack"] = "anim_core"
        action.use_fake_user = True
        PACKS["anim_core"][pose_name] = pose_name
    print(f"HK_POSES {sorted(POSES)}")

    if target.animation_data is None:
        target.animation_data_create()
    for pack_name, clips in PACKS.items():
        # Export one pack: the armature only, animations from the pack's actions via NLA tracks.
        target.animation_data.action = None
        for track in list(target.animation_data.nla_tracks):
            target.animation_data.nla_tracks.remove(track)
        for clip_id in clips:
            action = bpy.data.actions[clip_id]
            track = target.animation_data.nla_tracks.new()
            track.name = clip_id
            start = int(action.frame_range[0])
            strip = track.strips.new(clip_id, start, action)
            strip.name = clip_id
            if action.slots:
                strip.action_slot = action.slots[0]
        path = os.path.join(out_dir, f"{pack_name}.glb")
        bpy.ops.object.select_all(action="DESELECT")
        target.select_set(True)
        bpy.ops.export_scene.gltf(
            filepath=path,
            export_format="GLB",
            use_selection=True,
            export_animations=True,
            export_animation_mode="NLA_TRACKS",
            # Only the channels that remain after stripping (sampling would re-add TRS for every bone).
            export_force_sampling=False,
            export_optimize_animation_size=True,
            export_def_bones=False,
            export_leaf_bone=False,
            export_extras=True,
            export_skins=True,
            export_materials="NONE",
        )
        print(f"HK_EXPORT {path} clips={len(clips)}")

    if preview_dir:
        render_contact_sheet(target, mannequin, os.path.join(os.path.abspath(preview_dir), "anim_contact_sheet.png"))


def render_contact_sheet(rig, mesh, path: str) -> None:
    """Renders each preview clip at its middle frame and tiles the images (4 × 3) into one PNG."""
    for track in list(rig.animation_data.nla_tracks):
        rig.animation_data.nla_tracks.remove(track)
    tiles = []
    tmp_dir = os.path.join(os.path.dirname(path), "_anim_tiles")
    for clip_id in PREVIEW_CLIPS:
        action = bpy.data.actions[clip_id]
        rig.animation_data.action = action
        if action.slots:
            rig.animation_data.action_slot = action.slots[0]
        start, end = action.frame_range
        bpy.context.scene.frame_set(int((start + end) / 2))
        tile_path = os.path.join(tmp_dir, f"{clip_id}.png")
        hk.render_preview(tile_path, [mesh], size=(320, 360), azimuth_deg=30, elevation_deg=8)
        image = bpy.data.images.load(tile_path)
        pixels = np.array(image.pixels[:], dtype=np.float32).reshape(image.size[1], image.size[0], 4)
        tiles.append(pixels)
        bpy.data.images.remove(image)
    rows = []
    for r in range(3):
        rows.append(np.concatenate(tiles[r * 4 : r * 4 + 4], axis=1))
    sheet = np.concatenate(list(reversed(rows)), axis=0)
    out = bpy.data.images.new("contact", width=sheet.shape[1], height=sheet.shape[0])
    out.pixels.foreach_set(sheet.ravel())
    out.filepath_raw = path
    out.file_format = "PNG"
    out.save()
    print(f"HK_PREVIEW {path}")


main()

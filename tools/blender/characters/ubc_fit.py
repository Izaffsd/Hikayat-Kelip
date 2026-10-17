"""Diagnostic: proves the base bodies fit our clips. Imports a base body and the anim_core pack, conforms the body's
rest pose to the animation rig (lib/human.conform_rest), re-measures the rest differences, and renders a contact
sheet of the body playing core clips.

Usage: blender --background --factory-startup --python tools/blender/characters/ubc_fit.py -- --raw <raw dir>
       --anim build-cache/raw/anim_core.glb --sex male --previews build-cache/previews
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import bpy  # noqa: E402
import numpy as np  # noqa: E402

from lib import hk, human  # noqa: E402

CLIPS = ["idle", "sprint", "jump_loop", "climb_up_1m_rm", "staff_a", "block", "jab", "roll"]


def rest_difference(rig, reference):
    worst = 0.0
    for bone in rig.data.bones:
        ref = reference.data.bones.get(bone.name)
        if ref:
            worst = max(worst, human.angle_between(bone.matrix_local.to_quaternion(), ref.matrix_local.to_quaternion()))
    return worst * 57.29578


def main():
    args = hk.cli_args()
    hk.reset_scene()
    reference = human.load_reference_rig(os.path.abspath(args["anim"]))
    parts = human.load_base(args["raw"], args.get("sex", "male"))
    rig = parts["rig"]
    before = rest_difference(rig, reference)
    corrected = human.conform_rest(rig, [parts["body"], parts["eyes"], parts["brows"]], reference)
    after = rest_difference(rig, reference)
    print(f"HK_FIT rest_diff_before={before:.2f}deg corrected={corrected:.2f}deg rest_diff_after={after:.3f}deg")
    preview = args.get("previews")
    if not preview:
        return
    tiles = []
    tmp = os.path.join(os.path.abspath(preview), "_fit_tiles")
    for clip in CLIPS:
        human.play(rig, clip)
        path = os.path.join(tmp, f"{clip}.png")
        hk.render_preview(path, [parts["body"]], size=(300, 360), azimuth_deg=30, elevation_deg=8)
        image = bpy.data.images.load(path)
        tiles.append(np.array(image.pixels[:], dtype=np.float32).reshape(image.size[1], image.size[0], 4))
        bpy.data.images.remove(image)
    rows = [np.concatenate(tiles[r * 4 : r * 4 + 4], axis=1) for r in range(2)]
    sheet = np.concatenate(list(reversed(rows)), axis=0)
    out = bpy.data.images.new("fit", width=sheet.shape[1], height=sheet.shape[0])
    out.pixels.foreach_set(sheet.ravel())
    out.filepath_raw = os.path.join(os.path.abspath(preview), f"ubc_fit_{args.get('sex', 'male')}.png")
    out.file_format = "PNG"
    out.save()
    print(f"HK_PREVIEW {out.filepath_raw}")


main()

"""Human characters (docs/ASSETS.md §2) built on the Quaternius Universal Base Characters (CC0) and the universal
rig, so every clip in the anim_* packs plays on them unchanged.

Per character: load the base body, add hair, conform the rest pose to the animation rig (lib/human), reshape the
body without moving joints, dress it in original clothing from the garment builders below (shells lifted from the
body keep its skinning; wrapped garments are fitted tubes weighted by height so layers never cut through each
other), remove the body hidden under the clothes, bake one painterly atlas, fit the triangle budget, add a LOD and
export one GLB per character. Height comes from the root scale, so the clips' hip motion scales with the character.

Cursed variants (cursed brawler, cursed Adi) reuse these meshes with the runtime ink overlay (TECHNICAL §7), so no
separate mesh is built for them.

Usage: blender --background --factory-startup --python tools/blender/characters/humans.py -- --out <dir>
       --raw <raw library> [--previews <dir>] [--only bayu,adi] [--anim build-cache/raw/anim_core.glb]
"""

from __future__ import annotations

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import bmesh  # noqa: E402
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

from lib import hk, human, textures  # noqa: E402

# Body builds. Factors scale each vertex's distance from its bones (joints never move).
TEEN = {"upperarm": 0.8, "lowerarm": 0.86, "clavicle": 0.82, "spine_03": 0.84, "spine_02": 0.86, "spine_01": 0.9,
        "neck_01": 0.86, "thigh": 0.88, "calf": 0.9, "pelvis": 0.94}
LEAN = {"upperarm": 0.86, "lowerarm": 0.9, "clavicle": 0.88, "spine_03": 0.9, "spine_02": 0.9, "spine_01": 0.93,
        "neck_01": 0.9, "thigh": 0.92, "calf": 0.94}
EVERYDAY = {"upperarm": 0.84, "lowerarm": 0.9, "clavicle": 0.86, "spine_03": 0.92, "spine_02": 0.96, "spine_01": 1.02,
            "neck_01": 0.92, "thigh": 0.95, "calf": 0.95, "pelvis": 1.0}
SOFT_FEMALE = {"upperarm": 0.88, "lowerarm": 0.92, "spine_02": 1.02, "spine_01": 1.04, "thigh": 1.0, "pelvis": 1.02}
ELDER = {"upperarm": 0.8, "lowerarm": 0.86, "clavicle": 0.84, "spine_03": 0.88, "spine_02": 1.0, "spine_01": 1.04,
         "neck_01": 0.88, "thigh": 0.86, "calf": 0.86}

SAWO_MATANG = (0.86, 0.7, 0.56)
SAWO_GELAP = (0.74, 0.58, 0.46)
KUNING_LANGSAT = (0.95, 0.82, 0.68)
BLACK_HAIR = (0.16, 0.13, 0.11)
GREY_HAIR = (0.62, 0.6, 0.58)


def plain(seed, colour):
    return textures.plaid(seed=seed, base=colour, threads=160)


CHARACTERS = {
    "bayu": {
        "sex": "male", "height": 1.70, "radial": TEEN, "head_scale": 1.07, "teen": True, "skin": SAWO_MATANG,
        "hair": ["Hair_SimpleParted"], "hair_colour": BLACK_HAIR, "budget": 13500, "lod": 5000,
        "garments": [
            ("legs", {"name": "seluar", "to": "ankle", "cloth": "seluar"}),
            ("top", {"name": "baju", "sleeve": ("lowerarm", 0.35), "collar": True, "cloth": "baju"}),
            ("wrap", {"name": "sampin", "top": -0.05, "bottom": ("knee", 0.04), "clearance": 0.03, "cloth": "sampin"}),
            ("hem", {"name": "baju_hem", "top": 0.08, "bottom": -0.16, "clearance": (0.03, 0.07), "cloth": "baju"}),
        ],
        "cloth": {
            "baju": plain(201, "#2f5c69"),
            "sampin": textures.plaid(seed=202, base="#6a1d2b", threads=128, stripes=[
                (0.0, 0.2, "#3b0e18"), (0.22, 0.035, "#d8b04f"), (0.5, 0.2, "#3b0e18"), (0.72, 0.035, "#d8b04f"),
                (0.86, 0.012, "#efe0b8")]),
            "seluar": plain(203, "#2a2a33"),
        },
    },
    "wan_young": {
        # Tok Wan forty years ago (prologue, final duel): lean fighter, storm-dark clothes, destar headcloth.
        "sex": "male", "height": 1.74, "radial": LEAN, "head_scale": 1.02, "teen": False, "skin": SAWO_GELAP,
        "hair": ["Hair_Buzzed"], "hair_colour": BLACK_HAIR, "budget": 13500, "lod": 5000,
        "garments": [
            ("legs", {"name": "seluar", "to": "ankle", "cloth": "seluar"}),
            ("top", {"name": "baju", "sleeve": ("lowerarm", 0.5), "collar": True, "cloth": "baju"}),
            ("wrap", {"name": "sampin", "top": -0.05, "bottom": ("knee", 0.08), "clearance": 0.03, "cloth": "sampin"}),
            ("hem", {"name": "baju_hem", "top": 0.08, "bottom": -0.16, "clearance": (0.03, 0.07), "cloth": "baju"}),
            ("destar", {"name": "destar", "cloth": "destar"}),
        ],
        "cloth": {
            "baju": plain(211, "#1f2b33"),
            "sampin": textures.plaid(seed=212, base="#2b3a2f", threads=128, stripes=[
                (0.0, 0.18, "#16201a"), (0.3, 0.03, "#8a7a4a"), (0.6, 0.18, "#16201a"), (0.85, 0.03, "#8a7a4a")]),
            "seluar": plain(213, "#1c1c22"),
            "destar": textures.batik(seed=214, ground="#3a1f17", dye="#b08a4a", accent="#1c1410"),
        },
    },
    "adi": {
        # Bayu's rival: T-shirt over shorts with a kain tied at the hips, cap backwards, cocky.
        "sex": "male", "height": 1.72, "radial": TEEN, "head_scale": 1.06, "teen": True, "skin": SAWO_MATANG,
        "hair": ["Hair_Buzzed"], "hair_colour": BLACK_HAIR, "budget": 10000, "lod": 4000,
        "garments": [
            ("legs", {"name": "shorts", "to": "above_knee", "cloth": "shorts"}),
            ("top", {"name": "tshirt", "sleeve": ("upperarm", 0.55), "collar": False, "bottom": -0.06, "cloth": "tshirt"}),
            ("wrap", {"name": "kain_ikat", "top": -0.02, "bottom": -0.3, "clearance": 0.05, "flare": 0.1,
                      "cloth": "kain"}),
            ("cap", {"name": "cap", "cloth": "cap", "backwards": True}),
        ],
        "cloth": {
            "tshirt": plain(221, "#b0362f"),
            "shorts": plain(222, "#8a7a5a"),
            "kain": textures.plaid(seed=223, base="#2f5a3a", threads=128, stripes=[
                (0.0, 0.15, "#1d3a25"), (0.3, 0.05, "#d9d0b0"), (0.55, 0.15, "#1d3a25"), (0.8, 0.02, "#d9d0b0")]),
            "cap": plain(224, "#22303a"),
        },
    },
    "maksom": {
        # Bayu's mother: baju kurung, kain batik (original pattern), everyday tudung (attire, never a cosmetic item).
        "sex": "female", "height": 1.58, "radial": SOFT_FEMALE, "head_scale": 1.0, "teen": False,
        "skin": KUNING_LANGSAT, "hair": [], "hair_colour": BLACK_HAIR, "budget": 10000, "lod": 4000,
        "garments": [
            ("wrap", {"name": "kain", "top": -0.05, "bottom": ("ankle", 0.04), "clearance": 0.03, "flare": 0.0, "taper": 0.02,
                      "calf_follow": 0.55, "cloth": "kain"}),
            ("top", {"name": "baju_kurung", "sleeve": ("lowerarm", 0.92), "collar": False, "ease": 0.032, "smooth": 6, "cloth": "baju"}),
            ("hem", {"name": "kurung_hem", "top": 0.08, "bottom": ("knee", 0.1), "clearance": (0.04, 0.07), "flare": 0.0, "taper": 0.0,
                     "cloth": "baju"}),
            ("tudung", {"name": "tudung", "cloth": "tudung"}),
        ],
        "cloth": {
            "baju": plain(231, "#7a8f5c"),
            "kain": textures.batik(seed=232, ground="#5a2a1a", dye="#e0c080", accent="#24343c"),
            "tudung": plain(233, "#d9cdb4"),
        },
    },
    "villager_man": {
        "sex": "male", "height": 1.68, "radial": EVERYDAY, "head_scale": 1.0, "teen": False, "skin": SAWO_GELAP,
        "hair": ["Hair_SimpleParted"], "hair_colour": (0.2, 0.16, 0.13), "budget": 5000, "lod": 2000,
        "garments": [
            ("top", {"name": "kemeja", "sleeve": ("upperarm", 0.75), "collar": True, "bottom": -0.06, "cloth": "shirt"}),
            ("wrap", {"name": "kain_pelikat", "top": -0.02, "bottom": ("ankle", 0.05), "clearance": 0.03, "flare": 0.0, "taper": 0.02,
                      "calf_follow": 0.5, "cloth": "pelikat"}),
        ],
        "cloth": {
            "shirt": plain(241, "#c9c3a8"),
            "pelikat": textures.plaid(seed=242, base="#29415f", threads=128, stripes=[
                (0.0, 0.12, "#17263a"), (0.2, 0.03, "#e6e1d0"), (0.5, 0.12, "#17263a"), (0.7, 0.03, "#7a9a6a")]),
        },
    },
    "villager_elder": {
        "sex": "male", "height": 1.63, "radial": ELDER, "head_scale": 1.0, "teen": False, "skin": SAWO_GELAP,
        "hair": ["Hair_Buzzed", "Hair_Beard"], "hair_colour": GREY_HAIR, "budget": 5000, "lod": 2000,
        "garments": [
            ("top", {"name": "singlet", "sleeve": None, "collar": False, "bottom": -0.06, "cloth": "singlet"}),
            ("wrap", {"name": "kain_pelikat", "top": -0.02, "bottom": ("ankle", 0.05), "clearance": 0.03, "flare": 0.0, "taper": 0.02,
                      "calf_follow": 0.5, "cloth": "pelikat"}),
        ],
        "cloth": {
            "singlet": plain(251, "#e8e4d8"),
            "pelikat": textures.plaid(seed=252, base="#3a5a4a", threads=128, stripes=[
                (0.0, 0.1, "#223a2e"), (0.25, 0.04, "#c9b07a"), (0.6, 0.1, "#223a2e")]),
        },
    },
    "villager_woman": {
        "sex": "female", "height": 1.56, "radial": SOFT_FEMALE, "head_scale": 1.0, "teen": False, "skin": SAWO_MATANG,
        "hair": [], "hair_colour": BLACK_HAIR, "budget": 5000, "lod": 2000,
        "garments": [
            ("wrap", {"name": "kain", "top": -0.05, "bottom": ("ankle", 0.04), "clearance": 0.03, "flare": 0.0, "taper": 0.02,
                      "calf_follow": 0.55, "cloth": "kain"}),
            ("top", {"name": "baju_kurung", "sleeve": ("lowerarm", 0.92), "collar": False, "ease": 0.032, "smooth": 6, "cloth": "baju"}),
            ("hem", {"name": "kurung_hem", "top": 0.08, "bottom": ("knee", 0.1), "clearance": (0.04, 0.07), "flare": 0.0, "taper": 0.0,
                     "cloth": "baju"}),
            ("tudung", {"name": "tudung", "cloth": "tudung"}),
        ],
        "cloth": {
            "baju": plain(261, "#a8566a"),
            "kain": textures.batik(seed=262, ground="#2a3f5a", dye="#d8c9a0", accent="#6a2a2a"),
            "tudung": plain(263, "#3c4f6a"),
        },
    },
    "villager_woman_b": {
        "sex": "female", "height": 1.6, "radial": SOFT_FEMALE, "head_scale": 1.0, "teen": False, "skin": SAWO_GELAP,
        "hair": [], "hair_colour": BLACK_HAIR, "budget": 5000, "lod": 2000,
        "garments": [
            ("wrap", {"name": "kain", "top": -0.05, "bottom": ("ankle", 0.04), "clearance": 0.03, "flare": 0.0, "taper": 0.02,
                      "calf_follow": 0.55, "cloth": "kain"}),
            ("top", {"name": "baju", "sleeve": ("lowerarm", 0.92), "collar": False, "ease": 0.032, "smooth": 6, "cloth": "baju"}),
            ("hem", {"name": "baju_hem", "top": 0.08, "bottom": -0.2, "clearance": (0.04, 0.07), "flare": 0.0, "cloth": "baju"}),
            ("tudung", {"name": "tudung", "cloth": "tudung"}),
        ],
        "cloth": {
            "baju": plain(271, "#d9a441"),
            "kain": textures.batik(seed=272, ground="#3a2a4a", dye="#e8c9a0", accent="#1f5f63"),
            "tudung": plain(273, "#f0ead8"),
        },
    },
    "villager_child": {
        # Background child: the teen base scaled down (ASSETS §2), T-shirt and shorts.
        "sex": "male", "height": 1.3, "radial": {**TEEN, "upperarm": 0.76, "thigh": 0.84}, "head_scale": 1.14,
        "teen": True, "skin": SAWO_MATANG, "hair": ["Hair_Buzzed"], "hair_colour": BLACK_HAIR, "budget": 5000,
        "lod": 2000,
        "garments": [
            ("legs", {"name": "shorts", "to": "above_knee", "cloth": "shorts"}),
            ("top", {"name": "tshirt", "sleeve": ("upperarm", 0.55), "collar": False, "bottom": -0.06, "cloth": "tshirt"}),
        ],
        "cloth": {"tshirt": plain(281, "#2f6f8f"), "shorts": plain(282, "#4a4a52")},
    },
}

# ------------------------------------------------------------------------------------------------- landmarks


def landmarks(rig, body) -> dict:
    """World-space joint positions and head measurements used to place cuts and garments."""
    seg = human.bone_segments(rig)
    lm = {"segments": seg, "pelvis": seg["pelvis"][0], "neck": seg["neck_01"][0], "knee": seg["calf_l"][0],
          "ankle": seg["foot_l"][0]}
    weights = human.weights_of(body)
    head = [body.matrix_world @ v.co for v, w in zip(body.data.vertices, weights) if dominant(w) == "Head"]
    lm["head_top"] = max(p.z for p in head)
    lm["chin"] = min(p.z for p in head)
    lm["head_centre"] = Vector((sum(p.x for p in head) / len(head), sum(p.y for p in head) / len(head),
                                (lm["head_top"] + lm["chin"]) / 2))
    lm["front_y"] = min(p.y for p in head)  # the face looks toward −Y
    lm["brow"] = lm["chin"] + (lm["head_top"] - lm["chin"]) * 0.62
    return lm


def dominant(weights) -> str:
    return max(weights, key=weights.get) if weights else ""


def along(seg, bone, co) -> float:
    a, b = seg[bone]
    ab = b - a
    return (co - a).dot(ab) / max(ab.length_squared, 1e-9)


def level(lm, value) -> float:
    """A height: hip-relative metres, or (landmark, offset)."""
    if isinstance(value, tuple):
        return lm[value[0]].z + value[1] if value[0] in ("knee", "ankle") else lm[value[0]] + value[1]
    return lm["pelvis"].z + value


# ------------------------------------------------------------------------------------------------- garments
# Each builder returns (objects, hidden) where hidden(i, weights, co) says which body faces it covers.


def g_top(body, rig, coll, lm, p):
    seg, neck, hip_z = lm["segments"], lm["neck"], lm["pelvis"].z
    sleeve = p.get("sleeve")
    bottom = hip_z + p.get("bottom", -0.03)
    arm = ("clavicle_", "upperarm_", "lowerarm_") if sleeve else ()
    neck_cut = neck.z + 0.02 if p.get("collar", True) else neck.z - (0.03 if sleeve else 0.07)
    torso = ("spine_", "pelvis", "neck_01") + arm

    def keep(_i, w, co):
        return dominant(w).startswith(torso) and co.z > bottom - 0.05

    cuts = [((0, 0, neck_cut), (0, 0, 1)), ((0, 0, bottom), (0, 0, -1))]
    if sleeve:
        bone, frac = sleeve
        for side in ("l", "r"):
            a, b = seg[f"{bone}_{side}"]
            cuts.append((tuple(a + (b - a) * frac), tuple((b - a).normalized())))
    objects = [human.shell(body, p["name"], keep, offset=p.get("ease", 0.022), cuts=cuts, smooth=p.get("smooth", 2),
                           coll=coll)]
    if p.get("collar"):
        objects.append(human.tube(body, rig, p["name"] + "_collar", neck.z + 0.045, neck.z - 0.005, rings=2,
                                  segments=20, clearance=0.014, flare=0.0, coll=coll, centre_bone="neck_01",
                                  max_radius=0.11, fixed_weights={"neck_01": 0.7, "spine_03": 0.3}))

    def hidden(_i, w, co):
        name = dominant(w)
        if name.startswith("spine_") or name == "pelvis" or (sleeve and name.startswith("clavicle_")):
            return bottom + 0.06 < co.z < neck_cut - 0.04
        if sleeve and name.startswith("upperarm_"):
            return sleeve[0] == "lowerarm" or along(seg, name, co) < sleeve[1] - 0.15
        if sleeve and sleeve[0] == "lowerarm" and name.startswith("lowerarm_"):
            return along(seg, name, co) < sleeve[1] - 0.12
        return False

    return objects, hidden


def g_legs(body, rig, coll, lm, p):
    hip_z = lm["pelvis"].z
    low = lm["ankle"].z + 0.06 if p["to"] == "ankle" else lm["knee"].z + 0.08

    def keep(_i, w, co):
        name = dominant(w)
        return name.startswith(("thigh_", "calf_", "foot_")) or (name == "pelvis" and co.z < hip_z + 0.02)

    obj = human.shell(body, p["name"], keep, offset=0.018, smooth=2, coll=coll,
                      cuts=[((0, 0, low), (0, 0, -1)), ((0, 0, hip_z + 0.02), (0, 0, 1))])

    def hidden(_i, w, co):
        name = dominant(w)
        if name == "pelvis":
            return co.z < hip_z - 0.02
        if name.startswith(("thigh_", "calf_")):
            return co.z > low + 0.1
        return False

    return [obj], hidden


def g_wrap(body, rig, coll, lm, p):
    top, bottom = level(lm, p["top"]), level(lm, p["bottom"])
    obj = human.tube(body, rig, p["name"], top, bottom, rings=max(4, int((top - bottom) / 0.07)),
                     clearance=p.get("clearance", 0.03), flare=p.get("flare", 0.07), taper=p.get("taper", 0.0),
                     leg_follow=0.7, calf_follow=p.get("calf_follow", 0.0), coll=coll)

    def hidden(_i, w, co):
        name = dominant(w)
        if name == "pelvis":
            return bottom + 0.05 < co.z < top
        if name.startswith(("thigh_", "calf_")):
            return bottom + 0.14 < co.z < top
        return False

    return [obj], hidden


def g_hem(body, rig, coll, lm, p):
    top, bottom = level(lm, p["top"]), level(lm, p["bottom"])
    obj = human.tube(body, rig, p["name"], top, bottom, rings=max(4, int((top - bottom) / 0.06)),
                     clearance=p.get("clearance", 0.058), flare=p.get("flare", 0.06), taper=p.get("taper", 0.0),
                     leg_follow=0.7, coll=coll)
    return [obj], lambda _i, _w, _co: False


def _head_shell(body, coll, name, keep, offset, smooth=3):
    obj = human.shell(body, name, keep, offset=offset, smooth=smooth, coll=coll)
    group = obj.vertex_groups.get("Head") or obj.vertex_groups.new(name="Head")
    obj.vertex_groups.active = group
    return obj


def g_tudung(body, rig, coll, lm, p):
    """Everyday tudung: covers hair, ears and neck, drapes over the shoulders and chest; the face stays open."""
    centre, front = lm["head_centre"], lm["front_y"]
    chin, brow = lm["chin"], lm["brow"]

    def face(co):
        return co.y < centre.y - 0.035 and chin + 0.01 < co.z < brow + 0.035 and abs(co.x - centre.x) < 0.068

    def keep(_i, w, co):
        return dominant(w) in ("Head", "neck_01") and not face(co)

    head = _head_shell(body, coll, p["name"], keep, offset=0.016)
    # The drape measures the body within 0.2 m of the neck only (the T-pose arms are at shoulder height).
    drape = human.tube(body, rig, p["name"] + "_drape", lm["neck"].z + 0.03, lm["neck"].z - 0.16, rings=4,
                       segments=28, clearance=0.025, flare=0.1, coll=coll, centre_bone="neck_01", max_radius=0.2,
                       fixed_weights={"neck_01": 0.35, "spine_03": 0.65})

    def hidden(_i, w, co):
        return dominant(w) in ("Head", "neck_01") and not face(co) and co.z > chin - 0.06

    return [head, drape], hidden


def g_cap(body, rig, coll, lm, p):
    """A cap: crown shell above the brow and a stiff brim (worn backwards: the brim points behind)."""
    brow = lm["brow"]
    crown = _head_shell(body, coll, p["name"], lambda _i, w, co: dominant(w) == "Head" and co.z > brow + 0.015,
                        offset=0.014, smooth=4)
    bm = bmesh.new()
    deform = bm.verts.layers.deform.verify()
    centre = lm["head_centre"]
    direction = 1.0 if p.get("backwards") else -1.0
    ring = []
    for k in range(9):
        a = math.pi * k / 8
        ring.append(Vector((centre.x + math.cos(a) * 0.085, centre.y + direction * (0.06 + math.sin(a) * 0.07),
                            brow + 0.03)))
    base = [Vector((centre.x + math.cos(math.pi * k / 8) * 0.085, centre.y + direction * 0.06, brow + 0.035)) for k in range(9)]
    verts_a = [bm.verts.new(v) for v in base]
    verts_b = [bm.verts.new(v) for v in ring]
    for k in range(8):
        bm.faces.new((verts_a[k], verts_a[k + 1], verts_b[k + 1], verts_b[k]))
    for v in bm.verts:
        v[deform][0] = 1.0
    mesh = bpy.data.meshes.new(p["name"] + "_brim")
    bm.to_mesh(mesh)
    bm.free()
    brim = bpy.data.objects.new(p["name"] + "_brim", mesh)
    coll.objects.link(brim)
    brim.vertex_groups.new(name="Head")
    human.box_uv(brim, "pattern", 0.3)

    def hidden(_i, w, co):
        return dominant(w) == "Head" and co.z > brow + 0.04

    return [crown, brim], hidden


def g_destar(body, rig, coll, lm, p):
    """Destar: a wrapped headcloth, a band around the forehead with a folded crown."""
    brow = lm["brow"]
    band = human.tube(body, rig, p["name"], brow + 0.075, brow + 0.005, rings=3, segments=24, clearance=0.02,
                      flare=0.0, coll=coll, centre_bone="Head", fixed_weights={"Head": 1.0})
    crown = _head_shell(body, coll, p["name"] + "_crown", lambda _i, w, co: dominant(w) == "Head" and co.z > brow + 0.06,
                        offset=0.024, smooth=4)

    def hidden(_i, w, co):
        return dominant(w) == "Head" and co.z > brow + 0.07

    return [band, crown], hidden


BUILDERS = {"top": g_top, "legs": g_legs, "wrap": g_wrap, "hem": g_hem, "tudung": g_tudung, "cap": g_cap,
            "destar": g_destar}

# ------------------------------------------------------------------------------------------------- build


def first_image(obj):
    for slot in obj.material_slots:
        if slot.material and slot.material.node_tree:
            for node in slot.material.node_tree.nodes:
                if node.type == "TEX_IMAGE" and node.image and "normal" not in node.image.name.lower():
                    return node.image
    raise RuntimeError(f"No colour texture on {obj.name}")


def build(name, spec, args, reference):
    spec = {**spec, "id": name}
    coll = hk.collection(name)
    parts = human.load_base(args["raw"], spec["sex"])
    rig = parts["rig"]
    rig.name = f"{name}_rig"
    for obj in parts.values():
        for c in list(obj.users_collection):
            c.objects.unlink(obj)
        coll.objects.link(obj)
    hair = [m for style in spec["hair"] for m in human.import_hair(args["raw"], style, rig, coll)]
    heads = [parts["eyes"], parts["brows"], *hair]
    body = parts["body"]
    corrected = human.conform_rest(rig, [body, *heads], reference)
    human.reshape([body, *heads], rig, spec["radial"], spec["head_scale"])
    lm = landmarks(rig, body)

    garments, covers = [], []
    for kind, params in spec["garments"]:
        objects, hidden = BUILDERS[kind](body, rig, coll, lm, params)
        for obj in objects:
            human.bind(obj, rig)
            if not obj.data.uv_layers.get("pattern"):
                human.box_uv(obj, "pattern", 0.5)
            obj.data.materials.append(human.pattern_bake_material(f"{name}_{obj.name}", spec["cloth"][params["cloth"]]))
        garments += objects
        covers.append(hidden)
    removed = human.delete_faces(body, lambda i, w, co: any(h(i, w, co) for h in covers))

    skin_image = bpy.data.images.load(os.path.join(args["raw"], human.UBC_TEXTURES, human.SKIN_TEXTURES[spec["sex"]]))
    neck_z = lm["neck"].z if spec.get("teen") else None
    eye_image = first_image(parts["eyes"])
    hair_images = [(obj, first_image(obj)) for obj in [parts["brows"], *hair]]
    body.data.materials.clear()
    body.data.materials.append(human.skin_bake_material(f"{name}_skin_bake", skin_image, spec["skin"], neck_z))
    parts["eyes"].data.materials.clear()
    parts["eyes"].data.materials.append(human.texture_bake_material(f"{name}_eyes_bake", eye_image))
    tint = tuple(min(1.0, c * 2.2) for c in spec["hair_colour"])
    for obj, image in hair_images:
        obj.data.materials.clear()
        obj.data.materials.append(human.texture_bake_material(f"{name}_{obj.name}_bake", image, desaturate=1.0,
                                                              contrast=1.8, tint=tint))
    skin_parts = [body, *heads]
    size = 1024 if spec["budget"] > 6000 else 512
    atlas = human.bake_atlas(skin_parts + garments, f"{name}_atlas", size)
    mesh, lod = human.finish(name, rig, skin_parts, garments, atlas, spec["budget"], spec["lod"])
    base_height = lm["head_top"]
    rig.scale = (spec["height"] / base_height,) * 3
    hk.set_extras(mesh, hk_character=name)
    hk.set_extras(lod, hk_character=name, hk_lod="1")
    rig["hk_rig"] = "universal"
    tris = sum(len(p.vertices) - 2 for p in mesh.data.polygons)
    lod_tris = sum(len(p.vertices) - 2 for p in lod.data.polygons)
    print(f"HK_HUMAN {name} conform={corrected:.1f}deg hidden={removed} triangles={tris} lod1={lod_tris} "
          f"atlas={size} scale={rig.scale.x:.3f}")
    return rig, mesh, lod


def main():
    args = hk.cli_args()
    out_dir = os.path.abspath(args.get("out", os.path.join(hk.REPO_DIR, "build-cache", "raw")))
    hk.reset_scene(seed=17)
    anim = args.get("anim", os.path.join(hk.REPO_DIR, "build-cache", "raw", "anim_core.glb"))
    reference = human.load_reference_rig(os.path.abspath(anim))
    reference.hide_set(True)
    only = set(args["only"].split(",")) if isinstance(args.get("only"), str) else None
    built = {}
    for name, spec in CHARACTERS.items():
        if only and name not in only:
            continue
        rig, mesh, lod = build(name, spec, args, reference)
        built[name] = (rig, mesh, lod)
        hk.export_glb(os.path.join(out_dir, f"{name}.glb"), [rig])
        rig.hide_set(True)
        mesh.hide_set(True)
        lod.hide_set(True)
    preview = args.get("previews")
    if preview:
        for rig, mesh, lod in built.values():
            mesh.hide_render = True
            lod.hide_render = True
        for name, (rig, mesh, lod) in built.items():
            mesh.hide_set(False)
            mesh.hide_render = False
            for angle, label in ((0, "front"), (60, "three_quarter")):
                hk.render_preview(os.path.join(os.path.abspath(preview), f"human_{name}_{label}.png"), [mesh],
                                  size=(360, 600), azimuth_deg=angle, elevation_deg=4)
            human.play(rig, "walk")
            hk.render_preview(os.path.join(os.path.abspath(preview), f"human_{name}_walk.png"), [mesh],
                              size=(360, 600), azimuth_deg=60, elevation_deg=4)
            rig.animation_data_clear()
            mesh.hide_render = True


main()

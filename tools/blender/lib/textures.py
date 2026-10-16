"""Procedural, tileable, painterly textures generated with NumPy (deterministic by seed).

All functions return float32 RGBA arrays of shape (size, size, 4) in sRGB 0..1, row 0 = bottom (Blender order).
They replace procedural shader nodes, which glTF cannot carry ("bake procedural textures before export").
"""

from __future__ import annotations

import numpy as np


def _lattice_noise(size: int, gx: int, gy: int, rng: np.random.Generator) -> np.ndarray:
    """Tileable value noise on a gx × gy lattice with smoothstep interpolation."""
    lattice = rng.random((gy, gx))
    tx = np.arange(size) / size * gx
    ty = np.arange(size) / size * gy
    ix0 = np.floor(tx).astype(int)
    iy0 = np.floor(ty).astype(int)
    fx = tx - ix0
    fy = ty - iy0
    ix1 = (ix0 + 1) % gx
    iy1 = (iy0 + 1) % gy
    sx = (fx * fx * (3 - 2 * fx))[None, :]
    sy = (fy * fy * (3 - 2 * fy))[:, None]
    a = lattice[np.ix_(iy0, ix0)]
    b = lattice[np.ix_(iy0, ix1)]
    c = lattice[np.ix_(iy1, ix0)]
    d = lattice[np.ix_(iy1, ix1)]
    top = a + (b - a) * sx
    bottom = c + (d - c) * sx
    return top + (bottom - top) * sy


def fbm(size: int, seed: int, gx: int = 4, gy: int | None = None, octaves: int = 4, persistence: float = 0.5) -> np.ndarray:
    """Tileable fractal noise in 0..1. gx/gy set the base lattice (anisotropic when they differ)."""
    rng = np.random.default_rng(seed)
    gy = gy or gx
    total = np.zeros((size, size), dtype=np.float32)
    amplitude = 1.0
    norm = 0.0
    for octave in range(octaves):
        scale = 2**octave
        total += amplitude * _lattice_noise(size, gx * scale, gy * scale, rng)
        norm += amplitude
        amplitude *= persistence
    return total / norm


def _rgba(rgb: np.ndarray, alpha: np.ndarray | None = None) -> np.ndarray:
    size = rgb.shape[0]
    out = np.ones((size, size, 4), dtype=np.float32)
    out[..., :3] = np.clip(rgb, 0.0, 1.0)
    if alpha is not None:
        out[..., 3] = np.clip(alpha, 0.0, 1.0)
    return out


def _hex(color: str) -> np.ndarray:
    color = color.lstrip("#")
    return np.array([int(color[i : i + 2], 16) / 255.0 for i in (0, 2, 4)], dtype=np.float32)


def _painterly(rgb: np.ndarray, seed: int, strength: float = 0.08) -> np.ndarray:
    """Low-frequency warm/cool colour drift and soft brush blotches (the hand-painted feel)."""
    size = rgb.shape[0]
    warm = fbm(size, seed + 101, gx=3, octaves=3)[..., None]
    blot = fbm(size, seed + 202, gx=6, octaves=3)[..., None]
    tint = np.array([1.04, 1.0, 0.94], dtype=np.float32) * warm + np.array([0.95, 0.99, 1.05], dtype=np.float32) * (1 - warm)
    out = rgb * (1 + (tint - 1) * 1.5)
    out *= 1 + (blot - 0.5) * strength * 2
    # Gentle posterisation keeps flat painted areas.
    levels = 24
    return np.round(out * levels) / levels


def wood_planks(size: int = 512, seed: int = 11, planks: int = 5, base: str = "#7a5536", aged: float = 0.35) -> np.ndarray:
    """Horizontal planks (along U) with grain, seams and per-plank colour variation."""
    rng = np.random.default_rng(seed)
    v = np.arange(size)[:, None] / size * planks
    plank_index = np.floor(v).astype(int) % planks
    within = v - np.floor(v)
    grain = fbm(size, seed, gx=2, gy=24, octaves=4)
    fine = fbm(size, seed + 7, gx=8, gy=64, octaves=2)
    base_rgb = _hex(base)
    plank_tones = 0.82 + rng.random(planks) * 0.3
    plank_shift = (rng.random((planks, 3)) - 0.5) * 0.08
    tone = plank_tones[plank_index][..., None]
    rgb = base_rgb * tone + plank_shift[plank_index]
    rgb = rgb * (0.78 + 0.32 * grain[..., None] + 0.08 * (fine[..., None] - 0.5))
    weather = fbm(size, seed + 31, gx=4, octaves=4)[..., None]
    grey = rgb.mean(axis=-1, keepdims=True) * np.array([0.92, 0.95, 1.0], dtype=np.float32)
    rgb = rgb * (1 - aged * weather) + grey * (aged * weather)
    seam = np.clip(1 - np.minimum(within, 1 - within) * planks * 9, 0, 1)[..., None]
    rgb = rgb * (1 - 0.65 * seam)
    edge = np.clip(1 - np.minimum(within, 1 - within) * planks * 3.2, 0, 1)[..., None]
    rgb = rgb * (1 - 0.18 * edge)
    return _rgba(_painterly(rgb, seed))


def thatch(size: int = 512, seed: int = 21, rows: int = 7, base: str = "#a58a5c") -> np.ndarray:
    """Overlapping rows of dried nipah blades (atap), darker where each row is overlapped."""
    rng = np.random.default_rng(seed)
    v = np.arange(size)[:, None] / size * rows
    row = np.floor(v).astype(int)
    within = v - np.floor(v)
    u = np.arange(size)[None, :] / size
    blades = np.zeros((size, size), dtype=np.float32)
    for r in range(rows):
        count = 46 + int(rng.integers(0, 10))
        centers = rng.random(count)
        widths = 0.004 + rng.random(count) * 0.006
        shades = 0.75 + rng.random(count) * 0.5
        d = np.abs(((u - centers[:, None, None]) + 0.5) % 1.0 - 0.5)
        stripe = np.clip(1 - d / widths[:, None, None], 0, 1) * shades[:, None, None]
        row_value = stripe.max(axis=0)
        mask = row == r
        blades = np.where(mask, row_value, blades)
    streak = fbm(size, seed, gx=48, gy=4, octaves=3)
    base_rgb = _hex(base)
    shade = 0.62 + 0.38 * within
    rgb = base_rgb * (shade * (0.8 + 0.25 * blades) * (0.85 + 0.3 * streak))[..., None]
    lip = np.clip((within - 0.9) * 10, 0, 1)[..., None]
    rgb = rgb * (1 - 0.45 * lip)
    damp = fbm(size, seed + 9, gx=4, octaves=4)[..., None]
    rgb = rgb * (1 - 0.18 * damp) + np.array([0.18, 0.2, 0.16]) * 0.18 * damp
    return _rgba(_painterly(rgb, seed, 0.1))


def weave(size: int = 512, seed: int = 31, strips: int = 12, base: str = "#c9a86a") -> np.ndarray:
    """A generic over-under woven bamboo panel (functional weave geometry, no specific motif)."""
    u = np.arange(size)[None, :] / size * strips
    v = np.arange(size)[:, None] / size * strips
    iu = np.floor(u).astype(int)
    iv = np.floor(v).astype(int)
    fu = u - iu
    fv = v - iv
    over = ((iu // 2 + iv) % 2 == 0)
    across = np.where(over, fu, fv)
    shade = 0.72 + 0.28 * np.sin(across * np.pi)
    gap = np.where(over, np.minimum(fv, 1 - fv), np.minimum(fu, 1 - fu))
    gap_dark = np.clip(1 - gap * 14, 0, 1)
    fibre = fbm(size, seed, gx=4, gy=48, octaves=3)
    fibre_t = fbm(size, seed + 3, gx=48, gy=4, octaves=3)
    fibre_mix = np.where(over, fibre, fibre_t)
    base_rgb = _hex(base)
    tone = np.where(over, 1.0, 0.86)
    rgb = base_rgb * (shade * tone * (0.85 + 0.25 * fibre_mix))[..., None]
    rgb = rgb * (1 - 0.55 * gap_dark[..., None])
    age = fbm(size, seed + 17, gx=3, octaves=4)[..., None]
    rgb = rgb * (1 - 0.22 * age)
    return _rgba(_painterly(rgb, seed, 0.06))


def bark(size: int = 512, seed: int = 41, base: str = "#5e5144", moss: str = "#4c5b34") -> np.ndarray:
    """Fibrous vertical bark with moss patches (mangrove trunks, posts)."""
    fibres = fbm(size, seed, gx=16, gy=2, octaves=5)
    cracks = fbm(size, seed + 5, gx=24, gy=3, octaves=2)
    crack_dark = np.clip((0.42 - cracks) * 6, 0, 1)
    patch = fbm(size, seed + 13, gx=3, octaves=4)
    moss_mask = np.clip((patch - 0.55) * 5, 0, 1)[..., None]
    rgb = _hex(base) * (0.7 + 0.5 * fibres)[..., None]
    rgb = rgb * (1 - 0.5 * crack_dark[..., None])
    rgb = rgb * (1 - moss_mask) + _hex(moss) * (0.8 + 0.3 * fibres[..., None]) * moss_mask
    return _rgba(_painterly(rgb, seed, 0.08))


def palm_frond(size: int = 512, seed: int = 61, base: str = "#4f7a3a", tip: str = "#8a9a4a") -> np.ndarray:
    """Alpha-cut nipah frond: a rib along V (bottom→tip) with paired leaflets angled toward the tip."""
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32) / size
    rgb = np.zeros((size, size, 3), dtype=np.float32)
    alpha = np.zeros((size, size), dtype=np.float32)
    rib = np.abs(xx - 0.5) < 0.012
    rgb[rib] = _hex("#6b6a3c")
    alpha[rib] = 1.0
    base_rgb = _hex(base)
    tip_rgb = _hex(tip)
    pairs = 34
    for i in range(pairs):
        t = 0.04 + i / pairs * 0.92
        length = 0.42 * (1 - t * 0.55) * (0.9 + rng.random() * 0.2)
        for side in (-1, 1):
            angle = np.radians(58 + rng.random() * 8)
            dx = xx - 0.5
            dy = yy - t
            ca, sa = np.cos(angle), np.sin(angle)
            along = (dx * side * sa + dy * ca) / length
            across = (-dx * side * ca + dy * sa) / 0.012
            inside = (along >= 0) & (along <= 1) & (np.abs(across) <= (1 - along * 0.6))
            colour = base_rgb * (1 - t) + tip_rgb * t
            shade = 0.85 + 0.25 * rng.random()
            rgb[inside] = colour * shade * (0.9 + 0.15 * (1 - along[inside]))[:, None]
            alpha[inside] = 1.0
    return _rgba(_painterly(rgb, seed, 0.05), alpha)


def leaf_cluster(size: int = 512, seed: int = 51, count: int = 140, greens=("#3f6b35", "#56803f", "#2f5530", "#6f8f45")) -> np.ndarray:
    """Alpha-cut cluster of oval leaves for foliage cards (not tiled)."""
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32) / size
    rgb = np.zeros((size, size, 3), dtype=np.float32)
    alpha = np.zeros((size, size), dtype=np.float32)
    palette = np.array([_hex(c) for c in greens])
    for _ in range(count):
        cx, cy = 0.1 + rng.random() * 0.8, 0.1 + rng.random() * 0.8
        # Cluster leaves toward the centre so the card silhouette is rounded.
        cx = 0.5 + (cx - 0.5) * 0.85
        cy = 0.5 + (cy - 0.5) * 0.85
        length = 0.05 + rng.random() * 0.05
        width = length * (0.32 + rng.random() * 0.12)
        angle = rng.random() * np.pi
        dx = xx - cx
        dy = yy - cy
        ca, sa = np.cos(angle), np.sin(angle)
        lx = (dx * ca + dy * sa) / length
        ly = (-dx * sa + dy * ca) / width
        inside = lx * lx + ly * ly <= 1.0
        if not inside.any():
            continue
        colour = palette[rng.integers(0, len(palette))] * (0.8 + rng.random() * 0.4)
        vein = np.clip(1 - np.abs(ly) * 6, 0, 1) * 0.12
        light = (0.82 + 0.25 * (1 - (lx + 1) * 0.5)) * (1 + vein)
        rgb[inside] = colour * light[inside][:, None]
        alpha[inside] = 1.0
    rgb = _painterly(rgb, seed, 0.05)
    return _rgba(rgb, alpha)

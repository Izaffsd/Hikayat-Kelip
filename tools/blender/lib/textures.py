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


def _row_blades(size: int, rng: np.random.Generator, count: int, max_tip: float):
    """One attap row across U: per column, the blade id, its tone and how far its pointed tip hangs below the row."""
    edges = np.sort(rng.random(count))
    u = (np.arange(size) + 0.5) / size
    index = np.searchsorted(edges, u) % count
    start = edges[index - 1]
    end = np.where(index == 0, edges[0] + 1.0, edges[index])
    start = np.where(index == 0, edges[-1], start)
    span = (end - start) % 1.0
    pos = ((u - start) % 1.0) / np.maximum(span, 1e-6)  # 0..1 across the blade
    tip = (0.05 + rng.random(count) * max_tip)[index]
    # Mostly blunt, slightly rounded cut ends: a ragged fringe rather than pointed shingles.
    pointed = tip * (0.7 + 0.3 * np.sqrt(np.clip(1 - np.abs(pos * 2 - 1), 0, 1)))
    tone = (0.88 + rng.random(count) * 0.2)[index]
    grey = (rng.random(count) < 0.06)[index]
    seam = np.clip(1 - np.minimum(pos, 1 - pos) * 10, 0, 1)
    return pointed, tone, grey, seam


def thatch(size: int = 512, seed: int = 21, rows: int = 8, base: str = "#9c7d54") -> np.ndarray:
    """Nipah attap: overlapping rows of dried blades. V runs up the slope; each row's ragged, pointed tips hang
    over the row below and shade it, so rows read as layered thatch rather than tiles (tileable in U and V)."""
    rng = np.random.default_rng(seed)
    v = (np.arange(size)[:, None] + 0.5) / size * rows  # row units, up the slope
    band = np.floor(v).astype(int) % rows
    within = v - np.floor(v)  # 0 at a row's nominal bottom edge, 1 at the next row's
    data = [_row_blades(size, rng, 96 + int(rng.integers(0, 24)), 0.22) for _ in range(rows)]
    u_axis = (np.arange(size) + 0.5) / size
    # Rows sag and wave a little (whole periods across U, so the texture still tiles).
    wobble = np.stack([
        0.07 * np.sin(2 * np.pi * (int(rng.integers(1, 3)) * u_axis + rng.random()))
        + 0.03 * np.sin(2 * np.pi * (int(rng.integers(3, 6)) * u_axis + rng.random()))
        for _ in range(rows)
    ])
    tips = np.stack([d[0] for d in data]) + 0.1 + wobble  # (rows, size), always > 0
    tones = np.stack([d[1] for d in data])
    greys = np.stack([d[2] for d in data])
    seams = np.stack([d[3] for d in data])
    above = (band + 1) % rows
    cols = np.arange(size)[None, :]
    # Pixel belongs to the row above where that row's tips hang down over this band.
    hang = 1.0 - within  # distance below the next row's nominal edge
    covered = hang <= tips[above, cols]
    layer = np.where(covered, above, band)
    # Distance from the visible blade's own tip (0 at the tip): exposed tips are light, deeper parts darker.
    from_tip = np.where(covered, tips[above, cols] - hang, within + tips[band, cols])
    light = 0.78 + 0.3 * np.clip(1 - from_tip / 0.9, 0, 1)
    # Shadow cast on a row just under the tips of the row above.
    gap = np.where(covered, 1.0, hang - tips[above, cols])
    shadow = np.where(covered, 0.0, np.clip(1 - gap / 0.3, 0, 1) ** 1.5)
    tone = tones[layer, cols]
    fibre = fbm(size, seed, gx=128, gy=3, octaves=3)
    streak = fbm(size, seed + 4, gx=32, gy=2, octaves=2)
    base_rgb = _hex(base)
    grey_rgb = _hex(base) * 0.75 + np.array([0.5, 0.5, 0.48], dtype=np.float32) * 0.25
    colour = np.where(greys[layer, cols][..., None], grey_rgb, base_rgb)
    rgb = colour * (tone * light * (0.84 + 0.22 * fibre) * (0.92 + 0.14 * streak))[..., None]
    rgb = rgb * (1 - 0.55 * shadow[..., None])
    rgb = rgb * (1 - 0.28 * seams[layer, cols][..., None])
    tip_edge = np.where(covered, np.clip(1 - from_tip / 0.035, 0, 1), 0.0)
    rgb = rgb * (1 - 0.25 * tip_edge[..., None])
    damp = fbm(size, seed + 9, gx=3, octaves=4)[..., None]
    rgb = rgb * (1 - 0.2 * damp) + np.array([0.16, 0.18, 0.13]) * 0.2 * damp
    return _rgba(_painterly(rgb, seed, 0.08))


def weave(size: int = 512, seed: int = 31, strips: int = 12, base: str = "#c9a86a", twill: bool = False) -> np.ndarray:
    """A woven bamboo panel (functional weave geometry, no specific motif). `twill` gives a 2/2 herringbone twill,
    the diagonal structure of plaited bamboo walls; otherwise a plain over-under weave (cloth)."""
    u = np.arange(size)[None, :] / size * strips
    v = np.arange(size)[:, None] / size * strips
    iu = np.floor(u).astype(int)
    iv = np.floor(v).astype(int)
    fu = u - iu
    fv = v - iv
    if twill:
        # The diagonal reverses every `strips // 2` columns (herringbone); strips must be a multiple of 8 to tile.
        direction = np.where((iu // (strips // 2)) % 2 == 0, 1, -1)
        over = ((iu + direction * iv) % 4) < 2
    else:
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


def net(size: int = 256, seed: int = 33, cells: int = 8, base: str = "#6c5f43") -> np.ndarray:
    """Alpha-cut diamond fishing net (jala): two diagonal twine sets with darker knots; tiles in U and V."""
    u = np.arange(size)[None, :] / size
    v = np.arange(size)[:, None] / size
    d1 = (u + v) * cells
    d2 = (u - v) * cells
    width = 0.07
    line1 = np.minimum(d1 % 1, 1 - d1 % 1) < width
    line2 = np.minimum(d2 % 1, 1 - d2 % 1) < width
    knot = line1 & line2
    alpha = (line1 | line2).astype(np.float32)
    fibre = fbm(size, seed, gx=16, octaves=3)
    rgb = _hex(base) * (0.85 + 0.3 * fibre)[..., None]
    rgb = np.where(knot[..., None], rgb * 0.7, rgb)
    return _rgba(rgb.astype(np.float32), alpha)


def plaid(size: int = 512, seed: int = 121, base: str = "#5a1a24", stripes=(), threads: int = 96) -> np.ndarray:
    """Woven checks (kain pelikat / sampin cloth): the same stripe sequence in warp (U) and weft (V), interlaced in a
    2/2 twill so crossings mix the two colours thread by thread. `stripes` = [(start, width, colour)] in 0..1 of the
    repeat; one repeat per texture, so it tiles. Original colourways only."""
    coord = (np.arange(size) + 0.5) / size
    colour_at = np.tile(_hex(base), (size, 1))
    for start, width, colour in stripes:
        inside = ((coord - start) % 1.0) < width
        colour_at[inside] = _hex(colour)
    warp = colour_at[None, :, :]  # varies with U
    weft = colour_at[:, None, :]  # varies with V
    iu = (np.arange(size)[None, :] * threads // size)
    iv = (np.arange(size)[:, None] * threads // size)
    warp_on_top = ((iu + iv) % 4) < 2
    rgb = np.where(warp_on_top[..., None], warp, weft).astype(np.float32)
    fibre = fbm(size, seed, gx=32, octaves=2)
    rgb = rgb * (0.9 + 0.16 * fibre)[..., None]
    return _rgba(_painterly(rgb, seed, 0.04))


def batik(size: int = 512, seed: int = 131, ground: str = "#7a3b1e", dye: str = "#e3c58a", accent: str = "#2c3f56",
          sprigs: int = 4) -> np.ndarray:
    """Hand-dyed cloth in a batik-like technique, with an original motif: a half-drop lattice of five-petal sprigs
    with dotted rings, between undulating vines, plus the crackle veins wax-resist dyeing leaves. Generic geometry;
    no traditional or regional motif is reproduced. Tiles in U and V."""
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32) / size
    rgb = np.zeros((size, size, 3), dtype=np.float32) + _hex(ground)
    cell = 1.0 / sprigs
    for row in range(sprigs):
        for col in range(sprigs):
            cx = (col + 0.5 + (0.5 if row % 2 else 0.0)) * cell
            cy = (row + 0.5) * cell
            dx = ((xx - cx + 0.5) % 1.0) - 0.5
            dy = ((yy - cy + 0.5) % 1.0) - 0.5
            r = np.hypot(dx, dy) / cell
            a = np.arctan2(dy, dx)
            petal = r < 0.28 * (0.55 + 0.45 * np.abs(np.cos(2.5 * a)))
            rgb[petal] = _hex(dye)
            rgb[r < 0.07] = _hex(accent)
            ring = (np.abs(r - 0.4) < 0.02) & (np.cos(a * 12) > 0.3)
            rgb[ring] = _hex(dye)
    vine = np.abs(((yy * sprigs) % 1.0) - 0.5 - 0.12 * np.sin(xx * np.pi * 2 * sprigs)) < 0.018
    rgb[vine & (rgb[..., 0] == _hex(ground)[0])] = _hex(accent)
    crackle = fbm(size, seed, gx=12, octaves=3)
    veins = np.abs(crackle - 0.5) < 0.012
    rgb[veins] = rgb[veins] * 0.55 + _hex(accent) * 0.45
    cloth = fbm(size, seed + 1, gx=48, octaves=2)
    rgb = rgb * (0.9 + 0.14 * cloth)[..., None]
    return _rgba(_painterly(rgb, seed, 0.05))


def paper(size: int = 512, seed: int = 101, lines: int = 14, ink: bool = True, torn: bool = False) -> np.ndarray:
    """Aged hand-written page: cream paper with stains and rows of illegible cursive strokes (generic handwriting,
    deliberately no real script). `torn` gives a ragged alpha edge along the right side."""
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32) / size
    stain = fbm(size, seed, gx=4, octaves=4)
    fibre = fbm(size, seed + 1, gx=64, gy=64, octaves=2)
    rgb = _hex("#e9dcbc") * (0.9 + 0.12 * fibre)[..., None]
    rgb = rgb * (1 - 0.22 * np.clip(stain - 0.45, 0, 1)[..., None] * 2)
    edge = np.minimum(np.minimum(xx, 1 - xx), np.minimum(yy, 1 - yy))
    rgb = rgb * (0.82 + 0.18 * np.clip(edge * 12, 0, 1))[..., None]
    if ink:
        ink_mask = np.zeros((size, size), dtype=bool)
        for row in range(lines):
            base = 0.9 - (row + 0.5) * (0.8 / lines)
            x = 0.1
            while x < 0.88:
                length = 0.05 + rng.random() * 0.14
                end = min(x + length, 0.9)
                seg = (xx >= x) & (xx <= end)
                wave = base + 0.006 * np.sin((xx - x) * 2 * np.pi * (90 + rng.random() * 30)) + (rng.random() - 0.5) * 0.004
                ink_mask |= seg & (np.abs(yy - wave) < 0.0028)
                x = end + 0.015 + rng.random() * 0.02
        rgb = np.where(ink_mask[..., None], np.array([0.17, 0.12, 0.1], dtype=np.float32), rgb)
    alpha = np.ones((size, size), dtype=np.float32)
    if torn:
        ragged = 0.9 + 0.035 * fbm(size, seed + 5, gx=2, gy=24, octaves=4)[:, :1] * 2
        alpha = (xx < ragged).astype(np.float32)
        rgb = rgb * (1 - 0.3 * np.clip(1 - (ragged - xx) * 60, 0, 1))[..., None]
    return _rgba(rgb.astype(np.float32), alpha)


def polygon_distance(size: int, polygon: list[tuple[float, float]]) -> tuple[np.ndarray, np.ndarray]:
    """Inside mask and distance to the outline (UV units) for a polygon given in UV space (0..1)."""
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    px, py = (xx + 0.5) / size, (yy + 0.5) / size
    inside = np.zeros((size, size), dtype=bool)
    dist = np.full((size, size), np.inf, dtype=np.float32)
    pts = list(polygon)
    for (x0, y0), (x1, y1) in zip(pts, pts[1:] + pts[:1]):
        crosses = ((y0 > py) != (y1 > py)) & (px < (x1 - x0) * (py - y0) / ((y1 - y0) or 1e-9) + x0)
        inside ^= crosses
        dx, dy = x1 - x0, y1 - y0
        t = np.clip(((px - x0) * dx + (py - y0) * dy) / max(dx * dx + dy * dy, 1e-12), 0, 1)
        dist = np.minimum(dist, np.hypot(px - (x0 + t * dx), py - (y0 + t * dy)))
    return inside, dist


WAU_PALETTE = {"ground": "#efe2c4", "a": "#a3242a", "gold": "#d9a441", "b": "#1f5f63"}


def wau_skin(polygon_uv: list[tuple[float, float]], size: int = 1024, seed: int = 111, metres: float = 2.6,
             palette: dict | None = None) -> np.ndarray:
    """Layered cut-paper kite skin: colour bands that follow the outline (as layered paper does on a wau) and a
    column of nested diamonds and dots down the spine. Original geometry, no copied motif. `palette` recolours it
    (ground, a, gold, b): Bayu's glider keeps the default; festival kites get their own."""
    pal = {**WAU_PALETTE, **(palette or {})}
    inside, dist = polygon_distance(size, polygon_uv)
    d = dist * metres  # metres from the edge
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32) / size
    rgb = np.zeros((size, size, 3), dtype=np.float32) + _hex(pal["ground"])
    bands = [(0.0, 0.035, pal["a"]), (0.035, 0.05, pal["gold"]), (0.05, 0.08, pal["b"]), (0.08, 0.095, pal["gold"]),
             (0.2, 0.235, pal["a"]), (0.235, 0.25, pal["gold"])]
    for lo, hi, colour in bands:
        rgb[(d >= lo) & (d < hi)] = _hex(colour)
    # Spine column: nested diamonds and dots (|x| small in metres).
    cx = (xx - 0.5) * metres
    cy = (yy - 0.5) * metres
    for k, z in enumerate(np.arange(-0.62, 0.86, 0.16)):
        diamond = np.abs(cx) + np.abs(cy - z)
        rgb[(diamond < 0.07) & (d > 0.1)] = _hex(pal["a"] if k % 2 else pal["b"])
        rgb[(diamond < 0.045) & (d > 0.1)] = _hex(pal["gold"])
        rgb[(diamond < 0.02) & (d > 0.1)] = _hex(pal["ground"])
    paper_grain = fbm(size, seed, gx=48, octaves=2)
    rgb = rgb * (0.92 + 0.12 * paper_grain)[..., None]
    rgb[~inside] = _hex(pal["ground"])  # outside the outline (never shown; keeps mip edges clean)
    return _rgba(_painterly(rgb, seed, 0.04))


def stone(size: int = 512, seed: int = 141, base: str = "#9a5a3c", rows: int = 4) -> np.ndarray:
    """Laterite blocks (batu laterit): porous red-brown stone laid in courses, with dark mortar and pitting."""
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32) / size
    row = np.floor(yy * rows)
    offset = (row % 2) * 0.5
    col = np.floor(xx * 2 + offset)
    ux = (xx * 2 + offset) - col
    uy = yy * rows - row
    mortar = np.clip(np.minimum(np.minimum(ux, 1 - ux) * 18, np.minimum(uy, 1 - uy) * 9), 0, 1)
    rng = np.random.default_rng(seed)
    tint = rng.uniform(0.85, 1.12, size=(rows + 1, 4))
    block = tint[row.astype(int), col.astype(int) % 4]
    pits = fbm(size, seed + 3, gx=40, octaves=3)
    pitting = np.clip((0.35 - pits) * 5, 0, 1)
    broad = fbm(size, seed + 7, gx=6, octaves=4)
    rgb = _hex(base) * (block * (0.8 + 0.35 * broad))[..., None]
    rgb = rgb * (1 - 0.45 * pitting[..., None])
    rgb = rgb * (0.35 + 0.65 * mortar[..., None])
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


def leaf_cluster(
    size: int = 512,
    seed: int = 51,
    count: int = 140,
    greens=("#3f6b35", "#56803f", "#2f5530", "#6f8f45"),
    leaf: tuple[float, float] = (0.05, 0.1),
    disc: float | None = None,
) -> np.ndarray:
    """Alpha-cut cluster of oval leaves for foliage cards (not tiled). With `disc` (a radius in UV units) leaves fill a
    round clump that is darker toward its centre, so cards never show square silhouettes."""
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32) / size
    rgb = np.zeros((size, size, 3), dtype=np.float32)
    alpha = np.zeros((size, size), dtype=np.float32)
    palette = np.array([_hex(c) for c in greens])
    for _ in range(count):
        if disc:
            a = rng.random() * 2 * np.pi
            # Lobed, irregular rim: the reachable radius varies with the angle, so clumps never read as discs.
            rim = disc * (0.78 + 0.14 * np.sin(3 * a + seed) + 0.08 * np.sin(5 * a + 2 * seed))
            r = rim * np.sqrt(rng.random())
            cx, cy = 0.5 + np.cos(a) * r, 0.5 + np.sin(a) * r
            depth = 0.72 + 0.36 * (r / disc)
        else:
            cx, cy = 0.1 + rng.random() * 0.8, 0.1 + rng.random() * 0.8
            # Cluster leaves toward the centre so the card silhouette is rounded.
            cx = 0.5 + (cx - 0.5) * 0.85
            cy = 0.5 + (cy - 0.5) * 0.85
            depth = 1.0
        length = leaf[0] + rng.random() * (leaf[1] - leaf[0])
        width = length * (0.36 + rng.random() * 0.14)
        angle = rng.random() * np.pi
        dx = xx - cx
        dy = yy - cy
        ca, sa = np.cos(angle), np.sin(angle)
        lx = (dx * ca + dy * sa) / length
        ly = (-dx * sa + dy * ca) / width
        inside = lx * lx + ly * ly <= 1.0
        if not inside.any():
            continue
        colour = palette[rng.integers(0, len(palette))] * (0.8 + rng.random() * 0.4) * depth
        vein = np.clip(1 - np.abs(ly) * 6, 0, 1) * 0.12
        light = (0.82 + 0.25 * (1 - (lx + 1) * 0.5)) * (1 + vein)
        rgb[inside] = colour * light[inside][:, None]
        alpha[inside] = 1.0
    rgb = _painterly(rgb, seed, 0.05)
    return _rgba(rgb, alpha)

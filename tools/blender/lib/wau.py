"""The wau bulan outline shared by the glider prop (props/slice_props.py) and the festival kites (kits/sawah.py)."""

from __future__ import annotations

# Wau bulan outline, right half (x >= 0), clockwise from the top of the head; metres in the kite plane (x, z).
WAU_RIGHT = [
    (0.0, 0.95), (0.1, 0.92), (0.16, 0.82), (0.13, 0.7), (0.1, 0.62),  # head
    (0.16, 0.56), (0.45, 0.63), (0.8, 0.62), (1.06, 0.55), (1.22, 0.43),  # wing leading edge to the tip
    (1.1, 0.37), (0.88, 0.31), (0.6, 0.23), (0.32, 0.13), (0.14, 0.06),  # trailing edge back to the body
    (0.08, -0.06), (0.07, -0.2), (0.09, -0.46),  # waist
    (0.2, -0.52), (0.38, -0.46), (0.52, -0.37), (0.62, -0.27),  # crescent: inner arc out to the horn
    (0.6, -0.42), (0.48, -0.6), (0.27, -0.75), (0.0, -0.82),  # crescent: outer arc back to the bottom
]
WAU_OUTLINE = WAU_RIGHT + [(-x, z) for x, z in reversed(WAU_RIGHT[1:-1])]
WAU_METRES = 2.6  # UV square side in metres, centred on the kite


def wau_uv(x: float, z: float) -> tuple[float, float]:
    """UV of a point in the kite plane (metres)."""
    return (x / WAU_METRES + 0.5, z / WAU_METRES + 0.5)

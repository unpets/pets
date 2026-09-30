"""Authored contact frames for independently placed climbing environments."""

import math

import numpy as np

from .hands import fingertip, surface_press
from .transforms import point, transform

STRIDE = 0.28
ROPE_Y = -0.80
EDGE_Y = -0.87
LEDGE_HEIGHT = 1.60
REFERENCE_FRAMES = {
    "climbing": ("wall", [0, -0.95, 0]),
    "climb-rope": ("rope", [0, ROPE_Y, 0]),
    "climb-ladder": ("ladder", [0, -0.85, 0]),
    "climb-border": ("ledge", [0, EDGE_Y, LEDGE_HEIGHT]),
}


def ease(value):
    value = np.clip(value, 0, 1)
    return value * value * (3 - 2 * value)


def contact_cycle(t, side):
    phase = t + (0 if side == 1 else 0.5)
    fraction = phase % 1
    recovery = ease((fraction - 0.65) / 0.35)
    return STRIDE * (math.floor(phase) + recovery), math.sin(math.pi * recovery) ** 2


def climbing_targets(state, t, side):
    rise, release = contact_cycle(t, side)
    if state == "climb-rope":
        wrist = np.array(
            [
                side * (0.225 + 0.06 * release),
                ROPE_Y + 0.11 + 0.07 * release,
                2.04 + (0.14 if side < 0 else 0) + rise,
            ]
        )
        ankle = np.array(
            [
                side * 0.12,
                -0.48,
                0.34 + STRIDE * t - side * 0.035 * math.sin(math.tau * t),
            ]
        )
        rotation = (0, -side * math.pi / 2, 0)
    else:
        wrist = np.array([side * 0.54, -0.625 - 0.06 * release, 2.15 + rise])
        foot_rise, foot_release = contact_cycle(t, -side)
        ankle = np.array(
            [
                side * 0.27,
                -0.46 + 0.10 * foot_release,
                0.25 + foot_rise + 0.08 * foot_release,
            ]
        )
        rotation = (math.pi / 2, 0, 0)
    return wrist, ankle, transform(angles=rotation)


def border_hand(t, side, rest):
    start = 0.44 if side == 1 else 0.53
    peel = ease((t - start) / 0.12)
    release = ease((t - start - 0.12) / 0.10)
    flat = transform((side * 0.59, EDGE_Y, LEDGE_HEIGHT + 0.066), (math.pi / 2, 0, 0))
    pad = fingertip("middle", surface_press("middle", 0.066))
    pivot = point(flat, pad)
    rotation = transform(angles=(math.pi / 2 + 0.55 * peel, 0, 0))
    rotation[:3, 3] = pivot - point(rotation, pad)
    wrist = rotation[:3, 3] * (1 - release) + rest * release
    rotation[:3, 3] = wrist
    return wrist, rotation, release

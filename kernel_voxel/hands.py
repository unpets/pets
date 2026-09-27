"""Articulated mechanical hands with bounded flexion and independent digit chains."""

import math
from dataclasses import dataclass

import numpy as np

from .transforms import transform


@dataclass(frozen=True)
class HandBone:
    parent: str
    digit: str
    segment: int
    side: int
    length: float
    width: float
    origin: tuple[float, float, float]
    flexion_limit: float


# Local Z follows the digit. The palm faces -Y; flexion rotates about +X.
DIGITS = {
    "index": ((0.047, 0.034, 0.026), -0.072, 0.038),
    "middle": ((0.052, 0.038, 0.028), -0.024, 0.040),
    "ring": ((0.048, 0.034, 0.026), 0.024, 0.038),
    "little": ((0.037, 0.028, 0.023), 0.072, 0.034),
    "thumb": ((0.040, 0.035, 0.028), -0.110, 0.044),
}
HAND_BONES = {}
for side, suffix in ((-1, "L"), (1, "R")):
    for digit, (lengths, x, width) in DIGITS.items():
        parent = f"hand.{suffix}"
        for segment, length in enumerate(lengths):
            name = f"{digit}.{segment + 1:02d}.{suffix}"
            origin = (
                (side * x, 0, 0.056 if digit == "thumb" else 0.118)
                if segment == 0
                else (0, 0, lengths[segment - 1])
            )
            HAND_BONES[name] = HandBone(
                parent,
                digit,
                segment,
                side,
                length,
                width,
                origin,
                math.radians((85, 105, 75)[segment]),
            )
            parent = name


def digit_angles(state, t, digit, side):
    """Return flexion at each hinge, MCP spread and thumb opposition, in radians."""
    phase = math.tau * t
    index = list(DIGITS).index(digit)
    curl = np.array([0.16, 0.25, 0.13])
    spread = 0.015
    opposition = 0.25
    if state.startswith("running-"):
        curl = np.array([0.38, 0.54, 0.32]) * (1 + 0.08 * math.sin(phase + side))
    elif state == "waving" and side == 1:
        follow = 0.025 * (1 + math.sin(phase - index * 0.25))
        curl = np.array([0.025, 0.035, 0.020]) + follow
        spread = 0.09
        opposition = 0.08
    elif state == "jumping":
        curl = np.array([0.16, 0.25, 0.13]) * (1 - 0.8 * math.sin(math.pi * t) ** 2)
        spread = 0.015 + 0.07 * math.sin(math.pi * t) ** 2
    elif state == "failed":
        curl = np.array([0.18, 0.32, 0.16])
    elif state == "waiting":
        curl = np.array([0.08, 0.16, 0.08]) + 0.025 * (
            1 + math.sin(phase - index * 0.35)
        )
        spread = 0.04
        opposition = 0.14
    elif state == "running":
        if side == 1:
            curl = np.array([0.28, 1.05, 0.45])
            spread = 0
            opposition = 0.48
        else:
            curl = np.array([0.20, 0.34, 0.17]) + 0.09 * (
                1 + math.sin(2 * phase - index * 0.8)
            )
            opposition = 0.35
    elif state == "review" and side == 1:
        curl = (
            np.array([0.06, 0.10, 0.08])
            if digit == "index"
            else np.array([0.62, 0.92, 0.55])
        )
        spread = 0.02
        opposition = 0.7
    if digit == "thumb":
        curl *= (0.35, 0.7, 0.8)
    return curl, spread, opposition


def hand_matrices(matrices, state, t):
    result = {}
    for name, bone in HAND_BONES.items():
        curls, spread, opposition = digit_angles(state, t, bone.digit, bone.side)
        flexion = float(np.clip(curls[bone.segment], 0, bone.flexion_limit))
        yaw = 0.0
        roll = 0.0
        if bone.segment == 0:
            if bone.digit == "thumb":
                yaw = -bone.side * 0.95
                roll = bone.side * opposition
            else:
                yaw = bone.side * DIGITS[bone.digit][1] / 0.072 * spread
        parent = result.get(bone.parent)
        if parent is None:
            parent = matrices[bone.parent]
        result[name] = parent @ transform(bone.origin, (flexion, yaw, roll))
    return result

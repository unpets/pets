"""Rigid transforms in metres with Z up."""

import math

import numpy as np


def rotation(x=0.0, y=0.0, z=0.0):
    cx, sx, cy, sy, cz, sz = (
        math.cos(x),
        math.sin(x),
        math.cos(y),
        math.sin(y),
        math.cos(z),
        math.sin(z),
    )
    return (
        np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1.0]])
        @ np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
        @ np.array([[1.0, 0, 0], [0, cx, -sx], [0, sx, cx]])
    )


def transform(location=(0, 0, 0), angles=(0, 0, 0)):
    m = np.eye(4)
    m[:3, :3] = rotation(*angles)
    m[:3, 3] = location
    return m


def point(m, p):
    return (m @ np.r_[p, 1])[:3]

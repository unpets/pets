"""Stable orthographic sprite framing with transparent cell margins."""

import math

import numpy as np

from .rig import CELL, FRAMES

MARGIN = 4


def projected_bounds(scene):
    inverse = np.asarray(scene.camera.matrix_world.inverted())
    points = []
    for obj in scene.objects:
        if obj.type not in {"MESH", "CURVE"} or obj.hide_render:
            continue
        matrix = inverse @ np.asarray(obj.matrix_world)
        corners = np.asarray(obj.bound_box)
        points.append(corners @ matrix[:3, :3].T + matrix[:3, 3])
    projected = np.concatenate(points)[:, :2]
    return projected.min(axis=0), projected.max(axis=0)


def view_extent(scene):
    return np.max(
        np.abs(np.asarray(scene.camera.data.view_frame(scene=scene))[:, :2]), axis=0
    )


def fit_camera(scene, timeline):
    """Keep one camera transform and scale for the complete animation library."""
    times = {float(sample["frame"]) for sample in timeline}
    for state, count in {**FRAMES, "look": 16}.items():
        frames = [sample["frame"] for sample in timeline if sample["state"] == state]
        duration = len(frames) - (1 if state == "jumping" else 0)
        for index in range(count):
            phase = index / (count - 1 if state == "jumping" else count)
            times.add(frames[0] + phase * duration)
    extent = np.zeros(2)
    for frame in sorted(times):
        scene.frame_set(math.floor(frame), subframe=frame % 1)
        low, high = projected_bounds(scene)
        extent = np.maximum(extent, np.maximum(abs(low), abs(high)))
    usable = 1 - 2 * MARGIN / np.asarray(CELL)
    scene.camera.data.ortho_scale *= max(
        1.0, float(np.max(extent / (view_extent(scene) * usable)))
    )
    scene.frame_set(1)


def verify_frame(scene):
    low, high = projected_bounds(scene)
    edge = view_extent(scene)
    pixels = np.minimum((low / edge + 1) / 2, (1 - high / edge) / 2) * CELL
    if float(pixels.min()) < MARGIN - 0.05:
        raise ValueError(
            f"Sprite camera clips the animated bounds at frame {scene.frame_current}: {pixels.tolist()}"
        )

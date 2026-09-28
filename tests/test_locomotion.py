"""Locomotion, articulated variants, and attachment regression checks."""

import unittest

import numpy as np
from kernel_voxel.animation import PROJECT, resolve_composition
from kernel_voxel.rig import (
    CABLE_RADIUS,
    FOREARM_PORT,
    LOCOMOTION,
    SOURCE_MOTIONS,
    cable_points,
    point,
    pose_at,
)


class LocomotionTests(unittest.TestCase):
    def test_views_share_one_motion_and_climbing_variants_inherit(self):
        self.assertIn("move", PROJECT["compositions"])
        for target in ("codex", "shimeji"):
            for intent in ("running-left", "running-right"):
                self.assertNotIn(intent, PROJECT["compositions"])
                self.assertEqual(
                    PROJECT["exports"][target][intent]["composition"], "move"
                )
        for identifier in ("climb-rope", "climb-ladder", "climb-border"):
            self.assertEqual(PROJECT["compositions"][identifier]["parent"], "climbing")
            self.assertEqual(
                resolve_composition(PROJECT, identifier)["bindings"]["screen/eyes"],
                resolve_composition(PROJECT, "climbing")["bindings"]["screen/eyes"],
            )

    def test_all_new_motion_samples_preserve_limb_reach_and_fixed_bone_lengths(self):
        for name in SOURCE_MOTIONS:
            for t in np.linspace(0, 1, 17):
                pose = pose_at(name, t)
                for side in ("L", "R"):
                    for start, end, length in (
                        ("shoulder", "elbow", 0.33),
                        ("elbow", "wrist", 0.34),
                        ("hip", "knee", 0.42),
                        ("knee", "ankle", 0.42),
                    ):
                        self.assertAlmostEqual(
                            np.linalg.norm(
                                pose.joints[f"{start}.{side}"]
                                - pose.joints[f"{end}.{side}"]
                            ),
                            length,
                            places=6,
                        )

    def test_locomotion_is_direction_neutral_and_side_steps_change_foot_travel(self):
        for name in LOCOMOTION:
            pose = pose_at(name, 0.25)
            forward = pose.matrices["body"][:3, :3] @ np.array([0, -1, 0])
            self.assertLess(abs(forward[0]), 0.02)
        a, b = (
            pose_at("sidestep-right", t).matrices["foot.R"][:3, 3] for t in (0, 0.5)
        )
        self.assertGreater(abs(a[0] - b[0]), 0.1)
        self.assertLess(abs(a[1] - b[1]), 1e-8)

    def test_forearm_cable_is_clear_and_has_no_pinched_bends(self):
        for t in np.linspace(0, 1, 25):
            pose = pose_at("running", t)
            np.testing.assert_allclose(
                pose.cable_start, point(pose.matrices["forearm.R"], FOREARM_PORT)
            )
            points = cable_points(pose, 128)
            segments = np.diff(points, axis=0)
            lengths = np.linalg.norm(segments, axis=1)
            directions = segments / lengths[:, None]
            bends = np.arccos(
                np.clip(np.sum(directions[:-1] * directions[1:], axis=1), -1, 1)
            )
            radii = (lengths[:-1] + lengths[1:]) / 2 / np.maximum(bends, 1e-9)
            self.assertGreater(radii.min(), CABLE_RADIUS * 3)
            self.assertLess(lengths.max() / lengths.min(), 1.01)

"""Climbing reach, shell clearance, grip release, and completed mantle checks."""

import unittest

import numpy as np
from kernel_voxel.hands import digit_angles
from kernel_voxel.rig import pose_at


class ClimbingTests(unittest.TestCase):
    def test_raised_arm_shafts_clear_the_head_and_chest(self):
        shells = [
            ("body", [0, 0, 1.44], [1.04, 0.68, 0.39], 0.14),
            ("head", [0, -0.035, 0.33], [1.47, 0.88, 0.97], 0.22),
        ]
        for state in ("climbing", "climb-ladder", "climb-rope", "climb-border"):
            for t in np.linspace(0, 1, 81):
                pose = pose_at(state, t)
                for side in ("L", "R"):
                    for part, length in (("upper_arm", 0.33), ("forearm", 0.34)):
                        matrix = pose.matrices[f"{part}.{side}"]
                        for distance in np.linspace(0.10, length - 0.06, 7):
                            point = matrix @ [0, 0, distance, 1]
                            for node, center, size, radius in shells:
                                local = (np.linalg.inv(pose.matrices[node]) @ point)[
                                    :3
                                ] - center
                                q = np.abs(local) - (np.array(size) / 2 - radius)
                                clearance = (
                                    np.linalg.norm(np.maximum(q, 0))
                                    + min(max(q), 0)
                                    - radius
                                )
                                self.assertGreater(
                                    clearance, 0.07, (state, t, side, part, node)
                                )

    def test_mantle_finishes_with_both_feet_planted_and_hands_released(self):
        start, end = pose_at("climb-border", 0), pose_at("climb-border", 1)
        lift = end.matrices["body"][2, 3] - start.matrices["body"][2, 3]
        self.assertGreater(lift, 1.6)
        for side, sign in (("L", -1), ("R", 1)):
            foot = end.matrices[f"foot.{side}"]
            np.testing.assert_allclose(foot[:3, :3], np.eye(3), atol=1e-8)
            np.testing.assert_allclose(
                pose_at("climb-border", 0.85).matrices[f"foot.{side}"][:3, 3],
                foot[:3, 3],
                atol=1e-8,
            )
            self.assertLess(
                end.joints[f"wrist.{side}"][2], end.joints[f"shoulder.{side}"][2] - 0.5
            )
            idle = digit_angles("idle", 1, "index", sign)[0]
            np.testing.assert_allclose(
                digit_angles("climb-border", 1, "index", sign)[0], idle
            )
        self.assertAlmostEqual(end.joints["ankle.L"][2], end.joints["ankle.R"][2])


if __name__ == "__main__":
    unittest.main()

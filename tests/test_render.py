"""Regression checks for actual failure risks: rig geometry, loops, screen and alpha."""

import unittest

import numpy as np
from PIL import Image

from kernel_voxel.render import alpha_downsample
from kernel_voxel.rig import FRAMES, cable_points, pose_at, pose_for
from kernel_voxel.screen import framebuffer


class RigTests(unittest.TestCase):
    def test_bone_lengths_and_orthonormal_frames_across_motion(self):
        for state in [*FRAMES, "look"]:
            for t in np.linspace(0, 1, 121):
                pose = pose_at(state, t)
                for side in ["L", "R"]:
                    for a, b, length in [
                        ("hip", "knee", 0.42),
                        ("knee", "ankle", 0.42),
                        ("shoulder", "elbow", 0.33),
                        ("elbow", "wrist", 0.34),
                    ]:
                        self.assertAlmostEqual(
                            np.linalg.norm(
                                pose.joints[a + "." + side]
                                - pose.joints[b + "." + side]
                            ),
                            length,
                            places=7,
                            msg=(state, t),
                        )
                for m in pose.matrices.values():
                    np.testing.assert_allclose(
                        m[:3, :3].T @ m[:3, :3], np.eye(3), atol=1e-7
                    )
                    self.assertAlmostEqual(np.linalg.det(m[:3, :3]), 1, places=7)

    def test_stationary_states_keep_feet_planted(self):
        for state in [
            "idle",
            "waving",
            "failed",
            "waiting",
            "running",
            "review",
            "look",
        ]:
            for t in np.linspace(0, 1, 31):
                p = pose_at(state, t)
                for side in ["L", "R"]:
                    np.testing.assert_allclose(
                        p.matrices["foot." + side],
                        pose_at(state, 0).matrices["foot." + side],
                        atol=1e-7,
                    )

    def test_loop_seams(self):
        for state in [*FRAMES, "look"]:
            first, last = pose_at(state, 0), pose_at(state, 1)
            for part in first.matrices:
                np.testing.assert_allclose(
                    first.matrices[part],
                    last.matrices[part],
                    atol=1e-7,
                    err_msg=(state, part),
                )

    def test_cable_anchors_and_server_clearance(self):
        for t in np.linspace(0, 1, 61):
            p = pose_at("running", t)
            points = cable_points(p, 100)
            np.testing.assert_allclose(points[0], p.cable_start, atol=1e-9)
            np.testing.assert_allclose(points[-1], p.cable_end, atol=1e-9)
            # Includes cable radius. No cable vertex can enter the rectangular casing.
            for x, y, z in points:
                inside = 0.92 < x < 1.44 and -0.345 < y < 0.345 and 0.01 < z < 1.042
                self.assertFalse(inside, (t, x, y, z))

    def test_visible_jump_and_same_landing(self):
        a, b, c = [pose_for("jumping", i).joints["ankle.L"][2] for i in (0, 2, 4)]
        self.assertGreater(b - a, 0.30)
        self.assertAlmostEqual(a, c)

    def test_screen_is_deterministic_and_work_screen_moves(self):
        self.assertEqual(
            framebuffer("running", 0.25).tobytes(),
            framebuffer("running", 0.25).tobytes(),
        )
        self.assertNotEqual(
            framebuffer("running", 0).tobytes(), framebuffer("running", 0.25).tobytes()
        )
        self.assertEqual(framebuffer("running", 0).size, (96, 64))

    def test_transparent_edges_do_not_get_a_dark_or_colored_fringe(self):
        a = np.zeros((8, 8, 4), dtype=np.uint8)
        a[:4, :4] = [64, 200, 255, 255]
        result = np.asarray(alpha_downsample(Image.fromarray(a), (3, 3)))
        edge = result[(result[:, :, 3] > 0) & (result[:, :, 3] < 255)]
        self.assertTrue(len(edge) > 0)
        np.testing.assert_allclose(
            edge[:, :3], np.tile([64, 200, 255], (len(edge), 1)), atol=2
        )
        self.assertEqual(int(result[result[:, :, 3] == 0, :3].sum()), 0)


if __name__ == "__main__":
    unittest.main()

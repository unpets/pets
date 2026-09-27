"""Regression checks for actual failure risks: rig geometry, loops, screen and alpha."""

import unittest

import numpy as np
from kernel_voxel.render import alpha_downsample
from kernel_voxel.rig import FRAMES, cable_points, pose_at, pose_for
from kernel_voxel.screen import draw_clip, framebuffer
from kernel_voxel.transforms import point
from PIL import Image


class RigTests(unittest.TestCase):
    def test_screen_status_frame_has_equal_outer_margins(self):
        layers = draw_clip("background", "rails", 0)
        markings = Image.alpha_composite(
            layers["background-lines"], layers["background-text"]
        )
        left, top, right, bottom = markings.getbbox()
        self.assertEqual(left, markings.width - right)
        self.assertEqual(top, markings.height - bottom)
        self.assertEqual(left, top)

    def test_idle_head_draws_a_figure_eight_with_two_center_crossings(self):
        def direction(t):
            pose = pose_at("idle", t)
            return (np.linalg.inv(pose.matrices["body"]) @ pose.matrices["head"])[:3, 1]

        np.testing.assert_allclose(direction(0), direction(0.5), atol=1e-10)
        np.testing.assert_allclose(direction(0), direction(1), atol=1e-10)
        self.assertLess(direction(0.25)[0], -0.02)
        self.assertGreater(direction(0.75)[0], 0.02)
        for a, b in ((0.125, 0.375), (0.625, 0.875)):
            self.assertLess(direction(a)[2] * direction(b)[2], 0)

    def test_jump_crouches_and_lands_deeply_and_pushes_through_the_toes(self):
        for t in (0.22, 0.25, 0.75, 0.80):
            pose = pose_at("jumping", t)
            first = pose.joints["knee.R"] - pose.joints["hip.R"]
            second = pose.joints["ankle.R"] - pose.joints["knee.R"]
            bend = np.degrees(np.arccos(np.clip(first @ second / 0.42**2, -1, 1)))
            self.assertGreater(bend, 60)
        for t in np.linspace(0.22, 0.34, 25):
            foot = pose_at("jumping", t).matrices["foot.R"]
            np.testing.assert_allclose(
                point(foot, (0, -0.34, -0.17)), [0.26, -0.355, 0], atol=1e-9
            )
        self.assertGreater(pose_at("jumping", 0.34).matrices["foot.R"][2, 1], 0.45)
        np.testing.assert_allclose(
            pose_at("jumping", 0.70).matrices["foot.R"][:3, :3], np.eye(3), atol=1e-9
        )

    def test_jump_body_velocity_stays_continuous_across_motion_phases(self):
        delta = 1e-6
        for t in (0.22, 0.34, 0.70, 0.80):
            before, center, after = [
                pose_at("jumping", u).matrices["body"][:3, 3]
                for u in (t - delta, t, t + delta)
            ]
            np.testing.assert_allclose(
                (center - before) / delta, (after - center) / delta, atol=0.001
            )

    def test_walking_wrists_are_continuous_at_zero_crossings(self):
        for state in ("running-left", "running-right"):
            for t in (0, 0.5, 1):
                center = pose_at(state, t)
                for offset in (-1e-6, 1e-6):
                    adjacent = pose_at(state, t + offset)
                    for side in ("L", "R"):
                        for joint in ("wrist", "elbow"):
                            name = f"{joint}.{side}"
                            self.assertLess(
                                np.linalg.norm(
                                    center.joints[name] - adjacent.joints[name]
                                ),
                                1e-4,
                            )

    def test_neutral_limbs_are_relaxed_without_locking(self):
        for state in ("idle", "look"):
            for t in np.linspace(0, 1, 121):
                pose = pose_at(state, t)
                for side in ("L", "R"):
                    for a, b, c in (
                        ("shoulder", "elbow", "wrist"),
                        ("hip", "knee", "ankle"),
                    ):
                        start, hinge, end = (
                            pose.joints[f"{name}.{side}"] for name in (a, b, c)
                        )
                        first, second = hinge - start, end - hinge
                        angle = np.degrees(
                            np.arccos(
                                np.clip(
                                    first
                                    @ second
                                    / np.linalg.norm(first)
                                    / np.linalg.norm(second),
                                    -1,
                                    1,
                                )
                            )
                        )
                        self.assertGreater(angle, 10)
                        self.assertLess(angle, 26)

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

    def test_limb_hinges_share_one_axis_across_every_motion(self):
        for state in [*FRAMES, "look"]:
            for t in np.linspace(0, 1, 121):
                pose = pose_at(state, t)
                for side in ["L", "R"]:
                    for upper, lower, length in [
                        ("thigh", "shin", 0.42),
                        ("upper_arm", "forearm", 0.33),
                    ]:
                        first = pose.matrices[f"{upper}.{side}"]
                        second = pose.matrices[f"{lower}.{side}"]
                        np.testing.assert_allclose(
                            first[:3, 0], second[:3, 0], atol=1e-7
                        )
                        relative_rotation = first[:3, :3].T @ second[:3, :3]
                        np.testing.assert_allclose(
                            relative_rotation[:, 0], [1, 0, 0], atol=1e-7
                        )
                        # Flexion cannot change sign when moving between authored poses.
                        expected_sign = -1 if upper == "upper_arm" else 1
                        self.assertGreater(relative_rotation[2, 1] * expected_sign, 0)
                        np.testing.assert_allclose(
                            first[:3, 3] + first[:3, 2] * length,
                            second[:3, 3],
                            atol=1e-7,
                        )

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

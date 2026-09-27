"""Layer independence and contact-driven material animation."""

import unittest

import numpy as np
from kernel_voxel.animation import PROJECT, resolve_composition, rig_layer
from kernel_voxel.emission import sample_curve, values_at
from kernel_voxel.hands import HAND_BONES, KEYBOARD_DEPTH
from kernel_voxel.keyboard import KEYBOARDS, TYPING_DIGITS, key_intensity
from kernel_voxel.rig import pose_at
from kernel_voxel.screen import draw_clip
from kernel_voxel.transforms import point


class CompositionTests(unittest.TestCase):
    def test_lookaround_reuses_the_idle_body_and_palms(self):
        for t in np.linspace(0, 1, 41):
            idle, look = pose_at("idle", t), pose_at("look", t)
            for name in idle.matrices:
                if name != "head":
                    np.testing.assert_allclose(
                        idle.matrices[name], look.matrices[name], atol=1e-10
                    )
        for name, binding in resolve_composition(PROJECT, "look")["bindings"].items():
            if name.startswith("rig/") and name != "rig/head":
                self.assertEqual(
                    PROJECT["clips"][binding["clip"]]["data"]["source"], "idle"
                )

    def test_wave_only_replaces_its_arm_and_head_layers(self):
        for t in np.linspace(0, 1, 41):
            idle, wave = pose_at("idle", t), pose_at("waving", t)
            for name in idle.matrices:
                if rig_layer(name) in ("posture", "arm.L"):
                    np.testing.assert_allclose(
                        idle.matrices[name], wave.matrices[name], atol=1e-10
                    )

    def test_both_keyboards_light_only_when_the_matching_finger_presses(self):
        for suffix, (_, matrix, side) in KEYBOARDS.items():
            for index, digit in enumerate(TYPING_DIGITS):
                t = ((index / 4 + 0.21 - (0.125 if side < 0 else 0)) / 2) % 1
                pose = pose_at("running", t)
                np.testing.assert_allclose(pose.matrices[f"hand.{suffix}"], matrix)
                bone = HAND_BONES[f"{digit}.03.{suffix}"]
                tip = point(
                    pose.matrices[f"{digit}.03.{suffix}"],
                    (0, -0.017, bone.length - 0.012),
                )
                self.assertAlmostEqual(
                    point(np.linalg.inv(matrix), tip)[1], -KEYBOARD_DEPTH, places=8
                )
                self.assertEqual(key_intensity(t, digit, side), 4)
                material = f"key.{suffix}.{digit}.1"
                self.assertAlmostEqual(values_at(PROJECT, "running", t)[material], 4)
                self.assertEqual(key_intensity(t + 0.20, digit, side), 0)
                self.assertEqual(values_at(PROJECT, "idle", t)[material], 0)

    def test_emission_curves_interpolate_and_hold_their_endpoints(self):
        frames = [[0, 0], [0.25, 4], [1, 0]]
        self.assertEqual(sample_curve(frames, -1), 0)
        self.assertEqual(sample_curve(frames, 0.125), 2)
        self.assertEqual(sample_curve(frames, 0.625), 2)
        self.assertEqual(sample_curve(frames, 2), 0)

    def test_expressions_are_centered_and_gaze_offsets_are_preserved(self):
        for generator in ("neutral", "blink", "tired", "focused"):
            for t in (0, 0.47, 0.83):
                left, _, right, _ = draw_clip("eyes", generator, t)["eyes"].getbbox()
                self.assertLessEqual(abs((left + right - 1) / 2 - 47.5), 0.5)
        for generator in ("smile", "open", "frown", "line"):
            left, _, right, _ = draw_clip("mouth", generator, 0)["mouth"].getbbox()
            self.assertLessEqual(abs((left + right - 1) / 2 - 47.5), 0.5)
        for t, dx in ((0.25, 10), (0.75, -10)):
            left, _, right, _ = draw_clip("eyes", "look", t)["eyes"].getbbox()
            self.assertAlmostEqual((left + right - 1) / 2, 47.5 + dx)

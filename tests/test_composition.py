"""Layer independence and contact-driven material animation."""

import unittest

import numpy as np
from kernel_voxel.animation import (
    PROJECT,
    animation_project,
    resolve_composition,
    rig_layer,
)
from kernel_voxel.emission import sample_curve, values_at
from kernel_voxel.hands import HAND_BONES, KEYBOARD_DEPTH
from kernel_voxel.keyboard import KEYBOARDS, TYPING_DIGITS, key_intensity
from kernel_voxel.rig import gaze_at, pose_at
from kernel_voxel.screen import draw_clip, screen_components
from kernel_voxel.transforms import point


class CompositionTests(unittest.TestCase):
    def test_screen_assignment_inherits_and_replaces_parent_face_bindings(self):
        project = animation_project()
        project["screens"] = {
            "simple": {
                "label": "Simple face",
                "data": {},
                "bindings": {
                    "screen/eyes": PROJECT["compositions"]["idle"]["bindings"][
                        "screen/eyes"
                    ]
                },
            }
        }
        project["compositions"]["face"] = {
            "label": "Face",
            "parent": "idle",
            "screen": "simple",
            "bindings": {},
        }
        project["compositions"]["child"] = {
            "label": "Child",
            "parent": "face",
            "bindings": {},
        }
        resolved = resolve_composition(project, "child")
        self.assertEqual(resolved["screen"], "simple")
        self.assertEqual(
            resolved["bindings"]["screen/eyes"]["clip"], "screen/eyes/blink"
        )
        self.assertNotIn("screen/mouth", resolved["bindings"])
        self.assertIn("rig/body", resolved["bindings"])

    def test_review_and_waiting_reuse_idle_posture_without_changing_motion(self):
        for state in ("review", "waiting"):
            child = PROJECT["compositions"][state]
            self.assertEqual(child["parent"], "idle")
            for t in np.linspace(0, 1, 41):
                idle, pose = pose_at("idle", t), pose_at(state, t)
                for name in idle.matrices:
                    if rig_layer(name) == "posture" or (
                        state == "review" and rig_layer(name) == "arm.L"
                    ):
                        self.assertNotIn(f"rig/{name}", child["bindings"])
                        np.testing.assert_allclose(
                            idle.matrices[name], pose.matrices[name], atol=1e-10
                        )

    def test_idle_edits_propagate_to_review_and_waiting_with_local_overrides(self):
        project = animation_project()
        idle = project["compositions"]["idle"]["bindings"]
        idle["rig/body"]["speed"] = 0.5
        idle["screen/background"]["enabled"] = False
        idle["screen/eyes"]["speed"] = 0.7
        for state, mouth in (("review", "line"), ("waiting", "open")):
            resolved = resolve_composition(project, state)
            bindings = resolved["bindings"]
            self.assertEqual(bindings["rig/body"], idle["rig/body"])
            self.assertEqual(bindings["screen/background"], idle["screen/background"])
            self.assertEqual(bindings["rig/head"]["clip"], f"rig/head/{state}")
            self.assertEqual(bindings["screen/mouth"]["clip"], f"screen/mouth/{mouth}")
            self.assertEqual(
                resolved["duration"], PROJECT["compositions"][state]["duration"]
            )
        review = resolve_composition(project, "review")["bindings"]
        waiting = resolve_composition(project, "waiting")["bindings"]
        self.assertEqual(review["screen/eyes"]["clip"], "screen/eyes/focused")
        self.assertEqual(review["screen/activity"]["clip"], "screen/activity/checklist")
        self.assertEqual(waiting["screen/eyes"], idle["screen/eyes"])

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
        for t in (0, 0.25, 0.5, 0.75):
            left, _, right, _ = screen_components("look", t)["eyes"].getbbox()
            dx = round(gaze_at("look", t)[0] * 10)
            self.assertAlmostEqual((left + right - 1) / 2, 47.5 + dx)

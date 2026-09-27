"""Physical attachment, digit chain and authored gesture regressions."""

import unittest

import numpy as np
from kernel_voxel.hands import (
    DIGITS,
    HAND_BONES,
    KEYBOARD_DEPTH,
    digit_angles,
)
from kernel_voxel.rig import FRAMES, WORK_CONTACT, WORK_CONTACT_LOCAL, pose_at
from kernel_voxel.transforms import point


class HandTests(unittest.TestCase):
    def test_work_palm_stays_fixed_while_the_body_bounces_and_fingers_type(self):
        first = pose_at("running", 0)
        heights = []
        for t in np.linspace(0, 1, 121):
            pose = pose_at("running", t)
            heights.append(pose.matrices["body"][2, 3])
            np.testing.assert_allclose(
                pose.matrices["hand.R"], first.matrices["hand.R"], atol=1e-10
            )
            np.testing.assert_allclose(
                point(pose.matrices["hand.R"], WORK_CONTACT_LOCAL), WORK_CONTACT
            )
        self.assertGreater(max(heights) - min(heights), 0.013)
        # The palm touches the actual top plate, whose upper surface is z=1.0295.
        self.assertAlmostEqual(WORK_CONTACT[2], 1.017 + 0.025 / 2)
        self.assertTrue(1.0 < WORK_CONTACT[0] < 1.36)
        self.assertTrue(-0.27 < WORK_CONTACT[1] < 0.25)
        for index, digit in enumerate(("index", "middle", "ring", "little")):
            t = (index / 4 + 0.21) / 2
            pose = pose_at("running", t)
            bone = HAND_BONES[f"{digit}.03.R"]
            tip = point(
                pose.matrices[f"{digit}.03.R"], (0, -0.017, bone.length - 0.012)
            )
            local = point(np.linalg.inv(pose.matrices["hand.R"]), tip)
            self.assertAlmostEqual(local[1], -KEYBOARD_DEPTH, places=8)
            hover = pose_at("running", t + 0.20)
            self.assertGreater(
                point(
                    hover.matrices[f"{digit}.03.R"], (0, -0.017, bone.length - 0.012)
                )[2],
                tip[2] + 0.02,
            )

    def test_idle_palms_face_inward_with_thumbs_toward_the_front(self):
        for t in np.linspace(0, 1, 121):
            pose = pose_at("idle", t)
            for side, suffix in ((-1, "L"), (1, "R")):
                hand = pose.matrices[f"hand.{suffix}"]
                self.assertGreater(
                    -hand[:3, 1] @ (-side * pose.matrices["body"][:3, 0]), 0.99
                )
                np.testing.assert_allclose(
                    hand[:3, 2], pose.matrices[f"forearm.{suffix}"][:3, 2]
                )
                self.assertLess(
                    pose.matrices[f"thumb.01.{suffix}"][1, 3], hand[1, 3] - 0.05
                )

    def test_review_palm_faces_the_body_with_fingers_upward(self):
        for t in np.linspace(0, 1, 121):
            hand = pose_at("review", t).matrices["hand.R"]
            palm = -hand[:3, 1]
            self.assertGreater(palm[1], 0.6)
            self.assertLess(palm[0], -0.2)
            self.assertGreater(hand[2, 2], 0.95)

    def test_review_elbow_bends_below_the_shoulder_and_outside_the_body(self):
        for t in np.linspace(0, 1, 121):
            pose = pose_at("review", t)
            self.assertLess(
                pose.joints["elbow.R"][2], pose.joints["shoulder.R"][2] - 0.12
            )
            self.assertGreater(pose.joints["elbow.R"][0], 0.64)
            self.assertLess(pose.joints["wrist.R"][1], -0.4)

    def test_every_digit_is_connected_and_stays_within_its_joint_limits(self):
        for state in [*FRAMES, "look"]:
            for t in np.linspace(0, 1, 31):
                pose = pose_at(state, t)
                for name, bone in HAND_BONES.items():
                    expected = point(pose.matrices[bone.parent], bone.origin)
                    np.testing.assert_allclose(
                        pose.matrices[name][:3, 3], expected, atol=1e-9
                    )
                    curls, spread, opposition = digit_angles(
                        state, t, bone.digit, bone.side
                    )
                    self.assertGreaterEqual(curls[bone.segment], 0)
                    self.assertLessEqual(curls[bone.segment], bone.flexion_limit)
                    self.assertLessEqual(abs(spread), 0.12)
                    self.assertLessEqual(abs(opposition), 0.85)

    def test_wave_opens_all_digits_and_review_extends_the_index(self):
        for digit in DIGITS:
            waving = digit_angles("waving", 0.25, digit, 1)[0]
            self.assertLess(sum(waving), 0.30)
        index = digit_angles("review", 0, "index", 1)[0]
        middle = digit_angles("review", 0, "middle", 1)[0]
        self.assertLess(sum(index), sum(middle) / 3)

    def test_both_hands_have_mirrored_rest_geometry(self):
        pose = pose_at("look", 0)
        mirror = np.diag([-1, 1, 1, 1])
        for name in HAND_BONES:
            if not name.endswith(".R"):
                continue
            left = name[:-1] + "L"
            right_local = np.linalg.inv(pose.matrices["hand.R"]) @ pose.matrices[name]
            left_local = np.linalg.inv(pose.matrices["hand.L"]) @ pose.matrices[left]
            np.testing.assert_allclose(
                left_local, mirror @ right_local @ mirror, atol=1e-9
            )

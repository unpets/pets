"""Physical attachment, digit chain and authored gesture regressions."""

import unittest

import numpy as np

from kernel_voxel.hands import DIGITS, HAND_BONES, digit_angles
from kernel_voxel.rig import FRAMES, WORK_CONTACT, WORK_CONTACT_LOCAL, pose_at
from kernel_voxel.transforms import point


class HandTests(unittest.TestCase):
    def test_work_contact_and_digits_stay_fixed_while_the_body_bounces(self):
        first = pose_at("running", 0)
        heights = []
        for t in np.linspace(0, 1, 121):
            pose = pose_at("running", t)
            heights.append(pose.matrices["body"][2, 3])
            for name in ["hand.R", *[n for n in HAND_BONES if n.endswith(".R")]]:
                np.testing.assert_allclose(
                    pose.matrices[name], first.matrices[name], atol=1e-10
                )
            np.testing.assert_allclose(
                point(pose.matrices["hand.R"], WORK_CONTACT_LOCAL), WORK_CONTACT
            )
        self.assertGreater(max(heights) - min(heights), 0.013)
        # The palm touches the actual top plate, whose upper surface is z=1.0295.
        self.assertAlmostEqual(WORK_CONTACT[2], 1.017 + 0.025 / 2)
        self.assertTrue(1.0 < WORK_CONTACT[0] < 1.36)
        self.assertTrue(-0.27 < WORK_CONTACT[1] < 0.25)

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
            working = digit_angles("running", 0.25, digit, 1)[0]
            self.assertLess(sum(waving), sum(working) / 3)
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

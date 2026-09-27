import unittest

from kernel_voxel.render import CELL, FRAMES, SCREEN, frame, geometry, pose_for


class RendererTest(unittest.TestCase):
    def test_complete_frame_contract(self):
        self.assertEqual(sum(FRAMES.values()) + 16, 73)
        for state, count in {**FRAMES, "look": 16}.items():
            for index in range(count):
                image = frame(state, index)
                self.assertEqual(image.size, CELL)
                self.assertIsNotNone(image.getbbox(), (state, index))

    def test_screen_and_geometry_are_deterministic(self):
        self.assertEqual(frame("look", 4).tobytes(), frame("look", 4).tobytes())
        self.assertNotEqual(frame("look", 4).tobytes(), frame("look", 12).tobytes())
        self.assertNotEqual(SCREEN["error"], SCREEN["happy"])

    def test_display_tiles_are_in_front_of_head_glass(self):
        boxes = geometry(pose_for("idle", 0))
        glass = next(box for box in boxes if box.part == "head" and box.color == "glass")
        leds = [box for box in boxes if box.part == "head" and box.color == "cyan"
                and box.center[1] < -.5]
        self.assertGreater(len(leds), 8)
        for led in leds:
            self.assertLess(led.center[1], glass.center[1] - glass.size[1] / 2)
            self.assertLess(abs(led.center[0]) + led.size[0] / 2, glass.size[0] / 2)
            self.assertLess(abs(led.center[2] - glass.center[2]) + led.size[2] / 2,
                            glass.size[2] / 2)

    def test_jump_actually_lifts_off(self):
        self.assertGreater(pose_for("jumping", 2).lift, pose_for("jumping", 0).lift + .3)
        self.assertEqual(pose_for("jumping", 0).lift, pose_for("jumping", 4).lift)


if __name__ == "__main__":
    unittest.main()

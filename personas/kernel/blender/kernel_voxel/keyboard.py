"""A projected keyboard fitted to the articulated right fingertips."""

from .hands import KEYBOARD_DEPTH, fingertip, typing_press
from .rig import WORK_HAND
from .transforms import point


def build_keyboard(builder):
    def stroke(center, size, color="cyan"):
        builder.box(
            "keyboard",
            point(WORK_HAND, center),
            (size[0], size[2], size[1]),
            color,
        )

    def outline(x, z, width, height, color="cyan"):
        for side in (-1, 1):
            stroke(
                (x + side * width / 2, -KEYBOARD_DEPTH, z),
                (0.002, 0.0015, height),
                color,
            )
            stroke(
                (x, -KEYBOARD_DEPTH, z + side * height / 2),
                (width, 0.0015, 0.002),
                color,
            )

    outline(0, 0.24, 0.285, 0.19)
    for digit in ("index", "middle", "ring", "little"):
        contact = fingertip(digit, typing_press(digit))
        for row in (-1, 0, 1):
            z = contact[2] + row * 0.043
            outline(contact[0], z, 0.035, 0.034, "cyan" if row == 0 else "cyan_dim")
            stroke((contact[0], -KEYBOARD_DEPTH, z), (0.010, 0.0015, 0.002))
    for side in (-1, 1):
        stroke((side * 0.115, -KEYBOARD_DEPTH, 0.315), (0.024, 0.0015, 0.003), "green")

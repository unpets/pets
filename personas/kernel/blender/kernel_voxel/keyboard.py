"""Projected keyboards fitted to both articulated hands."""

from .hands import KEYBOARD_DEPTH, fingertip, typing_phase, typing_press
from .rig import FREE_HAND, WORK_HAND
from .transforms import point

KEYBOARDS = {"R": ("keyboard", WORK_HAND, 1), "L": ("keyboard.L", FREE_HAND, -1)}
TYPING_DIGITS = ("index", "middle", "ring", "little")
KEY_MATERIALS = {
    f"key.{side}.{digit}": (side, digit)
    for side in KEYBOARDS
    for digit in TYPING_DIGITS
}


def key_intensity(t, digit, side):
    """Light a contacted key, then ease out after the fingertip lifts."""
    phase = typing_phase(t, digit, side)
    if 0.15 <= phase < 0.18:
        u = (phase - 0.15) / 0.03
        return 4 * u * u * (3 - 2 * u)
    if 0.18 <= phase < 0.24:
        return 4.0
    if 0.24 <= phase < 0.32:
        u = (phase - 0.24) / 0.08
        return 4 * (1 - u * u * (3 - 2 * u))
    return 0.0


def build_keyboards(builder):
    contacts = {digit: fingertip(digit, typing_press(digit)) for digit in TYPING_DIGITS}
    center = sum(contact[2] for contact in contacts.values()) / len(contacts)
    for suffix, (part, matrix, side) in KEYBOARDS.items():
        build_keyboard(builder, suffix, part, matrix, side, contacts, center)


def build_keyboard(builder, suffix, part, matrix, side, contacts, center):

    def stroke(position, size, color="cyan"):
        builder.box(part, point(matrix, position), (size[0], size[2], size[1]), color)

    def outline(x, z, width, height, color="cyan"):
        for edge in (-1, 1):
            stroke(
                (x + edge * width / 2, -KEYBOARD_DEPTH, z),
                (0.002, 0.0015, height),
                color,
            )
            stroke(
                (x, -KEYBOARD_DEPTH, z + edge * height / 2),
                (width, 0.0015, 0.002),
                color,
            )

    outline(0, center, 0.285, 0.19)
    for digit, contact in contacts.items():
        x = side * contact[0]
        for row in (-1, 0, 1):
            z = contact[2] + row * 0.043
            outline(x, z, 0.035, 0.034, "cyan" if row == 0 else "cyan_dim")
            stroke((x, -KEYBOARD_DEPTH, z), (0.010, 0.0015, 0.002))
            if row == 0:
                stroke(
                    (x, -KEYBOARD_DEPTH + 0.0015, z),
                    (0.031, 0.001, 0.030),
                    f"key.{suffix}.{digit}",
                )
    for edge in (-1, 1):
        stroke(
            (edge * 0.115, -KEYBOARD_DEPTH, center + 0.075),
            (0.024, 0.0015, 0.003),
            "green",
        )

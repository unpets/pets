"""Fine voxel palms and rigid phalanges sharing the hand rig's dimensions."""

from .hands import HAND_BONES


def build_hand(builder, suffix):
    part = f"hand.{suffix}"
    builder.voxel(part, (0, 0, 0), (0.13, 0.13, 0.13), "joint", 0.065, step=0.013)
    builder.voxel(part, (0, 0, 0.055), (0.21, 0.15, 0.135), "dark", 0.025, step=0.010)
    builder.box(part, (0, 0.085, 0.055), (0.12, 0.026, 0.060), "violet")
    builder.box(part, (0, -0.071, 0.061), (0.135, 0.008, 0.060), "joint")
    for name, bone in HAND_BONES.items():
        if not name.endswith(f".{suffix}"):
            continue
        radius = 0.017 if bone.digit == "thumb" else 0.014
        # Shared pivot centers prevent gaps as the rigid phalanges rotate.
        builder.voxel(
            name,
            (0, 0, 0),
            (bone.width, radius * 2, radius * 2),
            "joint",
            0,
            step=0.005,
            shape="motor",
        )
        for side in (-1, 1):
            builder.voxel(
                name,
                (side * (bone.width / 2 + 0.001), 0, 0),
                (0.004, radius * 1.2, radius * 1.2),
                "metal",
                0,
                step=0.004,
                shape="motor",
            )
        length = bone.length - 0.010
        center = 0.008 + length / 2
        builder.voxel(
            name,
            (0, 0, center),
            (bone.width - 0.008, 0.033, length),
            "shell",
            0.006,
            step=0.005,
        )
        builder.box(
            name,
            (0, -0.018, center),
            (bone.width - 0.012, 0.006, length * 0.65),
            "dark",
        )

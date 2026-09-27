"""Fine voxel palms and rigid phalanges sharing the hand rig's dimensions."""

from .hands import HAND_BONES, PALM_CENTER, PALM_CONTACT, PALM_SIZE


def build_hand(builder, suffix):
    part = f"hand.{suffix}"
    builder.voxel(
        part,
        (0, 0, 0.020),
        (0.10, 0.10, 0.10),
        "metal",
        0.05,
        step=0.005,
        cut=lambda p: p[2] > 0.020,
    )
    builder.voxel(part, PALM_CENTER, PALM_SIZE, "dark", 0.025, step=0.005)
    builder.box(part, (0, 0.004, 0.140), (0.12, 0.012, 0.095), "violet")
    builder.box(part, PALM_CONTACT + (0, 0.004, 0), (0.135, 0.008, 0.070), "joint")
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
            (bone.width - 0.008, 0.026, length),
            "shell",
            0.006,
            step=0.005,
        )
        builder.box(
            name,
            (0, -0.014, center),
            (bone.width - 0.012, 0.006, length * 0.65),
            "dark",
        )

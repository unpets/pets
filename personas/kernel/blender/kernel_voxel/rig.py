"""Continuous, deterministic rigid-body animation; metres, Z up, front = -Y."""

import math
from dataclasses import dataclass
from itertools import pairwise

import numpy as np

from .climbing import LEDGE_HEIGHT, STRIDE, border_hand, climbing_targets
from .hands import HAND_BONES, PALM_CONTACT, hand_matrices
from .proportions import (
    ARM_REST,
    FOREARM,
    LEG_REACH,
    REST_HEIGHT,
    SHIN,
    THIGH,
    UPPER_ARM,
)
from .transforms import point, transform

CELL = (192, 208)
FRAMES = {
    "idle": 6,
    "running-right": 8,
    "running-left": 8,
    "waving": 4,
    "jumping": 5,
    "failed": 8,
    "waiting": 6,
    "running": 6,
    "review": 6,
}
MOTIONS = {
    name: count for name, count in FRAMES.items() if not name.startswith("running-")
}
MOTIONS = {"idle": 6, "move": 8, **{k: v for k, v in MOTIONS.items() if k != "idle"}}
# Synchronized local-space gait samples for a cyclic directional blend space.
LOCOMOTION = {
    "move": 0,
    "move-forward-right": 45,
    "sidestep-right": 90,
    "move-backward-right": 135,
    "move-backward": 180,
    "move-backward-left": 225,
    "sidestep-left": 270,
    "move-forward-left": 315,
}
MOTIONS.update(
    {"flying": 8, "climbing": 8, "climb-rope": 8, "climb-ladder": 8, "climb-border": 8}
)
SOURCE_MOTIONS = {**MOTIONS, **{name: 8 for name in LOCOMOTION}}
DURATIONS = {
    **{name: 90 for name in LOCOMOTION},
    "idle": 180,
    "running-right": 90,
    "running-left": 90,
    "waving": 180,
    "jumping": 140,
    "failed": 160,
    "waiting": 190,
    "running": 140,
    "review": 170,
    "look": 130,
    "flying": 160,
    "climbing": 160,
    "climb-rope": 180,
    "climb-ladder": 160,
    "climb-border": 220,
}
TAU = math.tau
FOREARM_PORT = np.array([0, 0.089, 0.235])
CABLE_RADIUS = 0.012
SERVER_PORT = np.array([1.185, -0.404, 0.85])
SHOULDER_PIVOT = np.array([0.60, 0, 1.50])
HIP_PIVOT = np.array([0.25, 0, 0.865])
PARENTS = {"body": None, "head": "body"}
for side in ("L", "R"):
    for child, parent in (
        ("upper_arm", "body"),
        ("forearm", "upper_arm"),
        ("hand", "forearm"),
        ("thigh", "body"),
        ("shin", "thigh"),
        ("foot", "shin"),
    ):
        PARENTS[f"{child}.{side}"] = parent if parent == "body" else f"{parent}.{side}"

PARENTS.update({name: spec.parent for name, spec in HAND_BONES.items()})

# Palm contact lies on the server lid. Fingers wrap over its front edge.
WORK_HAND = transform((1.04, -0.182, 1.0295 - PALM_CONTACT[1]), (math.pi / 2, 0, 0))
FREE_HAND = transform((-0.62, -0.41, 1.32), (math.pi / 2, 0, 0))
WORK_CONTACT_LOCAL = PALM_CONTACT
WORK_CONTACT = point(WORK_HAND, WORK_CONTACT_LOCAL)


def bone_matrix(a, b, hinge_axis=None):
    a, b = np.asarray(a), np.asarray(b)
    z = (b - a) / np.linalg.norm(b - a)
    ref = np.array([1.0, 0, 0]) if hinge_axis is None else np.asarray(hinge_axis)
    if abs(z @ ref) > 0.98:
        ref = np.array([0.0, 1, 0])
    y = np.cross(z, ref)
    y /= np.linalg.norm(y)
    x = np.cross(y, z)
    m = np.eye(4)
    m[:3, :3] = np.column_stack((x, y, z))
    m[:3, 3] = a
    return m


def limb_matrices(root, joint, end, hinge_sign=1):
    """Keep hinge axes shared and flexion signed consistently across every pose."""
    hinge = np.cross(joint - root, end - joint)
    hinge *= hinge_sign / np.linalg.norm(hinge)
    return bone_matrix(root, joint, hinge), bone_matrix(joint, end, hinge)


def orient_palm(hand, direction):
    """Roll the hand toward a direction while preserving its finger axis."""
    local = hand[:3, :3].T @ direction
    return hand @ transform(angles=(0, 0, math.atan2(local[0], -local[1])))


def two_bone(a, b, l1, l2, pole):
    """Analytic IK. No stretch; caller targets must stay in the reachable annulus."""
    a, b, pole = (np.asarray(v, dtype=float) for v in (a, b, pole))
    d = np.linalg.norm(b - a)
    if not abs(l1 - l2) + 1e-6 < d < l1 + l2 - 1e-6:
        raise ValueError(f"unreachable limb target: {d:.6f} for {l1}+{l2}")
    axis = (b - a) / d
    bend = pole - axis * np.dot(pole, axis)
    bend /= np.linalg.norm(bend)
    along = (l1 * l1 - l2 * l2 + d * d) / (2 * d)
    return a + axis * along + bend * math.sqrt(max(0, l1 * l1 - along * along))


def smooth(t):
    return t * t * (3 - 2 * t)


def curve(t, keys):
    """Smooth bounded interpolation between authored contact phases."""
    for (start, a), (end, b) in pairwise(keys):
        if t <= end:
            return a + (b - a) * smooth(np.clip((t - start) / (end - start), 0, 1))
    return keys[-1][1]


def jump_motion(t):
    """Return compression, flight height, and ankle pitch through a grounded jump."""
    crouch, takeoff, touchdown, landing = 0.22, 0.34, 0.70, 0.80
    height = 0.35
    launch_speed = 4 * height / (touchdown - takeoff)
    compression, lift, pitch = 0.0, 0.0, 0.0
    if t < crouch:
        compression = -0.23 * smooth(t / crouch)
    elif t < takeoff:
        u = (t - crouch) / (takeoff - crouch)
        # Match vertical takeoff velocity without pausing at full extension.
        compression = -0.23 * (1 - smooth(u)) + launch_speed * (takeoff - crouch) * (
            u**3 - u**2
        )
        pitch = 0.50 * smooth(u)
    elif t < touchdown:
        u = (t - takeoff) / (touchdown - takeoff)
        lift = 4 * height * u * (1 - u)
        compression = -0.035 * math.sin(math.pi * u) ** 2
        pitch = 0.50 * (1 - smooth(u))
    elif t < landing:
        u = (t - touchdown) / (landing - touchdown)
        # Continue the descent into knee compression while the feet plant.
        compression = -0.19 * smooth(u) - launch_speed * (landing - touchdown) * (
            u**3 - 2 * u**2 + u
        )
    else:
        compression = -0.19 * (1 - smooth((t - landing) / (1 - landing)))
    return compression, lift, pitch


def look_angle(t):
    """Ease between the sixteen runtime directions without changing their samples."""
    step = (t % 1) * 16
    index = math.floor(step)
    return TAU * (index + smooth(step - index)) / 16


def gaze_at(state, t):
    if state == "look":
        angle = look_angle(t)
        yaw = 0.216 + 0.66 * math.sin(angle)
        pitch = -0.02 - 0.34 * math.cos(angle)
        return np.clip(yaw * 12, -8, 8) / 10, np.clip(pitch * 15, -6, 6) / 9
    if state == "review":
        return 0.24 * math.sin(TAU * t), 0.1
    return 0.0, 0.0


def gait_foot(phase):
    """60% ground contact, 40% swing, eased swing and toe clearance."""
    phase %= 1
    if phase < 0.6:
        return -0.19 + 0.38 * phase / 0.6, 0.0, 0.0
    u = (phase - 0.6) / 0.4
    return (
        0.19 - 0.38 * smooth(u),
        0.16 * math.sin(math.pi * u) ** 2,
        0.27 * math.sin(TAU * u),
    )


@dataclass
class RigPose:
    matrices: dict
    joints: dict
    state: str
    t: float
    gaze: tuple
    cable_start: np.ndarray
    cable_end: np.ndarray


def pose_at(state, t, heading=0):
    # Legacy host intents are resolved at the output boundary.
    if state in ("running-left", "running-right"):
        from .outputs import output_instance

        state, properties = output_instance(state)
        heading = properties["heading"]
    travel = math.radians(LOCOMOTION.get(state, 0))
    if state in LOCOMOTION:
        state = "move"
    t = float(t)
    if state not in (
        "jumping",
        "climb-border",
        "climbing",
        "climb-rope",
        "climb-ladder",
    ):
        t %= 1
    s, c = math.sin(TAU * t), math.cos(TAU * t)
    root_z = REST_HEIGHT + 0.002 * s
    root_y = 0.0
    root_x = 0.0
    lean = 0.0
    roll = 0.0
    yaw = math.radians(heading)
    head_yaw = 0.025 * s
    head_pitch = -0.018 * c
    hands = {-1: None, 1: None}
    hand_rotations = {}
    hand_release = {}
    ankles = {-1: np.array([-0.26, -0.015, 0.17]), 1: np.array([0.26, -0.015, 0.17])}
    feet_pitch = {-1: 0.0, 1: 0.0}
    gaze = (0.0, 0.0)
    if state == "move":
        root_z = REST_HEIGHT - 0.010 * math.cos(2 * TAU * t)
        lean = 0.10 * math.cos(travel)
        root_y = -0.015
        roll = 0.035 * s - 0.07 * math.sin(travel)
        for side in (-1, 1):
            phase = t + (0 if side == 1 else 0.5)
            fy, fz, fp = gait_foot(phase)
            ankles[side] = np.array(
                [
                    side * 0.26 - 0.62 * fy * math.sin(travel),
                    fy * math.cos(travel),
                    0.17 + fz,
                ]
            )
            feet_pitch[side] = fp * math.cos(travel)
        head_pitch = -0.08
        head_yaw = 0.0
    elif state == "flying":
        lift = 0.32 + 0.018 * s
        root_z = REST_HEIGHT + lift
        head_pitch = -0.05
        for side in (-1, 1):
            ankles[side] += np.array([side * 0.025, 0.05, lift])
            hands[side] = np.array([side * (0.82 + 0.02 * c), 0.015, 1.10 + lift])
            feet_pitch[side] = -0.12
    elif state in ("climbing", "climb-ladder", "climb-rope"):
        root_z = REST_HEIGHT + STRIDE * t
        head_pitch = -0.12
        for side in (-1, 1):
            hands[side], ankles[side], hand_rotations[side] = climbing_targets(
                state, t, side
            )
            feet_pitch[side] = 0.10
    elif state == "climb-border":
        # Mantle: load the grip, pull, plant one foot, transfer support, then stand.
        ledge = LEDGE_HEIGHT
        root_z = REST_HEIGHT + curve(
            t,
            [
                (0, 0),
                (0.16, -0.04),
                (0.43, 0.48),
                (0.62, 0.59),
                (0.80, 1.14),
                (1, ledge),
            ],
        )
        root_y = curve(
            t, [(0, 0), (0.35, -0.08), (0.58, -0.38), (0.78, -0.95), (1, -1.07)]
        )
        lean = curve(t, [(0, 0.10), (0.4, 0.18), (0.58, 0.28), (0.82, 0.08), (1, 0)])
        head_pitch = -0.10 * (1 - smooth(t))
        for side in (-1, 1):
            foot_start = 0.30 if side == 1 else 0.47
            foot_end = 0.58 if side == 1 else 0.73
            transfer = foot_start + 0.55 * (foot_end - foot_start)
            plant = smooth(np.clip((t - transfer) / (foot_end - transfer), 0, 1))
            lift = curve(
                t,
                [
                    (0, 0),
                    (0.20, 0.08),
                    (foot_start, 0.38),
                    (transfer, ledge + 0.10),
                    (foot_end, ledge),
                    (1, ledge),
                ],
            )
            ankles[side] = np.array(
                [
                    side * 0.28,
                    -0.10 + (-1.07 + 0.10) * plant,
                    0.17 + lift + 0.08 * math.sin(math.pi * plant),
                ]
            )
            feet_pitch[side] = 0.18 * math.sin(math.pi * plant)
            rest_hand = point(
                transform((0, root_y, root_z), (lean, 0, 0)),
                (side * 0.68, -0.035, 1.50 - ARM_REST),
            )
            hands[side], hand_rotations[side], hand_release[side] = border_hand(
                t, side, rest_hand
            )
    elif state == "waving":
        hands[1] = np.array([0.94 + 0.09 * s, -0.02, 1.93 + 0.065 * c])
        head_yaw = 0.07
        head_pitch = -0.055
    elif state == "jumping":
        compression, air, pitch = jump_motion(t)
        # Rock around the front of the sole, then lift the same foot frame.
        toe = np.array([0, -0.34, -0.17])
        rocker = toe - point(transform(angles=(pitch, 0, 0)), toe)
        root_z = REST_HEIGHT + compression + air + rocker[2]
        root_y = rocker[1]
        for side in (-1, 1):
            ankles[side] += rocker + np.array([0, 0, air])
            feet_pitch[side] = pitch
            hands[side] = np.array(
                [
                    side * (0.78 + 0.13 * math.sin(math.pi * t)),
                    -0.07,
                    1.03 + 0.22 * math.sin(math.pi * t),
                ]
            )
        head_pitch = -0.09 * math.sin(math.pi * t)
    elif state == "failed":
        root_z = REST_HEIGHT - 0.035 * (1 - c) / 2
        head_pitch = 0.17 + 0.08 * (1 - c) / 2
        head_yaw = 0.085 * math.sin(2 * TAU * t)
        hands[1] = np.array([0.84, -0.22, 1.09])
        hands[-1] = np.array([-0.84, -0.22, 1.09])
    elif state == "waiting":
        head_pitch = -0.14
        head_yaw = 0.045 * s
        hands[1] = np.array([0.81, -0.35, 1.32 + 0.015 * s])
        hands[-1] = np.array([-0.81, -0.35, 1.32 + 0.015 * s])
    elif state == "running":
        head_yaw = 0.13
        head_pitch = 0.035 + 0.02 * s
        root_z = REST_HEIGHT - 0.038 + 0.007 * s
        root_x = 0.055
        hands[1] = WORK_HAND[:3, 3].copy()
        hands[-1] = FREE_HAND[:3, 3].copy()
    elif state == "review":
        nod = math.sin(math.pi * (t - 0.5) / 0.32) ** 2 if 0.5 < t < 0.82 else 0
        head_pitch = 0.08 + 0.035 * c + 0.08 * nod
        head_yaw = -0.045 + 0.12 * s
        hands[1] = np.array([0.43, -0.48, 1.515 + 0.012 * s])
    elif state == "look":
        angle = look_angle(t)
        head_yaw = 0.216 + 0.66 * math.sin(angle)
        head_pitch = -0.02 - 0.34 * math.cos(angle)
    elif state == "idle":
        head_pitch = -0.018 * math.sin(2 * TAU * t)
    else:
        raise ValueError(state)
    if state in ("waving", "jumping", "failed", "waiting", "review", "flying"):
        for side in (-1, 1):
            if hands[side] is not None:
                hands[side][2] += 0.24
    if state in ("flying", "climbing", "climb-rope", "climb-ladder", "climb-border"):
        head_pitch, head_yaw = -0.14, 0.045 * s
    gaze = gaze_at(state, t)
    heading = transform(angles=(0, 0, yaw))
    # Limit torso height against both foot targets, preserving a soft knee bend.
    # This also allows the support leg to extend during the walking cycle.
    tilted = transform((root_x, root_y, 0), (lean, roll, 0))
    for side in (-1, 1):
        hip = point(tilted, HIP_PIVOT * (side, 1, 1))
        offset = hip[:2] - ankles[side][:2]
        height = math.sqrt(LEG_REACH**2 - float(offset @ offset))
        root_z = min(root_z, ankles[side][2] + height - hip[2])
    body = heading @ transform((root_x, root_y, root_z), (lean, roll, 0))
    matrices = {
        "body": body,
        "head": body @ transform((0, 0, 1.87), (head_pitch, 0, head_yaw)),
    }
    joints = {}
    for side in (-1, 1):
        name = "L" if side == -1 else "R"
        hip = point(body, HIP_PIVOT * (side, 1, 1))
        ankle = point(heading, ankles[side])
        knee = two_bone(hip, ankle, THIGH, SHIN, point(heading, (0, -1, 0)))
        shoulder = point(body, SHOULDER_PIVOT * (side, 1, 1))
        if hands[side] is None:
            # Rest targets follow the shoulder, independently of planted feet.
            walking = state == "move"
            swing = side * 0.18 * s if walking else 0.0
            drift = 0.008 * math.sin(TAU * t + side * 1.1)
            hand = point(
                body,
                (
                    side * 0.68 + swing * 0.45 * math.sin(travel),
                    -0.035 - swing * math.cos(travel) + drift,
                    1.50 - ARM_REST + (0.035 * s * s if walking else 0),
                ),
            )
        else:
            # Gesture targets stay in world space; airborne hands follow lift.
            hand = point(
                heading,
                hands[side]
                + np.array(
                    [0, 0, max(0, root_z - REST_HEIGHT) if state == "jumping" else 0]
                ),
            )
        pole = (1, 0, -1) if state == "review" and side == 1 else (side * 0.3, 0.8, 0)
        if state in ("climbing", "climb-ladder", "climb-rope", "climb-border"):
            pole = (side * 1.8, -1.2, -0.20)
            if state == "climb-rope":
                pole = (side * 2.0, -0.8, -0.20)
        elbow = two_bone(shoulder, hand, UPPER_ARM, FOREARM, point(heading, pole))
        matrices[f"thigh.{name}"], matrices[f"shin.{name}"] = limb_matrices(
            hip, knee, ankle
        )
        matrices[f"foot.{name}"] = heading @ transform(
            ankles[side], (feet_pitch[side], 0, 0)
        )
        matrices[f"upper_arm.{name}"], matrices[f"forearm.{name}"] = limb_matrices(
            shoulder, elbow, hand, hinge_sign=-1
        )
        matrices[f"hand.{name}"] = matrices[f"forearm.{name}"].copy()
        matrices[f"hand.{name}"][:3, 3] = hand
        matrices[f"hand.{name}"] = orient_palm(
            matrices[f"hand.{name}"], -side * body[:3, 0]
        )
        if side in hand_rotations:
            selected = heading @ hand_rotations[side]
            selected[:3, 3] = hand
            release = hand_release.get(side, 0)
            if release < 1:
                # Polar interpolation keeps the wrist frame orthonormal during release.
                mixed = (
                    selected[:3, :3] * (1 - release)
                    + matrices[f"hand.{name}"][:3, :3] * release
                )
                u, _, vt = np.linalg.svd(mixed)
                selected[:3, :3] = u @ np.diag([1, 1, np.linalg.det(u @ vt)]) @ vt
                matrices[f"hand.{name}"] = selected
        if state == "running":
            matrices[f"hand.{name}"] = (WORK_HAND if side == 1 else FREE_HAND).copy()
        if state == "waving" and side == 1:
            matrices[f"hand.{name}"] = transform(hand, (0, 0.22 * s, 0.05 * s))
        if state == "waiting":
            matrices[f"hand.{name}"] = (
                transform(hand)
                @ heading
                @ transform(angles=(math.pi / 2, 0, side * 0.2))
            )
        if state == "review" and side == 1:
            matrices[f"hand.{name}"] = orient_palm(
                transform(hand, (0, -0.20, 0.08)),
                matrices["head"][:3, 3] - hand,
            )
        for joint, pos in [
            ("hip", hip),
            ("knee", knee),
            ("ankle", ankle),
            ("shoulder", shoulder),
            ("elbow", elbow),
            ("wrist", hand),
        ]:
            joints[f"{joint}.{name}"] = pos
    matrices.update(hand_matrices(matrices, state, t))
    # The plug is recessed into the right forearm, so its cable follows the rig.
    cable_start = point(matrices["forearm.R"], FOREARM_PORT)
    cable_end = SERVER_PORT.copy()
    return RigPose(matrices, joints, state, t, gaze, cable_start, cable_end)


def pose_for(state, index):
    count = 16 if state == "look" else FRAMES[state]
    return pose_at(state, index / (count - 1 if state == "jumping" else count))


def cable_points(pose, count=64):
    """Arc-length sampled slack curve with continuous tangents at both connectors."""
    a, b = pose.cable_start, pose.cable_end
    direction = pose.matrices["forearm.R"][:3, 1]
    controls = np.array(
        [
            a,
            a + direction * 0.14,
            a + direction * 0.26 + (0, -0.12, -0.12),
            b + (0, -0.28, -0.20),
            b + (0, -0.14, 0),
            b,
        ]
    )
    parameters = np.linspace(0, 1, 257)
    raw = np.array(
        [
            sum(
                math.comb(5, i) * (1 - t) ** (5 - i) * t**i * p
                for i, p in enumerate(controls)
            )
            for t in parameters
        ]
    )
    lengths = np.concatenate(
        ([0], np.cumsum(np.linalg.norm(np.diff(raw, axis=0), axis=1)))
    )
    distances = np.linspace(0, lengths[-1], count)
    return np.column_stack(
        [np.interp(distances, lengths, raw[:, axis]) for axis in range(3)]
    )

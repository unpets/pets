"""Continuous, deterministic rigid-body animation; metres, Z up, front = -Y."""

import math
from dataclasses import dataclass
from itertools import pairwise

import numpy as np

from .hands import HAND_BONES, hand_matrices
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
DURATIONS = {
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
}
TAU = math.tau
WRIST_PORT = np.array([0, 0.14, 0.055])
SERVER_PORT = np.array([1.185, -0.427, 0.85])
SHOULDER_PIVOT = np.array([0.64, 0, 1.50])
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
WORK_HAND = transform((1.04, -0.182, 1.1045), (math.pi / 2, 0, 0))
WORK_CONTACT_LOCAL = np.array([0, -0.075, 0.055])
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


def look_angle(t):
    """Ease between the sixteen runtime directions without changing their samples."""
    step = (t % 1) * 16
    index = math.floor(step)
    return TAU * (index + smooth(step - index)) / 16


def gaze_at(state, t):
    if state == "look":
        angle = look_angle(t)
        return math.sin(angle), -math.cos(angle)
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


def pose_at(state, t):
    t = float(t)
    if state != "jumping":
        t %= 1
    s, c = math.sin(TAU * t), math.cos(TAU * t)
    root_z = 0.012 * s
    root_y = 0.0
    root_x = 0.0
    lean = 0.0
    roll = 0.0
    yaw = 0.0
    head_yaw = 0.025 * s
    head_pitch = -0.018 * c
    hands = {-1: np.array([-0.78, -0.04, 1.00]), 1: np.array([0.78, -0.04, 1.00])}
    ankles = {-1: np.array([-0.26, -0.015, 0.17]), 1: np.array([0.26, -0.015, 0.17])}
    feet_pitch = {-1: 0.0, 1: 0.0}
    gaze = (0.0, 0.0)
    if state.startswith("running-"):
        yaw = 0.95 if state == "running-right" else -0.95
        root_z = 0.018 - 0.016 * math.cos(2 * TAU * t)
        lean = 0.10
        root_y = -0.015
        roll = 0.035 * s
        for side in (-1, 1):
            phase = t + (0 if side == 1 else 0.5)
            fy, fz, fp = gait_foot(phase)
            ankles[side] = np.array([side * 0.26, fy, 0.17 + fz])
            feet_pitch[side] = fp
            hands[side] = np.array(
                [side * 0.75, -0.07 - side * 0.19 * s, 1.02 + 0.035 * c]
            )
        head_pitch = -0.08
        head_yaw = -0.10 if yaw > 0 else 0.10
    elif state == "waving":
        hands[1] = np.array([0.94 + 0.09 * s, -0.02, 1.93 + 0.065 * c])
        head_yaw = 0.07
        head_pitch = -0.055
        roll = -0.025
    elif state == "jumping":
        # Rest -> launch -> apex -> landing compression -> rest. C1 interpolation.
        keys = [(0, 0), (0.13, -0.07), (0.50, 0.35), (0.86, -0.06), (1, 0)]
        for (ta, za), (tb, zb) in pairwise(keys):
            if ta <= t <= tb:
                root_z = za + (zb - za) * smooth((t - ta) / (tb - ta))
                break
        air = max(0, root_z)
        for side in (-1, 1):
            ankles[side][2] += air
            hands[side] = np.array(
                [
                    side * (0.78 + 0.13 * math.sin(math.pi * t)),
                    -0.07,
                    1.03 + 0.22 * math.sin(math.pi * t),
                ]
            )
        head_pitch = -0.09 * math.sin(math.pi * t)
    elif state == "failed":
        root_z = -0.035 * (1 - c) / 2
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
        root_z = 0.007 * s
        hands[1] = WORK_HAND[:3, 3].copy()
        hands[-1] = np.array([-0.62, -0.41, 1.32 + 0.024 * math.sin(2 * TAU * t)])
    elif state == "review":
        nod = math.sin(math.pi * (t - 0.5) / 0.32) ** 2 if 0.5 < t < 0.82 else 0
        head_pitch = 0.08 + 0.035 * c + 0.08 * nod
        head_yaw = -0.045 + 0.12 * s
        hands[1] = np.array([0.43, -0.48, 1.515 + 0.012 * s])
        hands[-1] = np.array([-0.72, -0.16, 1.04])
    elif state == "look":
        root_z = 0
        angle = look_angle(t)
        head_yaw = 0.216 + 0.66 * math.sin(angle)
        head_pitch = -0.02 - 0.34 * math.cos(angle)
        hands[-1] = np.array([-0.80, -0.09, 1.03])
        hands[1] = np.array([0.80, -0.09, 1.03])
    elif state != "idle":
        raise ValueError(state)
    gaze = gaze_at(state, t)
    heading = transform(angles=(0, 0, yaw))
    body = heading @ transform((root_x, root_y, root_z), (lean, roll, 0))
    matrices = {
        "body": body,
        "head": body @ transform((0, 0, 1.87), (head_pitch, 0, head_yaw)),
    }
    joints = {}
    for side in (-1, 1):
        name = "L" if side == -1 else "R"
        hip = point(body, (side * 0.25, 0, 0.92))
        ankle = point(heading, ankles[side])
        knee = two_bone(hip, ankle, 0.42, 0.42, point(heading, (0, -1, 0)))
        shoulder = point(body, SHOULDER_PIVOT * (side, 1, 1))
        # Jump hands follow torso translation; grounded states have world hand targets.
        hand = point(
            heading,
            hands[side] + np.array([0, 0, max(0, root_z) if state == "jumping" else 0]),
        )
        pole = (1, 0, -1) if state == "review" and side == 1 else (side * 0.3, 0.8, 0)
        elbow = two_bone(shoulder, hand, 0.33, 0.34, point(heading, pole))
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
        if state == "running" and side == 1:
            matrices[f"hand.{name}"] = WORK_HAND.copy()
        if state == "waving" and side == 1:
            matrices[f"hand.{name}"] = transform(hand, (0, 0.22 * s, 0.05 * s))
        if state == "waiting":
            matrices[f"hand.{name}"] = heading @ transform(
                hands[side], (math.pi / 2, 0, side * 0.2)
            )
        if state == "review" and side == 1:
            matrices[f"hand.{name}"] = transform(hand, (0, -0.20, 0.08))
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
    # The plug is mounted on the right wrist housing, so its cable follows the rig.
    cable_start = point(matrices["hand.R"], WRIST_PORT)
    cable_end = SERVER_PORT.copy()
    return RigPose(matrices, joints, state, t, gaze, cable_start, cable_end)


def pose_for(state, index):
    count = 16 if state == "look" else FRAMES[state]
    return pose_at(state, index / (count - 1 if state == "jumping" else count))


def cable_points(pose, count=32):
    """Cubic slack cable; clears the server lid/front, exact physical plug anchors."""
    a, b = pose.cable_start, pose.cable_end
    direction = pose.matrices["hand.R"][:3, 1]
    c1 = a + direction * 0.20
    c2 = b + np.array([0, -0.36, 0])
    return np.array(
        [
            (1 - u) ** 3 * a
            + 3 * (1 - u) ** 2 * u * c1
            + 3 * (1 - u) * u * u * c2
            + u**3 * b
            for u in np.linspace(0, 1, count)
        ]
    )

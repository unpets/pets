"""Continuous, deterministic rigid-body animation; metres, Z up, front = -Y."""

import math
from dataclasses import dataclass
from itertools import pairwise

import numpy as np

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
SERVER_PORT = np.array([1.16, -0.427, 0.66])
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


def rotation(x=0.0, y=0.0, z=0.0):
    cx, sx, cy, sy, cz, sz = (
        math.cos(x),
        math.sin(x),
        math.cos(y),
        math.sin(y),
        math.cos(z),
        math.sin(z),
    )
    return (
        np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1.0]])
        @ np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
        @ np.array([[1.0, 0, 0], [0, cx, -sx], [0, sx, cx]])
    )


def transform(location=(0, 0, 0), angles=(0, 0, 0)):
    m = np.eye(4)
    m[:3, :3] = rotation(*angles)
    m[:3, 3] = location
    return m


def point(m, p):
    return (m @ np.r_[p, 1])[:3]


def bone_matrix(a, b):
    a, b = np.asarray(a), np.asarray(b)
    z = (b - a) / np.linalg.norm(b - a)
    ref = np.array([1.0, 0, 0])
    if abs(z @ ref) > 0.98:
        ref = np.array([0.0, 1, 0])
    y = np.cross(z, ref)
    y /= np.linalg.norm(y)
    x = np.cross(y, z)
    m = np.eye(4)
    m[:3, :3] = np.column_stack((x, y, z))
    m[:3, 3] = a
    return m


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
        hands[1] = np.array([0.96, -0.21, 1.10 + 0.012 * s])
        hands[-1] = np.array([-0.62, -0.41, 1.32 + 0.024 * math.sin(2 * TAU * t)])
    elif state == "review":
        head_pitch = 0.12 + 0.035 * c
        head_yaw = 0.13 * s
        hands[1] = np.array([0.51, -0.44, 1.64 + 0.015 * s])
        hands[-1] = np.array([-0.69, -0.22, 1.06])
    elif state == "look":
        root_z = 0
        head_yaw = 0.216 + 0.72 * s
        head_pitch = -0.40 * c
        gaze = (s, -c)
    elif state != "idle":
        raise ValueError(state)
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
        shoulder = point(body, (side * 0.64, 0, 1.50))
        # Jump hands follow torso translation; grounded states have world hand targets.
        hand = point(
            heading,
            hands[side] + np.array([0, 0, max(0, root_z) if state == "jumping" else 0]),
        )
        elbow = two_bone(
            shoulder, hand, 0.33, 0.34, point(heading, (side * 0.3, 0.8, 0))
        )
        matrices[f"thigh.{name}"] = bone_matrix(hip, knee)
        matrices[f"shin.{name}"] = bone_matrix(knee, ankle)
        matrices[f"foot.{name}"] = heading @ transform(
            ankles[side], (feet_pitch[side], 0, 0)
        )
        matrices[f"upper_arm.{name}"] = bone_matrix(shoulder, elbow)
        matrices[f"forearm.{name}"] = bone_matrix(elbow, hand)
        matrices[f"hand.{name}"] = bone_matrix(elbow, hand)
        matrices[f"hand.{name}"][:3, 3] = hand
        if state == "waving" and side == 1:
            matrices[f"hand.{name}"] = transform(hand, (0, 0.22 * s, 0.05 * s))
        if state == "waiting":
            matrices[f"hand.{name}"] = heading @ transform(
                hands[side], (math.pi / 2, 0, side * 0.2)
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

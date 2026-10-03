"""Reopen an exported Blender scene and verify its baked rig and screen files."""

import json
from pathlib import Path

import bpy
import numpy as np

from .animation import PROJECT, PROPS, prop_visible
from .armature import part_matrix
from .emission import sockets, values_at
from .framing import verify_frame
from .rig import MOTIONS, pose_at


def verify(build):
    bpy.ops.wm.open_mainfile(filepath=str((build / "kernel.blend").resolve()))
    scene = bpy.context.scene
    timeline = json.loads((build / "timeline.json").read_text())
    parts = {obj["rig_part"]: obj for obj in scene.objects if "rig_part" in obj}
    display = next(obj for obj in scene.objects if obj.get("is_display"))
    armature = next(obj for obj in scene.objects if obj.type == "ARMATURE")
    foot_vertices = {
        side: np.array([vertex.co[:] for vertex in parts[f"foot.{side}"].data.vertices])
        for side in ("L", "R")
    }
    for name, obj in parts.items():
        if name in PROPS:
            continue
        if (
            obj.parent != armature
            or obj.parent_type != "BONE"
            or obj.parent_bone != name
        ):
            raise ValueError(f"Mechanical part is not attached to its bone: {name}")
    for name in [*MOTIONS, "look"]:
        action = bpy.data.actions.get(name)
        if not action or not action.slots:
            raise ValueError(f"Missing slotted animation action: {name}")
    for clip in PROJECT["clips"].values():
        if PROJECT["components"][clip["component"]]["kind"] != "rig":
            continue
        if "lookAt" in clip["data"]:
            # Target-driven parts are evaluated when a composition is baked.
            if PROJECT["components"][clip["component"]]["data"]["nodes"] != ["head"]:
                raise ValueError("Lookat requires the head component")
            continue
        name = f"{clip['component']}/{clip['data']['source']}"
        action = bpy.data.actions.get(name)
        if (
            not action
            or action.get("pets_component") != clip["component"]
            or not action.asset_data
        ):
            raise ValueError(f"Missing component action asset: {name}")
    if display.parent != parts["head"]:
        raise ValueError("Screen is not attached to the head")
    if (scene.frame_start, scene.frame_end) != (1, len(timeline)):
        raise ValueError("Blender timeline does not match its exported metadata")
    texture = next(
        node
        for node in display.data.materials[0].node_tree.nodes
        if node.type == "TEX_IMAGE"
    )
    if texture.image.source != "SEQUENCE" or not texture.image.filepath.startswith(
        "//"
    ):
        raise ValueError("Screen must use a portable relative image sequence")
    if not Path(bpy.path.abspath(texture.image.filepath)).is_file():
        raise FileNotFoundError("Blender display image reference cannot be resolved")
    emission_targets = sockets(PROJECT)
    for sample in timeline:
        scene.frame_set(sample["frame"])
        verify_frame(scene)
        for prop in PROPS:
            obj = scene.objects["cable"] if prop == "cable" else parts[prop]
            hidden = not prop_visible(sample["state"], prop)
            if obj.hide_render != hidden or obj.hide_viewport != hidden:
                raise ValueError(
                    f"Incorrect {prop} visibility at frame {sample['frame']}"
                )
        for name, expected in values_at(PROJECT, sample["state"], sample["t"]).items():
            if abs(emission_targets[name].default_value - expected) > 1e-5:
                raise ValueError(
                    f"Incorrect key emission at frame {sample['frame']}: {name}"
                )
        pose = pose_at(sample["state"], sample["t"])
        for name, matrix in pose.matrices.items():
            actual = np.asarray(
                part_matrix(armature, name)
                if parts[name].hide_viewport
                else parts[name].matrix_world
            )
            # Float32 bone chains accumulate angular error independently of translation.
            if not (
                np.allclose(actual[:3, 3], matrix[:3, 3], atol=1e-5, rtol=0)
                and np.allclose(actual[:3, :3], matrix[:3, :3], atol=5e-5, rtol=0)
            ):
                raise ValueError(
                    f"Baked rig differs at frame {sample['frame']}: {name}"
                )
        if sample["state"] == "jumping":
            for side, vertices in foot_vertices.items():
                matrix = np.asarray(parts[f"foot.{side}"].matrix_world)
                lowest = (vertices @ matrix[2, :3] + matrix[2, 3]).min()
                if lowest < -1e-5:
                    raise ValueError(
                        f"Foot enters the floor at frame {sample['frame']}: {lowest}"
                    )
        if not (
            build / "blend-screens" / f"screen-{sample['frame']:04d}.png"
        ).is_file():
            raise FileNotFoundError(f"Missing display frame {sample['frame']}")
    report = {
        "ok": True,
        "frames_checked": len(timeline),
        "screen_parent": "head",
        "relative_screen_sequence": True,
        "server_and_cable_visibility": True,
        "keyboard_visibility": True,
        "key_emission_curves": True,
        "jump_foot_clearance": True,
        "sprite_camera_margin": True,
    }
    (build / "blend-check.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report))

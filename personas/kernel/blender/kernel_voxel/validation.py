"""Reopen an exported Blender scene and verify its baked rig and screen files."""

import json
from pathlib import Path

import bpy
import numpy as np

from .animation import PROJECT, prop_visible
from .rig import FRAMES, pose_at


def verify(build):
    bpy.ops.wm.open_mainfile(filepath=str((build / "kernel.blend").resolve()))
    scene = bpy.context.scene
    timeline = json.loads((build / "timeline.json").read_text())
    parts = {obj["rig_part"]: obj for obj in scene.objects if "rig_part" in obj}
    display = next(obj for obj in scene.objects if obj.get("is_display"))
    armature = next(obj for obj in scene.objects if obj.type == "ARMATURE")
    for name, obj in parts.items():
        if name == "server":
            continue
        if (
            obj.parent != armature
            or obj.parent_type != "BONE"
            or obj.parent_bone != name
        ):
            raise ValueError(f"Mechanical part is not attached to its bone: {name}")
    for name in [*FRAMES, "look"]:
        action = bpy.data.actions.get(name)
        if not action or not action.slots:
            raise ValueError(f"Missing slotted animation action: {name}")
    for clip in PROJECT["clips"].values():
        if PROJECT["components"][clip["component"]]["kind"] != "rig":
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
    for sample in timeline:
        scene.frame_set(sample["frame"])
        for prop, obj in (
            ("server", parts["server"]),
            ("cable", scene.objects["cable"]),
        ):
            hidden = not prop_visible(sample["state"], prop)
            if obj.hide_render != hidden or obj.hide_viewport != hidden:
                raise ValueError(
                    f"Incorrect server visibility at frame {sample['frame']}"
                )
        pose = pose_at(sample["state"], sample["t"])
        for name, matrix in pose.matrices.items():
            if not np.allclose(np.asarray(parts[name].matrix_world), matrix, atol=1e-5):
                raise ValueError(
                    f"Baked rig differs at frame {sample['frame']}: {name}"
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
    }
    (build / "blend-check.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report))

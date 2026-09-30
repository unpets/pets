"""Bake Studio composition projects into an editable Blender scene."""

import argparse
import json
import math
import shutil
from pathlib import Path

import bpy
import numpy as np
from pets_core import animation_project

from .animation import playback_duration, resolve_composition
from .armature import key_pose, linear_keys
from .composition import apply_composition
from .effects import key_effects, update_effects
from .framing import MARGIN, projected_bounds, view_extent
from .rig import CELL
from .scene import load_source


def bake_project(source, document, output, compositions=None, device="auto"):
    project = animation_project(document.get("animations", document))
    selected = compositions or list(project["compositions"])
    if any(name not in project["compositions"] for name in selected):
        raise ValueError("Unknown composition selection")
    model = load_source(source, device)
    for identifier in selected:
        update_effects(model, project, identifier, 0)
    scene = bpy.context.scene
    output.mkdir(parents=True, exist_ok=True)
    screens = output / "blend-screens"
    screens.mkdir(exist_ok=True)
    preview = bpy.data.actions.new("Composed preview")
    preview.use_fake_user = True
    armature = model["armature"]
    timeline = []
    extent = np.zeros(2)
    frame = 1
    scene.timeline_markers.clear()
    for identifier in selected:
        composition = resolve_composition(project, identifier)
        scene.timeline_markers.new(composition["label"], frame=frame)
        action = bpy.data.actions.new(f"composition/{identifier}")
        action.use_fake_user = True
        action.asset_mark()
        count = max(
            2, math.ceil(playback_duration(project, identifier) * scene.render.fps)
        )
        for index in range(count):
            phase = index / (count - 1)
            image = apply_composition(
                model, project, identifier, phase, document.get("screen")
            )
            for target, time in ((action, index), (preview, frame)):
                armature.animation_data.action = target
                key_pose(armature, time)
            key_effects(model, frame)
            from .environment import update_environment

            update_environment(identifier, frame)
            model["placement"].keyframe_insert("rotation_euler", frame=frame)
            for node in [
                model["cable"],
                *(
                    model["nodes"][name]
                    for name in ("server", "keyboard", "keyboard.L")
                ),
            ]:
                node.keyframe_insert("hide_render", frame=frame)
                node.keyframe_insert("hide_viewport", frame=frame)
            for socket in model["emission"].values():
                socket.keyframe_insert("default_value", frame=frame)
            for vertex in model["cable"].data.splines[0].points:
                vertex.keyframe_insert("co", frame=frame)
            low, high = projected_bounds(scene)
            extent = np.maximum(extent, np.maximum(abs(low), abs(high)))
            image.save(screens / f"screen-{frame:04d}.png")
            timeline.append({"frame": frame, "state": identifier, "t": phase})
            frame += 1
        linear_keys(action)
    linear_keys(preview)
    armature.animation_data.action = preview
    armature.animation_data.action_slot = preview.slots[0]
    for socket in model["emission"].values():
        if socket.id_data.animation_data:
            linear_keys(socket.id_data.animation_data.action)
    usable = 1 - 2 * MARGIN / np.asarray(CELL)
    scene.camera.data.ortho_scale *= max(
        1.0, float(np.max(extent / (view_extent(scene) * usable)))
    )
    texture = next(
        n
        for n in model["display"].data.materials[0].node_tree.nodes
        if n.type == "TEX_IMAGE"
    )
    image = bpy.data.images.load(str((screens / "screen-0001.png").resolve()))
    image.source = "SEQUENCE"
    texture.image = image
    texture.image_user.frame_duration = frame - 1
    texture.image_user.frame_start = 1
    texture.image_user.use_auto_refresh = True
    for name, value in (
        ("pets-animation.json", project),
        ("pets-studio.json", document),
    ):
        text = bpy.data.texts.get(name) or bpy.data.texts.new(name)
        text.clear()
        text.write(json.dumps(value, indent=2))
    scene.frame_start = 1
    scene.frame_end = frame - 1
    scene.frame_set(1)
    bpy.context.preferences.filepaths.save_version = 0
    for library in bpy.data.libraries:
        source = Path(bpy.path.abspath(library.filepath)).resolve()
        destination = (output / source.name).resolve()
        if source != destination:
            shutil.copy2(source, destination)
        library.filepath = str(destination)
    path = (output / "kernel.blend").resolve()
    bpy.ops.wm.save_as_mainfile(filepath=str(path))
    bpy.ops.file.make_paths_relative()
    bpy.ops.wm.save_as_mainfile(filepath=str(path))
    (output / "timeline.json").write_text(json.dumps(timeline, indent=2))
    return path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--blend", required=True, type=Path)
    parser.add_argument("--project", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--composition", action="append")
    parser.add_argument("--device", default="auto")
    args = parser.parse_args()
    document = json.loads(args.project.read_text())
    print(
        bake_project(args.blend, document, args.output, args.composition, args.device)
    )


if __name__ == "__main__":
    main()

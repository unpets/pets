"""Build the canonical Blender scene and evaluate its saved animation actions."""

import json
import math

import bpy
import numpy as np

from . import __version__
from .animation import PROJECT, prop_visible
from .rig import (
    DURATIONS,
    FRAMES,
    PARENTS,
    SERVER_PORT,
    WRIST_PORT,
    RigPose,
    cable_points,
    gaze_at,
    point,
    pose_at,
)
from .screen import framebuffer


def save_source(model, out):
    """Bake rigid transforms, cable vertices, and framebuffer sequence into the .blend."""
    import bpy

    from .armature import bake_actions, key_pose, linear_keys

    bake_actions(model)
    from .model import apply_pose

    scene = bpy.context.scene
    project_text = bpy.data.texts.new("pets-animation.json")
    project_text.write(json.dumps(PROJECT, indent=2))
    armature = model["armature"]
    timeline_action = bpy.data.actions.new("Preview timeline")
    armature.animation_data.action = timeline_action
    frames_dir = (out / "blend-screens").resolve()
    frames_dir.mkdir(exist_ok=True)
    timeline = []
    frame = 1
    for state, frame_count in {**FRAMES, "look": 16}.items():
        scene.timeline_markers.new(state, frame=frame)
        count = round(frame_count * DURATIONS[state] / 1000 * scene.render.fps)
        for i in range(count):
            p = pose_at(state, i / (count - 1 if state == "jumping" else count))
            scene.frame_set(frame)
            apply_pose(model, p)
            key_pose(armature, frame)
            for obj in (model["nodes"]["server"], model["cable"]):
                obj.keyframe_insert("hide_render", frame=frame)
                obj.keyframe_insert("hide_viewport", frame=frame)
            for pp in model["cable"].data.splines[0].points:
                pp.keyframe_insert("co", frame=frame)
            framebuffer(state, p.t, p.gaze).save(frames_dir / f"screen-{frame:04d}.png")
            timeline.append({"frame": frame, "state": state, "t": p.t})
            frame += 1
    linear_keys(timeline_action)
    scene.frame_start = 1
    scene.frame_end = frame - 1
    img = bpy.data.images.load(str(frames_dir / "screen-0001.png"))
    img.source = "SEQUENCE"
    tex = next(
        n
        for n in model["display"].data.materials[0].node_tree.nodes
        if n.type == "TEX_IMAGE"
    )
    tex.image = img
    tex.image_user.frame_duration = frame - 1
    tex.image_user.frame_start = 1
    tex.image_user.use_auto_refresh = True
    scene.frame_set(1)
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str((out / "kernel.blend").resolve()))
    bpy.ops.file.make_paths_relative()
    bpy.ops.wm.save_as_mainfile(filepath=str((out / "kernel.blend").resolve()))
    (out / "timeline.json").write_text(json.dumps(timeline, indent=2))


def build_source(out, scale, samples):
    from .model import build_model, setup_scene
    from .validation import verify

    setup_scene(scale, samples)
    model = build_model()
    metadata = {
        "version": __version__,
        "voxel_count": model["voxel_count"],
        "voxel_pitch": 0.035,
        "supersampling": scale,
        "samples": samples,
        "ports": {"wrist": WRIST_PORT.tolist(), "server": SERVER_PORT.tolist()},
    }
    bpy.context.scene["kernel_metadata"] = json.dumps(metadata)
    save_source(model, out)
    verify(out)
    return metadata


def load_source(path, device=None):
    from .devices import configure_render_device

    bpy.ops.wm.open_mainfile(filepath=str(path.resolve()))
    scene = bpy.context.scene
    metadata = json.loads(scene["kernel_metadata"])
    nodes = {obj["rig_part"]: obj for obj in scene.objects if "rig_part" in obj}
    display = next(obj for obj in scene.objects if obj.get("is_display"))
    armature = next(obj for obj in scene.objects if obj.type == "ARMATURE")
    cable = scene.objects["cable"]
    nodes["server"].animation_data_clear()
    cable.animation_data_clear()
    cable.data.animation_data_clear()
    image = bpy.data.images.new("Kernel export framebuffer", 96, 64, alpha=True)
    image.colorspace_settings.name = "sRGB"
    texture = next(
        n for n in display.data.materials[0].node_tree.nodes if n.type == "TEX_IMAGE"
    )
    texture.image = image
    actions = {name: bpy.data.actions[name] for name in [*FRAMES, "look"]}
    # Runtime tracks reference the same curves through their full source actions.
    # The editable source retains the separate joint assets in its Action library.
    for action in list(bpy.data.actions):
        if action.get("pets_component"):
            bpy.data.actions.remove(action)
    # The combined preview belongs in the editable source, not the exported clip list.
    armature.animation_data.action = actions["idle"]
    timeline = bpy.data.actions.get("Preview timeline")
    if timeline:
        bpy.data.actions.remove(timeline)
    if device is not None:
        configure_render_device(scene, device)
    return {
        "nodes": nodes,
        "display": display,
        "armature": armature,
        "cable": cable,
        "texture": image,
        "actions": actions,
        "metadata": metadata,
        "project": json.loads(bpy.data.texts["pets-animation.json"].as_string()),
        "voxel_count": metadata["voxel_count"],
    }


def sample_source(model, state, phase, update_display=True):
    """Evaluate saved bones; exports never solve a second procedural rig."""
    action = model["actions"][state]
    animation = model["armature"].animation_data
    animation.action = action
    animation.action_slot = action.slots[0]
    start, end = action.frame_range
    frame = start + phase * (end - start)
    bpy.context.scene.frame_set(math.floor(frame), subframe=frame % 1)
    matrices = {
        name: np.asarray(model["nodes"][name].matrix_world).copy() for name in PARENTS
    }
    gaze = gaze_at(state, phase)
    ports = model["metadata"]["ports"]
    pose = RigPose(
        matrices,
        {},
        state,
        phase,
        gaze,
        point(matrices["hand.R"], ports["wrist"]),
        np.asarray(ports["server"]),
    )
    for prop, obj in (("server", model["nodes"]["server"]), ("cable", model["cable"])):
        obj.hide_render = not prop_visible(state, prop)
        obj.hide_viewport = obj.hide_render

    for vertex, position in zip(
        model["cable"].data.splines[0].points, cable_points(pose)
    ):
        vertex.co = (*position, 1)
    if update_display:
        pixels = (
            np.asarray(
                framebuffer(state, phase, gaze).convert("RGBA"), dtype=np.float32
            )
            / 255
        )
        model["texture"].pixels.foreach_set(np.flipud(pixels).flatten())
        model["texture"].update()
    bpy.context.view_layer.update()
    return pose

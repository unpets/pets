"""Build the canonical Blender scene and evaluate its saved animation actions."""

import json
import math

import bpy
import numpy as np

from . import __version__
from .animation import PROJECT, PROPS, prop_visible
from .effects import key_effects, update_effects
from .emission import apply_values, bake_clips, read_clips
from .environment import build_environment, update_environment
from .framing import fit_camera
from .outputs import output_instance
from .placement import place
from .rig import (
    DURATIONS,
    FOREARM_PORT,
    MOTIONS,
    PARENTS,
    SERVER_PORT,
    SOURCE_MOTIONS,
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

    from .armature import bake_actions, compose_timeline, key_pose, linear_keys

    build_environment(out)
    bake_actions(model)
    for state in ("flying", "climbing"):
        update_effects(model, PROJECT, state, 0)
    update_effects(model, PROJECT, "idle", 0)
    emission_targets = bake_clips(PROJECT)
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
    for state, frame_count in {**MOTIONS, "look": 16}.items():
        scene.timeline_markers.new(state, frame=frame)
        count = round(frame_count * DURATIONS[state] / 1000 * scene.render.fps)
        for i in range(count):
            p = pose_at(
                state,
                i / (count - 1 if state in ("jumping", "climb-border") else count),
            )
            scene.frame_set(frame)
            apply_pose(model, p)
            key_pose(armature, frame)
            update_environment(state, frame)
            update_effects(model, PROJECT, state, p.t)
            key_effects(model, frame)
            apply_values(emission_targets, PROJECT, state, p.t)
            for socket in emission_targets.values():
                socket.keyframe_insert("default_value", frame=frame)
            for prop in PROPS:
                obj = model["cable"] if prop == "cable" else model["nodes"][prop]
                obj.keyframe_insert("hide_render", frame=frame)
                obj.keyframe_insert("hide_viewport", frame=frame)
            for pp in model["cable"].data.splines[0].points:
                pp.keyframe_insert("co", frame=frame)
            framebuffer(state, p.t, p.gaze).save(frames_dir / f"screen-{frame:04d}.png")
            timeline.append({"frame": frame, "state": state, "t": p.t})
            frame += 1
    linear_keys(timeline_action)
    for socket in emission_targets.values():
        linear_keys(socket.id_data.animation_data.action)
    compose_timeline(model, timeline)
    fit_camera(scene, timeline)
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
        "ports": {
            "wrist": FOREARM_PORT.tolist(),
            "node": "forearm.R",
            "radius": 0.012,
            "server": SERVER_PORT.tolist(),
        },
    }
    bpy.context.scene["kernel_metadata"] = json.dumps(metadata)
    save_source(model, out)
    verify(out)
    return metadata


def load_source(path, device=None):
    from .devices import configure_render_device

    bpy.ops.wm.open_mainfile(filepath=str(path.resolve()))
    scene = bpy.context.scene
    for obj in list(scene.objects):
        if obj.get("pets_fx"):
            bpy.data.objects.remove(obj, do_unlink=True)
    metadata = json.loads(scene["kernel_metadata"])
    nodes = {obj["rig_part"]: obj for obj in scene.objects if "rig_part" in obj}
    display = next(obj for obj in scene.objects if obj.get("is_display"))
    armature = next(obj for obj in scene.objects if obj.type == "ARMATURE")
    cable = scene.objects["cable"]
    for prop in PROPS:
        if prop != "cable":
            nodes[prop].animation_data_clear()
    cable.animation_data_clear()
    cable.data.animation_data_clear()
    image = bpy.data.images.new("Kernel export framebuffer", 96, 64, alpha=True)
    image.colorspace_settings.name = "sRGB"
    texture = next(
        n for n in display.data.materials[0].node_tree.nodes if n.type == "TEX_IMAGE"
    )
    texture.image = image
    for track in list(armature.animation_data.nla_tracks):
        armature.animation_data.nla_tracks.remove(track)
    actions = {name: bpy.data.actions[name] for name in [*SOURCE_MOTIONS, "look"]}
    # Runtime tracks reference the same curves through their full source actions.
    # The editable source retains the separate joint assets in its Action library.
    for action in list(bpy.data.actions):
        if action.get("pets_component") or action.get("pets_layer"):
            bpy.data.actions.remove(action)
    # The combined preview belongs in the editable source, not the exported clip list.
    armature.animation_data.action = actions["idle"]
    timeline = bpy.data.actions.get("Preview timeline")
    if timeline:
        bpy.data.actions.remove(timeline)
    if device is not None:
        configure_render_device(scene, device)
    project = json.loads(bpy.data.texts["pets-animation.json"].as_string())
    return {
        "emission": read_clips(project),
        "nodes": nodes,
        "display": display,
        "armature": armature,
        "cable": cable,
        "texture": image,
        "actions": actions,
        "metadata": metadata,
        "project": project,
        "voxel_count": metadata["voxel_count"],
    }


def sample_source(model, state, phase, update_display=True):
    """Evaluate saved bones; exports never solve a second procedural rig."""
    state, properties = output_instance(state)
    place(model, 0)
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
        point(matrices[ports.get("node", "hand.R")], ports["wrist"]),
        np.asarray(ports["server"]),
    )
    for prop in PROPS:
        obj = model["cable"] if prop == "cable" else model["nodes"][prop]
        obj.hide_render = not prop_visible(state, prop)
        obj.hide_viewport = obj.hide_render

    update_environment(state)
    apply_values(model["emission"], model["project"], state, phase)
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
    update_effects(model, model["project"], state, phase)
    heading = properties.get("heading", 0)
    placement = np.asarray(place(model, heading))
    if heading:
        pose.matrices = {name: placement @ matrix for name, matrix in matrices.items()}
        pose.cable_start = point(placement, pose.cable_start)
        pose.cable_end = point(placement, pose.cable_end)
    return pose

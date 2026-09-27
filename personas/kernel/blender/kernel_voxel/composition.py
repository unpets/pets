"""Evaluate authored composition layers against saved Blender actions."""

import math
from bisect import bisect_right

import bpy
import numpy as np
from mathutils import Euler, Matrix
from PIL import Image, ImageColor

from .animation import LABELS, resolve_composition
from .emission import sample_curve
from .rig import PARENTS, RigPose, cable_points, point
from .screen import SIZE, draw_clip


def samples_at(project, identifier, seconds, independent_seconds=None):
    composition = resolve_composition(project, identifier)
    independent_seconds = (
        seconds if independent_seconds is None else independent_seconds
    )
    samples = {}
    for component, binding in composition["bindings"].items():
        if not binding["enabled"]:
            continue
        clip = project["clips"][binding["clip"]]
        cycles = (
            seconds / composition["duration"]
            if binding["clock"] == "composition"
            else independent_seconds / clip["duration"]
        ) * binding["speed"] + binding["offset"]
        samples[component] = (
            clip,
            cycles % 1 if clip["looping"] else min(1, max(0, cycles)),
        )
    return samples


def tinted(image, color, shaded=False):
    data = np.array(image)
    rgb = np.array(ImageColor.getrgb(color)[:3])
    if shaded:
        data[:, :, :3] = np.rint(data[:, :, :3].max(axis=2)[:, :, None] / 255 * rgb)
    else:
        data[:, :, :3] = rgb
    return Image.fromarray(data)


def composition_screen(project, identifier, seconds, settings=None):
    settings = settings or {}
    palette = {
        "background": "#07151d",
        "lines": None,
        "text": None,
        **settings.get("palette", {}),
    }
    image = Image.new("RGBA", SIZE, palette["background"])
    samples = samples_at(project, identifier, seconds)
    components = sorted(
        (
            (name, value)
            for name, value in project["components"].items()
            if value["kind"] == "screen"
        ),
        key=lambda item: item[1]["data"]["order"],
    )
    for name, component in components:
        layer = component["data"]["layer"]
        style = {
            "visible": True,
            "opacity": 1,
            "x": 0,
            "y": 0,
            "color": None,
            "source": None,
        }
        style.update(component["data"].get("style", {}))
        style.update(settings.get("layers", {}).get(layer, {}))
        sample = samples.get(name)
        if style["source"] is not None:
            source = list(LABELS)[style["source"]]
            binding = resolve_composition(project, source)["bindings"].get(name)
            if binding:
                clip = project["clips"][binding["clip"]]
                sample = (clip, (seconds / clip["duration"]) % 1)
        if not sample or not style["visible"]:
            continue
        clip, phase = sample
        pixels = clip["data"].get("frames")
        frame = min(
            len(pixels) - 1 if pixels else 47,
            int(phase * (len(pixels) if pixels else 48)),
        )
        surface = Image.new("RGBA", SIZE)
        if pixels:
            for x, y, color in pixels[frame]:
                surface.putpixel((x, y), ImageColor.getcolor(color, "RGBA"))
            if style["color"]:
                surface = tinted(surface, style["color"])
        else:
            layers = draw_clip(layer, clip["data"]["generator"], frame / 48)
            if layer in {"background", "activity"}:
                if layer == "background":
                    surface.paste(palette["background"], (0, 0, *SIZE))
                for role in ("lines", "text"):
                    content = layers[f"{layer}-{role}"]
                    if palette[role]:
                        content = tinted(content, palette[role], True)
                    surface = Image.alpha_composite(surface, content)
            else:
                surface = layers[layer]
                if style["color"]:
                    surface = tinted(surface, style["color"])
        surface.putalpha(
            surface.getchannel("A").point(
                lambda value, opacity=style["opacity"]: round(value * opacity)
            )
        )
        image.alpha_composite(surface, (style["x"], style["y"]))
    return image


def local_matrices(model, source, phase):
    armature = model["armature"]
    action = model["actions"][source]
    armature.animation_data.action = action
    armature.animation_data.action_slot = action.slots[0]
    start, end = action.frame_range
    frame = start + phase * (end - start)
    bpy.context.scene.frame_set(math.floor(frame), subframe=frame % 1)
    return {
        name: (
            armature.pose.bones[parent].matrix.inverted()
            @ armature.pose.bones[name].matrix
            if parent
            else armature.pose.bones[name].matrix.copy()
        )
        for name, parent in PARENTS.items()
    }


def rotation_at(frames, seconds):
    index = bisect_right([frame["time"] for frame in frames], seconds)
    left, right = frames[max(0, index - 1)], frames[min(index, len(frames) - 1)]
    a = Euler(tuple(math.radians(v) for v in left["rotation"]), "XYZ").to_quaternion()
    b = Euler(tuple(math.radians(v) for v in right["rotation"]), "XYZ").to_quaternion()
    return (
        a.slerp(b, (seconds - left["time"]) / (right["time"] - left["time"]))
        if right["time"] > left["time"]
        else a
    )


def apply_composition(model, project, identifier, phase, screen=None):
    """Compose joint-local channels without solving or moving rig attachment points."""
    duration = resolve_composition(project, identifier)["duration"]
    samples = samples_at(project, identifier, phase * duration)
    if "composition_rest" not in model:
        model["composition_rest"] = local_matrices(model, "idle", 0)
    rest = model["composition_rest"]
    targets = {name: matrix.copy() for name, matrix in rest.items()}
    sources = {}
    for component, (clip, position) in samples.items():
        specification = project["components"][component]
        if specification["kind"] != "rig":
            continue
        data = clip["data"]
        if "source" in data:
            key = (data["source"], position)
            if key not in sources:
                sources[key] = local_matrices(model, *key)
            for name in specification["data"]["nodes"]:
                targets[name] = sources[key][name].copy()
        else:
            rotation = rotation_at(data["keyframes"], position * clip["duration"])
            for name in specification["data"]["nodes"]:
                location, _, scale = rest[name].decompose()
                targets[name] = Matrix.LocRotScale(location, rotation, scale)
    armature = model["armature"]
    armature.animation_data.action = None
    world = {}
    for name, parent in PARENTS.items():
        world[name] = world[parent] @ targets[name] if parent else targets[name]
        bone = armature.pose.bones[name]
        args = (
            {}
            if parent is None
            else {
                "parent_matrix": world[parent],
                "parent_matrix_local": bone.parent.bone.matrix_local,
            }
        )
        bone.matrix_basis = bone.bone.convert_local_to_pose(
            world[name], bone.bone.matrix_local, invert=True, **args
        )
    bpy.context.view_layer.update()
    for node in [
        model["cable"],
        *(model["nodes"][name] for name in ("server", "keyboard", "keyboard.L")),
    ]:
        node.hide_render = node.hide_viewport = True
    for socket in model["emission"].values():
        socket.default_value = 0
    for component, (clip, position) in samples.items():
        specification = project["components"][component]
        if specification["kind"] == "visibility":
            name = specification["data"]["node"]
            node = model["cable"] if name == "cable" else model["nodes"][name]
            node.hide_render = node.hide_viewport = not clip["data"]["visible"]
        elif specification["kind"] == "emission":
            model["emission"][
                specification["data"]["material"]
            ].default_value = sample_curve(
                clip["data"]["keyframes"], position * clip["duration"]
            )
    matrices = {
        name: np.asarray(model["nodes"][name].matrix_world).copy() for name in PARENTS
    }
    ports = model["metadata"]["ports"]
    pose = RigPose(
        matrices,
        {},
        identifier,
        phase,
        (0, 0),
        point(matrices["hand.R"], ports["wrist"]),
        np.asarray(ports["server"]),
    )
    for vertex, position in zip(
        model["cable"].data.splines[0].points, cable_points(pose)
    ):
        vertex.co = (*position, 1)
    image = composition_screen(project, identifier, phase * duration, screen)
    model["texture"].pixels.foreach_set(
        np.flipud(np.asarray(image, dtype=np.float32) / 255).flatten()
    )
    model["texture"].update()
    bpy.context.view_layer.update()
    return image

"""Evaluate authored composition layers against saved Blender actions."""

import math
from bisect import bisect_right

import bpy
import numpy as np
from mathutils import Euler, Matrix, Vector
from PIL import Image, ImageColor

from .animation import resolve_composition
from .armature import BONE_BASIS
from .emission import sample_curve
from .placement import place
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
            seconds
            * composition["properties"].get("animationSpeed", 1)
            / composition["duration"]
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


def composition_screen(project, identifier, seconds, settings=None, gaze=(0, 0)):
    composition = resolve_composition(project, identifier)
    assigned = project.get("screens", {}).get(composition.get("screen"), {})
    settings = assigned.get("data", settings) or {}
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
        key=lambda item: (
            settings.get("layers", {})
            .get(item[1]["data"]["layer"], {})
            .get("order", item[1]["data"]["order"])
        ),
    )
    for name, component in components:
        layer = component["data"]["layer"]
        source_layer = "eyes" if layer in ("eyeLeft", "eyeRight") else layer
        style = {
            "visible": True,
            "opacity": 1,
            "x": 0,
            "y": 0,
            "color": None,
            "source": None,
            "mirrorX": False,
            "mirrorY": False,
            "scale": 1,
            "rotation": 0,
        }
        style.update(component["data"].get("style", {}))
        style.update(settings.get("layers", {}).get(layer, {}))
        sample = samples.get(name)
        if style["source"] is not None:
            source = [
                "idle",
                "move",
                "move",
                "waving",
                "jumping",
                "failed",
                "waiting",
                "running",
                "review",
                "look",
            ][style["source"]]
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
            layers = draw_clip(source_layer, clip["data"]["generator"], frame / 48)
            if layer in {"background", "activity"}:
                if layer == "background":
                    surface.paste(palette["background"], (0, 0, *SIZE))
                for role in ("lines", "text"):
                    content = layers[f"{layer}-{role}"]
                    if palette[role]:
                        content = tinted(content, palette[role], True)
                    surface = Image.alpha_composite(surface, content)
            else:
                surface = layers[source_layer]
                if style["color"]:
                    surface = tinted(surface, style["color"])
        half_eye = layer in ("eyeLeft", "eyeRight")
        mirrored_eye = layer == "eyeRight" and settings.get("eyeMode") == "mirrored"
        width = 48 if half_eye else 96
        destination_x = 48 if layer == "eyeRight" else 0
        source_x = 48 if layer == "eyeRight" and not mirrored_eye else 0
        surface = surface.crop((source_x, 0, source_x + width, 64))
        if bool(style["mirrorX"]) != mirrored_eye:
            surface = surface.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
        if style["mirrorY"]:
            surface = surface.transpose(Image.Transpose.FLIP_TOP_BOTTOM)
        scale = style["scale"]
        if scale != 1:
            surface = surface.resize(
                (max(1, round(width * scale)), max(1, round(64 * scale))),
                Image.Resampling.NEAREST,
            )
        if style["rotation"]:
            surface = surface.rotate(
                -style["rotation"], resample=Image.Resampling.NEAREST, expand=True
            )
        surface.putalpha(
            surface.getchannel("A").point(
                lambda value, opacity=style["opacity"]: round(value * opacity)
            )
        )
        follow = style.get("followHead", clip["data"].get("generator") == "look")
        dx, dy = gaze if layer.startswith("eye") and follow else (0, 0)
        image.alpha_composite(
            surface,
            (
                round(destination_x + width / 2 + style["x"] + dx - surface.width / 2),
                round(32 + style["y"] + dy - surface.height / 2),
            ),
        )
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


def blend_samples(points, angle):
    angle %= 360
    ordered = sorted(points, key=lambda value: value["heading"] % 360)
    for index, left in enumerate(ordered):
        right = ordered[(index + 1) % len(ordered)]
        start, end = left["heading"] % 360, right["heading"] % 360
        span = (end - start) % 360 or 360
        offset = (angle - start) % 360
        if offset <= span:
            weight = offset / span
            return [(left["source"], 1 - weight), (right["source"], weight)]
    raise ValueError("Empty locomotion blend space")


def blend_matrices(a, b, weight):
    ap, aq, scale = a.decompose()
    bp, bq, _ = b.decompose()
    return Matrix.LocRotScale(ap.lerp(bp, weight), aq.slerp(bq, weight), scale)


def apply_composition(model, project, identifier, phase, screen=None, context=True):
    """Compose joint-local channels without solving or moving rig attachment points."""
    composition = resolve_composition(project, identifier)
    duration = composition["duration"] / composition["properties"].get(
        "animationSpeed", 1
    )
    place(model, 0)
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
        if "lookAt" in data:
            settings = data["lookAt"]
            body = targets["body"]
            location, rotation, scale = rest["head"].decompose()
            head = body @ Vector(location)
            heading = math.radians(composition["properties"].get("heading", 0))
            target = Matrix.Rotation(-heading, 4, "Z") @ Vector(settings["position"])
            body_rotation = (body @ BONE_BASIS.inverted()).to_quaternion()
            direction = body_rotation.inverted() @ (target - head)
            yaw = np.clip(math.atan2(direction.x, -direction.y), -0.72, 0.72)
            pitch = np.clip(
                -math.atan2(direction.z, math.hypot(direction.x, direction.y)),
                -0.4,
                0.4,
            )
            aimed = (
                body.to_quaternion().inverted()
                @ body_rotation
                @ Euler((pitch, 0, yaw), "XYZ").to_quaternion()
                @ BONE_BASIS.to_quaternion()
            )
            targets["head"] = Matrix.LocRotScale(
                location, rotation.slerp(aimed, settings["weight"]), scale
            )
        elif "blendSpace" in data:
            properties = composition["properties"]
            angle = properties.get(
                "travelHeading", properties.get("heading", 0)
            ) - properties.get("heading", 0)
            selected = blend_samples(data["blendSpace"], angle)
            poses = []
            for source, weight in selected:
                key = (source, position)
                if key not in sources:
                    sources[key] = local_matrices(model, *key)
                poses.append((sources[key], weight))
            for name in specification["data"]["nodes"]:
                targets[name] = blend_matrices(
                    poses[0][0][name], poses[1][0][name], poses[1][1]
                )
        elif "source" in data:
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
    if not context:
        return None
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
        point(matrices[ports.get("node", "hand.R")], ports["wrist"]),
        np.asarray(ports["server"]),
    )
    for vertex, position in zip(
        model["cable"].data.splines[0].points, cable_points(pose)
    ):
        vertex.co = (*position, 1)
    body_rotation = (world["body"] @ BONE_BASIS.inverted()).to_quaternion()
    head_rotation = (world["head"] @ BONE_BASIS.inverted()).to_quaternion()
    relative = body_rotation.inverted() @ head_rotation
    direction = relative @ Vector((0, -1, 0))
    gaze = (
        np.clip(math.atan2(direction.x, -direction.y) * 12, -8, 8),
        np.clip(
            -math.atan2(direction.z, math.hypot(direction.x, direction.y)) * 15, -6, 6
        ),
    )
    image = composition_screen(project, identifier, phase * duration, screen, gaze)
    model["texture"].pixels.foreach_set(
        np.flipud(np.asarray(image, dtype=np.float32) / 255).flatten()
    )
    model["texture"].update()
    from .effects import update_effects

    update_effects(model, project, identifier, phase)
    place(model, composition["properties"].get("heading", 0))
    return image

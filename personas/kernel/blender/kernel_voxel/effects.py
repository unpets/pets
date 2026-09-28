"""Deterministic local-space particle effects shared with the character runtime."""

import math

import bpy


def particle(effect, index, seconds):
    age = (seconds + index * effect["lifetime"] / effect["count"]) % effect["lifetime"]

    def seed(axis):
        return ((index + 1) * (axis * 193 + 137) % 997) / 498.5 - 1

    return (
        [
            offset
            + (effect["velocity"][axis] + seed(axis) * effect["spread"]) * age
            + effect["gravity"][axis] * age**2 / 2
            for axis, offset in enumerate(effect["offset"])
        ],
        effect["radius"] * math.sin(math.pi * age / effect["lifetime"]),
    )


def update_effects(model, project, identifier, phase):
    from .animation import playback_duration
    from .composition import samples_at

    pools = model.setdefault("effects", {})
    for objects in pools.values():
        for obj in objects:
            obj.hide_render = obj.hide_viewport = True
    samples = samples_at(
        project, identifier, phase * playback_duration(project, identifier)
    )
    for name, (clip, position) in samples.items():
        component = project["components"][name]
        if component["kind"] != "effect":
            continue
        effect = clip["data"]
        key = (name, clip["label"], str(effect))
        if key not in pools:
            color = tuple(int(effect["color"][i : i + 2], 16) / 255 for i in (1, 3, 5))
            material = bpy.data.materials.new(name)
            material.use_nodes = True
            shader = material.node_tree.nodes.get("Principled BSDF")
            shader.inputs["Base Color"].default_value = (*color, 1)
            shader.inputs["Emission Color"].default_value = (*color, 1)
            shader.inputs["Emission Strength"].default_value = 1
            pools[key] = []
            for node in component["data"]["nodes"]:
                for index in range(effect["count"]):
                    bpy.ops.mesh.primitive_cube_add(size=2)
                    obj = bpy.context.object
                    obj.name = f"{name}/{node}/{index}"
                    obj["pets_fx"] = True
                    obj.parent = model["nodes"][node]
                    obj.data.materials.append(material)
                    pools[key].append(obj)
        for index, obj in enumerate(pools[key]):
            location, scale = particle(
                effect, index % effect["count"], position * clip["duration"]
            )
            obj.location = location
            obj.scale = (scale,) * 3
            obj.hide_render = obj.hide_viewport = False


def key_effects(model, frame):
    for objects in model.get("effects", {}).values():
        for obj in objects:
            for path in ("location", "scale", "hide_render", "hide_viewport"):
                obj.keyframe_insert(path, frame=frame)

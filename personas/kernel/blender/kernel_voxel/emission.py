"""Reusable material intensity curves shared by Blender and runtime exports."""

from bisect import bisect_right


def sample_curve(frames, seconds):
    index = bisect_right([frame[0] for frame in frames], seconds)
    if index == 0:
        return frames[0][1]
    if index == len(frames):
        return frames[-1][1]
    (start, a), (end, b) = frames[index - 1 : index + 1]
    return a + (b - a) * (seconds - start) / (end - start)


def values_at(project, state, phase):
    from .animation import resolve_composition

    composition = resolve_composition(project, state)
    values = {
        component["data"]["material"]: 0.0
        for component in project["components"].values()
        if component["kind"] == "emission"
    }
    for component, binding in composition["bindings"].items():
        target = project["components"][component]
        if target["kind"] != "emission" or not binding["enabled"]:
            continue
        clip = project["clips"][binding["clip"]]
        cycles = (
            phase
            if binding["clock"] == "composition"
            else phase * composition["duration"] / clip["duration"]
        )
        cycles = cycles * binding["speed"] + binding["offset"]
        cycles = cycles % 1 if clip["looping"] else min(1, max(0, cycles))
        values[target["data"]["material"]] = sample_curve(
            clip["data"]["keyframes"], cycles * clip["duration"]
        )
    return values


def sockets(project):
    import bpy

    return {
        component["data"]["material"]: bpy.data.materials[component["data"]["material"]]
        .node_tree.nodes["Principled BSDF"]
        .inputs["Emission Strength"]
        for component in project["components"].values()
        if component["kind"] == "emission"
    }


def apply_values(targets, project, state, phase):
    for name, value in values_at(project, state, phase).items():
        targets[name].default_value = value


def bake_clips(project):
    import bpy

    from .armature import linear_keys

    targets = sockets(project)
    fps = bpy.context.scene.render.fps
    for identifier, clip in project["clips"].items():
        component = project["components"][clip["component"]]
        if component["kind"] != "emission":
            continue
        socket = targets[component["data"]["material"]]
        tree = socket.id_data
        tree.animation_data_create()
        action = bpy.data.actions.new(identifier)
        action.use_fake_user = True
        action["pets_emission_clip"] = identifier
        tree.animation_data.action = action
        for seconds, value in clip["data"]["keyframes"]:
            socket.default_value = value
            socket.keyframe_insert("default_value", frame=seconds * fps)
        linear_keys(action)
        action.asset_mark()
    for name, socket in targets.items():
        socket.id_data.animation_data.action = bpy.data.actions.new(f"Preview {name}")
    return targets


def read_clips(project):
    """Export the curves stored in the canonical .blend, including manual edits."""
    import bpy

    targets = sockets(project)
    fps = bpy.context.scene.render.fps
    for identifier, clip in project["clips"].items():
        if project["components"][clip["component"]]["kind"] != "emission":
            continue
        action = bpy.data.actions[identifier]
        curve = action.layers[0].strips[0].channelbags[0].fcurves[0]
        clip["data"]["keyframes"] = [
            [min(clip["duration"], max(0, float(key.co.x) / fps)), float(key.co.y)]
            for key in curve.keyframe_points
        ]
    for socket in targets.values():
        socket.id_data.animation_data_clear()
    return targets

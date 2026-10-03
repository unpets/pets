"""Render portable face and accessory layers against canonical bone frames."""

import json
import math
from bisect import bisect_right

import bpy
from mathutils import Matrix, Quaternion, Vector

from .animation import resolve_composition
from .armature import BONE_BASIS


def rotation(angles):
    x, y, z = (math.radians(v) for v in angles)
    return (
        Quaternion((1, 0, 0), x) @ Quaternion((0, 1, 0), y) @ Quaternion((0, 0, 1), z)
    )


def transform(value):
    return Matrix.LocRotScale(
        Vector(value["position"]), rotation(value["rotation"]), Vector(value["scale"])
    )


def sample(frames, seconds):
    i = bisect_right([frame["time"] for frame in frames], seconds)
    a, b = frames[max(0, i - 1)], frames[min(i, len(frames) - 1)]
    t = (
        0
        if a["time"] == b["time"]
        else max(0, min(1, (seconds - a["time"]) / (b["time"] - a["time"])))
    )
    return Matrix.LocRotScale(
        Vector(a["position"]).lerp(Vector(b["position"]), t),
        rotation(a["rotation"]).slerp(rotation(b["rotation"]), t),
        Vector(a["scale"]).lerp(Vector(b["scale"]), t),
    ), a["opacity"] + (b["opacity"] - a["opacity"]) * t


def create_mesh(component):
    geometry = component["data"]["geometry"]
    if geometry["type"] == "mesh":
        positions = geometry["positions"]
        vertices = [positions[i : i + 3] for i in range(0, len(positions), 3)]
        indices = geometry["indices"]
        faces = [indices[i : i + 3] for i in range(0, len(indices), 3)]
        mesh = bpy.data.meshes.new(component["label"])
        mesh.from_pydata(vertices, [], faces)
        mesh.update()
        obj = bpy.data.objects.new(component["label"], mesh)
        bpy.context.collection.objects.link(obj)
    else:
        if geometry["type"] == "sphere":
            bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=24, radius=0.5)
        elif geometry["type"] == "box":
            bpy.ops.mesh.primitive_cube_add(size=1)
        else:
            bpy.ops.mesh.primitive_plane_add(size=1)
        obj = bpy.context.object
        obj.name = component["label"]
    material = bpy.data.materials.new(component["label"])
    color = component["data"]["color"]
    rgb = tuple(int(color[i : i + 2], 16) / 255 for i in (1, 3, 5))
    material.diffuse_color = (*rgb, 1)
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*rgb, 1)
    shader.inputs["Emission Color"].default_value = (*rgb, 1)
    shader.inputs["Emission Strength"].default_value = 1
    obj.data.materials.append(material)
    obj.rotation_mode = "QUATERNION"
    obj.asset_mark()
    return obj


def update_mesh_layers(model, project, identifier, phase):
    from .composition import samples_at

    composition = resolve_composition(project, identifier)
    duration = composition["duration"] / composition["properties"].get(
        "animationSpeed", 1
    )
    samples = samples_at(project, identifier, phase * duration)
    assigned = project.get("screens", {}).get(composition.get("screen"), {})
    surface = assigned.get("surface", {})
    pool = model.setdefault(
        "mesh_layers",
        {
            obj["pets_mesh_component"]: obj
            for obj in bpy.context.scene.objects
            if "pets_mesh_component" in obj
        },
    )
    for part, visibility in model.get("mesh_hidden", {}).items():
        model["nodes"][part].hide_render, model["nodes"][part].hide_viewport = (
            visibility
        )
    hidden = {}
    identity = {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}
    for id, obj in list(pool.items()):
        if id not in project["components"]:
            bpy.data.objects.remove(obj, do_unlink=True)
            del pool[id]
    for id, component in project["components"].items():
        kind = component["kind"]
        if kind not in ("face-mesh", "attachment"):
            continue
        signature = json.dumps(component["data"], sort_keys=True)
        obj = pool.get(id)
        if obj is None or obj.get("pets_mesh_signature") != signature:
            if obj is not None:
                bpy.data.objects.remove(obj, do_unlink=True)
            obj = create_mesh(component)
            obj["pets_mesh_component"] = id
            obj["pets_mesh_signature"] = signature
            constraint = obj.constraints.new("COPY_TRANSFORMS")
            constraint.target = model["armature"]
            constraint.subtarget = (
                component["data"]["node"] if kind == "attachment" else "head"
            )
            constraint.mix_mode = "BEFORE_FULL"
            pool[id] = obj
        selected = samples.get(id)
        obj.hide_render = obj.hide_viewport = selected is None
        if selected is None:
            continue
        clip, position = selected
        matrix, opacity = sample(clip["data"]["keyframes"], position * clip["duration"])
        if kind == "face-mesh":
            anchor = (
                Matrix.Translation((0, -0.4665, 0.33))
                @ Matrix.Rotation(math.pi / 2, 4, "X")
                @ Matrix.Scale(1.166, 4)
            )
            matrix = (
                anchor
                @ transform(surface.get("placements", {}).get(id, identity))
                @ matrix
            )
        obj.matrix_basis = BONE_BASIS.inverted() @ matrix
        obj.data.materials[0].node_tree.nodes.get("Principled BSDF").inputs[
            "Alpha"
        ].default_value = opacity
        if kind == "attachment":
            for part in component["data"]["hides"]:
                original = model["nodes"][part]
                hidden.setdefault(part, (original.hide_render, original.hide_viewport))
                original.hide_render = original.hide_viewport = True
    model["mesh_hidden"] = hidden
    model["display"].hide_render = model["display"].hide_viewport = not surface.get(
        "canvas", True
    )
    bpy.context.view_layer.update()


def key_mesh_layers(model, frame):
    for obj in model.get("mesh_layers", {}).values():
        for path in (
            "location",
            "rotation_quaternion",
            "scale",
            "hide_render",
            "hide_viewport",
        ):
            obj.keyframe_insert(path, frame=frame)
        obj.data.materials[0].node_tree.nodes.get("Principled BSDF").inputs[
            "Alpha"
        ].keyframe_insert("default_value", frame=frame)
    for obj in [*model["nodes"].values(), model["display"]]:
        if obj.type == "MESH":
            obj.keyframe_insert("hide_render", frame=frame)
            obj.keyframe_insert("hide_viewport", frame=frame)

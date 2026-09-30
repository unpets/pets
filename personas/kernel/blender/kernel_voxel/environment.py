"""Independent environment asset library and scene instances, in metres with Z up."""

import json
import math
from pathlib import Path

import bpy

DOCUMENT = Path(__file__).resolve().parents[4] / "resources" / "environment.json"


def build_environment(out):
    document = json.loads(DOCUMENT.read_text())
    assets = {}
    for key, asset in document["assets"].items():
        collection = bpy.data.collections.new(f"Environment/{key}")
        for index, part in enumerate(asset["parts"]):
            if part["shape"] == "box":
                bpy.ops.mesh.primitive_cube_add(size=1)
                obj = bpy.context.object
                obj.scale = part["size"]
            else:
                bpy.ops.mesh.primitive_cone_add(
                    vertices=24,
                    radius1=part["size"][0],
                    radius2=part["size"][1],
                    depth=part["size"][2],
                )
                obj = bpy.context.object
            obj.name = f"{key}/{index}"
            obj.location = part["position"]
            obj.rotation_euler = [
                math.radians(angle) for angle in part.get("rotation", [0, 0, 0])
            ]
            material = bpy.data.materials.new(f"{key}/{index}")
            color = part["color"].lstrip("#")
            rgb = [int(color[i : i + 2], 16) / 255 for i in (0, 2, 4)]
            # Blender material values are linear; document colours are sRGB.
            material.diffuse_color = (
                *[
                    (c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
                    for c in rgb
                ],
                1,
            )
            obj.data.materials.append(material)
            for parent in list(obj.users_collection):
                parent.objects.unlink(obj)
            collection.objects.link(obj)
        assets[key] = collection
    library = out / "environment.blend"
    bpy.data.libraries.write(
        str(library.resolve()), set(assets.values()), fake_user=True
    )
    for collection in assets.values():
        bpy.data.collections.remove(collection)
    with bpy.data.libraries.load(str(library.resolve()), link=True) as (source, target):
        target.collections = source.collections
    linked = {
        collection.name.removeprefix("Environment/"): collection
        for collection in target.collections
    }
    for key, entry in document["objects"].items():
        obj = bpy.data.objects.new(entry["label"], None)
        obj.instance_type = "COLLECTION"
        obj.instance_collection = linked[entry["asset"]]
        obj.location = entry["position"]
        obj.rotation_euler = [math.radians(angle) for angle in entry["rotation"]]
        obj.scale = entry["scale"]
        obj["pets_environment"] = key
        obj["pets_environment_enabled"] = entry["enabled"]
        obj["pets_environment_modes"] = json.dumps(
            [
                mode
                for mode, binding in document["bindings"].items()
                if binding["object"] == key
            ]
        )
        bpy.context.scene.collection.objects.link(obj)
    (out / "environment.json").write_text(json.dumps(document, indent=2) + "\n")


def update_environment(state, frame=None):
    for obj in bpy.context.scene.objects:
        if "pets_environment" not in obj:
            continue
        modes = json.loads(obj["pets_environment_modes"])
        hidden = not obj["pets_environment_enabled"] or bool(
            modes and state not in modes
        )
        obj.hide_render = hidden
        obj.hide_viewport = hidden
        if frame is not None:
            obj.keyframe_insert("hide_render", frame=frame)
            obj.keyframe_insert("hide_viewport", frame=frame)

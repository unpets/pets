"""Character placement rotates the rig and attached scene context together."""

import math

import bpy
from mathutils import Matrix


def placement_root(model):
    if "placement" not in model:
        root = bpy.data.objects.new("Character placement", None)
        bpy.context.collection.objects.link(root)
        objects = {model["armature"], model["cable"], *model["nodes"].values()}
        for obj in objects:
            if obj.parent is None:
                matrix = obj.matrix_world.copy()
                obj.parent = root
                obj.matrix_world = matrix
        model["placement"] = root
    return model["placement"]


def place(model, heading):
    root = placement_root(model)
    root.rotation_euler.z = math.radians(heading)
    bpy.context.view_layer.update()
    return Matrix.Rotation(math.radians(heading), 4, "Z")

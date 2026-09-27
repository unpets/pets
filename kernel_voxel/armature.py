"""Rigid bone parenting and reusable slotted actions for the mechanical rig."""

import math

import bpy
from mathutils import Matrix

from .rig import DURATIONS, FRAMES, PARENTS, pose_at

BONE_BASIS = Matrix.Rotation(math.pi / 2, 4, "X")


def create_armature(model):
    rest = pose_at("idle", 0)
    data = bpy.data.armatures.new("Kernel mechanical rig")
    armature = bpy.data.objects.new("Kernel rig", data)
    bpy.context.collection.objects.link(armature)
    armature.show_in_front = True
    bpy.context.view_layer.objects.active = armature
    armature.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    for name, parent in PARENTS.items():
        bone = data.edit_bones.new(name)
        bone.head = (0, 0, 0)
        bone.tail = (0, 0.2, 0)
        bone.matrix = Matrix(rest.matrices[name].tolist()) @ BONE_BASIS
        bone.length = {
            "upper_arm": 0.33,
            "forearm": 0.34,
            "thigh": 0.42,
            "shin": 0.42,
        }.get(name.split(".")[0], 0.2)
        if parent:
            bone.parent = data.edit_bones[parent]
            bone.use_connect = name.split(".")[0] in ("forearm", "hand", "shin", "foot")
    bpy.ops.object.mode_set(mode="OBJECT")
    for name in PARENTS:
        bone = data.bones[name]
        bone["joint"] = name
        obj = model["nodes"][name]
        obj.parent = armature
        obj.parent_type = "BONE"
        obj.parent_bone = name
        obj.matrix_parent_inverse = (
            Matrix.Translation((0, -bone.length, 0)) @ BONE_BASIS.inverted()
        )
        obj.matrix_basis = Matrix.Identity(4)
        armature.pose.bones[name].rotation_mode = "QUATERNION"
    model["armature"] = armature
    apply_armature_pose(model, rest)
    return armature


def apply_armature_pose(model, pose):
    armature = model["armature"]
    for name in PARENTS:
        armature.pose.bones[name].matrix = (
            Matrix(pose.matrices[name].tolist()) @ BONE_BASIS
        )
        bpy.context.view_layer.update()


def key_pose(armature, frame):
    for bone in armature.pose.bones:
        bone.keyframe_insert("location", frame=frame, group=bone.name)
        bone.keyframe_insert("rotation_quaternion", frame=frame, group=bone.name)


def linear_keys(action):
    for layer in action.layers:
        for strip in layer.strips:
            for channelbag in strip.channelbags:
                for curve in channelbag.fcurves:
                    for key in curve.keyframe_points:
                        key.interpolation = "LINEAR"


def bake_actions(model):
    armature = model["armature"]
    armature.animation_data_create()
    actions = {}
    fps = bpy.context.scene.render.fps
    for state, count in {**FRAMES, "look": 16}.items():
        action = bpy.data.actions.new(state)
        action.use_fake_user = True
        armature.animation_data.action = action
        duration = count * DURATIONS[state] / 1000
        for index in range(121):
            apply_armature_pose(model, pose_at(state, index / 120))
            key_pose(armature, index * duration * fps / 120)
        linear_keys(action)
        actions[state] = action
    armature.animation_data.action = actions["idle"]
    model["actions"] = actions
    return actions

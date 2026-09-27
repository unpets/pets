"""Rigid bone parenting and reusable slotted actions for the mechanical rig."""

import math

import bpy
from bpy_extras.anim_utils import action_ensure_channelbag_for_slot
from mathutils import Matrix

from .hands import HAND_BONES
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
        bone.length = (
            HAND_BONES[name].length
            if name in HAND_BONES
            else {
                "upper_arm": 0.33,
                "forearm": 0.34,
                "thigh": 0.42,
                "shin": 0.42,
            }.get(name.split(".")[0], 0.2)
        )
        if parent:
            bone.parent = data.edit_bones[parent]
            bone.use_connect = (
                name in HAND_BONES and HAND_BONES[name].segment > 0
            ) or name.split(".")[0] in ("forearm", "hand", "shin", "foot")
    bpy.ops.object.mode_set(mode="OBJECT")
    for name in PARENTS:
        bone = data.bones[name]
        bone["joint"] = name
        if name in HAND_BONES:
            spec = HAND_BONES[name]
            bone["digit"] = spec.digit
            bone["segment"] = spec.segment + 1
            bone["flexion_limit"] = spec.flexion_limit
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
    targets = {
        name: Matrix(pose.matrices[name].tolist()) @ BONE_BASIS for name in PARENTS
    }
    for name, parent in PARENTS.items():
        bone = armature.pose.bones[name]
        parent_args = (
            {}
            if parent is None
            else {
                "parent_matrix": targets[parent],
                "parent_matrix_local": bone.parent.bone.matrix_local,
            }
        )
        bone.matrix_basis = bone.bone.convert_local_to_pose(
            targets[name], bone.bone.matrix_local, invert=True, **parent_args
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
    from .animation import rig_source

    fps = bpy.context.scene.render.fps
    states = {**FRAMES, "look": 16}
    for state, count in {**FRAMES, "look": 16}.items():
        action = bpy.data.actions.new(state)
        action.use_fake_user = True
        armature.animation_data.action = action
        duration = count * DURATIONS[state] / 1000
        phases = {index / 120 for index in range(121)}
        for composition, frame_count in states.items():
            if not any(rig_source(composition, name) == state for name in PARENTS):
                continue
            samples = round(frame_count * DURATIONS[composition] / 1000 * fps)
            phases.update(
                index / (samples - 1 if composition == "jumping" else samples)
                for index in range(samples)
            )
        curves = {}
        rotations = {}
        for phase in sorted(phases):
            apply_armature_pose(model, pose_at(state, phase))
            for bone in armature.pose.bones:
                rotation = bone.rotation_quaternion.copy()
                if bone.name in rotations and rotation.dot(rotations[bone.name]) < 0:
                    rotation.negate()
                rotations[bone.name] = rotation
                for property_name, values in (
                    ("location", bone.location),
                    ("rotation_quaternion", rotation),
                ):
                    for index, value in enumerate(values):
                        key = (bone.name, property_name, index)
                        curves.setdefault(key, []).extend(
                            (phase * duration * fps, value)
                        )
        slot = action.slots.new(id_type="OBJECT", name="Kernel rig")
        bag = action_ensure_channelbag_for_slot(action, slot)
        for (name, property_name, index), coordinates in curves.items():
            curve = bag.fcurves.new(
                f'pose.bones["{name}"].{property_name}', index=index, group_name=name
            )
            curve.keyframe_points.add(len(coordinates) // 2)
            curve.keyframe_points.foreach_set("co", coordinates)
            # Ordered linear samples retain distinct subframe times.
        linear_keys(action)
        actions[state] = action
    armature.animation_data.action = actions["idle"]
    model["actions"] = actions
    component_actions(actions)
    layer_actions(actions)
    return actions


def component_actions(actions):
    """Expose each joint clip as a reusable slotted Blender action asset."""
    for state, source in actions.items():
        curves = source.layers[0].strips[0].channelbags[0].fcurves
        for name in PARENTS:
            action = bpy.data.actions.new(f"rig/{name}/{state}")
            action.use_fake_user = True
            action["pets_component"] = f"rig/{name}"
            action["pets_clip"] = f"rig/{name}/{state}"
            action.asset_mark()
            action.asset_data.description = f"{name} local motion from {state}"
            slot = action.slots.new(id_type="OBJECT", name="Kernel rig")
            bag = action_ensure_channelbag_for_slot(action, slot)
            prefix = f'pose.bones["{name}"]'
            for curve in curves:
                if not curve.data_path.startswith(prefix):
                    continue
                target = bag.fcurves.new(
                    curve.data_path, index=curve.array_index, group_name=name
                )
                target.keyframe_points.add(len(curve.keyframe_points))
                for original, copied in zip(
                    curve.keyframe_points, target.keyframe_points
                ):
                    copied.co = original.co
                    copied.interpolation = original.interpolation


def layer_actions(actions):
    """Create masked action assets for posture, either arm and head movement."""
    from .animation import RIG_LAYERS, rig_layer

    for layer, label in RIG_LAYERS.items():
        for state, source in actions.items():
            action = bpy.data.actions.new(f"layer/{layer}/{state}")
            action.use_fake_user = True
            action["pets_layer"] = layer
            action.asset_mark()
            action.asset_data.description = f"{label}: {state}"
            slot = action.slots.new(id_type="OBJECT", name="Kernel rig")
            bag = action_ensure_channelbag_for_slot(action, slot)
            prefixes = tuple(
                f'pose.bones["{name}"]' for name in PARENTS if rig_layer(name) == layer
            )
            for curve in source.layers[0].strips[0].channelbags[0].fcurves:
                if not curve.data_path.startswith(prefixes):
                    continue
                target = bag.fcurves.new(curve.data_path, index=curve.array_index)
                target.keyframe_points.add(len(curve.keyframe_points))
                for original, copied in zip(
                    curve.keyframe_points, target.keyframe_points
                ):
                    copied.co = original.co
                    copied.interpolation = original.interpolation


def compose_timeline(model, timeline):
    """Assemble nonoverlapping local-space masks as editable NLA tracks."""
    from .animation import RIG_LAYERS, rig_layer, rig_source

    animation = model["armature"].animation_data
    animation.action = None
    for layer, label in RIG_LAYERS.items():
        track = animation.nla_tracks.new()
        track.name = label
        representative = next(name for name in PARENTS if rig_layer(name) == layer)
        for state in [*FRAMES, "look"]:
            frames = [
                sample["frame"] for sample in timeline if sample["state"] == state
            ]
            source = rig_source(state, representative)
            action = bpy.data.actions[f"layer/{layer}/{source}"]
            strip = track.strips.new(state, frames[0], action)
            strip.action_slot = action.slots[0]
            strip.blend_type = "REPLACE"
            strip.extrapolation = "NOTHING"
            end = frames[-1] + (0 if state == "jumping" else 1)
            strip.scale = (end - frames[0]) / (
                strip.action_frame_end - strip.action_frame_start
            )
            # Distinct cut boundaries avoid evaluating two strips on the same frame.
            strip.frame_end = end + (0.0001 if state == "jumping" else -0.0001)

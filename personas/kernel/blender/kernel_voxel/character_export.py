"""Export a rigidly skinned character and synchronized in-place motion library."""

import math

import bpy
from mathutils import Matrix

from .animation import playback_duration
from .armature import key_pose, linear_keys
from .composition import apply_composition, local_matrices
from .rig import DURATIONS, LOCOMOTION, PARENTS, SOURCE_MOTIONS
from .scene import sample_source


def export_character(model, path):
    source = model["armature"]
    source.data.pose_position = "REST"
    bpy.context.view_layer.update()
    armature = source.copy()
    armature.data = source.data.copy()
    armature.name = "Kernel skeleton"
    armature.parent = None
    armature.matrix_world = Matrix.Identity(4)
    armature.animation_data_clear()
    armature.animation_data_create()
    bpy.context.collection.objects.link(armature)
    objects = [armature]
    meshes = []
    for name, original in [
        *((name, model["nodes"][name]) for name in PARENTS),
        ("head", model["display"]),
    ]:
        obj = bpy.data.objects.new(original.name + " skin", original.data.copy())
        bpy.context.collection.objects.link(obj)
        obj.data.transform(original.matrix_world)
        obj.vertex_groups.new(name=name).add(
            list(range(len(obj.data.vertices))), 1, "REPLACE"
        )
        meshes.append(obj)
        objects.append(obj)
    source.data.pose_position = "POSE"
    armature.data.pose_position = "POSE"
    bpy.ops.object.select_all(action="DESELECT")
    for mesh in meshes:
        mesh.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.join()
    mesh = meshes[0]
    mesh.name = "Kernel character"
    mesh.parent = armature
    modifier = mesh.modifiers.new("Mechanical skin", "ARMATURE")
    modifier.object = armature
    modifier.show_viewport = False
    bpy.ops.object.select_all(action="DESELECT")
    armature.select_set(True)
    bpy.context.view_layer.objects.active = armature
    bpy.ops.object.mode_set(mode="EDIT")
    root = armature.data.edit_bones.new("root")
    root.head, root.tail = (0, 0, 0), (0, 0, 0.2)
    armature.data.edit_bones["body"].parent = root
    bpy.ops.object.mode_set(mode="OBJECT")
    armature["pets_motion_space"] = "in-place"
    armature["pets_locomotion"] = dict(LOCOMOTION)
    actions = []
    project = model["project"]
    specifications = [
        (name, playback_duration(project, name), True)
        for name in project["compositions"]
    ]
    specifications += [
        (name, SOURCE_MOTIONS[name] * DURATIONS[name] / 1000, False)
        for name in LOCOMOTION
        if name != "move"
    ]
    try:
        for identifier, duration, composed in specifications:
            action = bpy.data.actions.new(f"character/{identifier}")
            actions.append(action)
            count = max(2, math.ceil(duration * 60))
            for index in range(count + 1):
                phase = index / count
                if composed:
                    apply_composition(model, project, identifier, phase, context=False)
                else:
                    local_matrices(model, identifier, phase)
                armature.animation_data.action = action
                for name in PARENTS:
                    armature.pose.bones[name].rotation_mode = "QUATERNION"
                    armature.pose.bones[name].matrix_basis = source.pose.bones[
                        name
                    ].matrix_basis.copy()
                key_pose(
                    armature, index * duration * bpy.context.scene.render.fps / count
                )
            linear_keys(action)
            track = armature.animation_data.nla_tracks.new()
            track.name = identifier
            track.strips.new(identifier, 0, action)
        armature.animation_data.action = None
        sample_source(model, "idle", 0)
        modifier.show_viewport = True
        bpy.ops.object.select_all(action="DESELECT")
        armature.select_set(True)
        mesh.select_set(True)
        bpy.ops.export_scene.gltf(
            filepath=str(path.resolve()),
            export_format="GLB",
            use_selection=True,
            export_yup=True,
            export_animations=True,
            export_animation_mode="NLA_TRACKS",
            export_force_sampling=True,
            export_frame_range=False,
            export_extras=True,
            export_skins=True,
            export_all_influences=False,
        )
    finally:
        for obj in (mesh, armature):
            bpy.data.objects.remove(obj, do_unlink=True)
        for action in actions:
            bpy.data.actions.remove(action)
        sample_source(model, "idle", 0)

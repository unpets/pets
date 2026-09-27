"""Export the canonical Blender scene as glTF clips and web display data."""

import json

import numpy as np
from PIL import Image

from .rig import DURATIONS, FRAMES, cable_points
from .scene import sample_source
from .screen import framebuffer


def export_site(model, site_out):
    import bpy

    site_out.mkdir(parents=True, exist_ok=True)
    assets = site_out / "assets"
    assets.mkdir(exist_ok=True)
    sample_source(model, "idle", 0)
    model["texture"].pack()
    bpy.ops.object.select_all(action="DESELECT")
    for obj in [model["armature"], *model["nodes"].values(), model["display"]]:
        obj.hide_viewport = False
        obj.hide_set(False)
        obj.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=str((assets / "kernel.glb").resolve()),
        export_format="GLB",
        use_selection=True,
        export_yup=False,
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_anim_single_armature=True,
        export_force_sampling=False,
        export_frame_range=False,
        export_extras=True,
    )
    data = {
        "version": model["metadata"]["version"],
        "up": "Z",
        "voxelSize": 0.035,
        "voxelCount": model["voxel_count"],
        "screenSize": [96, 64],
        "ports": model["metadata"]["ports"],
        "states": {},
    }
    screen_sheet = Image.new("RGB", (96 * 48, 64 * 10))
    for row, (state, count) in enumerate({**FRAMES, "look": 16}.items()):
        samples = []
        for i in range(121):
            t = i / 120
            p = sample_source(model, state, t, update_display=False)
            transforms = {}
            for name, m in p.matrices.items():
                from mathutils import Matrix

                loc, quat, _scale = Matrix(m.tolist()).decompose()
                transforms[name] = {
                    "p": [round(x, 6) for x in loc],
                    "q": [round(x, 7) for x in (quat.x, quat.y, quat.z, quat.w)],
                }
            samples.append(
                {"parts": transforms, "cable": np.round(cable_points(p), 6).tolist()}
            )
        for i in range(48):
            t = i / 48
            p = sample_source(model, state, t, update_display=False)
            screen_sheet.paste(framebuffer(state, t, p.gaze), (96 * i, 64 * row))
        data["states"][state] = {
            "duration": count * DURATIONS[state] / 1000,
            "frames": count,
            "screenRow": row,
            "samples": samples,
        }
    (assets / "animations.json").write_text(json.dumps(data, separators=(",", ":")))
    screen_sheet.save(assets / "screens.png", optimize=True)
    return data

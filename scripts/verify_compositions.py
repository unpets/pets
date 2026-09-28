"""Verify layered Blender playback and editable child composition baking."""

import argparse
import json
from pathlib import Path
from tempfile import TemporaryDirectory

import bpy
import numpy as np
from kernel_voxel.compose import bake_project
from kernel_voxel.composition import apply_composition, composition_screen
from kernel_voxel.rig import PARENTS
from kernel_voxel.scene import load_source, sample_source


def verify(source):
    model = load_source(source, "auto")
    project = model["project"]
    for name in ("idle", "waving", "look", "running", "review", "waiting"):
        for phase in (0, 0.25, 0.75):
            sample_source(model, name, phase)
            expected = {
                name: np.array(model["nodes"][name].matrix_world) for name in PARENTS
            }
            apply_composition(model, project, name, phase)
            for node, matrix in expected.items():
                np.testing.assert_allclose(
                    np.array(model["nodes"][node].matrix_world),
                    matrix,
                    atol=2e-5,
                    err_msg=f"{name}/{phase}/{node}",
                )
    project["compositions"]["child"] = {
        "label": "Child",
        "parent": "idle",
        "duration": 0.2,
        "bindings": {
            "rig/head": {
                "clip": "rig/head/look",
                "clock": "composition",
                "speed": 1.0,
                "offset": 0.0,
                "enabled": True,
            }
        },
    }
    project["compositions"]["target"] = {
        "label": "Target",
        "parent": "idle",
        "duration": 0.2,
        "bindings": {
            "rig/head": {
                "clip": "rig/head/lookat",
                "clock": "independent",
                "speed": 1,
                "offset": 0,
                "enabled": True,
            }
        },
    }
    for side in ("Left", "Right"):
        project["components"][f"screen/eye{side}"] = {
            "label": f"{side} eye",
            "kind": "screen",
            "data": {"layer": f"eye{side}", "family": "eyes", "order": 2},
        }
    project["clips"]["custom-eye"] = {
        "label": "Custom eye",
        "component": "screen/eyeLeft",
        "duration": 1,
        "looping": True,
        "data": {"frames": [[[20, 30, "#ff8800"]]]},
    }
    project["screens"] = {
        "custom": {
            "label": "Custom face",
            "data": {"eyeMode": "mirrored", "layers": {}},
            "bindings": {
                f"screen/eye{side}": {
                    "clip": "custom-eye",
                    "clock": "independent",
                    "speed": 1,
                    "offset": 0,
                    "enabled": True,
                }
                for side in ("Left", "Right")
            },
        }
    }
    project["compositions"]["child"]["screen"] = "custom"
    mirrored = composition_screen(project, "child", 0)
    assert mirrored.getpixel((20, 30)) == (255, 136, 0, 255)
    assert mirrored.getpixel((75, 30)) == (255, 136, 0, 255)
    for x in (-3, 3):
        project["clips"]["rig/head/lookat"]["data"]["lookAt"]["position"] = [x, -4, 2.2]
        apply_composition(model, project, "target", 0.5)
        relative = (
            model["nodes"]["body"].matrix_world.inverted()
            @ model["nodes"]["head"].matrix_world
        )
        from mathutils import Vector

        forward = relative.to_quaternion() @ Vector((0, -1, 0))
        assert forward.x * x > 0.5, "Baked Lookat must face its scene target"
    with TemporaryDirectory(prefix="pets-compositions-") as directory:
        output = Path(directory)
        path = bake_project(source, project, output, ["child", "target"], "auto")
        bpy.ops.wm.open_mainfile(filepath=str(path))
        assert bpy.context.scene.frame_end == 24
        assert "composition/child" in bpy.data.actions
        assert "composition/target" in bpy.data.actions
        embedded = json.loads(bpy.data.texts["pets-animation.json"].as_string())
        assert embedded["compositions"]["child"]["parent"] == "idle"
        assert (output / "blend-screens/screen-0012.png").is_file()
    print("Authored joint transforms and child composition baking passed.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--blend", required=True, type=Path)
    verify(parser.parse_args().blend)

"""Verify layered Blender playback and editable child composition baking."""

import argparse
import json
from pathlib import Path
from tempfile import TemporaryDirectory

import bpy
import numpy as np
from kernel_voxel.compose import bake_project
from kernel_voxel.composition import apply_composition
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
    with TemporaryDirectory(prefix="pets-compositions-") as directory:
        output = Path(directory)
        path = bake_project(source, project, output, ["child"], "auto")
        bpy.ops.wm.open_mainfile(filepath=str(path))
        assert bpy.context.scene.frame_end == 12
        assert "composition/child" in bpy.data.actions
        embedded = json.loads(bpy.data.texts["pets-animation.json"].as_string())
        assert embedded["compositions"]["child"]["parent"] == "idle"
        assert (output / "blend-screens/screen-0012.png").is_file()
    print("Authored joint transforms and child composition baking passed.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--blend", required=True, type=Path)
    verify(parser.parse_args().blend)

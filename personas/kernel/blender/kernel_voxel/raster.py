"""Render frames from a saved Blender scene with premultiplied alpha reduction."""

import numpy as np
from PIL import Image

from .rig import CELL


def alpha_downsample(image, size=CELL):
    """Average associated color + coverage together. No ringing or chroma despill."""
    # Pillow RGBa is premultiplied; BOX has no negative lobes or exterior halo.
    result = image.convert("RGBa").resize(size, Image.Resampling.BOX).convert("RGBA")
    a = np.asarray(result).copy()
    a[a[:, :, 3] == 0, :3] = 0
    return Image.fromarray(a)


def render_states(source, out, record, states, device):
    import bpy

    from .cache import write_cache
    from .pipeline import STATES, state_cached, state_files, state_key
    from .scene import load_source, sample_source

    pending = [state for state in states if not state_cached(out, record, state)]
    if not pending:
        print("Reusing rendered frames", flush=True)
        return
    model = load_source(source, device)
    scene = bpy.context.scene
    for state in pending:
        count = STATES[state]
        folder, masters = (out / name / state for name in ("frames", "masters"))
        folder.mkdir(parents=True, exist_ok=True)
        masters.mkdir(parents=True, exist_ok=True)
        for i in range(count):
            phase = i / (count - 1 if state == "jumping" else count)
            sample_source(model, state, phase)
            scene.render.filepath = str((masters / f"{i:02d}.png").resolve())
            bpy.ops.render.render(write_still=True)
            with Image.open(scene.render.filepath) as image:
                frame = alpha_downsample(image)
                bounds = frame.getchannel("A").getbbox()
                if (
                    not bounds
                    or bounds[0] == 0
                    or bounds[1] == 0
                    or bounds[2] == CELL[0]
                    or bounds[3] == CELL[1]
                ):
                    raise ValueError(f"Empty or clipped sprite: {state}/{i}")
                frame.save(folder / f"{i:02d}.png", optimize=True)
            print(f"FRAME {state} {i + 1}/{count}", flush=True)
        write_cache(
            out / f"render-{state}.json",
            state_key(record, state),
            state_files(out, state),
        )

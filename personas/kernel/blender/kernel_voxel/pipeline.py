"""Resolve artifact dependencies and reuse outputs whose content is still valid."""

import json
from importlib.metadata import version

import numpy as np
from pets_core import fingerprint as core_fingerprint

from . import __version__
from .cache import file_hash, fingerprint, read_cache, source_hash, write_cache
from .rig import DURATIONS, FOREARM_PORT, FRAMES, SERVER_PORT, pose_at
from .screen import LAYERS, PALETTE_LAYERS, framebuffer

STATES = {**FRAMES, "look": 16}


def model_key(scale, samples):
    return fingerprint(
        source_hash(
            "proportions.py",
            "climbing.py",
            "mesh_layers.py",
            "../../../../resources/kernel-rope-grips.json",
            "environment.py",
            "../../../../resources/environment.json",
            "model.py",
            "hands.py",
            "hand_mesh.py",
            "keyboard.py",
            "emission.py",
            "framing.py",
            "transforms.py",
            "surfaces.py",
            "armature.py",
            "rig.py",
            "screen.py",
            "animation.py",
            "outputs.py",
            "placement.py",
            "effects.py",
            "scene.py",
            "validation.py",
        ),
        __version__,
        version("bpy"),
        version("numpy"),
        version("Pillow"),
        scale,
        samples,
    )


def render_keys(scale, samples):
    common = fingerprint(
        source_hash(
            "proportions.py",
            "climbing.py",
            "mesh_layers.py",
            "../../../../resources/kernel-rope-grips.json",
            "environment.py",
            "../../../../resources/environment.json",
            "model.py",
            "hands.py",
            "animation.py",
            "outputs.py",
            "placement.py",
            "effects.py",
            "hand_mesh.py",
            "keyboard.py",
            "emission.py",
            "framing.py",
            "surfaces.py",
            "armature.py",
            "scene.py",
            "raster.py",
        ),
        version("bpy"),
        version("Pillow"),
        scale,
        samples,
        FOREARM_PORT.tolist(),
        SERVER_PORT.tolist(),
    )
    keys = {}
    for state, count in STATES.items():
        poses = []
        screens = []
        for i in range(121):
            p = pose_at(state, i / 120)
            poses.append(
                {
                    name: np.round(matrix, 9).tolist()
                    for name, matrix in p.matrices.items()
                }
            )
        for i in range(count):
            t = i / (count - 1 if state == "jumping" else count)
            p = pose_at(state, t)
            screens.append(fingerprint(framebuffer(state, t, p.gaze).tobytes().hex()))
        keys[state] = fingerprint(common, poses, screens)
    return keys


def ensure_source(out, scale, samples):
    key = model_key(scale, samples)
    cached = read_cache(out / "model-cache.json", key)
    if cached:
        print("Reusing Blender source", flush=True)
        return cached
    from .scene import build_source

    metadata = build_source(out, scale, samples)
    files = [
        out / name
        for name in (
            "kernel.blend",
            "environment.blend",
            "environment.json",
            "timeline.json",
            "blend-check.json",
        )
    ]
    files.extend(sorted((out / "blend-screens").glob("*.png")))
    return write_cache(
        out / "model-cache.json",
        key,
        files,
        metadata=metadata,
        states=render_keys(scale, samples),
    )


def source_record(path):
    cached = read_cache(path.parent / "model-cache.json")
    if not cached or cached["files"].get(path.name) != file_hash(path):
        raise ValueError(
            "Blender source is missing its matching build record; rebuild the model first"
        )
    return cached


def state_key(record, state):
    return record["states"][state]


def state_files(out, state):
    return [
        out / folder / state / f"{i:02d}.png"
        for folder in ("frames", "masters")
        for i in range(STATES[state])
    ]


def state_cached(out, record, state):
    return (
        read_cache(out / f"render-{state}.json", state_key(record, state)) is not None
    )


def export_viewer(source, site_out, record):
    key = fingerprint(
        record["files"][source.name],
        source_hash(
            "export.py",
            "mesh_layers.py",
            "scene.py",
            "screen.py",
            "animation.py",
            "emission.py",
            "outputs.py",
            "placement.py",
            "character_export.py",
            "composition.py",
            "effects.py",
        ),
    )
    site_out.mkdir(parents=True, exist_ok=True)
    if read_cache(site_out / "site-cache.json", key):
        print("Reusing viewer assets", flush=True)
        return
    from .export import export_site
    from .scene import load_source

    export_site(load_source(source), site_out)
    write_cache(
        site_out / "site-cache.json",
        key,
        [
            site_out / "assets" / name
            for name in (
                "kernel.glb",
                "kernel-character.glb",
                "animations.json",
                "screens.png",
                *(f"screen-{name}.png" for name in (*LAYERS, *PALETTE_LAYERS)),
            )
        ],
    )


def assemble(out, record):
    from .core_exports import assemble_atlas
    from .previews import make_previews

    for state in STATES:
        if not state_cached(out, record, state):
            raise ValueError(f"Missing or outdated rendered state: {state}")
    key = fingerprint(
        record["states"],
        record["metadata"],
        source_hash("previews.py", "pipeline.py"),
        core_fingerprint(),
        DURATIONS,
    )
    if read_cache(out / "atlas-cache.json", key):
        print("Reusing sprite atlas and previews", flush=True)
        return
    assemble_atlas(out / "frames", out / "kernel-spritesheet.png")
    make_previews(out)
    manifest = {
        **{k: v for k, v in record["metadata"].items() if k != "ports"},
        "sha256": file_hash(out / "kernel-spritesheet.png"),
        "source_blend_sha256": record["files"]["kernel.blend"],
        "alpha": "native RGBA; premultiplied BOX reduction; no chroma cleanup",
    }
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    write_cache(
        out / "atlas-cache.json",
        key,
        [
            out / "kernel-spritesheet.png",
            out / "manifest.json",
            out / "alpha-and-stills.png",
            *sorted(out.glob("*.gif")),
        ],
    )

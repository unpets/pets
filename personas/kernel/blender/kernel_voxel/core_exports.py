"""Describe Kernel's rendered assets to the Rust core export mechanisms."""

import json

from pets_core import execute

from . import __version__
from .rig import CELL, DURATIONS, FRAMES


def rendered_persona(source_checksum=""):
    return {
        "id": "kernel",
        "name": "Kernel",
        "version": __version__,
        "cell": CELL,
        "animations": {
            state: {"frames": count, "frameDurationMs": DURATIONS[state]}
            for state, count in {**FRAMES, "look": 16}.items()
        },
        "provenance": {"source_blend_sha256": source_checksum},
    }


def assemble_atlas(frames, output):
    return execute("export", "codex", rendered_persona(), frames, output)


def validate_atlas(build, atlas_name):
    manifest = json.loads((build / "manifest.json").read_text())
    execute(
        "validate",
        "codex",
        rendered_persona(),
        build / "frames",
        build / atlas_name,
        {atlas_name: manifest["sha256"]},
    )
    return manifest


def validate_shimeji(output, build):
    manifest = json.loads((build / "manifest.json").read_text())
    return execute(
        "validate",
        "shimeji",
        rendered_persona(manifest["source_blend_sha256"]),
        build / "frames",
        output,
    )

"""Export verified Kernel renders through the Shimeji adapter."""

import argparse
import json
from pathlib import Path

from pets_exports.frames import RenderedPersona
from pets_exports.shimeji import export_shimeji as export_frames
from pets_exports.shimeji import validate_package as validate_frames

from . import __version__
from .cache import read_cache
from .rig import CELL, DURATIONS, FRAMES

STATES = {**FRAMES, "look": 16}


def persona(source_sha=""):
    return RenderedPersona(
        "kernel", "Kernel", __version__, CELL, STATES, DURATIONS, source_sha
    )


def validate_package(output):
    return validate_frames(output, persona())


def export_shimeji(build, output):
    manifest = json.loads((build / "manifest.json").read_text())
    if manifest["version"] != __version__:
        raise ValueError("Render version does not match the Shimeji exporter")
    for state in STATES:
        if not read_cache(build / f"render-{state}.json"):
            raise ValueError(f"Missing or modified rendered frames: {state}")
    print(
        json.dumps(
            export_frames(build, output, persona(manifest["source_blend_sha256"]))
        )
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--build", type=Path, default=Path("build"))
    parser.add_argument("--output", type=Path, default=Path("build-shimeji"))
    args = parser.parse_args()
    export_shimeji(args.build, args.output)


if __name__ == "__main__":
    main()

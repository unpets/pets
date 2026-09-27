"""Export verified Kernel renders through the Rust core."""

import argparse
import json
from pathlib import Path

from pets_core import execute

from . import __version__
from .cache import read_cache
from .core_exports import rendered_persona
from .rig import FRAMES

STATES = {**FRAMES, "look": 16}


def export_shimeji(build, output):
    manifest = json.loads((build / "manifest.json").read_text())
    if manifest["version"] != __version__:
        raise ValueError("Render version does not match the Shimeji exporter")
    for state in STATES:
        if not read_cache(build / f"render-{state}.json"):
            raise ValueError(f"Missing or modified rendered frames: {state}")
    print(
        json.dumps(
            execute(
                "export",
                "shimeji",
                rendered_persona(manifest["source_blend_sha256"]),
                build / "frames",
                output,
            )
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

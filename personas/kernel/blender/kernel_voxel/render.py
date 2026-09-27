"""Build a canonical Blender source and generate only the requested artifact target."""

import argparse
import os
import subprocess
import sys
from pathlib import Path

from .pipeline import (
    STATES,
    assemble,
    ensure_source,
    export_viewer,
    source_record,
    state_cached,
)
from .raster import alpha_downsample  # Re-exported for image processing callers.

__all__ = ["alpha_downsample", "main"]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path("build"))
    parser.add_argument(
        "--site-output", type=Path, default=Path("personas/kernel/generated")
    )
    parser.add_argument(
        "--blend",
        type=Path,
        help="Use an existing verified Blender source without rebuilding it",
    )
    parser.add_argument("--scale", type=int, default=4)
    parser.add_argument("--samples", type=int, default=32)
    parser.add_argument(
        "--device",
        choices=("auto", "cpu", "optix", "cuda", "hip", "oneapi", "metal"),
        default="auto",
        help="Cycles backend; auto prefers an available GPU",
    )
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument(
        "--model-only", action="store_true", help="Build and verify the Blender source"
    )
    mode.add_argument(
        "--site-only",
        action="store_true",
        help="Export viewer assets from the Blender source",
    )
    mode.add_argument(
        "--render-only",
        action="store_true",
        help="Render selected states without assembly or web export",
    )
    mode.add_argument(
        "--assemble-only",
        action="store_true",
        help="Assemble existing verified frames without rendering or web export",
    )
    parser.add_argument("--states", nargs="+", choices=list(STATES))
    args = parser.parse_args()
    if args.render_only and not args.states:
        parser.error("--render-only requires --states")
    if args.states and not args.render_only:
        parser.error("--states requires --render-only")
    out = args.output
    out.mkdir(parents=True, exist_ok=True)
    source = args.blend or out / "kernel.blend"
    record = (
        source_record(source)
        if args.blend or args.assemble_only
        else ensure_source(out, args.scale, args.samples)
    )
    if args.model_only:
        return
    if args.site_only:
        export_viewer(source, args.site_output, record)
        return
    if args.assemble_only:
        assemble(out, record)
        return
    if args.render_only:
        from .raster import render_states

        render_states(source, out, record, args.states, args.device)
        return
    for state in STATES:
        if state_cached(out, record, state):
            print(f"Reusing frames: {state}", flush=True)
            continue
        command = [
            sys.executable,
            "-m",
            "kernel_voxel.render",
            "--render-only",
            "--blend",
            str(source),
            "--output",
            str(out),
            "--states",
            state,
            "--device",
            args.device,
        ]
        subprocess.run(
            command,
            check=True,
            env=dict(os.environ, OPENBLAS_NUM_THREADS="1", OMP_NUM_THREADS="8"),
            timeout=600,
        )
    assemble(out, record)
    export_viewer(source, args.site_output, record)
    print(f"Completed: {out}; viewer: {args.site_output}", flush=True)


if __name__ == "__main__":
    main()

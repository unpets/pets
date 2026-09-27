"""Verify the saved Blender source before generating downstream artifacts."""

import argparse
from pathlib import Path

from kernel_voxel.validation import verify

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--build", type=Path, default=Path("build"))
    verify(parser.parse_args().build)

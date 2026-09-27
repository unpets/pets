"""Validate release versions and package verified build outputs."""

import argparse
import hashlib
import json
import os
import re
import subprocess
import tomllib
import zipfile
from pathlib import Path

from PIL import Image

from kernel_voxel.rig import CELL, FRAMES

ROOT = Path(__file__).resolve().parents[1]
SEMVER = re.compile(r"(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)")


def release_version(tag=None):
    project = tomllib.loads((ROOT / "pyproject.toml").read_text())["project"]
    version = project["version"]
    if not SEMVER.fullmatch(version):
        raise ValueError(f"Invalid release version: {version}")
    for name in ("package.json", "web/package.json"):
        if json.loads((ROOT / name).read_text())["version"] != version:
            raise ValueError(f"Version mismatch in {name}")
    if tag and tag != f"v{version}":
        raise ValueError(f"Tag {tag} does not match v{version}")
    return version


def sha256(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def validate_pet(build):
    sheet_path = build / "kernel-spritesheet.png"
    manifest = json.loads((build / "manifest.json").read_text())
    if manifest["sha256"] != sha256(sheet_path):
        raise ValueError("Sprite sheet checksum does not match its manifest")
    occupied = set()
    with Image.open(sheet_path) as sheet:
        if sheet.mode != "RGBA" or sheet.size != (1536, 2288):
            raise ValueError("Invalid sprite sheet format")
        for state, count in {**FRAMES, "look": 16}.items():
            for index in range(count):
                row = list(FRAMES).index(state) if state != "look" else 9 + index // 8
                column = index if state != "look" else index % 8
                occupied.add((row, column))
                x, y = column * CELL[0], row * CELL[1]
                cell = sheet.crop((x, y, x + CELL[0], y + CELL[1]))
                with Image.open(build / "frames" / state / f"{index:02d}.png") as frame:
                    if (
                        frame.mode != "RGBA"
                        or frame.size != CELL
                        or frame.tobytes() != cell.tobytes()
                    ):
                        raise ValueError(f"Atlas mismatch: {state}/{index}")
                box = cell.getchannel("A").getbbox()
                if (
                    not box
                    or box[0] == 0
                    or box[1] == 0
                    or box[2] == CELL[0]
                    or box[3] == CELL[1]
                ):
                    raise ValueError(f"Empty or clipped frame: {state}/{index}")
        for row in range(11):
            for column in range(8):
                if (row, column) in occupied:
                    continue
                x, y = column * CELL[0], row * CELL[1]
                if (
                    sheet.crop((x, y, x + CELL[0], y + CELL[1]))
                    .getchannel("A")
                    .getbbox()
                ):
                    raise ValueError("Unused atlas cells must be transparent")
    return manifest


def files_under(root):
    return sorted(path for path in root.rglob("*") if path.is_file())


def archive(path, root, files):
    if not files:
        raise ValueError(f"Empty archive: {path.name}")
    with zipfile.ZipFile(
        path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6
    ) as output:
        for source in sorted(files):
            entry = zipfile.ZipInfo(
                source.relative_to(root).as_posix(), (1980, 1, 1, 0, 0, 0)
            )
            entry.compress_type = zipfile.ZIP_DEFLATED
            entry.external_attr = 0o100644 << 16
            output.writestr(entry, source.read_bytes())


def bundle(build, site, destination, version, assets):
    manifest = validate_pet(build)
    if manifest["version"] != version:
        raise ValueError("Rendered assets have the wrong release version")
    verification = json.loads((build / "blend-check.json").read_text())
    if not verification.get("ok"):
        raise ValueError("Blender scene verification did not pass")
    required = [build / "kernel.blend", build / "timeline.json", site / "index.html"]
    required.extend(
        assets / name for name in ("kernel.glb", "animations.json", "screens.png")
    )
    for path in required:
        if not path.is_file() or not path.stat().st_size:
            raise ValueError(f"Missing release output: {path}")
    if json.loads((assets / "animations.json").read_text())["version"] != version:
        raise ValueError("Viewer assets have the wrong release version")
    destination.mkdir(parents=True, exist_ok=True)
    if any(destination.iterdir()):
        raise ValueError("Release destination must be empty")
    prefix = f"kernel-{version}"
    packages = {
        "blender": (
            build,
            required[:2]
            + files_under(build / "blend-screens")
            + [build / "blend-check.json"],
        ),
        "pet": (
            build,
            [build / "kernel-spritesheet.png", build / "manifest.json"]
            + files_under(build / "frames")
            + files_under(build / "masters")
            + list(build.glob("*.gif")),
        ),
        "model": (
            assets,
            [
                assets / name
                for name in ("kernel.glb", "animations.json", "screens.png")
            ],
        ),
        "site": (site, files_under(site)),
    }
    for name, (root, files) in packages.items():
        archive(destination / f"{prefix}-{name}.zip", root, files)
    (destination / f"{prefix}.html").write_bytes((site / "index.html").read_bytes())
    commit = (
        os.environ.get("GITHUB_SHA")
        or subprocess.check_output(
            ["git", "rev-parse", "HEAD"], cwd=ROOT, text=True
        ).strip()
    )
    metadata = {
        "version": version,
        "commit": commit,
        "sprite_sha256": manifest["sha256"],
        "files": [
            {"name": path.name, "bytes": path.stat().st_size, "sha256": sha256(path)}
            for path in sorted(destination.iterdir())
        ],
    }
    (destination / "release.json").write_text(json.dumps(metadata, indent=2) + "\n")
    checksums = "".join(
        f"{sha256(path)}  {path.name}\n" for path in sorted(destination.iterdir())
    )
    (destination / "SHA256SUMS").write_text(checksums)
    print(json.dumps(metadata, indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["check", "bundle"])
    parser.add_argument("--tag")
    parser.add_argument("--build", type=Path, default=Path("build"))
    parser.add_argument("--site", type=Path, default=Path("dist"))
    parser.add_argument("--assets", type=Path, default=Path("web/public/assets"))
    parser.add_argument("--output", type=Path, default=Path("release"))
    args = parser.parse_args()
    version = release_version(args.tag)
    if args.command == "check":
        outputs = {
            "version": version,
            "tag": f"v{version}",
            "states": json.dumps([*FRAMES, "look"], separators=(",", ":")),
        }
        if output := os.environ.get("GITHUB_OUTPUT"):
            with Path(output).open("a") as stream:
                stream.writelines(f"{key}={value}\n" for key, value in outputs.items())
        print(json.dumps(outputs))
    else:
        bundle(args.build, args.site, args.output, version, args.assets)


if __name__ == "__main__":
    main()

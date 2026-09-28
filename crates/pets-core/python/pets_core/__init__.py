"""Python transport for the Pets Rust core CLI."""

import hashlib
import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path


def workspace_root():
    for root in Path(__file__).resolve().parents:
        if (root / "crates/pets-core/Cargo.toml").is_file():
            return root
    return None


def command():
    if binary := os.environ.get("PETS_EXPORT_BIN") or shutil.which("pets-export"):
        return [binary]
    root = workspace_root()
    if root is None:
        raise RuntimeError(
            "Install pets-export or set PETS_EXPORT_BIN to its executable"
        )
    return [
        "cargo",
        "run",
        "--manifest-path",
        str(root / "Cargo.toml"),
        "--locked",
        "--quiet",
        "-p",
        "pets-core",
        "--features",
        "cli",
        "--bin",
        "pets-export",
        "--",
    ]


def fingerprint():
    digest = hashlib.sha256()
    if root := workspace_root():
        core = root / "crates/pets-core"
        paths = [
            root / "Cargo.lock",
            core / "Cargo.toml",
            core / "src/persona.rs",
            core / "src/animation.rs",
        ]
        paths.extend(sorted((core / "src/export").glob("*.rs")))
        paths.extend(sorted((core / "src/bin").glob("*.rs")))
        for path in paths:
            digest.update(path.relative_to(root).as_posix().encode())
            digest.update(path.read_bytes())
    else:
        digest.update(Path(command()[0]).read_bytes())
    digest.update(Path(__file__).read_bytes())
    return digest.hexdigest()


def execute(operation, target, persona, frames, output, expected_files=None):
    args = command() + [
        operation,
        "--target",
        target,
        "--frames",
        str(Path(frames).resolve()),
        "--output",
        str(Path(output).resolve()),
    ]
    with tempfile.TemporaryDirectory(prefix="pets-export-") as temporary:
        if expected_files:
            checksums = Path(temporary) / "checksums.json"
            checksums.write_text(json.dumps(expected_files))
            args.extend(["--checksums", str(checksums)])
        result = subprocess.run(
            args, input=json.dumps(persona), text=True, capture_output=True, check=False
        )
    if result.returncode:
        raise RuntimeError(result.stderr.strip() or "Core export failed")
    return json.loads(result.stdout)


def animation_project(project):
    """Validate and normalize a reusable animation project with the Rust core."""
    result = subprocess.run(
        command() + ["project"],
        input=json.dumps(project),
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode:
        raise ValueError(result.stderr.strip() or "Invalid animation project")
    return json.loads(result.stdout)

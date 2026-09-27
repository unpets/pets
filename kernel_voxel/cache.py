"""Content-addressed stage records with verified output files."""

import hashlib
import json
from pathlib import Path


def file_hash(path):
    with Path(path).open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def fingerprint(*values):
    return hashlib.sha256(
        json.dumps(values, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()


def source_hash(*names):
    root = Path(__file__).resolve().parent
    return fingerprint({name: file_hash(root / name) for name in names})


def read_cache(path, key=None):
    try:
        record = json.loads(path.read_text())
        if key is not None and record["key"] != key:
            return None
        for name, checksum in record["files"].items():
            if file_hash(path.parent / name) != checksum:
                return None
        return record
    except (OSError, KeyError, ValueError):
        return None


def write_cache(path, key, files, **metadata):
    record = {
        "key": key,
        "files": {str(p.relative_to(path.parent)): file_hash(p) for p in files},
        **metadata,
    }
    path.write_text(json.dumps(record, indent=2) + "\n")
    return record

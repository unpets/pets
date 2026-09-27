"""Release gates protect version identity and portable downloads."""

import json
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

from scripts.release import archive, release_version, sha256


class ReleaseTests(unittest.TestCase):
    def test_release_rejects_wrong_tags_and_mismatched_manifests(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "web").mkdir()
            (root / "src-tauri").mkdir()
            (root / "src-tauri/Cargo.toml").write_text('[package]\nversion = "1.2.3"\n')
            (root / "pyproject.toml").write_text('[project]\nversion = "1.2.3"\n')
            for name in (
                "package.json",
                "web/package.json",
                "src-tauri/tauri.conf.json",
            ):
                (root / name).write_text(json.dumps({"version": "1.2.3"}))
            with patch("scripts.release.ROOT", root):
                self.assertEqual(release_version("v1.2.3"), "1.2.3")
                with self.assertRaises(ValueError):
                    release_version("v1.2.4")
                (root / "web/package.json").write_text('{"version":"1.2.2"}')
                with self.assertRaises(ValueError):
                    release_version("v1.2.3")

    def test_archives_preserve_relative_paths_and_ignore_input_order(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "source"
            source.mkdir()
            (source / "blend-screens").mkdir()
            scene = source / "kernel.blend"
            screen = source / "blend-screens/screen-0001.png"
            scene.write_bytes(b"scene")
            screen.write_bytes(b"frame")
            first, second = root / "first.zip", root / "second.zip"
            archive(first, source, [scene, screen])
            archive(second, source, [screen, scene])
            self.assertEqual(sha256(first), sha256(second))
            with zipfile.ZipFile(first) as package:
                self.assertEqual(
                    package.namelist(),
                    ["blend-screens/screen-0001.png", "kernel.blend"],
                )
                self.assertEqual(
                    package.read("blend-screens/screen-0001.png"), b"frame"
                )


if __name__ == "__main__":
    unittest.main()

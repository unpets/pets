"""Guard against stale artifacts and accidental work outside requested targets."""

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from kernel_voxel import render
from kernel_voxel.cache import fingerprint, read_cache, write_cache


class PipelineTests(unittest.TestCase):
    def test_modified_and_missing_outputs_invalidate_the_cache(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            output = root / "frame.png"
            record = root / "cache.json"
            output.write_bytes(b"verified frame")
            key = fingerprint("source", 32)
            write_cache(record, key, [output])
            self.assertIsNotNone(read_cache(record, key))
            self.assertIsNone(read_cache(record, fingerprint("changed source", 32)))
            output.write_bytes(b"modified frame")
            self.assertIsNone(read_cache(record, key))
            output.unlink()
            self.assertIsNone(read_cache(record, key))

    def test_targets_do_not_run_unrelated_generation(self):
        with tempfile.TemporaryDirectory() as folder:
            for mode, expected in [
                ("--model-only", None),
                ("--site-only", "viewer"),
                ("--assemble-only", "atlas"),
            ]:
                with (
                    self.subTest(mode=mode),
                    patch("sys.argv", ["kernel-render", mode, "--output", folder]),
                    patch.object(render, "ensure_source", return_value={}) as build,
                    patch.object(render, "source_record", return_value={}) as load,
                    patch.object(render, "export_viewer") as viewer,
                    patch.object(render, "assemble") as atlas,
                    patch.object(render.subprocess, "run") as subprocess,
                ):
                    render.main()
                    self.assertEqual(viewer.call_count, int(expected == "viewer"))
                    self.assertEqual(atlas.call_count, int(expected == "atlas"))
                    self.assertEqual(build.call_count, int(expected != "atlas"))
                    self.assertEqual(load.call_count, int(expected == "atlas"))
                    subprocess.assert_not_called()


if __name__ == "__main__":
    unittest.main()

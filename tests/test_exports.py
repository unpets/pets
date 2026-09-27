"""Check export format boundaries with persona-independent frame inputs."""

import json
import tempfile
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path

from kernel_voxel.core_exports import rendered_persona
from kernel_voxel.rig import CELL, FRAMES
from pets_core import execute
from PIL import Image

STATES = {**FRAMES, "look": 16}


class ExportTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.frames = self.root / "frames"
        self.persona = rendered_persona()
        self.persona.update(id="fixture", name="Fixture", version="1.0.0")
        for row, (state, count) in enumerate(STATES.items()):
            (self.frames / state).mkdir(parents=True)
            for index in range(count):
                image = Image.new("RGBA", CELL)
                image.paste((row * 20, index * 12, 120, 255), (20, 20, 160, 190))
                image.save(self.frames / state / f"{index:02d}.png")

    def test_adapters_preserve_frames_and_direction_references(self):
        root, frames, persona = self.root, self.frames, self.persona
        atlas_path = root / "atlas.png"
        report = execute("export", "codex", persona, frames, atlas_path)
        self.assertEqual(report["frames"], 73)
        self.assertTrue(
            execute("validate", "codex", persona, frames, atlas_path, report["files"])[
                "ok"
            ]
        )
        with Image.open(atlas_path) as atlas:
            self.assertEqual(atlas.size, (1536, 2288))
            with Image.open(frames / "look/15.png") as last:
                self.assertEqual(
                    atlas.crop((1344, 2080, 1536, 2288)).tobytes(), last.tobytes()
                )
            self.assertIsNone(atlas.crop((1152, 0, 1536, 208)).getbbox())
        for clip in persona["animations"].values():
            clip["frameDurationMs"] = 180
        output = root / "shimeji"
        execute("export", "shimeji", persona, frames, output)
        self.assertTrue(execute("validate", "shimeji", persona, frames, output)["ok"])
        actions = ET.parse(output / "img/Fixture/conf/actions.xml")
        ns = {"m": "http://www.group-finity.com/Mascot"}
        poses = actions.findall('.//m:Action[@Name="Walk"]/m:Animation/m:Pose', ns)
        self.assertEqual(len(poses), 8)
        self.assertEqual(poses[0].attrib["Image"], "/running-left-00.png")
        self.assertEqual(poses[0].attrib["ImageRight"], "/running-right-00.png")
        self.assertEqual(sum(int(p.attrib["Duration"]) for p in poses), 36)
        self.assertEqual(
            (output / "img/Fixture/idle-00.png").read_bytes(),
            (frames / "idle/00.png").read_bytes(),
        )

    def test_codex_rejects_invalid_inputs_and_damaged_output(self):
        atlas = self.root / "atlas.png"
        execute("export", "codex", self.persona, self.frames, atlas)
        with self.assertRaisesRegex(RuntimeError, "checksum mismatch"):
            execute(
                "validate",
                "codex",
                self.persona,
                self.frames,
                atlas,
                {"atlas.png": "0" * 64},
            )
        with Image.open(atlas) as image:
            damaged = image.copy()
        damaged.putpixel((1535, 0), (10, 20, 30, 255))
        damaged.save(atlas)
        with self.assertRaisesRegex(RuntimeError, "atlas pixels"):
            execute("validate", "codex", self.persona, self.frames, atlas)
        self.persona["cell"] = [96, 104]
        with self.assertRaisesRegex(RuntimeError, "192 by 208"):
            execute("export", "codex", self.persona, self.frames, atlas)

    def test_shimeji_rejects_changed_references_images_and_metadata(self):
        output = self.root / "shimeji"
        execute("export", "shimeji", self.persona, self.frames, output)
        paths = [
            output / "img/Fixture/conf/actions.xml",
            output / "img/Fixture/idle-00.png",
            output / "manifest.json",
        ]
        for path in paths:
            with self.subTest(path=path.name):
                original = path.read_bytes()
                if path.suffix == ".xml":
                    path.write_bytes(
                        original.replace(b"running-right-00", b"running-left-00")
                    )
                elif path.suffix == ".png":
                    path.write_bytes((self.frames / "waving/00.png").read_bytes())
                else:
                    metadata = json.loads(original)
                    metadata["version"] = "invalid"
                    path.write_text(json.dumps(metadata))
                with self.assertRaises(RuntimeError):
                    execute("validate", "shimeji", self.persona, self.frames, output)
                path.write_bytes(original)


if __name__ == "__main__":
    unittest.main()

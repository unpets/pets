"""Check export format boundaries with persona-independent frame inputs."""

import tempfile
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path

from pets_exports.codex import CELL, STATES, assemble_atlas
from pets_exports.frames import RenderedPersona
from pets_exports.shimeji import export_shimeji, validate_package
from PIL import Image


class ExportTests(unittest.TestCase):
    def test_adapters_preserve_frames_and_direction_references(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            frames = root / "frames"
            for row, (state, count) in enumerate(STATES.items()):
                (frames / state).mkdir(parents=True)
                for index in range(count):
                    image = Image.new("RGBA", CELL)
                    image.paste((row * 20, index * 12, 120, 255), (20, 20, 160, 190))
                    image.save(frames / state / f"{index:02d}.png")
            atlas_path = root / "atlas.png"
            assemble_atlas(frames, atlas_path)
            with Image.open(atlas_path) as atlas:
                self.assertEqual(atlas.size, (1536, 2288))
                with Image.open(frames / "look/15.png") as last:
                    self.assertEqual(
                        atlas.crop((1344, 2080, 1536, 2288)).tobytes(), last.tobytes()
                    )
                self.assertIsNone(atlas.crop((1152, 0, 1536, 208)).getbbox())
            persona = RenderedPersona(
                "fixture",
                "Fixture",
                "1.0.0",
                CELL,
                STATES,
                dict.fromkeys(STATES, 180),
                "source-checksum",
            )
            output = root / "shimeji"
            export_shimeji(root, output, persona)
            self.assertTrue(validate_package(output, persona)["ok"])
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


if __name__ == "__main__":
    unittest.main()

"""Codex v2 atlas layout and validation for rendered persona frames."""

import hashlib
import json

from PIL import Image

CELL = (192, 208)
FRAMES = {
    "idle": 6,
    "running-right": 8,
    "running-left": 8,
    "waving": 4,
    "jumping": 5,
    "failed": 8,
    "waiting": 6,
    "running": 6,
    "review": 6,
}
STATES = {**FRAMES, "look": 16}


def assemble_atlas(frames, output):
    atlas = Image.new("RGBA", (1536, 2288))
    for state, count in STATES.items():
        for index in range(count):
            row = list(FRAMES).index(state) if state != "look" else 9 + index // 8
            column = index if state != "look" else index % 8
            with Image.open(frames / state / f"{index:02d}.png") as frame:
                if frame.mode != "RGBA" or frame.size != CELL:
                    raise ValueError(f"Invalid Codex frame: {state}/{index}")
                atlas.paste(frame, (column * CELL[0], row * CELL[1]))
    atlas.save(output, optimize=True)


def validate_atlas(build, atlas_name):
    sheet_path = build / atlas_name
    manifest = json.loads((build / "manifest.json").read_text())
    if manifest["sha256"] != hashlib.sha256(sheet_path.read_bytes()).hexdigest():
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

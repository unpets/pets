"""Preview encoded pet frames on declared backgrounds."""

from PIL import Image, ImageDraw

from .rig import CELL, DURATIONS, FRAMES


def make_previews(out):
    atlas = Image.open(out / "kernel-spritesheet.png").convert("RGBA")
    all_frames = []
    all_durations = []
    for state, count in {**FRAMES, "look": 16}.items():
        frames = []
        for i in range(count):
            row = list(FRAMES).index(state) if state != "look" else 9 + i // 8
            col = i if state != "look" else i % 8
            image = atlas.crop((col * 192, row * 208, (col + 1) * 192, (row + 1) * 208))
            # GIF cannot store graded alpha: composite previews on a declared background.
            bg = Image.new("RGB", CELL, (22, 29, 39))
            bg.paste(image, mask=image.getchannel("A"))
            frames.append(bg)
        frames[0].save(
            out / f"{state}.gif",
            save_all=True,
            append_images=frames[1:],
            duration=DURATIONS[state],
            loop=0,
            disposal=2,
        )
        if state != "look":
            for i, im in enumerate(frames):
                canvas = Image.new("RGB", (384, 456), (22, 29, 39))
                canvas.paste(im.resize((384, 416), Image.Resampling.NEAREST), (0, 0))
                ImageDraw.Draw(canvas).text(
                    (16, 430), f"{state}  {i + 1}/{count}", fill=(199, 220, 234)
                )
                all_frames.append(canvas)
                all_durations.append(DURATIONS[state])
    all_frames[0].save(
        out / "all-states.gif",
        save_all=True,
        append_images=all_frames[1:],
        duration=all_durations,
        loop=0,
    )
    ids = [(0, 0)] * 3 + [(4, i) for i in range(5)] + [(0, 0)] * 3
    jump = []
    for row, i in ids:
        frame = atlas.crop((i * 192, row * 208, (i + 1) * 192, (row + 1) * 208))
        bg = Image.new("RGB", CELL, (22, 29, 39))
        bg.paste(frame, mask=frame.getchannel("A"))
        jump.append(bg)
    jump[0].save(
        out / "idle-jump-idle.gif",
        save_all=True,
        append_images=jump[1:],
        duration=140,
        loop=0,
    )
    # Alpha inspection on both light and dark surfaces; exact encoded frame pixels.
    plate = Image.new("RGB", (4 * 384, 2 * 448), (235, 239, 242))
    draw = ImageDraw.Draw(plate)
    for j, (state, i) in enumerate(
        [("idle", 0), ("running", 2), ("waving", 1), ("jumping", 2)]
    ):
        row = list(FRAMES).index(state)
        frame = atlas.crop((i * 192, row * 208, (i + 1) * 192, (row + 1) * 208)).resize(
            (384, 416), Image.Resampling.NEAREST
        )
        for r, bg in enumerate([(235, 239, 242), (22, 29, 39)]):
            plate.paste(bg, (j * 384, r * 448, (j + 1) * 384, (r + 1) * 448))
            plate.paste(frame, (j * 384, r * 448), frame)
            draw.text(
                (j * 384 + 15, r * 448 + 428),
                f"{state} / frame {i}",
                fill=(75, 93, 110) if r == 0 else (201, 219, 237),
            )
    plate.save(out / "alpha-and-stills.png")

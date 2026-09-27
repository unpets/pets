"""96 x 64 deterministic framebuffer. No randomness, wall clock, or text assets."""

from PIL import Image, ImageDraw

SIZE = (96, 64)
BG = (7, 21, 29)
CYAN = (79, 239, 243)
DIM = (24, 78, 91)
GREEN = (85, 245, 158)
FONT = {
    "0": ["111", "101", "101", "101", "111"],
    "1": ["010", "110", "010", "010", "111"],
    "2": ["110", "001", "010", "100", "111"],
    "3": ["110", "001", "010", "001", "110"],
    "4": ["101", "101", "111", "001", "001"],
    "5": ["111", "100", "110", "001", "110"],
    "6": ["011", "100", "111", "101", "111"],
    "7": ["111", "001", "010", "010", "010"],
    "8": ["111", "101", "111", "101", "111"],
    "9": ["111", "101", "111", "001", "110"],
    ">": ["100", "010", "001", "010", "100"],
    "_": ["000", "000", "000", "000", "111"],
    "{": ["011", "010", "110", "010", "011"],
    "}": ["110", "010", "011", "010", "110"],
    ":": ["000", "010", "000", "010", "000"],
    "/": ["001", "001", "010", "100", "100"],
    "K": ["101", "101", "110", "101", "101"],
    "R": ["110", "101", "110", "101", "101"],
    "N": ["101", "111", "111", "101", "101"],
    "L": ["100", "100", "100", "100", "111"],
}


def glyph(draw, xy, char, color, scale=1):
    x, y = xy
    for r, line in enumerate(FONT.get(char, FONT["0"])):
        for c, p in enumerate(line):
            if p == "1":
                draw.rectangle(
                    (
                        x + c * scale,
                        y + r * scale,
                        x + (c + 1) * scale - 1,
                        y + (r + 1) * scale - 1,
                    ),
                    fill=color,
                )


LAYERS = ("background", "activity", "eyes", "mouth")


PALETTE_LAYERS = (
    "background-lines",
    "background-text",
    "activity-lines",
    "activity-text",
)
COMPONENTS = ("background", *PALETTE_LAYERS, "eyes", "mouth")


def screen_components(state, t, gaze=(0.0, 0.0)):
    t %= 1
    layers = {name: Image.new("RGBA", SIZE) for name in COMPONENTS}
    layers["background"].paste((*BG, 255), (0, 0, *SIZE))
    d = ImageDraw.Draw(layers["background-lines"])
    # Glass is flush inside a centered opening. Status rail stays on the display.
    d.line((5, 8, 90, 8), fill=(21, 53, 66))
    d.line((5, 56, 90, 56), fill=(21, 53, 66))
    text = ImageDraw.Draw(layers["background-text"])
    for i, ch in enumerate("KRNL"):
        glyph(text, (6 + i * 4, 2), ch, DIM)
    d.rectangle((83, 3, 89, 4), fill=CYAN)
    d = ImageDraw.Draw(layers["activity-text"])
    if state == "running":
        # Cyclic digital rain on the right, syntax-like terminal tokens on the left.
        tick = int((t % 1) * 24)
        for col in range(7):
            head = (tick * 2 + col * 13) % 48
            for tail in range(4):
                y = 11 + (head - tail * 7) % 43
                color = (
                    (99, 255, 179)
                    if tail == 0
                    else (21, 105 - 15 * tail, 65 - 5 * tail)
                )
                glyph(
                    d, (61 + col * 4, y), str((col * 7 + tail * 3 + tick) % 10), color
                )
        lines = ImageDraw.Draw(layers["activity-lines"])
        lines.line((55, 12, 55, 53), fill=DIM)
        tokens = [">{01}", "/1010", "{0:1}", ">101_", "/0110", "{1:0}"]
        for r in range(5):
            line = tokens[(r + tick // 4) % len(tokens)]
            for j, ch in enumerate(line):
                glyph(d, (7 + 5 * j, 13 + r * 8), ch, CYAN if j == 0 else GREEN)
        lines.rectangle((7, 51, 7 + int(40 * t), 52), fill=CYAN)
    else:
        d = ImageDraw.Draw(layers["eyes"])
        dx = round(gaze[0] * 10)
        dy = round(gaze[1] * 9)
        blink = state == "idle" and 0.46 < t < 0.64
        ey = 23 + dy
        for x in (25 + dx, 62 + dx):
            if state == "failed":
                # Compressed tired eyelids, never detached error symbols.
                d.rectangle((x - 7, ey + 4, x + 6, ey + 7), fill=(175, 116, 238))
                d.rectangle((x + 4, ey + 5, x + 7, ey + 12), fill=(175, 116, 238))
            elif state == "review":
                d.rectangle((x - 7, ey + 3, x + 7, ey + 11), fill=CYAN)
                d.rectangle((x - 4, ey + 4, x + 3, ey + 8), fill=(148, 255, 251))
                d.line((x - 7, ey - 1, x + 6, ey - 3), fill=DIM, width=2)
            elif blink:
                d.rectangle((x - 7, ey + 6, x + 7, ey + 8), fill=CYAN)
            else:
                d.rectangle((x - 7, ey, x + 7, ey + 13), fill=CYAN)
                d.rectangle((x - 5, ey - 2, x + 5, ey + 15), fill=CYAN)
                d.rectangle((x - 3, ey + 2, x + 3, ey + 10), fill=(148, 255, 251))
        d = ImageDraw.Draw(layers["mouth"])
        if state == "waiting":
            d.rectangle((43, 45, 50, 49), fill=CYAN)
        elif state == "failed":
            d.line((38, 49, 46, 45, 54, 49), fill=(175, 116, 238), width=2)
        elif state == "review":
            d.line((42, 37, 51, 37), fill=CYAN)
        else:
            d.line((37, 43, 40, 47, 53, 47, 57, 43), fill=CYAN, width=2)
        if state == "review":
            d = ImageDraw.Draw(layers["activity-lines"])
            selected = min(2, int(t * 4))
            for row, width in enumerate((25, 34, 21)):
                y = 43 + row * 4
                color = CYAN if row == selected else DIM
                d.rectangle((22, y, 24, y + 1), fill=color)
                d.line((29, y, 29 + width, y), fill=color)
            if 0.5 < t < 0.82:
                d.line((70, 46, 73, 49, 79, 42), fill=GREEN, width=2)
    return layers


def screen_layers(state, t, gaze=(0.0, 0.0)):
    components = screen_components(state, t, gaze)
    layers = {name: Image.new("RGBA", SIZE) for name in LAYERS}
    for name, image in components.items():
        layer = name.split("-")[0]
        layers[layer] = Image.alpha_composite(layers[layer], image)
    return layers


def framebuffer(state, t, gaze=(0.0, 0.0)):
    layers = screen_layers(state, t, gaze)
    image = Image.new("RGBA", SIZE)
    for layer in layers.values():
        image = Image.alpha_composite(image, layer)
    return image.convert("RGB")

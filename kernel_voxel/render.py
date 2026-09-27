"""Render Kernel from its real voxel model; export the same rig for the web viewer."""

import argparse
import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

from . import __version__
from .rig import CELL, DURATIONS, FRAMES, cable_points, pose_at, pose_for
from .screen import framebuffer


def alpha_downsample(image, size=CELL):
    """Average associated color + coverage together. No ringing or chroma despill."""
    # Pillow RGBa is premultiplied; BOX has no negative lobes or exterior halo.
    result = image.convert("RGBa").resize(size, Image.Resampling.BOX).convert("RGBA")
    a = np.asarray(result).copy()
    a[a[:, :, 3] == 0, :3] = 0
    return Image.fromarray(a)


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


def export_site(model, out, site_out):
    import bpy

    site_out.mkdir(parents=True, exist_ok=True)
    assets = site_out / "assets"
    assets.mkdir(exist_ok=True)
    # Export static source geometry in Z-up coordinates. The viewer applies sampled rig transforms.
    apply = __import__("kernel_voxel.model", fromlist=["apply_pose"]).apply_pose
    apply(model, pose_for("idle", 0))
    model["texture"].pack()
    bpy.ops.object.select_all(action="DESELECT")
    for obj in [*model["nodes"].values(), model["display"]]:
        obj.hide_viewport = False
        obj.hide_set(False)
        obj.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=str((assets / "kernel.glb").resolve()),
        export_format="GLB",
        use_selection=True,
        export_yup=False,
        export_animations=False,
        export_extras=True,
    )
    data = {
        "version": __version__,
        "up": "Z",
        "voxelSize": 0.035,
        "voxelCount": model["voxel_count"],
        "screenSize": [96, 64],
        "states": {},
    }
    screen_sheet = Image.new("RGB", (96 * 48, 64 * 10))
    for row, (state, count) in enumerate({**FRAMES, "look": 16}.items()):
        samples = []
        for i in range(121):
            t = i / 120
            p = pose_at(state, t)
            transforms = {}
            for name, m in p.matrices.items():
                from mathutils import Matrix

                loc, quat, _scale = Matrix(m.tolist()).decompose()
                transforms[name] = {
                    "p": [round(x, 6) for x in loc],
                    "q": [round(x, 7) for x in (quat.x, quat.y, quat.z, quat.w)],
                }
            samples.append(
                {"parts": transforms, "cable": np.round(cable_points(p), 6).tolist()}
            )
        for i in range(48):
            t = i / 48
            p = pose_at(state, t)
            screen_sheet.paste(framebuffer(state, t, p.gaze), (96 * i, 64 * row))
        data["states"][state] = {
            "duration": count * DURATIONS[state] / 1000,
            "frames": count,
            "screenRow": row,
            "samples": samples,
        }
    (assets / "animations.json").write_text(json.dumps(data, separators=(",", ":")))
    screen_sheet.save(assets / "screens.png", optimize=True)
    return data


def export_blend(model, out):
    """Bake rigid transforms, cable vertices, and framebuffer sequence into the .blend."""
    import bpy

    from .model import apply_pose

    scene = bpy.context.scene
    scene.render.fps = 24
    frames_dir = (out / "blend-screens").resolve()
    frames_dir.mkdir(exist_ok=True)
    timeline = []
    frame = 1
    for state in FRAMES:
        scene.timeline_markers.new(state, frame=frame)
        count = round(FRAMES[state] * DURATIONS[state] / 1000 * 24)
        for i in range(count):
            p = pose_at(state, i / (count - 1 if state == "jumping" else count))
            scene.frame_set(frame)
            apply_pose(model, p)
            for name, obj in model["nodes"].items():
                if name != "server":
                    obj.rotation_mode = "QUATERNION"
                    loc, q, _scale = obj.matrix_world.decompose()
                    obj.location = loc
                    obj.rotation_quaternion = q
                    obj.keyframe_insert("location", frame=frame)
                    obj.keyframe_insert("rotation_quaternion", frame=frame)
                obj.keyframe_insert("hide_render", frame=frame)
            model["cable"].keyframe_insert("hide_render", frame=frame)
            for pp in model["cable"].data.splines[0].points:
                pp.keyframe_insert("co", frame=frame)
            framebuffer(state, p.t, p.gaze).save(frames_dir / f"screen-{frame:04d}.png")
            timeline.append({"frame": frame, "state": state, "t": p.t})
            frame += 1
    for obj in model["nodes"].values():
        if obj.animation_data and obj.animation_data.action:
            for fc in obj.animation_data.action.fcurves:
                for k in fc.keyframe_points:
                    k.interpolation = (
                        "LINEAR" if fc.data_path != "hide_render" else "CONSTANT"
                    )
    scene.frame_start = 1
    scene.frame_end = frame - 1
    img = bpy.data.images.load(str(frames_dir / "screen-0001.png"))
    img.source = "SEQUENCE"
    tex = next(
        n
        for n in model["display"].data.materials[0].node_tree.nodes
        if n.type == "TEX_IMAGE"
    )
    tex.image = img
    tex.image_user.frame_duration = frame - 1
    tex.image_user.frame_start = 1
    tex.image_user.use_auto_refresh = True
    scene.frame_set(1)
    bpy.ops.wm.save_as_mainfile(filepath=str((out / "kernel.blend").resolve()))
    bpy.ops.file.make_paths_relative()
    bpy.ops.wm.save_as_mainfile(filepath=str((out / "kernel.blend").resolve()))
    (out / "timeline.json").write_text(json.dumps(timeline, indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path("build"))
    parser.add_argument("--site-output", type=Path, default=Path("web/public"))
    parser.add_argument("--scale", type=int, default=4)
    parser.add_argument("--samples", type=int, default=32)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--site-only", action="store_true")
    mode.add_argument(
        "--render-only",
        action="store_true",
        help="Render selected states without packaging",
    )
    mode.add_argument(
        "--assemble-only",
        action="store_true",
        help="Assemble existing frames and export scene assets",
    )
    parser.add_argument("--states", nargs="+", choices=[*FRAMES, "look"])
    parser.add_argument("--no-blend", action="store_true")
    args = parser.parse_args()
    out = args.output
    out.mkdir(parents=True, exist_ok=True)
    if args.render_only and not args.states:
        parser.error("--render-only requires --states")
    if not (args.site_only or args.render_only or args.assemble_only):
        # Isolate Blender's native render/denoise thread pools by animation state.
        # This also bounds peak memory and makes a failed row easy to regenerate.
        for state in args.states or [*FRAMES, "look"]:
            command = [
                sys.executable,
                "-m",
                "kernel_voxel.render",
                "--render-only",
                "--output",
                str(out),
                "--states",
                state,
                "--scale",
                str(args.scale),
                "--samples",
                str(args.samples),
            ]
            env = dict(os.environ, OPENBLAS_NUM_THREADS="1", OMP_NUM_THREADS="8")
            subprocess.run(command, check=True, env=env, timeout=600)
    import bpy

    from .model import apply_pose, build_model, setup_scene

    scene = setup_scene(args.scale, args.samples)
    model = build_model()
    print(f"Voxel occupancy: {model['voxel_count']}", flush=True)
    if args.render_only:
        for state in args.states:
            count = 16 if state == "look" else FRAMES[state]
            folder = out / "frames" / state
            masters = out / "masters" / state
            folder.mkdir(parents=True, exist_ok=True)
            masters.mkdir(parents=True, exist_ok=True)
            for i in range(count):
                p = pose_for(state, i)
                apply_pose(model, p)
                scene.render.filepath = str((masters / f"{i:02d}.png").resolve())
                bpy.ops.render.render(write_still=True)
                with Image.open(scene.render.filepath) as im:
                    alpha_downsample(im).save(folder / f"{i:02d}.png", optimize=True)
                print(f"FRAME {state} {i + 1}/{count}", flush=True)
        return
    if not args.site_only:
        expected = [
            out / "frames" / s / f"{i:02d}.png"
            for s, n in {**FRAMES, "look": 16}.items()
            for i in range(n)
        ]
        missing = [p for p in expected if not p.exists()]
        if args.assemble_only and missing:
            raise FileNotFoundError(
                f"Cannot assemble: {len(missing)} frames missing; first: {missing[0]}"
            )
        if not missing:
            atlas = Image.new("RGBA", (1536, 2288))
            for state, count in {**FRAMES, "look": 16}.items():
                for i in range(count):
                    row = list(FRAMES).index(state) if state != "look" else 9 + i // 8
                    col = i if state != "look" else i % 8
                    atlas.paste(
                        Image.open(out / "frames" / state / f"{i:02d}.png"),
                        (col * 192, row * 208),
                    )
            atlas.save(out / "kernel-spritesheet.png", optimize=True)
            make_previews(out)
            manifest = {
                "version": __version__,
                "voxel_count": model["voxel_count"],
                "voxel_pitch": 0.035,
                "supersampling": args.scale,
                "samples": args.samples,
                "sha256": hashlib.sha256(
                    (out / "kernel-spritesheet.png").read_bytes()
                ).hexdigest(),
                "alpha": "native RGBA; premultiplied BOX reduction; no chroma cleanup",
            }
            (out / "manifest.json").write_text(json.dumps(manifest, indent=2))
    export_site(model, out, args.site_output)
    if not args.no_blend:
        export_blend(model, out)
    print(f"Completed: {out}; viewer: {args.site_output}", flush=True)


if __name__ == "__main__":
    main()

"""Fine voxel surface meshes. No bevel modifiers, smooth normals, outlines or halos."""

from collections import defaultdict

import bpy
import numpy as np
from mathutils import Matrix, Vector

from .hand_mesh import build_hand
from .rig import SERVER_PORT, SHOULDER_PIVOT, WRIST_PORT, cable_points, pose_for
from .screen import framebuffer
from .surfaces import resolve_coplanar

VOXEL = 0.035
PALETTE = {
    "shell": "586777",
    "top": "718394",
    "dark": "303d4c",
    "joint": "202b38",
    "metal": "9baeb8",
    "violet": "ae77df",
    "violet_dim": "705286",
    "cyan": "55e9eb",
    "cyan_dim": "347888",
    "screen": "07151d",
    "green": "6bf1a0",
}


def srgb(v):
    return v / 12.92 if v < 0.04045 else ((v + 0.055) / 1.055) ** 2.4


def material(name, hexcode, variation=0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes.get("Principled BSDF")
    rgb = [
        max(0, min(1, int(hexcode[i : i + 2], 16) / 255 + variation)) for i in (0, 2, 4)
    ]
    linear = tuple(srgb(v) for v in rgb)
    p.inputs["Base Color"].default_value = (*linear, 1)
    p.inputs["Metallic"].default_value = (
        0.34 if name.startswith(("metal", "shell", "top")) else 0.12
    )
    p.inputs["Roughness"].default_value = 0.48
    if name.startswith(("cyan", "green")):
        p.inputs["Emission Color"].default_value = (*linear, 1)
        p.inputs["Emission Strength"].default_value = 0.50
    m.diffuse_color = (*linear, 1)
    return m


# Consistent outward winding for +/- X,Y,Z.
DIRECTIONS = [
    ((1, 0, 0), ((1, 0, 0), (1, 1, 0), (1, 1, 1), (1, 0, 1))),
    ((-1, 0, 0), ((0, 0, 0), (0, 0, 1), (0, 1, 1), (0, 1, 0))),
    ((0, 1, 0), ((0, 1, 0), (0, 1, 1), (1, 1, 1), (1, 1, 0))),
    ((0, -1, 0), ((0, 0, 0), (1, 0, 0), (1, 0, 1), (0, 0, 1))),
    ((0, 0, 1), ((0, 0, 1), (1, 0, 1), (1, 1, 1), (0, 1, 1))),
    ((0, 0, -1), ((0, 0, 0), (0, 1, 0), (1, 1, 0), (1, 0, 0))),
]


class Builder:
    def __init__(self):
        self.buffers = defaultdict(lambda: [[], [], []])
        self.palette = []
        self.matidx = {}
        self.voxels = 0
        for name, col in PALETTE.items():
            for variant in range(3):
                self.matidx[(name, variant)] = len(self.palette)
                self.palette.append(
                    material(f"{name}.{variant}", col, (variant - 1) * 0.009)
                )

    def face(self, part, points, color, variant=1):
        vertices, faces, mats = self.buffers[part]
        n = len(vertices)
        vertices.extend(points)
        faces.append(tuple(range(n, n + len(points))))
        mats.append(self.matidx[(color, variant)])

    def box(self, part, center, size, color):
        origin = np.array(center) - np.array(size) / 2
        for _, corners in DIRECTIONS:
            self.face(part, [origin + np.array(c) * size for c in corners], color)

    def voxel(
        self, part, center, size, color, radius=0.08, step=VOXEL, cut=None, shape="box"
    ):
        count = np.ceil(np.array(size) / step).astype(int)
        origin = np.array(center) - count * step / 2
        occupied = set()
        half = np.array(size) / 2
        for i in np.ndindex(*count):
            p = origin + (np.array(i) + 0.5) * step - np.array(center)
            if shape == "motor":
                inside = (
                    abs(p[0]) <= half[0]
                    and (p[1] / half[1]) ** 2 + (p[2] / half[2]) ** 2 <= 1
                )
            else:
                q = np.abs(p) - (half - radius)
                sdf = np.linalg.norm(np.maximum(q, 0)) + min(max(q), 0) - radius
                inside = sdf <= 0
            if inside and not (cut and cut(p + np.array(center))):
                occupied.add(i)
        self.voxels += len(occupied)
        for i in sorted(occupied):
            v = (i[0] * 13 + i[1] * 7 + i[2] * 3) % 13
            variant = 0 if v == 0 else 2 if v == 1 else 1
            for delta, corners in DIRECTIONS:
                if tuple(i[k] + delta[k] for k in range(3)) not in occupied:
                    self.face(
                        part,
                        [origin + (np.array(i) + c) * step for c in corners],
                        color,
                        variant,
                    )

    def finish(self):
        nodes = {}
        for name, (verts, faces, mats) in self.buffers.items():
            verts, faces, mats = resolve_coplanar(verts, faces, mats)
            mesh = bpy.data.meshes.new(name)
            mesh.from_pydata(verts, [], faces)
            mesh.update()
            for m in self.palette:
                mesh.materials.append(m)
            mesh.polygons.foreach_set("material_index", mats)
            obj = bpy.data.objects.new(name, mesh)
            bpy.context.collection.objects.link(obj)
            obj["rig_part"] = name
            nodes[name] = obj
        return nodes


def shoulder_socket(builder, side):
    center = SHOULDER_PIVOT * (side, 1, 1) - np.array([side * 0.095, 0, 0])
    builder.voxel(
        "body",
        center,
        (0.22, 0.22, 0.22),
        "joint",
        0.11,
        step=0.010,
        cut=lambda point: side * (point[0] - center[0]) < 0,
    )


def build_model():
    b = Builder()
    b.voxel("body", (0, 0, 1.44), (1.04, 0.68, 0.39), "shell", 0.14)
    b.voxel("body", (0, 0, 1.15), (0.91, 0.63, 0.19), "dark", 0.07)
    b.voxel("body", (0, 0, 0.95), (0.79, 0.58, 0.20), "shell", 0.07)
    b.box("body", (0, -0.327, 1.20), (0.70, 0.018, 0.034), "violet")
    b.box("body", (0, -0.330, 1.105), (0.62, 0.019, 0.025), "violet_dim")
    b.voxel("body", (0, 0, 1.735), (0.24, 0.27, 0.19), "metal", 0.04, step=0.022)
    for z in (1.68, 1.73, 1.78):
        b.box("body", (0, 0, z), (0.28, 0.30, 0.025), "joint")
    # Flush chest processor hatch, contacts, vents and fasteners.
    b.voxel("body", (0, -0.345, 1.44), (0.36, 0.07, 0.27), "joint", 0.035, step=0.025)
    b.box("body", (0, -0.389, 1.44), (0.20, 0.023, 0.12), "violet_dim")
    b.box("body", (0, -0.404, 1.44), (0.10, 0.012, 0.09), "cyan")
    for side in (-1, 1):
        for i in range(4):
            b.box(
                "body",
                (side * (0.26 + i * 0.045), -0.348, 1.45),
                (0.020, 0.015, 0.10),
                "joint",
            )
        for z in (1.32, 1.57):
            b.box("body", (side * 0.36, -0.326, z), (0.030, 0.025, 0.030), "metal")
        b.box("body", (side * 0.365, 0, 0.95), (0.03, 0.25, 0.07), "violet_dim")
    # Rounded contours are sampled on a fine cubic lattice, never chamfered.
    b.voxel(
        "head",
        (0, 0, 0.33),
        (1.47, 0.95, 0.97),
        "shell",
        0.22,
        cut=lambda p: abs(p[0]) < 0.597 and abs(p[2] - 0.33) < 0.334 and p[1] < -0.26,
    )
    # Deep cavity backing and four rails around the same aperture.
    b.box("head", (0, -0.273, 0.33), (1.20, 0.026, 0.68), "screen")
    for side in (-1, 1):
        b.box("head", (side * 0.605, -0.392, 0.33), (0.034, 0.15, 0.65), "joint")
        b.box("head", (0, -0.392, 0.33 + side * 0.331), (1.22, 0.15, 0.025), "joint")
        b.voxel(
            "head",
            (side * 0.747, 0.04, 0.32),
            (0.13, 0.40, 0.35),
            "violet_dim",
            0.06,
            step=0.026,
        )
        b.voxel(
            "head",
            (side * 0.82, 0.035, 0.32),
            (0.044, 0.24, 0.24),
            "metal",
            0.02,
            step=0.018,
            shape="motor",
        )
        b.box("head", (side * 0.845, -0.01, 0.32), (0.025, 0.08, 0.095), "cyan")
        for y in (0.07, 0.17, 0.27):
            b.box("head", (side * 0.713, y, 0.56), (0.03, 0.034, 0.13), "joint")
        b.box("head", (side * 0.50, -0.372, -0.079), (0.10, 0.033, 0.025), "cyan_dim")
        for z in (0.02, 0.64):
            b.box("head", (side * 0.633, -0.380, z), (0.023, 0.027, 0.025), "metal")
    b.box("head", (0, 0.02, 0.827), (0.15, 0.18, 0.039), "joint")
    b.box("head", (0, 0.02, 0.861), (0.105, 0.13, 0.028), "cyan")
    # Crisp narrow seams across the crown and service hatch at the back.
    b.box("head", (0, 0.452, 0.32), (0.69, 0.016, 0.40), "dark")
    for z in (0.22, 0.31, 0.40):
        b.box("head", (0, 0.466, z), (0.49, 0.014, 0.028), "joint")
    for side in (-1, 1):
        n = "L" if side < 0 else "R"
        shoulder_socket(b, side)
        for part, length, width in [
            (f"thigh.{n}", 0.42, 0.235),
            (f"shin.{n}", 0.42, 0.22),
            (f"upper_arm.{n}", 0.33, 0.205),
            (f"forearm.{n}", 0.34, 0.215),
        ]:
            shoulder = part.startswith("upper_arm.")
            arm = shoulder or part.startswith("forearm.")
            depth = 0.16 if arm else 0.23
            b.voxel(
                part,
                (0, 0, 0.185 if shoulder else length * 0.50),
                (width, depth, 0.175 if shoulder else length - 0.14),
                "shell",
                0.045,
                step=0.025,
            )
            b.box(
                part,
                (0, -depth / 2 - 0.009, length * 0.50),
                (width * 0.50, 0.025, 0.033),
                "cyan_dim",
            )
            if shoulder:
                b.voxel(part, (0, 0, 0), (0.21, 0.21, 0.21), "metal", 0.105, step=0.010)
                b.box(part, (0, 0, 0.142), (0.10, 0.10, 0.096), "dark")
            else:
                b.voxel(
                    part,
                    (0, 0, 0),
                    (0.25, 0.16 if arm else 0.20, 0.20),
                    "joint",
                    0.035,
                    step=0.020,
                    shape="motor",
                )
                for side2 in (-1, 1):
                    b.voxel(
                        part,
                        (side2 * 0.132, 0, 0),
                        (0.025, 0.122, 0.122),
                        "metal",
                        0.0,
                        step=0.017,
                        shape="motor",
                    )
                    b.box(
                        part, (side2 * 0.147, 0, 0), (0.015, 0.036, 0.037), "violet_dim"
                    )
            b.box(
                part,
                (0, depth / 2 - 0.02, length * 0.48),
                (0.085, 0.052, length * 0.56),
                "dark",
            )
        b.box(f"forearm.{n}", (0, 0, 0.295), (0.095, 0.095, 0.06), "metal")
        build_hand(b, n)
        b.voxel(
            f"foot.{n}",
            (0, -0.09, -0.075),
            (0.37, 0.54, 0.18),
            "dark",
            0.05,
            step=0.025,
        )
        b.voxel(
            f"foot.{n}",
            (0, -0.10, -0.01),
            (0.30, 0.41, 0.11),
            "shell",
            0.04,
            step=0.025,
        )
        b.box(f"foot.{n}", (0, -0.351, -0.075), (0.22, 0.015, 0.034), "cyan_dim")
        for x in (-0.10, 0, 0.10):
            b.box(f"foot.{n}", (x, -0.10, -0.15), (0.06, 0.38, 0.025), "joint")
    # Small three-bay server: work-state-only and attached by a real cable.
    b.voxel("server", (1.18, 0.0, 0.51), (0.47, 0.65, 0.99), "dark", 0.055, step=0.025)
    for z in (0.22, 0.44, 0.66):
        b.box("server", (1.18, -0.337, z), (0.375, 0.035, 0.17), "joint")
        for j in range(5):
            b.box(
                "server", (1.045 + j * 0.047, -0.360, z), (0.020, 0.019, 0.10), "shell"
            )
        b.box("server", (1.337, -0.362, z + 0.03), (0.030, 0.017, 0.023), "green")
    b.box("server", SERVER_PORT + (0, 0.082, 0), (0.15, 0.06, 0.11), "joint")
    b.box("server", SERVER_PORT + (0, 0.055, 0), (0.11, 0.03, 0.11), "metal")
    b.box("server", SERVER_PORT + (0, 0.034, 0), (0.078, 0.018, 0.078), "screen")
    b.box("server", SERVER_PORT + (0, 0.016, 0), (0.060, 0.032, 0.060), "cyan_dim")
    b.box("hand.R", WRIST_PORT + (0, -0.06, 0), (0.10, 0.06, 0.10), "metal")
    b.box("hand.R", WRIST_PORT + (0, -0.027, 0), (0.078, 0.018, 0.078), "screen")
    b.box("hand.R", WRIST_PORT + (0, -0.012, 0), (0.060, 0.024, 0.060), "cyan_dim")
    b.box("server", (1.18, -0.01, 1.017), (0.36, 0.52, 0.025), "shell")
    nodes = b.finish()
    # One screen plane with one local transform, packed texture and UVs.
    mesh = bpy.data.meshes.new("display")
    w, h = 1.095, 0.600
    y = -0.408
    z = 0.32
    mesh.from_pydata(
        [
            (-w / 2, y, z - h / 2),
            (w / 2, y, z - h / 2),
            (w / 2, y, z + h / 2),
            (-w / 2, y, z + h / 2),
        ],
        [],
        [(0, 1, 2, 3)],
    )
    uv = mesh.uv_layers.new(name="ScreenUV")
    for loop, v in zip(uv.data, [(0, 0), (1, 0), (1, 1), (0, 1)]):
        loop.uv = v
    display = bpy.data.objects.new("display", mesh)
    bpy.context.collection.objects.link(display)
    display.parent = nodes["head"]
    display["is_display"] = True
    tex = bpy.data.images.new(
        "Kernel deterministic framebuffer", width=96, height=64, alpha=True
    )
    tex.colorspace_settings.name = "sRGB"
    mat = bpy.data.materials.new("display")
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    output = nt.nodes.new("ShaderNodeOutputMaterial")
    em = nt.nodes.new("ShaderNodeEmission")
    img = nt.nodes.new("ShaderNodeTexImage")
    img.image = tex
    img.interpolation = "Closest"
    em.inputs["Strength"].default_value = 0.95
    nt.links.new(img.outputs["Color"], em.inputs["Color"])
    nt.links.new(em.outputs[0], output.inputs[0])
    mesh.materials.append(mat)
    # The cable is geometry, with physical wrist and server anchors.
    curve = bpy.data.curves.new("cable", "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 1
    curve.bevel_depth = 0.025
    curve.bevel_resolution = 1
    curve.resolution_u = 1
    spline = curve.splines.new("POLY")
    spline.points.add(31)
    cable = bpy.data.objects.new("cable", curve)
    bpy.context.collection.objects.link(cable)
    curve.materials.append(b.palette[b.matidx[("cyan_dim", 1)]])
    scene = {
        "nodes": nodes,
        "display": display,
        "texture": tex,
        "cable": cable,
        "voxel_count": b.voxels,
    }
    apply_pose(scene, pose_for("idle", 0))
    from .armature import create_armature

    create_armature(scene)
    return scene


def apply_pose(model, pose):
    if "armature" in model:
        from .armature import apply_armature_pose

        apply_armature_pose(model, pose)
    else:
        for name, m in pose.matrices.items():
            model["nodes"][name].matrix_world = Matrix(m.tolist())
    work = pose.state == "running"
    model["nodes"]["server"].hide_render = not work
    model["nodes"]["server"].hide_viewport = not work
    model["cable"].hide_render = not work
    model["cable"].hide_viewport = not work
    for p, v in zip(model["cable"].data.splines[0].points, cable_points(pose)):
        p.co = (*v, 1)
    im = (
        np.asarray(
            framebuffer(pose.state, pose.t, pose.gaze).convert("RGBA"), dtype=np.float32
        )
        / 255
    )
    model["texture"].pixels.foreach_set(np.flipud(im).flatten())
    model["texture"].update()
    bpy.context.view_layer.update()


def setup_scene(scale=4, samples=32, device="auto"):
    from .devices import configure_render_device

    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.render.fps = 60
    configure_render_device(scene, device)
    scene.cycles.samples = samples
    scene.cycles.seed = 17
    scene.cycles.use_animated_seed = False
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 4
    scene.render.threads_mode = "FIXED"
    scene.render.threads = 8
    scene.render.resolution_x = 192 * scale
    scene.render.resolution_y = 208 * scale
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "Medium High Contrast"
    scene.view_settings.exposure = 0
    scene.view_settings.gamma = 1
    world = bpy.data.worlds.new("Soft studio")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.18, 0.23, 0.30, 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 0.55
    scene.world = world
    target = Vector((0.06, 0, 1.47))
    bpy.ops.object.camera_add(location=target + Vector((2.2, -10, 3.8)))
    cam = bpy.context.object
    cam.name = "Pet camera"
    cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = 3.43
    scene.camera = cam
    for name, loc, power, size, color in [
        ("Key", (-3, -4, 7), 450, 4.0, (0.87, 0.94, 1)),
        ("Fill", (4, -2, 4), 220, 3.5, (0.76, 0.88, 1)),
        ("Top", (-1, 3, 6), 320, 3.0, (0.87, 0.79, 1)),
    ]:
        bpy.ops.object.light_add(type="AREA", location=loc)
        o = bpy.context.object
        o.name = name
        o.data.energy = power
        o.data.shape = "DISK"
        o.data.size = size
        o.data.color = color
        o.rotation_euler = (
            (Vector((0, 0, 1.4)) - o.location).to_track_quat("-Z", "Y").to_euler()
        )
    return scene

"""Deterministic software renderer and animated voxel rig for Kernel."""
from __future__ import annotations

import argparse
import math
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image

CELL = (192, 208)
SCALE = 4
FRAMES = {"idle": 6, "running-right": 8, "running-left": 8, "waving": 4,
          "jumping": 5, "failed": 8, "waiting": 6, "running": 6, "review": 6}
COLORS = {"shell": (68, 78, 92), "shell_light": (94, 108, 123),
          "shell_dark": (43, 51, 65), "joint": (30, 37, 48),
          "screen": (8, 24, 37), "glass": (14, 40, 54),
          "cyan": (79, 239, 250), "cyan_dim": (37, 130, 156),
          "violet": (171, 100, 228), "violet_dim": (97, 62, 139),
          "metal": (125, 143, 155)}

# Seven-column LED display. Every lit pixel is a 3D tile attached to the head.
SCREEN = {
    "happy": ("0000000", "0110110", "0110110", "1000001", "0111110"),
    "blink": ("0000000", "0000000", "0110110", "1000001", "0111110"),
    "focus": ("0000000", "1110111", "0100010", "0100010", "0011100"),
    "error": ("0000000", "1010101", "0100010", "1010101", "0011100"),
    "ask":   ("0000000", "0110110", "0110110", "0001000", "0001000"),
    "scan":  ("0000000", "1111111", "1000001", "1111111", "0000000"),
}

Vec = tuple[float, float, float]

def add(a: Vec, b: Vec) -> Vec:
    return (a[0]+b[0], a[1]+b[1], a[2]+b[2])

def rot(p: Vec, yaw: float = 0, pitch: float = 0) -> Vec:
    x, y, z = p
    x, y = x*math.cos(yaw)-y*math.sin(yaw), x*math.sin(yaw)+y*math.cos(yaw)
    return (x, y*math.cos(pitch)-z*math.sin(pitch), y*math.sin(pitch)+z*math.cos(pitch))

@dataclass
class Box:
    center: Vec
    size: Vec
    color: str
    part: str = "body"

@dataclass
class Pose:
    lift: float = 0
    lean: float = 0
    head_yaw: float = 0
    head_pitch: float = 0
    left_arm: float = 0
    right_arm: float = 0
    left_leg: float = 0
    right_leg: float = 0
    face: str = "happy"
    gaze_x: int = 0
    gaze_y: int = 0

def pose_for(state: str, index: int) -> Pose:
    if state == "idle":
        return Pose(lift=(0, .018, .035, .018, 0, .006)[index],
                    head_pitch=(-.02, 0, .015, .02, 0, -.02)[index],
                    face="blink" if index == 3 else "happy")
    if state in ("running-right", "running-left"):
        sign = 1 if state.endswith("right") else -1
        t = 2*math.pi*index/8
        return Pose(lift=.05+abs(math.sin(t))*.045, lean=sign*.24,
                    head_yaw=sign*.27, left_arm=math.sin(t)*.28,
                    right_arm=-math.sin(t)*.28, left_leg=math.sin(t)*.29,
                    right_leg=-math.sin(t)*.29)
    if state == "waving":
        return Pose(right_arm=(.65,.95,.72,.95)[index], head_pitch=-.08)
    if state == "jumping":
        return Pose(lift=(0,.18,.38,.19,0)[index],
                    left_arm=(.08,.20,.34,.20,.08)[index],
                    right_arm=(.08,.20,.34,.20,.08)[index])
    if state == "failed":
        return Pose(lift=(.02,0,.01,0,.02,0,.01,0)[index],
                    head_pitch=(.12,.23,.31,.35,.32,.24,.16,.12)[index],
                    face="error", left_arm=-.08, right_arm=-.08)
    if state == "waiting":
        return Pose(head_pitch=(-.10,-.13,-.16,-.13,-.10,-.08)[index],
                    left_arm=.20, right_arm=.20, face="ask")
    if state == "running":
        return Pose(head_pitch=-.08, left_arm=(.16,.23,.16,.10,.16,.23)[index],
                    right_arm=(.23,.16,.10,.16,.23,.16)[index], face="focus")
    if state == "review":
        return Pose(head_yaw=(-.12,-.06,0,.06,.12,0)[index],
                    head_pitch=(.05,.08,.11,.08,.05,0)[index], face="scan")
    if state == "look":
        a = math.radians(index * 22.5)
        return Pose(head_yaw=.69*math.sin(a), head_pitch=-.52*math.cos(a),
                    gaze_x=round(math.sin(a)), gaze_y=-round(math.cos(a)))
    raise ValueError(state)

def geometry(pose: Pose) -> list[Box]:
    b = []
    def box(center: Vec, size: Vec, color: str, part="body"):
        b.append(Box(center,size,color,part))
    # Three separately recognizable stacked modules, layered voxel bevels.
    for z, sx, sy, sz, color in ((.70,.95,.66,.41,"shell_dark"),
                                  (1.18,1.22,.72,.52,"shell"),
                                  (1.66,1.04,.70,.31,"shell_light")):
        box((0,0,z),(sx,sy,sz*.72),color)
        box((0,0,z-sz*.38),(sx*.88,sy*.87,sz*.22),"shell_dark")
        box((0,0,z+sz*.38),(sx*.89,sy*.87,sz*.22),"shell_light")
        box((0,-sy/2-.026,z+sz*.22),(sx*.79,.046,.052),"violet_dim")
        for sign in (-1,1):
            box((sign*sx*.43,-sy*.50,z),(sx*.06,.045,sz*.39),"metal")
    # Chest reactor has its own housing; it is not a second display.
    box((0,-.398,1.21),(.47,.08,.40),"joint")
    box((0,-.454,1.21),(.32,.044,.28),"violet_dim")
    box((0,-.488,1.21),(.18,.035,.17),"cyan")
    for sign in (-1,1):
        for i in range(3):
            box((sign*(.38+i*.075),-.392,1.28),(.037,.045,.10),"cyan_dim")
    box((0,0,1.92),(.29,.34,.18),"joint")
    # Neck, feet, and limbs share the rig but move by deterministic offsets.
    for sign, arm, leg in ((-1,pose.left_arm,pose.left_leg),(1,pose.right_arm,pose.right_leg)):
        box((sign*.75,0,1.46+arm*.25),(.23,.31,.28),"joint")
        box((sign*.82,-.02,1.14+arm*.45),(.24,.29,.43),"shell")
        box((sign*.84,-.20,1.11+arm*.45),(.20,.04,.10),"cyan")
        box((sign*.83,-.02,.91+arm*.45),(.29,.35,.16),"joint")
        box((sign*.83,-.21,.91+arm*.45),(.16,.035,.07),"violet")
        box((sign*.32,0,.34+leg*.25),(.24,.32,.45),"joint")
        box((sign*.36,-.18,.16+leg*.35),(.40,.58,.27),"shell_dark")
        box((sign*.36,-.48,.16+leg*.35),(.24,.025,.08),"cyan")
        box((sign*.33,-.18,.48+leg*.25),(.23,.33,.11),"shell_light")
    # Head is one 3D part; eyes and face LEDs move with it exactly.
    box((0,0,0),(.33,.34,.17),"joint","head")
    box((0,0,.12),(1.22,.79,.60),"shell","head")
    box((0,0,-.246),(1.06,.68,.15),"shell_dark","head")
    box((0,0,.486),(1.07,.68,.15),"shell_light","head")
    box((0,.01,.57),(.86,.55,.06),"shell_light","head")
    # Bezel, recessed dark glass, and LEDs sit in three separate forward planes.
    box((0,-.427,.12),(1.06,.083,.68),"joint","head")
    box((0,-.482,.12),(.96,.035,.61),"screen","head")
    box((0,-.505,.12),(.86,.018,.53),"glass","head")
    box((0,.02,.66),(.20,.22,.09),"cyan","head")
    for sign in (-1,1):
        box((sign*.51,-.477,.12),(.037,.035,.48),"violet_dim","head")
        box((sign*.34,-.507,-.211),(.11,.026,.019),"cyan_dim","head")
    for sign in (-1,1):
        box((sign*.64,0,.13),(.14,.39,.26),"violet","head")
        box((sign*.72,-.13,.13),(.04,.17,.14),"cyan","head")
        box((sign*.57,.05,.47),(.12,.22,.055),"metal","head")
    pattern=SCREEN[pose.face]
    if pose.gaze_x or pose.gaze_y:
        # Both eye clusters are rebuilt at integer LED positions for each view.
        pixels=[["0"]*7 for _ in range(5)]
        row=max(0,min(3,1+pose.gaze_y))
        for col in (2,4):
            pixels[row][max(0,min(6,col+pose.gaze_x))]="1"
            if row+1 < 4:
                pixels[row+1][max(0,min(6,col+pose.gaze_x))]="1"
        pixels[4][3]="1"
        pattern=["".join(r) for r in pixels]
    for row, line in enumerate(pattern):
        for col, on in enumerate(line):
            if on == "1":
                box(((col-3)*.116,-.529,.33-row*.106),(.087,.028,.076),"cyan","head")
    return b

CAM = (3.0,-8.0,3.4)
def project(p: Vec) -> tuple[float,float,float]:
    # Slightly elevated view makes the voxel depth visible.
    side = (math.cos(.14),math.sin(.14),0)
    up = (-.055,.39,.92)
    depth = p[0]*CAM[0]+p[1]*CAM[1]+p[2]*CAM[2]
    return (p[0]*side[0]+p[1]*side[1], p[0]*up[0]+p[1]*up[1]+p[2]*up[2], depth)

FACES=((0,1,3,2),(4,6,7,5),(0,4,5,1),(2,3,7,6),(0,2,6,4),(1,5,7,3))
SHADE=(.69,1.06,.85,.80,.75,.93)

def mesh(box: Box, pose: Pose) -> list[Vec]:
    cx,cy,cz=box.center
    sx,sy,sz=(v/2 for v in box.size)
    corners=[(cx+dx*sx,cy+dy*sy,cz+dz*sz) for dz in (-1,1)
             for dy in (-1,1) for dx in (-1,1)]
    out=[]
    for v in corners:
        if box.part == "head":
            v=add(rot(v,pose.head_yaw,pose.head_pitch),(pose.lean*.25,0,2.40+pose.lift))
        else:
            v=add(v,(pose.lean*.16,0,pose.lift))
        out.append(v)
    return out

def frame(state: str, index: int) -> Image.Image:
    pose=pose_for(state,index)
    width,height=CELL[0]*SCALE,CELL[1]*SCALE
    pixels=np.zeros((height,width,4),dtype=np.uint8)
    zbuffer=np.full((height,width),-np.inf,dtype=np.float32)

    def triangle(a, b, c, color):
        x0,y0,z0=a; x1,y1,z1=b; x2,y2,z2=c
        left=max(0,math.floor(min(x0,x1,x2)))
        right=min(width,math.ceil(max(x0,x1,x2))+1)
        top=max(0,math.floor(min(y0,y1,y2)))
        bottom=min(height,math.ceil(max(y0,y1,y2))+1)
        if right<=left or bottom<=top: return
        denom=(y1-y2)*(x0-x2)+(x2-x1)*(y0-y2)
        if abs(denom)<1e-8: return
        yy,xx=np.mgrid[top:bottom,left:right]
        xx=xx.astype(np.float32)+.5
        yy=yy.astype(np.float32)+.5
        w0=((y1-y2)*(xx-x2)+(x2-x1)*(yy-y2))/denom
        w1=((y2-y0)*(xx-x2)+(x0-x2)*(yy-y2))/denom
        w2=1-w0-w1
        depth=w0*z0+w1*z1+w2*z2
        local_z=zbuffer[top:bottom,left:right]
        visible=(w0>=-1e-5)&(w1>=-1e-5)&(w2>=-1e-5)&(depth>local_z+1e-5)
        local_z[visible]=depth[visible]
        pixels[top:bottom,left:right][visible]=color

    for item in geometry(pose):
        vertices=mesh(item,pose)
        for f, indices in enumerate(FACES):
            points=[vertices[k] for k in indices]
            # Face normal, and camera-facing cull.
            a,b,c=points[0],points[1],points[2]
            u=(b[0]-a[0],b[1]-a[1],b[2]-a[2])
            v=(c[0]-a[0],c[1]-a[1],c[2]-a[2])
            normal=(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])
            if sum(normal[k]*CAM[k] for k in range(3)) <= 0:
                continue
            q=[project(p) for p in points]
            color=tuple(min(255,max(0,round(n*SHADE[f]))) for n in COLORS[item.color])+(255,)
            pts=[(CELL[0]*SCALE/2+x*58*SCALE,193*SCALE-y*58*SCALE,d) for x,y,d in q]
            triangle(pts[0],pts[1],pts[2],color)
            triangle(pts[0],pts[2],pts[3],color)
    im=Image.fromarray(pixels,"RGBA")
    return im.resize(CELL,Image.Resampling.LANCZOS)

def export_obj(out: Path) -> None:
    lines=["# Kernel neutral voxel model; screen glyph is deterministic geometry", "mtllib kernel.mtl"]
    offset=0
    for b in geometry(pose_for("idle",0)):
        corners=mesh(b,pose_for("idle",0))
        lines.extend(f"v {x:.6f} {y:.6f} {z:.6f}" for x,y,z in corners)
        lines.append(f"usemtl {b.color}")
        for face in FACES:
            lines.append("f "+" ".join(str(offset+i+1) for i in face))
        offset+=8
    (out/"kernel.obj").write_text("\n".join(lines)+"\n")
    (out/"kernel.mtl").write_text("\n".join(
        f"newmtl {name}\nKd {' '.join(f'{v/255:.6f}' for v in rgb)}\n"
        for name,rgb in COLORS.items()))

def main() -> None:
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output",type=Path,default=Path("build"))
    args=parser.parse_args()
    out=args.output
    root=out/"frames"
    atlas=Image.new("RGBA",(1536,2288))
    for state,count in {**FRAMES,"look":16}.items():
        directory=root/state
        directory.mkdir(parents=True,exist_ok=True)
        images=[]
        for i in range(count):
            im=frame(state,i)
            im.save(directory/f"{i:02d}.png",optimize=True)
            images.append(im)
            row=list(FRAMES).index(state) if state != "look" else 9+i//8
            column=i if state != "look" else i%8
            atlas.alpha_composite(im,(column*CELL[0],row*CELL[1]))
        images[0].save(out/f"{state}.gif",save_all=True,
                       append_images=images[1:],duration=115,loop=0,disposal=2)
    export_obj(out)
    atlas.save(out/"kernel-spritesheet.png")
    with Image.open(out/"kernel-spritesheet.png") as check:
        check.load()
    print(f"Rendered {sum(FRAMES.values())+16} model frames to {out}")

if __name__ == "__main__":
    main()

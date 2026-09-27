"""Export cached model renders as a Shimeji-ee character image set."""

import argparse
import hashlib
import json
import shutil
import xml.etree.ElementTree as ET
from pathlib import Path

from PIL import Image

from . import __version__
from .cache import read_cache
from .rig import CELL, DURATIONS, FRAMES

NAMESPACE = "http://www.group-finity.com/Mascot"
TICK_MS = 40
STATES = {**FRAMES, "look": 16}
ET.register_namespace("", NAMESPACE)


def element(parent, tag, **attributes):
    return ET.SubElement(parent, f"{{{NAMESPACE}}}{tag}", attributes)


def root():
    return ET.Element(f"{{{NAMESPACE}}}Mascot")


def write_xml(path, document):
    ET.indent(document, space="  ")
    ET.ElementTree(document).write(path, encoding="utf-8", xml_declaration=True)


def pose(
    animation, state, index, velocity="0,0", duration=None, right=None, anchor=197
):
    image = f"/{state}-{index:02d}.png"
    element(
        animation,
        "Pose",
        Image=image,
        ImageRight=f"/{right}-{index:02d}.png" if right else image,
        ImageAnchor=f"96,{anchor}",
        Velocity=velocity,
        Duration=str(
            duration
            or max(
                1,
                round((index + 1) * DURATIONS[state] / TICK_MS)
                - round(index * DURATIONS[state] / TICK_MS),
            )
        ),
    )


def validate_package(output):
    character = output / "img/Kernel"
    actions = ET.parse(character / "conf/actions.xml")
    behaviors = ET.parse(character / "conf/behaviors.xml")
    ns = {"m": NAMESPACE}
    names = {node.attrib["Name"] for node in actions.findall(".//m:Action", ns)}
    for reference in actions.findall(".//m:ActionReference", ns):
        if reference.attrib["Name"] not in names:
            raise ValueError("Undefined Shimeji action")
    for behavior in behaviors.findall(".//m:Behavior", ns):
        if behavior.attrib["Name"] not in names:
            raise ValueError("Undefined Shimeji behavior action")
    if not {"Dragged", "Fall", "Thrown", "ChaseMouse"}.issubset(names):
        raise ValueError("Required Shimeji actions are missing")
    poses = actions.findall(".//m:Pose", ns)
    for node in poses:
        if int(node.attrib["Duration"]) <= 0:
            raise ValueError("Pose duration must be positive")
        for key in ("Image", "ImageRight"):
            path = character / node.attrib[key].removeprefix("/")
            with Image.open(path) as image:
                if image.mode != "RGBA" or image.size != CELL or not image.getbbox():
                    raise ValueError(f"Invalid Shimeji image: {path}")
    return {"ok": True, "actions": len(names), "poses": len(poses), "tick_ms": TICK_MS}


def export_shimeji(build, output):
    manifest = json.loads((build / "manifest.json").read_text())
    if manifest["version"] != __version__:
        raise ValueError("Render version does not match the Shimeji exporter")
    for state in STATES:
        if not read_cache(build / f"render-{state}.json"):
            raise ValueError(f"Missing or modified rendered frames: {state}")
    character = output / "img/Kernel"
    config = character / "conf"
    config.mkdir(parents=True, exist_ok=True)
    for state, count in STATES.items():
        for index in range(count):
            shutil.copyfile(
                build / "frames" / state / f"{index:02d}.png",
                character / f"{state}-{index:02d}.png",
            )
    shutil.copyfile(character / "idle-00.png", character / "shime1.png")
    actions = root()
    listing = element(actions, "ActionList")
    mapping = {
        "Idle": "idle",
        "Wave": "waving",
        "Jump": "jumping",
        "Failure": "failed",
        "Waiting": "waiting",
        "Work": "running",
        "Review": "review",
        "LookAround": "look",
    }
    for name, state in mapping.items():
        action = element(
            listing, "Action", Name=name, Type="Animate", BorderType="Floor"
        )
        animation = element(action, "Animation")
        for index in range(STATES[state]):
            pose(animation, state, index)
    walk = element(listing, "Action", Name="Walk", Type="Move", BorderType="Floor")
    animation = element(walk, "Animation")
    for index in range(FRAMES["running-left"]):
        pose(animation, "running-left", index, velocity="-2,0", right="running-right")
    for name, attributes, state, index in [
        (
            "Falling",
            {
                "Class": "com.group_finity.mascot.action.Fall",
                "RegistanceX": "0.05",
                "RegistanceY": "0.1",
                "Gravity": "2",
            },
            "jumping",
            2,
        ),
        ("Pinched", {"Class": "com.group_finity.mascot.action.Dragged"}, "waiting", 0),
    ]:
        action = element(listing, "Action", Name=name, Type="Embedded", **attributes)
        with Image.open(character / f"{state}-{index:02d}.png") as image:
            anchor = image.getchannel("A").getbbox()[3] - 1
        pose(element(action, "Animation"), state, index, duration=250, anchor=anchor)
    for name in ("Fall", "Thrown", "Dragged", "ChaseMouse", "Wander"):
        sequence = element(
            listing,
            "Action",
            Name=name,
            Type="Sequence",
            Loop="true" if name == "Dragged" else "false",
        )
        if name == "Dragged":
            element(sequence, "ActionReference", Name="Pinched")
        elif name in ("Fall", "Thrown"):
            attributes = (
                {
                    "InitialVX": "${mascot.environment.cursor.dx}",
                    "InitialVY": "${mascot.environment.cursor.dy}",
                }
                if name == "Thrown"
                else {}
            )
            element(sequence, "ActionReference", Name="Falling", **attributes)
            element(sequence, "ActionReference", Name="Idle")
        else:
            target = (
                "#{mascot.environment.cursor.x}"
                if name == "ChaseMouse"
                else "${mascot.environment.workArea.left+96+Math.random()*(mascot.environment.workArea.width-192)}"
            )
            element(
                sequence, "ActionReference", Name="Walk", TargetX=target, Duration="250"
            )
            element(sequence, "ActionReference", Name="Idle")
    write_xml(config / "actions.xml", actions)
    behaviors = root()
    listing = element(behaviors, "BehaviorList")
    for name in ("Fall", "Thrown", "Dragged", "ChaseMouse"):
        element(listing, "Behavior", Name=name, Frequency="0", Hidden="true")
    floor = element(
        listing,
        "Condition",
        Condition="#{mascot.environment.floor.isOn(mascot.anchor)}",
    )
    for name, frequency in {
        "Idle": 100,
        "Wander": 50,
        "Wave": 10,
        "Jump": 5,
        "Failure": 0,
        "Waiting": 10,
        "Work": 20,
        "Review": 15,
        "LookAround": 20,
    }.items():
        element(floor, "Behavior", Name=name, Frequency=str(frequency))
    write_xml(config / "behaviors.xml", behaviors)
    validation = validate_package(output)
    metadata = {
        "version": __version__,
        "source_blend_sha256": manifest["source_blend_sha256"],
        "validation": validation,
        "files": {
            str(path.relative_to(output)): hashlib.sha256(path.read_bytes()).hexdigest()
            for path in sorted(character.rglob("*"))
            if path.is_file()
        },
    }
    (output / "manifest.json").write_text(json.dumps(metadata, indent=2) + "\n")
    (output / "README.md").write_text(
        "# Kernel for Shimeji\n\nCopy `img/Kernel` into the Shimeji engine's `img` folder.  \nSelect Kernel in the character chooser.  \nUse the pet's context menu to choose an action.  \n\nThe image set supports Shimeji-ee compatible engines.  \nWalking uses independently rendered left and right views.  \nFrames are generated from Kernel's canonical Blender model.  \n"
    )
    print(json.dumps(validation))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--build", type=Path, default=Path("build"))
    parser.add_argument("--output", type=Path, default=Path("build-shimeji"))
    args = parser.parse_args()
    export_shimeji(args.build, args.output)


if __name__ == "__main__":
    main()

"""Export cached model renders as a Shimeji-ee character image set."""

import hashlib
import json
import shutil
import xml.etree.ElementTree as ET

from PIL import Image

NAMESPACE = "http://www.group-finity.com/Mascot"
TICK_MS = 40
ET.register_namespace("", NAMESPACE)


def element(parent, tag, **attributes):
    return ET.SubElement(parent, f"{{{NAMESPACE}}}{tag}", attributes)


def root():
    return ET.Element(f"{{{NAMESPACE}}}Mascot")


def write_xml(path, document):
    ET.indent(document, space="  ")
    ET.ElementTree(document).write(path, encoding="utf-8", xml_declaration=True)


def pose(
    persona,
    animation,
    state,
    index,
    velocity="0,0",
    duration=None,
    right=None,
    anchor=197,
):
    image = f"/{state}-{index:02d}.png"
    element(
        animation,
        "Pose",
        Image=image,
        ImageRight=f"/{right}-{index:02d}.png" if right else image,
        ImageAnchor=f"{persona.cell[0] // 2},{anchor}",
        Velocity=velocity,
        Duration=str(
            duration
            or max(
                1,
                round((index + 1) * persona.durations[state] / TICK_MS)
                - round(index * persona.durations[state] / TICK_MS),
            )
        ),
    )


def validate_package(output, persona):
    character = output / "img" / persona.name
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
                if (
                    image.mode != "RGBA"
                    or image.size != persona.cell
                    or not image.getbbox()
                ):
                    raise ValueError(f"Invalid Shimeji image: {path}")
    return {"ok": True, "actions": len(names), "poses": len(poses), "tick_ms": TICK_MS}


def export_shimeji(build, output, persona):
    character = output / "img" / persona.name
    config = character / "conf"
    config.mkdir(parents=True, exist_ok=True)
    for state, count in persona.states.items():
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
        for index in range(persona.states[state]):
            pose(persona, animation, state, index)
    walk = element(listing, "Action", Name="Walk", Type="Move", BorderType="Floor")
    animation = element(walk, "Animation")
    for index in range(persona.states["running-left"]):
        pose(
            persona,
            animation,
            "running-left",
            index,
            velocity="-2,0",
            right="running-right",
        )
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
        pose(
            persona,
            element(action, "Animation"),
            state,
            index,
            duration=250,
            anchor=anchor,
        )
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
    validation = validate_package(output, persona)
    metadata = {
        "version": persona.version,
        "persona": {"id": persona.identifier, "name": persona.name},
        "source_blend_sha256": persona.source_blend_sha256,
        "validation": validation,
        "files": {
            str(path.relative_to(output)): hashlib.sha256(path.read_bytes()).hexdigest()
            for path in sorted(character.rglob("*"))
            if path.is_file()
        },
    }
    (output / "manifest.json").write_text(json.dumps(metadata, indent=2) + "\n")
    (output / "README.md").write_text(
        f"# {persona.name} for Shimeji\n\n"
        f"Copy `img/{persona.name}` into the Shimeji engine's `img` folder.  \n"
        f"Select {persona.name} in the character chooser.  \n"
        "Use the pet's context menu to choose an action.  \n\n"
        "The image set supports Shimeji-ee compatible engines.  \n"
        "Walking uses independently rendered left and right views.  \n"
    )
    return validation

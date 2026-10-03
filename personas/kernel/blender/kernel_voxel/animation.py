"""Kernel's reusable clip catalog and explicit composition bindings."""

from .keyboard import KEY_MATERIALS, key_intensity
from .rig import DURATIONS, FRAMES, LOCOMOTION, MOTIONS, PARENTS

LABELS = {
    "idle": "Idle",
    "move": "Move",
    "waving": "Wave",
    "jumping": "Jump",
    "failed": "Failure",
    "waiting": "Waiting",
    "running": "Active work",
    "review": "Review",
    "look": "Look around",
    "flying": "Fly",
    "climbing": "Climb",
    "climb-rope": "Rope",
    "climb-ladder": "Ladder",
    "climb-border": "Border",
}
PROPS = ("server", "cable", "keyboard", "keyboard.L")

RIG_LAYERS = {
    "posture": "Posture",
    "arm.L": "Left arm action",
    "arm.R": "Right arm action",
    "head": "Head movement",
}


def rig_layer(name):
    if name == "head":
        return "head"
    if name == "body" or name.startswith(("thigh.", "shin.", "foot.")):
        return "posture"
    return f"arm.{name[-1]}"


def rig_source(state, name):
    layer = name if name in RIG_LAYERS else rig_layer(name)
    if layer == "head" and state in (
        "flying",
        "climbing",
        "climb-rope",
        "climb-ladder",
        "climb-border",
    ):
        return "waiting"
    if state == "look" and layer != "head":
        return "idle"
    if state in ("waving", "review") and layer in ("posture", "arm.L"):
        return "idle"
    if state == "waiting" and layer == "posture":
        return "idle"
    return state


SCREEN_CLIPS = {
    "background": [("rails", "Status rails", 1)],
    "activity": [
        ("empty", "Clear", 1),
        ("terminal", "Terminal", 2.4),
        ("checklist", "Checklist", 1.02),
    ],
    "eyes": [
        ("neutral", "Neutral", 1),
        ("blink", "Natural blink", 4.8),
        ("tired", "Tired", 1),
        ("focused", "Focused", 1),
        ("look", "Look around", 2.08),
        ("empty", "Clear", 1),
    ],
    "mouth": [
        ("smile", "Smile", 1),
        ("open", "Open", 1),
        ("frown", "Frown", 1),
        ("line", "Line", 1),
        ("empty", "Clear", 1),
    ],
}


def binding(clip, clock="independent"):
    return {"clip": clip, "clock": clock, "speed": 1, "offset": 0, "enabled": True}


def animation_project():
    project = {
        "format": "pets-animation",
        "version": 3,
        "components": {},
        "clips": {},
        "compositions": {},
        "exports": {},
    }
    components, clips = project["components"], project["clips"]
    states = {**MOTIONS, "look": 16}
    for name, label in RIG_LAYERS.items():
        component = f"rig/{name}"
        components[component] = {
            "label": label,
            "kind": "rig",
            "data": {
                "nodes": [node for node in PARENTS if rig_layer(node) == name],
                "layer": name,
                "layerLabel": label,
            },
        }
        for state in sorted({rig_source(state, name) for state in states}):
            count = states[state]
            clips[f"{component}/{state}"] = {
                "label": "Attend"
                if name == "head" and state == "waiting"
                else LABELS.get(state, state.replace("-", " ").capitalize()),
                "component": component,
                "duration": count * DURATIONS[state] / 1000,
                "looping": state not in ("jumping", "climb-border"),
                "data": {
                    "source": state,
                    **(
                        {"rootMotion": [0, 0, 0.28]}
                        if name == "posture"
                        and state in ("climbing", "climb-rope", "climb-ladder")
                        else {}
                    ),
                    **(
                        {
                            "blendSpace": [
                                {"source": source, "heading": angle}
                                for source, angle in LOCOMOTION.items()
                            ]
                        }
                        if state == "move"
                        else {}
                    ),
                },
            }
    clips["rig/head/lookat"] = {
        "label": "Lookat",
        "component": "rig/head",
        "duration": 2,
        "looping": True,
        "data": {
            "lookAt": {
                "target": "pointer",
                "position": [0, -3, 2.2],
                "response": 8,
                "weight": 1,
            }
        },
    }
    for layer, sources in SCREEN_CLIPS.items():
        component = f"screen/{layer}"
        components[component] = {
            "label": layer.capitalize(),
            "kind": "screen",
            "data": {"layer": layer, "order": list(SCREEN_CLIPS).index(layer)},
        }
        for row, (generator, label, duration) in enumerate(sources):
            clips[f"{component}/{generator}"] = {
                "label": label,
                "component": component,
                "duration": duration,
                "looping": True,
                "data": {"generator": generator, "row": row},
            }
    for prop in PROPS:
        component = f"prop/{prop}"
        components[component] = {
            "label": prop.capitalize(),
            "kind": "visibility",
            "data": {"node": prop},
        }
        for visible in (False, True):
            clips[f"{component}/{str(visible).lower()}"] = {
                "label": "Visible" if visible else "Hidden",
                "component": component,
                "duration": 1,
                "looping": True,
                "data": {"visible": visible},
            }
    for material, (side, digit) in KEY_MATERIALS.items():
        component = f"emission/{material}"
        components[component] = {
            "label": f"{side} {digit} key",
            "kind": "emission",
            "data": {"material": f"{material}.1"},
        }
        duration = states["running"] * DURATIONS["running"] / 1000
        for mode in ("off", "typing"):
            clips[f"{component}/{mode}"] = {
                "label": "Typing" if mode == "typing" else "Off",
                "component": component,
                "duration": duration,
                "looping": True,
                "data": {
                    "keyframes": [
                        [
                            i * duration / 120,
                            key_intensity(i / 120, digit, 1 if side == "R" else -1)
                            if mode == "typing"
                            else 0,
                        ]
                        for i in range(121)
                    ]
                },
            }
    effects = {
        "thrusters": (
            ["foot.L", "foot.R"],
            "flying",
            "#55e9eb",
            [0, 0, -1.1],
            [0, 0, -0.16],
        ),
    }
    for name, (nodes, state, color, velocity, offset) in effects.items():
        component = f"fx/{name}"
        components[component] = {
            "label": name.replace("-", " ").capitalize(),
            "kind": "effect",
            "data": {"nodes": nodes},
        }
        clips[component] = {
            "label": components[component]["label"],
            "component": component,
            "duration": 1.28,
            "looping": True,
            "data": {
                "generator": "particles",
                "color": color,
                "count": 16,
                "lifetime": 0.32,
                "radius": 0.018,
                "spread": 0.12,
                "velocity": velocity,
                "gravity": [0, 0, -0.3],
                "offset": offset,
            },
        }
    for state, count in states.items():
        bindings = {
            f"rig/{name}": binding(
                f"rig/{name}/{rig_source(state, name)}", "composition"
            )
            for name in RIG_LAYERS
        }
        eye = {
            "running": "empty",
            "failed": "tired",
            "review": "focused",
            "look": "look",
        }.get(state, "blink")
        mouth = {
            "running": "empty",
            "failed": "frown",
            "review": "line",
            "waiting": "open",
        }.get(state, "smile")
        activity = {"running": "terminal", "review": "checklist"}.get(state, "empty")
        for layer, source in {
            "background": "rails",
            "activity": activity,
            "eyes": eye,
            "mouth": mouth,
        }.items():
            clock = "composition" if source in ("look", "checklist") else "independent"
            bindings[f"screen/{layer}"] = binding(f"screen/{layer}/{source}", clock)
        for prop in PROPS:
            bindings[f"prop/{prop}"] = binding(
                f"prop/{prop}/{str(state == 'running').lower()}"
            )
        for material in KEY_MATERIALS:
            component = f"emission/{material}"
            bindings[component] = binding(
                f"{component}/{'typing' if state == 'running' else 'off'}",
                "composition",
            )
        for name, (_, owner, _, _, _) in effects.items():
            if state == owner:
                bindings[f"fx/{name}"] = binding(f"fx/{name}")
        project["compositions"][state] = {
            "label": LABELS.get(state, state.replace("-", " ").capitalize()),
            "description": "",
            "enabled": True,
            "duration": count * DURATIONS[state] / 1000,
            "bindings": bindings,
        }
    for state in ("waving", "look", "review", "waiting"):
        child = project["compositions"][state]
        child["parent"] = "idle"
        child["bindings"] = {
            component: source
            for component, source in child["bindings"].items()
            if source != project["compositions"]["idle"]["bindings"].get(component)
        }
    for state in ("climb-rope", "climb-ladder", "climb-border"):
        child = project["compositions"][state]
        child["parent"] = "climbing"
        child["bindings"] = {
            component: source
            for component, source in child["bindings"].items()
            if source != project["compositions"]["climbing"]["bindings"].get(component)
        }
    project["compositions"]["move"]["properties"] = {
        "heading": 0,
        "turnSpeed": 240,
        "animationSpeed": 1,
        "moveSpeed": 0.7,
    }
    from .outputs import output_binding

    project["exports"] = {
        target: {state: output_binding(state) for state in [*FRAMES, "look"]}
        for target in ("codex", "shimeji")
    }
    import json
    from pathlib import Path

    grips = json.loads(
        (
            Path(__file__).resolve().parents[4] / "resources/kernel-rope-grips.json"
        ).read_text()
    )
    project["components"].update(grips["components"])
    project["clips"].update(grips["clips"])
    project["compositions"]["climb-rope"]["bindings"].update(grips["bindings"])
    return project


PROJECT = animation_project()


def resolve_composition(project, identifier):
    """Resolve live inherited bindings while retaining sparse editable overrides."""
    chain, seen = [], set()
    cursor = identifier
    while cursor is not None:
        if cursor in seen:
            raise ValueError(f"Composition cycle: {cursor}")
        seen.add(cursor)
        composition = project["compositions"][cursor]
        chain.append(composition)
        cursor = composition.get("parent")
    result = dict(chain[0])
    result["bindings"] = {}
    result["properties"] = {}
    duration = None
    for composition in reversed(chain):
        if "screen" in composition:
            screen = composition["screen"]
            result["bindings"] = {
                component: binding
                for component, binding in result["bindings"].items()
                if project["components"][component]["kind"]
                not in ("screen", "face-mesh")
            }
            result["bindings"].update(project["screens"][screen]["bindings"])
            result["screen"] = screen
        result["bindings"].update(composition["bindings"])
        result["properties"].update(composition.get("properties", {}))
        duration = composition.get("duration", duration)
    if duration is None or duration <= 0:
        raise ValueError(f"Composition needs a duration: {identifier}")
    result["duration"] = duration
    return result


def screen_bindings(state, phase):
    from .outputs import output_instance

    state, _ = output_instance(state)
    composition = resolve_composition(PROJECT, state)
    seconds = phase * composition["duration"]
    for component, source in composition["bindings"].items():
        if (
            PROJECT["components"][component]["kind"] != "screen"
            or not source["enabled"]
        ):
            continue
        clip = PROJECT["clips"][source["clip"]]
        cycles = (
            phase if source["clock"] == "composition" else seconds / clip["duration"]
        )
        cycles = cycles * source["speed"] + source["offset"]
        yield (
            component.split("/", 1)[1],
            clip["data"]["generator"],
            cycles % 1 if clip["looping"] else min(1, max(0, cycles)),
        )


def prop_visible(state, prop):
    from .outputs import output_instance

    state, _ = output_instance(state)
    component = f"prop/{prop}"
    source = resolve_composition(PROJECT, state)["bindings"].get(component)
    return bool(
        source
        and source["enabled"]
        and PROJECT["clips"][source["clip"]]["data"]["visible"]
    )


def playback_duration(project, identifier):
    composition = resolve_composition(project, identifier)
    return composition["duration"] / composition["properties"].get("animationSpeed", 1)

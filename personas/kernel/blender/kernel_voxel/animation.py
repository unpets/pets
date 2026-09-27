"""Kernel's reusable clip catalog and explicit composition bindings."""

from .keyboard import KEY_MATERIALS, key_intensity
from .rig import DURATIONS, FRAMES, PARENTS

LABELS = {
    "idle": "Idle",
    "running-right": "Move right",
    "running-left": "Move left",
    "waving": "Wave",
    "jumping": "Jump",
    "failed": "Failure",
    "waiting": "Waiting",
    "running": "Active work",
    "review": "Review",
    "look": "Look around",
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
    layer = rig_layer(name)
    if state == "look" and layer != "head":
        return "idle"
    if state == "waving" and layer in ("posture", "arm.L"):
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
        "version": 2,
        "components": {},
        "clips": {},
        "compositions": {},
        "exports": {},
    }
    components, clips = project["components"], project["clips"]
    states = {**FRAMES, "look": 16}
    for name in PARENTS:
        component = f"rig/{name}"
        components[component] = {
            "label": name.replace("_", " "),
            "kind": "rig",
            "data": {
                "nodes": [name],
                "layer": rig_layer(name),
                "layerLabel": RIG_LAYERS[rig_layer(name)],
            },
        }
        for state, count in states.items():
            clips[f"{component}/{state}"] = {
                "label": LABELS[state],
                "component": component,
                "duration": count * DURATIONS[state] / 1000,
                "looping": state != "jumping",
                "data": {"source": state},
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
    for state, count in states.items():
        bindings = {
            f"rig/{name}": binding(
                f"rig/{name}/{rig_source(state, name)}", "composition"
            )
            for name in PARENTS
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
        project["compositions"][state] = {
            "label": LABELS[state],
            "description": "",
            "duration": count * DURATIONS[state] / 1000,
            "bindings": bindings,
        }
    for state in ("waving", "look"):
        child = project["compositions"][state]
        child["parent"] = "idle"
        child["bindings"] = {
            component: source
            for component, source in child["bindings"].items()
            if source != project["compositions"]["idle"]["bindings"].get(component)
        }
    project["exports"] = {
        target: {state: state for state in states} for target in ("codex", "shimeji")
    }
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
    duration = None
    for composition in reversed(chain):
        result["bindings"].update(composition["bindings"])
        duration = composition.get("duration", duration)
    if duration is None or duration <= 0:
        raise ValueError(f"Composition needs a duration: {identifier}")
    result["duration"] = duration
    return result


def screen_bindings(state, phase):
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
    component = f"prop/{prop}"
    source = resolve_composition(PROJECT, state)["bindings"].get(component)
    return bool(
        source
        and source["enabled"]
        and PROJECT["clips"][source["clip"]]["data"]["visible"]
    )

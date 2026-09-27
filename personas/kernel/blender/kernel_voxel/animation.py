"""Kernel's reusable clip catalog and explicit composition bindings."""

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
PROPS = ("server", "cable", "keyboard")
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
        "version": 1,
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
            "data": {"nodes": [name]},
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
    for state, count in states.items():
        bindings = {
            f"rig/{name}": binding(f"rig/{name}/{state}", "composition")
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
        project["compositions"][state] = {
            "label": LABELS[state],
            "description": "",
            "duration": count * DURATIONS[state] / 1000,
            "bindings": bindings,
        }
    project["exports"] = {
        target: {state: state for state in states} for target in ("codex", "shimeji")
    }
    return project


PROJECT = animation_project()


def screen_bindings(state, phase):
    composition = PROJECT["compositions"][state]
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
    source = PROJECT["compositions"][state]["bindings"].get(component)
    return bool(
        source
        and source["enabled"]
        and PROJECT["clips"][source["clip"]]["data"]["visible"]
    )

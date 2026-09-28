"""Host view adapters. Motion clips use local forward (-Y), with Z up."""

import math

# Match the orthographic export camera azimuth, independently of the source rig.
CAMERA_POSITION = (2.26, -10.0, 5.27)
CAMERA_TARGET = (0.06, 0.0, 1.47)
VIEW_HEADING = math.degrees(
    math.atan2(
        CAMERA_POSITION[0] - CAMERA_TARGET[0],
        CAMERA_TARGET[1] - CAMERA_POSITION[1],
    )
)


def output_binding(intent):
    if intent in ("running-left", "running-right"):
        return {
            "composition": "move",
            "properties": {"heading": -90 if intent == "running-left" else 90},
            "headingSpace": "view",
        }
    return intent


def output_instance(intent):
    source = output_binding(intent)
    if isinstance(source, str):
        return source, {}
    properties = dict(source.get("properties", {}))
    if source.get("headingSpace") == "view" and "heading" in properties:
        properties["heading"] += VIEW_HEADING
    return source["composition"], properties

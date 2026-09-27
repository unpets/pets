"""Select an available Cycles compute backend for headless rendering."""

import bpy

BACKENDS = ("OPTIX", "CUDA", "HIP", "ONEAPI", "METAL")


def configure_render_device(scene, requested="auto"):
    preferences = bpy.context.preferences.addons["cycles"].preferences
    supported = {entry[0] for entry in preferences.get_device_types(bpy.context)}
    candidates = BACKENDS if requested == "auto" else (requested.upper(),)
    for backend in candidates:
        if backend not in supported:
            continue
        preferences.compute_device_type = backend
        preferences.refresh_devices()
        devices = [device for device in preferences.devices if device.type == backend]
        if not devices:
            continue
        for device in preferences.devices:
            device.use = device.type == backend
        scene.cycles.device = "GPU"
        print(
            f"Cycles device: {backend} ({', '.join(d.name for d in devices)})",
            flush=True,
        )
        return backend
    if requested not in {"auto", "cpu"}:
        raise RuntimeError(f"No usable Cycles {requested.upper()} device found")
    preferences.compute_device_type = "NONE"
    scene.cycles.device = "CPU"
    print("Cycles device: CPU", flush=True)
    return "CPU"

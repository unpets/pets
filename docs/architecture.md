# Architecture

Pets separates companion behavior, host integration, persona implementation, and export formats.  
The core is a Rust library with no dependency on Tauri, Svelte, Three.js, Blender, or Kernel.  

## Rust core

`crates/pets-core` owns persona identity, representation descriptors, export target identifiers, and wandering decisions.  
Hosts supply elapsed time, entropy, and desktop bounds.  
The core returns an animation intent and an optional position.  
It performs no operating system calls or rendering.  

| Representation | Contract |
| --- | --- |
| `2d` | Sprite atlas path and frame dimensions |
| `3d` | Model path and animation data path |

Asset paths are portable and relative to the persona's generated asset directory.  
The manifest schema is versioned and validated by the core.  
Representation descriptors define the data boundary; rendering belongs to an adapter.  

## Applications

The Tauri host links `pets-core` and translates desktop samples into core inputs.  
It applies returned positions through the window API and handles the tray and application lifecycle.  
The Svelte application owns studio controls, presentation state, and renderer lifecycle.  
Its Three.js integration loads Kernel through the `@pets/kernel` workspace package.  

The bundled default is selected at the application composition boundary.  
`personas/kernel/persona.json` supplies the same identity to the native host and frontend.  
The Rust core does not select or import a specific persona.  

## Personas and visual runtime

Kernel's Blender code lives in `personas/kernel/blender/kernel_voxel`.  
Its web display, gaze adapter, cable, character assembly, and screen editor live in `personas/kernel/web`.  
`packages/three-runtime` contains reusable animation transitions.  
The application supplies the initial animation when creating that playback adapter.  

The Blender source is generated and verified before web assets or sprites.  
Meshes, joint placement, screen expressions, and clip timing belong to the persona.  
Application code orchestrates those assets through the persona adapter.  

## Export adapters

`exporters/pets_exports/codex.py` owns the Codex v2 atlas layout and validation.  
`exporters/pets_exports/shimeji.py` owns the Shimeji configuration and image package format.  
They consume rendered frames and format-specific metadata.  
Kernel's build pipeline verifies its source records before invoking the adapters.  

An export target translates persona output into another application's format.  
It does not become the source of companion behavior or model geometry.  
Additional formats belong beside the existing adapters and must declare their input requirements.  

## Dependency rules

- Hosts depend on the Rust core; the core does not depend on hosts.
- Applications select persona adapters; shared runtime packages do not import Kernel.
- Export adapters consume rendered assets; they do not import the Kernel generator.
- Kernel owns its rig, materials, display layers, and Blender generation.
- Build targets request only their required artifacts and verify cached outputs.

# Architecture

Pets separates companion behavior, host integration, persona implementation, and export formats.  
The core is a Rust library with no dependency on Tauri, Svelte, Three.js, Blender, or Kernel.  

## Rust core

`crates/pets-core` owns persona identity, representation descriptors, export mechanisms, and wandering decisions.  
Hosts supply elapsed time, entropy, and desktop bounds.  
The core returns an animation intent and an optional position.  
Behavior decisions perform no operating system calls or rendering.  

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

## Core exports

`crates/pets-core/src/export` owns export dispatch, input validation, checksums, and format implementations.  
The Codex implementation assembles and validates the v2 atlas.  
The Shimeji implementation writes and validates configuration, images, and package metadata.  
Both consume rendered frames and a persona descriptor through the same Rust API.  
Filesystem and memory stores share those implementations.  
The browser embeds the Rust core as WebAssembly and supplies rendered PNG frames in memory.  
The descriptor includes identity, version, frame dimensions, animation counts, timing, and provenance.  

The `export` Cargo feature enables these mechanisms independently of the native host.  
The `cli` feature adds the Clap-based `pets-export` command.  
`crates/pets-core/python/pets_core` transports JSON and paths to that command without implementing formats.  
Kernel's build pipeline verifies its source records before invoking this bridge.  
An installed executable is reused through `PETS_EXPORT_BIN` or `PATH`; source checkouts can use Cargo directly.  

An export target translates persona output into another application's format.  
It does not become the source of companion behavior or model geometry.  
Additional formats belong beside the existing adapters and must declare their input requirements.  

## Dependency rules

- Hosts depend on the Rust core; the core does not depend on hosts.
- Applications select persona adapters; shared runtime packages do not import Kernel.
- Export adapters consume rendered assets; they do not import the Kernel generator.
- Kernel owns its rig, materials, display layers, and Blender generation.
- Build targets request only their required artifacts and verify cached outputs.

## Animation composition

The core owns component, clip, composition, timing, and export binding contracts.  
Renderer adapters interpret clip data and apply evaluated phases to their targets.  
Kernel supplies reusable joint motion, screen clips, prop bindings, and default compositions.  
The studio edits the same project imported by the standalone companion.  
See [Animation projects](animation.md) for the data flow and authoring controls.  

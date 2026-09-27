# Development

## Toolchain

Bun manages the web workspace and runs Vite.  
The viewer uses Svelte, Tailwind CSS, Lucide, and Three.js.  
Exact dependency versions are recorded in `bun.lock`.  

Svelte source transformation uses the `typescript` dependency.  
The `@typescript/native` compiler performs the type checks.  
`bun run check` validates Svelte components and the Vite configuration.  

uv manages the Python environment and dependencies.  
The renderer uses Blender through the `bpy` wheel.  
Python requirements are declared in `pyproject.toml`.  
Exact Python dependencies are recorded in `uv.lock`.  

## Local viewer

```sh
bun install --frozen-lockfile
uv sync --frozen
bun run generate
bun run dev
```

Drag to orbit the model and scroll to zoom.  
Animation controls support playback, speed adjustment, and timeline scrubbing.  
Joint markers and wireframe views expose the model structure.  
The display preview uses the same framebuffer as the model screen.  

```sh
bun run check
bun run format:check
bun test
bun run build
bunx playwright install chromium firefox
bun run test:viewer
```

The production build writes one self-contained `dist/index.html`.  
Vite inlines scripts, styles, the GLB model, motion metadata, and display atlas.  
The same file runs offline through `file://` and under HTTP project subpaths.  
Browser checks open an isolated copy with external requests blocked and verify both downloads.  
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` optionally selects an existing Chromium installation for local browser checks.  

## Rendering

```sh
uv run kernel-render --output build --site-output web/public
uv run ruff check kernel_voxel scripts tests
uv run ruff format --check kernel_voxel scripts tests
uv run python -m unittest discover -s tests -v
```

Use `bun run generate` to build the Blender source and export only the viewer assets.  
Use `--render-only --states jumping` to render one state without other exports.  
Use `--assemble-only` to assemble verified existing frames.  
Every target checks content fingerprints and output hashes before reusing artifacts.  
Missing or modified outputs invalidate their stage.  
An animation change invalidates its frames while unrelated states remain reusable.  

| Output | Contents |
| --- | --- |
| `build/kernel-spritesheet.png` | Transparent 1536 × 2288 v2 atlas with 73 frames |
| `build/masters/` | 768 × 832 transparent source renders |
| `build/frames/` | Native 192 × 208 pet frames |
| `build/kernel.blend` | Editable scene with a baked animation timeline |
| `build/blend-screens/` | Framebuffer images referenced by the Blender scene |
| `web/public/assets/` | GLB model, animation samples, and display sequence |

Keep `blend-screens/` beside the Blender scene.  
GIF previews are also written to the render directory.  

## Architecture

| Module | Responsibility |
| --- | --- |
| `kernel_voxel/model.py` | Voxel meshes, materials, display recess, server, camera, and lighting |
| `kernel_voxel/armature.py` | Bone hierarchy, rigid attachments, and slotted animation actions |
| `kernel_voxel/surfaces.py` | Coplanar face resolution and shared interface removal |
| `kernel_voxel/rig.py` | Continuous poses, limb constraints, foot placement, and wrist cable |
| `kernel_voxel/screen.py` | Deterministic expressions, terminal output, and digital rain |
| `kernel_voxel/render.py` | Command targets and dependency orchestration |
| `kernel_voxel/scene.py` | Canonical Blender source and saved action evaluation |
| `kernel_voxel/pipeline.py` | Stage dependencies and artifact reuse |
| `kernel_voxel/cache.py` | Content fingerprints and output verification |
| `kernel_voxel/devices.py` | Cycles GPU selection and CPU fallback |
| `kernel_voxel/raster.py` | Frame rendering and premultiplied alpha reduction |
| `kernel_voxel/export.py` | glTF clips and web display assets |
| `kernel_voxel/previews.py` | Preview images and animations from encoded frames |
| `kernel_voxel/validation.py` | Saved rig, screen, and visibility checks |
| `web/src/components/` | Svelte viewport, playback controls, and display preview |
| `web/src/lib/studio.ts` | Three.js scene and renderer lifecycle |
| `web/src/lib/motion.ts` | AnimationMixer transitions and cable geometry |
| `web/src/lib/screen.ts` | Shared framebuffer canvas and display texture |
| `web/src/lib/assets.ts` | Model, animation, and framebuffer loading |

The canonical Blender scene is built and verified before downstream generation.  
Every view evaluates the bones and actions loaded from that saved file.  
Only exposed cube faces are emitted.  
The screen is parented to the head inside a fixed aperture.  
Transparent renders are reduced in premultiplied alpha.  

The mechanical rig uses fixed limb lengths and authored joint motion.  
Upper and lower segments share a hinge axis with a consistent flexion direction.  
Stationary states keep both feet planted.  
The GLB contains ten named clips and the complete bone hierarchy.  
Rigid bone parenting preserves the mechanical parts and fixed limb lengths.  
The viewer blends local bone transforms from the displayed pose, including interrupted transitions.  
The cable is evaluated from the transformed wrist connector.  
Blender stores editable slotted actions and a baked preview timeline.  
Server and cable visibility follow active work in both the viewport and rendered timeline.  
The pet runtime uses fixed frame counts and 192 × 208 cells.  

## GitHub Actions

The model studio workflow runs on pushes, pull requests, and manual requests.  
It checks the source, generates model assets, builds the site, and runs browser checks.  
The resulting site is stored as the `kernel-model-studio` artifact.  

[Release process](releasing.md) covers full renders, versioned downloads, and Pages deployment.  

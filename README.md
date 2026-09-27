# Kernel

An articulated voxel companion, built from a real 3D model. Graphite armor, violet stack seams, cyan display, and a quiet terminal personality.

## Toolchain

- **Bun 1.3.11 + Vite 8.1.3 + Three.js 0.180.0**. The viewer was scaffolded with the official `bun create vite web --template vanilla --no-interactive` generator.
- **Python 3.11 + Blender 4.3 (`bpy`)**, managed by uv. CPU rendering works headlessly, with no GPU or Blender desktop installation required.
- Exact dependencies are committed in `bun.lock` and `uv.lock`. This repository stays private.

## Interactive 3D viewer

```sh
bun install --frozen-lockfile
uv sync --frozen
bun run generate
bun dev
```

Drag to orbit, scroll to zoom, choose any of the nine animation states or the look sweep, pause, scrub, change speed, inspect the joints or wireframe, and download the model. Active work displays deterministic terminal output and digital rain while the right wrist is connected to a three-bay server. The live screen panel shows the same framebuffer as the model.

```sh
bun run build       # Vite production site in dist/
bun run preview
bun test            # generated-model and motion-data contract
bun run test:viewer # Playwright: install Chromium with bunx playwright install chromium
```

The site is self-contained: Three.js is bundled locally, with no CDN, telemetry, backend, or authentication token in the output. `base: './'` supports a GitHub Pages project subpath.

## Render the pet and editable scene

```sh
uv run kernel-render --output build --site-output web/public
uv run python -m unittest discover -s tests -v
```

Outputs include:

- `build/kernel-spritesheet.png`: transparent 1536 × 2288 v2 atlas, 73 frames.
- `build/masters/`: 768 × 832 RGBA source renders, plus native `192 × 208` cells in `frames/`.
- Nine state GIFs, look sweep, all-state preview, idle/jump/idle loop, and light/dark edge inspection.
- `build/kernel.blend`: the editable voxel scene with a baked 24 fps animation timeline. Keep `blend-screens/` beside it for the scripted framebuffer sequence.
- `web/public/assets/kernel.glb`, `animations.json`, `screens.png`: the same 3D geometry, continuous rig samples and screen sequence used by the interactive viewer.

For a quick asset-only rebuild use `bun run generate`. Render a repaired state using `--states jumping`; the complete atlas is rebuilt when all required frame files exist. The model uses 82,688 occupied source voxels, with a 0.035-unit principal grid and finer mechanical parts. Only exposed cube faces are emitted. There are no bevel or chamfer modifiers, outline passes, bloom, or painted frames.

## Source of truth

| Module | Responsibility |
| --- | --- |
| `kernel_voxel/model.py` | Voxel meshes, materials, recessed display, server, camera and lighting |
| `kernel_voxel/rig.py` | Continuous poses, analytic two-bone IK, fixed limb lengths, wrist cable and planted feet |
| `kernel_voxel/screen.py` | Deterministic 96 × 64 framebuffer, expressions, terminal tokens and digital rain |
| `kernel_voxel/render.py` | CPU rendering, alpha-safe reduction, atlas, previews, Blender scene and web assets |
| `web/` | Vite-generated Three.js viewer, controls and timeline |

All views come from the model. The display is one UV-mapped plane parented to the head, inside one fixed aperture. Lighting and camera use a coherent 3D projection. Native transparent rendering is reduced in premultiplied alpha with a box filter; no chroma cleanup recolors antialiased edges.

Stationary states keep both feet fixed. Directional movement uses an in-place gait with 60% stance and 40% swing, toe clearance, counter-swinging arms and body weight transfer. The host controls drag speed. This is an authored rigid mechanical rig, not a physics simulation. The viewer interpolates 120 rig samples per cycle; the pet runtime has fixed frame counts and 192 × 208 cells. Smooth viewer motion and high-resolution masters do not raise that runtime limit.

## GitHub Actions and Pages

`.github/workflows/render.yml` installs locked dependencies with **Bun and uv**, tests the rig, generates the Blender scene and sprites, runs Bun asset tests, builds with Vite, checks the site in Chromium, and uploads both the model/pet package and generated site.

To publish from this private repository, choose **Settings → Pages → Build and deployment → Source: GitHub Actions** once. The workflow detects that setting and deploys on subsequent pushes to `main`. Until enabled, the generated site is available as the `kernel-model-studio` workflow artifact. GitHub Pages in a private personal repository requires an eligible paid GitHub plan; the website itself is public. No repository visibility change is made by the workflow.

GitHub commits are created using the owner's authenticated integration. This integration does not expose a cryptographic signing option. Contributions may include a `Co-authored-by: Codex <codex@openai.com>` trailer; this is attribution, not a signature.

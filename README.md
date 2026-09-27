# Kernel

A voxel companion with an articulated mechanical rig and a programmable display.  
Every view is generated from the same Blender model.  
The Svelte studio uses Three.js to display the model and play its animations.  

## Requirements

Install [Bun](https://bun.sh/docs/installation) and [uv](https://docs.astral.sh/uv/getting-started/installation/).  
The Bun version is declared in `package.json`.  
uv manages Python and the renderer dependencies.  
Blender's Python module provides headless model generation and rendering.  

## Quick start

```sh
git clone https://github.com/GGLinnk/pets.git
cd pets
uv sync --frozen
bun install --frozen-lockfile
bun run generate
bun run dev
```

Open the local URL printed by Vite.  
Drag to orbit, scroll to zoom, and use the controls to select or scrub an animation.  
The display preview shows the same framebuffer as the model screen.  

## Build the static site

After installing dependencies, generate the model assets and build the viewer.  

```sh
bun run generate
bun run build
```

Open `dist/index.html` directly in a browser.  
The single HTML file embeds the viewer, rigged model, animation clips, and display atlas.  
It also works on static hosting, including GitHub Pages project URLs.  
Use `bun run preview` to serve the production build locally.  

## Render the pet and Blender scene

```sh
uv run kernel-render --output build --site-output web/public
```

The build creates and verifies `build/kernel.blend` before generating downstream outputs.  
Sprites and web assets are generated from that saved scene and its animation actions.  
Unchanged outputs are reused after their inputs and checksums are verified.  
Rendering automatically uses a supported GPU when available and falls back to CPU.  
Use `--device cpu` or select `optix`, `cuda`, `hip`, `oneapi`, or `metal` explicitly.  

| Target | Command |
| --- | --- |
| Blender source | `uv run kernel-render --model-only` |
| Viewer assets | `bun run generate` |
| One animation | `uv run kernel-render --render-only --states jumping` |
| Assemble existing frames | `uv run kernel-render --assemble-only` |

Use `--blend build/kernel.blend` to consume an existing verified source without rebuilding it.  
Selected animation renders do not assemble the atlas or export web assets.  

| Output | Contents |
| --- | --- |
| `build/kernel.blend` | Editable model and baked animation timeline |
| `build/blend-screens/` | Deterministic display image sequence |
| `build/kernel-spritesheet.png` | Transparent pet sprite sheet |
| `build/masters/` | High-resolution source frames |
| `build/frames/` | Native pet animation frames |
| `web/public/assets/` | GLB model, animation data, and display atlas |
| `dist/index.html` | Self-contained viewer for direct opening or static hosting |

Keep `blend-screens/` beside `kernel.blend` when opening or moving the scene.  

## Checks

Run these checks after generating the web assets.  

```sh
uv run python -m unittest discover -s tests -v
bun run check
bun test
```

Browser checks require a production build and Playwright's browsers.  

```sh
bun run build
bunx playwright install --with-deps chromium firefox
bun run test:viewer
```

[Development](docs/development.md) describes formatting, module responsibilities, and renderer details.  

## Releases

Pushing a version change to `main` starts **Release Kernel**.  
The workflow can also be started from GitHub Actions.  
Pushing a matching `vMAJOR.MINOR.PATCH` tag also starts a release.  

Releases include native desktop applications, Shimeji assets, offline HTML, and Blender, pet, model, and site packages with SHA-256 checksums.  
Publishing happens only after rendering, validation, and browser checks succeed.  
Published release assets are never overwritten.  
The released static site is deployed to GitHub Pages.  

Use **Build Kernel model studio** for development builds and checks.  
[Release documentation](docs/releasing.md) covers version changes, package contents, and deployment.  

## Desktop pet

Install the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) and Rust.  
Generate the shared model assets, then start the desktop pet.  

```sh
bun run generate
bun run dev:desktop
```

Use `bun run build:desktop` to create a native application.  
The transparent pet follows the desktop cursor with a bounded, smoothly animated neck.  
Drag the pet to move it and right-click to open its controls.  
The tray menu opens controls or quits the application.  
Mouse tracking, wandering, and animation playback have separate controls.  
`bun run build:pet` creates the browser companion in `dist-pet/pet.html`.  

## Screen studio

The screen editor provides independent background, activity, eyes, and mouth layers.  
Each layer has visibility, opacity, color, position, and expression controls.  
Changes appear on the 3D model and display preview.  
Export a screen project as JSON and import it in the studio or desktop pet.  
Layer assets are generated from the deterministic screen renderer.  

## Shimeji

Render the pet frames, then export the character image set.  

```sh
uv run kernel-render --output build
bun run build:shimeji
```

Copy `build-shimeji/img/Kernel` into the Shimeji engine's `img` folder.  
Select Kernel in the character chooser.  
The package supports Shimeji-ee compatible engines and includes dragging, falling, walking, and cursor chasing.  
The exporter reuses verified frames without rebuilding the model.  

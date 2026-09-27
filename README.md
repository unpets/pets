# Kernel

A voxel companion with an articulated mechanical rig and a programmable display.  
Every view is generated from the same Blender model.  
The Svelte studio uses Three.js to display the model and play its animations.  

## Requirements

Install [Bun](https://bun.sh/docs/installation) and [uv](https://docs.astral.sh/uv/getting-started/installation/).  
The Bun version is declared in `package.json`.  
uv manages Python 3.11 and the Blender 4.3 Python dependency.  
A separate Blender desktop installation is not required to generate assets.  

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
bun run preview
```

The complete static site is written to `dist/`.  
Deploy that directory to a static HTTP server.  
Relative asset paths support GitHub Pages project URLs.  

## Render the pet and Blender scene

```sh
uv run kernel-render --output build --site-output web/public
```

The full render generates the sprite sheet, preview animations, and editable Blender scene.  
Use `--states jumping` to render one animation state.  
Use `bun run generate` when only the web assets are needed.  

| Output | Contents |
| --- | --- |
| `build/kernel.blend` | Editable model and baked animation timeline |
| `build/blend-screens/` | Deterministic display image sequence |
| `build/kernel-spritesheet.png` | Transparent pet sprite sheet |
| `build/masters/` | High-resolution source frames |
| `build/frames/` | Native pet animation frames |
| `web/public/assets/` | GLB model, animation data, and display atlas |
| `dist/` | Production static site |

Keep `blend-screens/` beside `kernel.blend` when opening or moving the scene.  

## Checks

Run these checks after generating the web assets.  

```sh
uv run python -m unittest discover -s tests -v
bun run check
bun test
```

Browser checks require a production build and Playwright's Chromium browser.  

```sh
bun run build
bunx playwright install --with-deps chromium
bun run test:viewer
```

[Development](docs/development.md) describes formatting, module responsibilities, and renderer details.  

## Releases

Run **Release Kernel** from GitHub Actions to build and publish the current project version.  
Manual runs publish by default and create the matching version tag when it is missing.  
Disable the `publish` input for a build-only run.  
Pushing a matching `vMAJOR.MINOR.PATCH` tag also starts a release.  

Releases include Blender, pet, model, and static site packages with SHA-256 checksums.  
Publishing happens only after rendering, validation, and browser checks succeed.  
Published release assets are never overwritten.  

GitHub Pages deployment requires **Settings → Pages → GitHub Actions**.  
The site remains available as a release download when Pages is disabled.  
[Release documentation](docs/releasing.md) covers version changes, package contents, and deployment.  

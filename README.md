# Pets

A standalone companion application and persona studio.  
Kernel is the bundled default persona.  
The Rust core defines persona contracts, companion behavior, and export mechanisms.  
Svelte and Three.js provide the studio and visual runtime.  

## Structure

| Path | Responsibility |
| --- | --- |
| `crates/pets-core/` | Rust persona contracts, behavior, exports, and Clap CLI |
| `apps/desktop/` | Tauri desktop host and operating system integration |
| `apps/studio/` | Svelte studio and browser companion |
| `packages/three-runtime/` | Shared Three.js animation playback |
| `personas/kernel/` | Default persona, Blender generator, rig, display, and editor |

Persona contracts distinguish 2D sprite assets from 3D model assets.  
Renderers and export adapters consume persona assets without defining the application core.  
[Architecture](docs/architecture.md) describes the boundaries and dependency direction.  

## Requirements

Install [Bun](https://bun.sh/docs/installation), [uv](https://docs.astral.sh/uv/getting-started/installation/), and [Rust](https://www.rust-lang.org/tools/install).  
The toolchain requirements are declared in the workspace manifests.  
uv manages Python and Blender's headless rendering module.  
Native desktop builds also require the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).  

## Run the studio

Run these commands from a terminal to install dependencies, generate Kernel's assets, and start the studio.  

```sh
git clone https://github.com/unpets/pets.git
cd pets
uv sync --frozen
bun install --frozen-lockfile
bun run generate
bun run dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173) in a browser.  
If that port is occupied, use the URL printed by Vite.  
Keep the terminal running while using the studio.  
Press `Ctrl+C` to stop it.  

For subsequent sessions, run this command from the repository root.  

```sh
bun run dev
```

### Studio workspaces

| Workspace | Purpose |
| --- | --- |
| Persona | Create, duplicate, rename, import, export, and switch personas. |
| Face | Compose reusable faces and edit their independent components. |
| Animation | Edit reusable motion, prop, and effect parts. |
| Composition | Assemble animation parts, assign screens, and set inheritance. |
| Scene | Arrange independent environment assets and inspect the model, camera, lighting, and joints. |

Use **File**, **Export**, and **Assets** in the menu bar to import projects, save work, and download source files.  

Drag to orbit and scroll to zoom.  
Use the timeline to scrub or step through frames.  
Press `Space` to play or pause.  

See the [Studio guide](docs/studio.md) for editing controls and export options.  

## Build the applications

```sh
bun run generate
bun run build
bun run build:pet
bun run build:desktop
```

| Output | Use |
| --- | --- |
| `dist/index.html` | Self-contained studio for direct opening or static hosting |
| `dist-pet/pet.html` | Self-contained browser companion |
| `target/release/bundle/` | Native desktop packages |

Studio builds compile the Rust export backend for WebAssembly and embed it in the HTML.  
`bun run build:core` builds that backend independently.  
Both HTML files work through `file://` and HTTP.  
Use `bun run dev:desktop` to start the native companion during development.  
Drag the companion to move it and right-click to open its controls.  
Mouse tracking, wandering, and playback have separate controls.  

## Generate Kernel assets

```sh
uv run kernel-render --output build --site-output personas/kernel/generated
```

The generator creates and verifies `build/kernel.blend` before downstream exports.  
Every view comes from that saved model and its rigged animation actions.  
Unchanged outputs are reused after their inputs and checksums are verified.  
Rendering uses a supported GPU when available and falls back to CPU.  
Use `--device cpu`, `optix`, `cuda`, `hip`, `oneapi`, or `metal` to select a backend.  

| Target | Command |
| --- | --- |
| Blender source | `uv run kernel-render --model-only` |
| Studio assets | `bun run generate` |
| One animation | `uv run kernel-render --render-only --states jumping` |
| Codex atlas from rendered frames | `uv run kernel-render --assemble-only` |
| Shimeji package | `uv run kernel-shimeji --build build --output build-shimeji` |

Use `--blend build/kernel.blend` to consume a verified source without rebuilding it.  
Keep `blend-screens/` beside `kernel.blend` when opening or moving the scene.  
The Codex atlas is written to `build/kernel-spritesheet.png`.  
Copy `build-shimeji/img/Kernel` into a Shimeji-ee compatible engine's `img` folder.  
Both image formats are generated and validated by the Rust core.  
Run `bun run export --help` for the persona-independent export CLI.  
Use `uv run kernel-compose --blend build/kernel.blend --project kernel.pets.json --output build-composed` to bake Studio edits into Blender.  

## Checks

```sh
bun run test:core
uv run python -m unittest discover -s tests -v
bun run check
bun test
bun run format:check
bun run format:core:check
```

Generate studio assets before running the frontend tests.  
Browser checks require production builds and Playwright browsers.  

```sh
bun run build
bun run build:pet
bunx playwright install --with-deps chromium firefox
bun run test:viewer
bun run test:pet
bun run test:studio
```

[Development](docs/development.md) covers targeted builds and validation.  

## Releases

Pushing a version change to `main` starts **Release Pets**.  
The workflow also accepts matching version tags and manual runs.  
It validates, packages, and publishes the GitHub Release before deploying the static site.  
Downloads include native applications, offline HTML, Blender sources, model assets, and Codex and Shimeji packages.  
Published assets are immutable and include SHA-256 checksums.  
[Release documentation](docs/releasing.md) describes versioning and deployment.  

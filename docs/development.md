# Development

## Workspaces

Cargo manages the Rust core and native host through the root `Cargo.toml`.  
Bun manages the studio, desktop launcher, Three.js runtime, and Kernel web adapter.  
uv installs the persona generator and Rust core bridge from `pyproject.toml`.  
`Cargo.lock`, `bun.lock`, and `uv.lock` record resolved dependencies.  

```sh
uv sync --frozen
bun install --frozen-lockfile
cargo test -p pets-core --all-features --locked
```

The default Cargo member is `pets-core`, so core checks do not build native UI dependencies.  
Use `bun run build:desktop` to build the Tauri application with its frontend.  

## Studio and browser companion

```sh
bun run generate
bun run dev
bun run dev:pet
```

The studio and browser companion share Kernel's character adapter and screen compositor.  
Vite embeds their assets into self-contained HTML builds.  
Studio builds compile the Rust core for `wasm32-unknown-unknown`.  
`bun run build:core` installs that Rust target when needed and uses Cargo incremental compilation.  
The build uses Cargo's reported artifact path and stages the module in `apps/studio/generated/`.  
Custom Cargo target directories are supported without changing Vite imports.  
Tailwind scans the application and persona components.  
The footer uses the checkout commit SHA.  
Set `PETS_COMMIT_SHA` when building from a source archive without Git metadata.  
Screen projects use the versioned `kernel-screen` format.  
The screen library stores reusable palettes, layers, and face component bindings.  
Compositions reference screens by ID, including inherited assignments.  

```sh
bun run check
bun test
bun run build
bun run build:pet
bunx playwright install chromium firefox
bun run test:viewer
bun run test:pet
```

Browser checks exercise HTTP and direct file opening with external requests blocked.  
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` selects an existing Chromium installation.  
`PLAYWRIGHT_BROWSER=firefox` selects Firefox.  

## Persona generation

```sh
uv run kernel-render --model-only
uv run kernel-render --site-only --blend build/kernel.blend
uv run kernel-render --render-only --blend build/kernel.blend --states jumping
uv run kernel-render --assemble-only
uv run kernel-shimeji --build build --output build-shimeji
```

The canonical Blender scene contains the editable rig, slotted actions, and baked timeline.  
Web export produces GLB clips, sampled transforms, and deterministic display atlases.  
The model package also includes `kernel-character.glb` with rigid skin weights and a ground root.  
[Animation composition](animation.md) describes locomotion, FX, and character import.  
Sprite rendering evaluates saved actions and reduces transparent images in premultiplied alpha.  
Stage records verify source fingerprints and output checksums before reuse.  

| Directory | Contents |
| --- | --- |
| `build/blend-screens/` | Framebuffer sequence referenced by the Blender scene |
| `build/masters/` | High-resolution transparent renders |
| `build/frames/` | Native animation frames |
| `personas/kernel/generated/assets/` | Generated model, animation, and display data |

Keep `blend-screens/` beside the Blender scene.  
Generated outputs are excluded from source control.  

## Core export CLI

```sh
bun run export --help
bun run export export --target codex --input persona.json --frames build/frames --output build/atlas.png
bun run export validate --target codex --input persona.json --frames build/frames --output build/atlas.png
bun run export export --target shimeji --input persona.json --frames build/frames --output build-shimeji
```

`--input` accepts a rendered persona descriptor, with `-` selecting standard input.  
This descriptor differs from the asset manifest used to load a persona.  
It contains `id`, `name`, `version`, `cell`, and an `animations` map.  
Each animation declares `frames` and `frameDurationMs`.  
Optional `provenance` entries record source checksums or identifiers.  
Frames use `<animation>/<index>.png` paths with zero-padded indices starting at `00`.  
Commands return JSON containing the target, frame count, and output checksums.  
Validation also accepts `--checksums` with a JSON map of relative output paths to SHA-256 values.  

Install the CLI for use outside a source checkout or alongside a Python wheel.  

```sh
cargo install --path crates/pets-core --features cli --bin pets-export --locked
```

`PETS_EXPORT_BIN` selects a specific executable.  
Release jobs build this executable once and reuse it during packaging.  
Native host builds omit image codecs and CLI dependencies unless their features are enabled.  

## Formatting and validation

```sh
cargo fmt --all --check
cargo test -p pets-core --all-features --locked
uv run ruff check personas/kernel/blender crates/pets-core/python scripts tests
uv run ruff format --check personas/kernel/blender crates/pets-core/python scripts tests
uv run python -m unittest discover -s tests -v
bun run format:check
bun run check
```

Core tests cover persona contracts and desktop decisions without an operating system host.  
Export checks verify frame preservation, directional references, timing, and rejection of damaged outputs.  
Generator tests cover rig constraints, screen data, transparency, and target isolation.  
Frontend tests verify exported clips and continuous joint connections during transitions.  
[Architecture](architecture.md) describes module ownership and dependency rules.  


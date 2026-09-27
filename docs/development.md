# Development

## Workspaces

Cargo manages the Rust core and native host through the root `Cargo.toml`.  
Bun manages the studio, desktop launcher, Three.js runtime, and Kernel web adapter.  
uv installs the persona generator and image export adapters from `pyproject.toml`.  
`Cargo.lock`, `bun.lock`, and `uv.lock` record resolved dependencies.  

```sh
uv sync --frozen
bun install --frozen-lockfile
cargo test -p pets-core --locked
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
Tailwind scans the application and persona components.  
Screen projects retain the versioned `kernel-screen` format.  

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

## Formatting and validation

```sh
cargo fmt --all --check
cargo test -p pets-core --locked
uv run ruff check personas/kernel/blender exporters scripts tests
uv run ruff format --check personas/kernel/blender exporters scripts tests
uv run python -m unittest discover -s tests -v
bun run format:check
bun run check
```

Core tests cover persona contracts and desktop decisions without an operating system host.  
Generator tests cover rig constraints, screen data, transparency, and target isolation.  
Frontend tests verify exported clips and continuous joint connections during transitions.  
[Architecture](architecture.md) describes module ownership and dependency rules.  

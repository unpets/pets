# Changelog

## 0.8.1

- Keep wrist targets continuous when walking arm swing crosses zero.
- Verify wrist and elbow continuity at both gait zero crossings and loop boundaries.

## 0.8.0

- Add independent animation components, reusable clips, composition clocks, and export bindings to the Rust core.
- Add an Animation workspace with composition editing, per-component timing, pixel clip painting, and joint rotation clips.
- Separate display generators and atlas clips from body animation modes.
- Expose reusable joint action assets and the composition catalog in Blender.
- Support custom composition names and animation project imports in the standalone companion.
- Relax resting elbows and knees and extend walking support legs without locking joints.
- Run Firefox validation with a virtual display for WebGL2 rendering.

## 0.7.0

- Reorganize the studio into Scene and Screen workspaces with a clip browser, central viewport, timeline, and inspector.
- Add screen zoom, pixel grid, guides, layer solo preview, precise offsets, palette presets, and undo and redo.
- Add frame stepping, playback loop control, camera views, lighting controls, and viewport reset.
- Reduce arm depth while preserving width and lengthen the upper-arm housing to approach the forearm.
- Replace cylindrical shoulder sockets with smaller filled hemispheres seated into the torso.
- Slim the palms and fingers while preserving the working hand's contact with the server.

## 0.6.1

- Move Codex and Shimeji format handling, validation, and export dispatch into the Rust core.
- Expose the shared export mechanism through a Clap CLI and a thin Python bridge.
- Preserve animation restart events when the Rust core selects the same mode again.
- Reset wandering before releasing the desktop drag state.
- Document studio setup and startup commands explicitly.

## 0.6.0

- Restructure Pets as a standalone application with Kernel as its default persona.
- Move persona contracts and existing desktop wandering decisions into a Rust core.
- Separate the studio, native host, shared Three.js playback, and Kernel implementation.
- Define distinct 2D sprite and 3D model representation contracts.
- Extract Codex and Shimeji export adapters from persona generation.
- Update workspace builds, release paths, and documentation without adding runtime features.

## 0.5.0

- Articulate both hands with independent finger chains and opposing thumbs.
- Add bounded finger gestures to every animation.
- Keep the working hand planted on the server while the torso bounces.
- Correct the review elbow bend and preserve the hand beneath the chin.
- Replace hollow shoulder cups with smaller solid bearing housings.
- Add independent background, line, and text palette controls with linked line and text colors.
- Preserve animated screen detail and support earlier screen project files.
- Evaluate the complete rig with one dependency update per authored pose.

## 0.4.0

- Add a native desktop pet with smooth global cursor tracking, independent animation, dragging, wandering, and tray controls.
- Add Shimeji-ee character export with explicit left and right views and required desktop behaviors.
- Add a screen studio with independent background, activity, eyes, and mouth layers.
- Support screen project import, export, undo, and live 3D preview.
- Connect the arms through spherical shoulder joints.
- Rework review and lookaround poses with coordinated screen expressions.
- Build native desktop packages from shared model assets and publish releases on version changes.

## 0.3.0

- Embedded the complete viewer and model in one HTML file for offline opening and HTTP hosting.
- Upgraded to Blender 5.2.2 with rigid bone parenting and ten reusable slotted actions.
- Replaced world-space pose blending with continuous local joint transitions.
- Aligned cable sockets and removed coplanar surface overlap.
- Made every successful release run publish its versioned downloads.

- Rebuilt shell and mechanics as fine voxel surface meshes with 82,688 occupied source voxels.
- Added articulated fixed-length arms and legs, IK, physical joint housings, segmented hands, grounded idle/work poses, and a continuous gait.
- Replaced inconsistent software projection with Blender's camera and CPU renderer.
- Corrected display aperture, local attachment, screen pixel density, and bezel clearance.
- Added deterministic terminal/digital-rain work display and a wrist cable that clears the server casing.
- Removed chroma despill from native alpha. Added premultiplied reduction without ringing.
- Added Blender scene/timeline, GLB geometry, continuous animation data, and framebuffer sequence exports.
- Added a Bun, Svelte, Tailwind CSS, Lucide, and Three.js model studio.
- Added responsive components, playback controls, timeline scrubbing, and a shared screen preview.
- Added TypeScript checks, source formatting, and desktop and mobile browser checks.
- Added fast preview builds and tagged releases with parallel Blender rendering.
- Added verified Blender, pet, model, and static site packages with SHA-256 checksums.
- Added production Pages deployment from tested releases.

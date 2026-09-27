# Kernel

Kernel is a small voxel robot companion, inspired by stacked modules, mischievous error states, and a quiet signal from the dark. Its model, animation, and screen expressions are deterministic Python data and code.

## Render

```bash
uv run kernel-render --output build
```

The renderer creates a transparent 1536 × 2288 v2 ChatGPT pet sheet, individual PNG frames, a looping GIF for each standard state, a look loop, and an OBJ/MTL mesh export. Rendering the same source at the same version yields the same frame pixels. `SCREEN` in `kernel_voxel/render.py` defines the LED glyphs; `pose_for` defines timing and face expression for each state.

The model uses chamfered, layered voxel geometry with a shared orthographic camera and a software depth buffer. Every frame, including all sixteen look directions, is rendered from that geometry. The screen is recessed into the head bezel and its LED tiles are attached to the 3D head. No frame is AI painted or copied from another pose. The OBJ stores the neutral geometry; the Python source is the animated rig and material source of truth.

The pet format fixes each frame at 192 × 208 pixels. The renderer uses 4× supersampling and downsampling for clean edges, enlarges the character within that cell, and keeps the display readable at normal size. The generated sheet is in `build/kernel-spritesheet.png`.

The Git repository should remain private until its owner explicitly changes visibility.

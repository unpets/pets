# Animation projects

The Rust core defines reusable components, clips, compositions, clocks, and export bindings.  
A component identifies an independently animated target.  
A clip supplies reusable motion or display content for that component.  
A composition associates clips without owning them.  
Identifiers are strings and are not restricted to Kernel's built-in behaviors.  

## Timing

Each binding uses an independent clock by default.  
Independent clips use their own duration and continue across composition changes.  
A composition clock explicitly coordinates clips with the composition's duration.  
Speed, phase offset, looping, and enabled state are separate controls.  
Pausing freezes both clocks, and seeking places both clocks at the selected time.  

Kernel synchronizes the rig clips that maintain foot placement and server contact.  
Display activity and blinking use independent clocks.  
The look and review presets explicitly coordinate display cues with their gestures.  
Changing a shared clip affects every composition that references it.  

## Studio

Open the Animation workspace to inspect a composition's component bindings.  
Duplicate a composition to create a new behavior.  
Select a component and assign a reusable clip, clock, speed, and phase offset.  
Create pixel clips for eyes, mouths, screen activity, or additional display layers.  
The pixel editor supports painting, erasing, brush sizes, and frame creation.  
Create rotation clips for individual joints and edit local Euler keyframes in degrees through Clip data.  
The joint hierarchy preserves segment attachment while clips are combined.  
Clip data can be imported and exported separately.  
Save animations exports the full project as `pets-animation.json`.  
Import the project in either the studio or the companion.  

A rotation clip's data contains ordered keyframes in seconds.  

```json
{
  "keyframes": [
    { "time": 0, "rotation": [0, 0, 0] },
    { "time": 0.5, "rotation": [0, 12, 0] },
    { "time": 1, "rotation": [0, 0, 0] }
  ]
}
```

A pixel clip's data contains frames of `[x, y, color]` pixels on a transparent 96 by 64 canvas.  

```json
{
  "frames": [
    [[24, 25, "#4feff3"], [62, 25, "#4feff3"]],
    [[24, 26, "#4feff3"], [62, 26, "#4feff3"]]
  ]
}
```

## Blender

`kernel.blend` contains reusable slotted joint action assets and a combined preview timeline.  
Joint action names use `rig/<joint>/<source>` and animate local transforms.  
The `pets-animation.json` text block records the component library and default compositions.  
Web motion tracks are selected from the saved model's action curves.  
The deterministic screen generators produce independent display atlases and the Blender preview sequence.  

## Core CLI

Validate an animation project with the Rust CLI.  

```sh
bun run export project --input pets-animation.json
```

Sample a composition with separate composition and independent clock values.  

```sh
bun run export project --input pets-animation.json --composition idle --seconds 0.5 --independent-seconds 7
```

Export bindings map host intent names to rendered composition directories.  
Pass `--project pets-animation.json` to an export or validation command to apply those mappings.  
Codex and Shimeji retain their host format requirements at the adapter boundary.  
Renderer adapters interpret component kinds and clip data while the core validates references and evaluates timing.  

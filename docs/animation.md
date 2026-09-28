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

Kernel synchronizes the rig clips that maintain foot placement, server contact, and fingertip contact.  
Display activity and blinking use independent clocks.  
The look and review presets explicitly coordinate display cues with their gestures.  
Changing a shared clip affects every composition that references it.  

## Studio

Open the Animation workspace to inspect a composition's component bindings.  
Create a child composition to inherit a behavior or duplicate it for an independent copy.  
Use Motion layers to combine posture, left arm action, right arm action, and head movement.  
Each layer has its own motion, enabled state, clock, speed, and phase offset.  
Selecting a layer motion preserves the other layers and starts with an independent clock.  
Select a component for individual joint, material, visibility, or screen control.  
Assign a reusable clip, clock, speed, and phase offset.  
Create pixel clips for eyes, mouths, screen activity, or additional display layers.  
The pixel editor supports painting, erasing, brush sizes, and frame creation.  
Create rotation clips for individual joints and edit local Euler keyframes in degrees through the keyframe editor.  
The joint hierarchy preserves segment attachment while clips are combined.  
Clip data can be imported and exported separately.  
Save animations exports the animation library as `pets-animation.json`.  
Import the project in either the studio or the companion.  

Kernel exposes the server, cable, and both virtual keyboards as separate visibility components.  
Active work fixes both palms while the body moves and the fingers type.  
Each key has an independent emission clip synchronized to fingertip contact.  
Lookaround combines idle posture and resting arms with a separate head clip.  
Wave is a reusable arm action that can accompany other postures and screen content.  
Each finger joint clip can be reused or replaced independently of the body motion.  

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

`kernel.blend` contains reusable slotted joint and material action assets.  
The preview timeline uses separate NLA tracks for posture, each arm, and head movement.  
Layer masks assign each bone to one track and use local transforms with quaternion rotations.  
Runtime transitions blend from the displayed pose, including interrupted transitions.  
Material emission curves are read from the saved Blender actions for each export.  
Layer action names use `layer/<layer>/<source>`.  
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

## Composition inheritance

A composition can select a parent and store only its local component overrides.  
Wave, Look around, Review, and Waiting inherit Idle.  
Review overrides its right arm, head, and review display layers.  
Waiting overrides both arms, the head, and mouth while inheriting Idle's posture and blinking.  
Parent edits propagate through every descendant unless that component is overridden.  
Children inherit duration unless an explicit duration is entered.  
A disabled binding is an explicit override that mutes the inherited component.  
Reset to parent removes an override.  
Detach copies the resolved result into an independent composition.  
Cycles and missing references are rejected before a project is applied.  

To create a greeting, select Idle and choose Create child.  
Set Right arm action to Wave.  
Posture, the other arm, head movement, screen layers, and props remain inherited.  
Use New composition for an empty root or Duplicate composition for an independent snapshot.  

## Project and asset files

Open Import / export for the complete file workflow.  
A `pets-studio` project includes embedded model and display assets, animations, hierarchy, screen settings, export mappings, and editor selection.  
Complete projects reopen in the Studio and standalone companion.  
Studio HTML and standalone pet HTML embed the selected project and work offline.  
GLB imports replace the model while retaining the persona's joint names and action contract.  

Composition bundles include their ancestors, referenced clips, and components.  
Clip bundles include timing, looping, target component, and content.  
Component bundles include every clip belonging to the component.  
Identical assets are reused during import.  
Conflicting assets receive new identifiers and their references are remapped.  
Imported changes are validated before replacing the open project.  

The pixel editor imports and exports PNG frame grids with 96 by 64 cells.  
Frames can be painted, duplicated, reordered, and removed.  
Rotation and emission clips have editable keyframe tables.  
Shared clip edits update every referencing composition.  
Duplicate a clip to customize only one composition.  

## Export packages

Export mappings associate each host intent with a composition.  
The Studio renders the resolved project, including screen changes, props, material animation, and custom clips.  
The Rust core validates and packages Codex and Shimeji exports through WebAssembly.  
The same Rust format implementations serve browser and native exports.  
One fitted camera preserves transparent margins across the exported animation set.  
Packages include the complete editable Studio project.  

## Import into Blender

Bake an animation or Studio project against its source model.  

```sh
uv run kernel-compose --blend build/kernel.blend --project kernel.pets.json --output build-composed
```

Select individual compositions to limit baking.  

```sh
uv run kernel-compose --blend build/kernel.blend --project kernel.pets.json --composition greeting --output build-greeting
```

The output contains `kernel.blend`, its framebuffer sequence, and a timeline descriptor.  
Saved source actions supply joint transforms; local composition layers preserve the rig hierarchy.  
Custom rotation clips, independent clocks, visibility, emission, and screen content are baked together.  
The project remains embedded in Blender text blocks and each composition has an action asset.  

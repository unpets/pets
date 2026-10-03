# Animation composition

Animation projects use the `pets-animation` format.  
Version 3 adds inherited placement and locomotion properties.  
Versions 1 and 2 remain readable.  
Components, clips, compositions, and output mappings are reusable assets.  

## Movement

`move` is one in-place composition.  
Facing and travel direction are independent.  
A cyclic blend space combines synchronized forward, backward, sidestep, and diagonal gait samples.  
Directional gait samples describe motion relative to the body.  
They do not bake a camera angle into the character.  

| Property | Unit | Behavior |
| --- | --- | --- |
| `heading` | Degrees | Facing about the character's up axis |
| `turnSpeed` | Degrees per second | Maximum facing and travel turn rate |
| `travelHeading` | Degrees | Travel direction; omitted values follow facing |
| `animationSpeed` | Multiplier | Composition clock playback rate |
| `moveSpeed` | Metres per second | Translation speed supplied to the host |

Zero heading faces local forward.  
Kernel uses metres, Z up, and local forward along negative Y.  
Properties inherit individually through composition parents.  
A child can change direction or speed while retaining its parent's rig, screen, and FX bindings.  
Placement-only changes preserve gait phase.  
Live turns use the shortest angular path with bounded angular speed, acceleration, and braking.  
Travel speed changes ease independently of the animation clock.  
The Studio previews travel in metres while its camera follows the character.  
Disable **Preview travel** in the Scene workspace to inspect movement in place.  
Character hosts apply the returned velocity to their own movement and collision systems.  

To sidestep right while facing forward, set `heading` to `0` and `travelHeading` to `90`.  
Use `-90` to sidestep left and `180` to walk backward.  
Intermediate angles blend the adjacent gait samples.  
Change `animationSpeed` to adjust cadence and `moveSpeed` to adjust travel independently.  
Independent component clocks continue at their own rates.  
Host locomotion controllers can coordinate cadence, stride, and travel to maintain planted feet.  

## Output mappings

An export mapping accepts a composition identifier or a composition instance.  
Instances can override properties without creating another rig animation.  
The `view` heading space resolves facing relative to the output camera.  
The `world` heading space uses character coordinates.  

```json
{
  "running-right": {
    "composition": "move",
    "properties": { "heading": 90 },
    "headingSpace": "view"
  },
  "running-left": {
    "composition": "move",
    "properties": { "heading": -90 },
    "headingSpace": "view"
  }
}
```

Directional sprite views are rendered separately and retain the host's required intent names.  
Placed frame sets use their output intent as the rendered directory name.  
A plain composition mapping can reuse an existing composition frame directory.  

## Flight, climbing, and effects

Flying combines a hover pose with an independent thruster FX layer.  
Climb has Rope, Ladder, and Border children with distinct grip and support patterns.  
Climbing does not require an effect layer.  
Rig actions, head motion, expressions, and effects can be reassigned independently.  

Effect components attach to one or more rig nodes.  
Particle clips define color, count, lifetime, size, spread, offset, velocity, and gravity.  
The Animation workspace creates, edits, imports, exports, and binds FX assets.  
Particles use deterministic local-space sampling in Blender and Three.js.  
Their clocks can run independently or follow a composition.  

## Character exports

`kernel.glb` supplies the Studio's articulated model and source motion tracks.  
`kernel-character.glb` supplies a weighted skeletal mesh, a ground root, and baked composition clips.  
Each mechanical vertex has one rigid bone influence.  
The character GLB uses standard glTF axes and metres.  
Its animations stay in place so an engine can manage movement and collisions.  
The file contains synchronized locomotion samples for engine blend spaces.  

Import the character GLB as assets through Unreal Engine's Interchange importer.  
Enable skeletal meshes and animations, and assign the imported skeleton to the animation sequences.  
Use the locomotion clips in a directional blend space and drive facing separately.  
[Interchange import options](https://dev.epicgames.com/documentation/unreal-engine/interchange-import-reference-in-unreal-engine) describe the engine's settings.  
The animation JSON preserves composition, screen, attachment, and effect metadata for renderer adapters.  
Screen animation and particle effects require corresponding engine materials or effect components.  

To bake an edited Studio project into Blender, use `kernel-compose`.  
The source retains reusable actions, property placement, screen sequences, and effect animation.  

```sh
uv run kernel-compose --blend build/kernel.blend --project studio-project.json --output build-composed
```

## Target tracking and climbing

Lookat is a reusable head clip with a point or pointer target, response, and influence weight.  
The runtime evaluates the target after authored motion and constrains the result to the neck limits.  
Baking uses the saved scene point for deterministic output.  
Eye layers can follow the evaluated head direction while keeping their own expression clock.  

Climbing uses forward reach targets and outward elbow guides to clear the head and torso.  
Border climbing transfers support from the hands to the feet and ends in a standing pose.  
The final border frame is included in Blender playback and exports.  

## Mesh layers

The `face-mesh` adapter defines a reusable 3D face component.  
The `attachment` adapter defines a reusable accessory attached to a rig part.  
Both store `geometry` and a hexadecimal `color` in component data.  
Geometry supports `sphere`, `box`, `plane`, or indexed triangle meshes with `positions` and `indices`.  
Mesh clips store ordered `keyframes` with `time`, `position`, `rotation`, `scale`, and `opacity`.  
Rotation uses XYZ Euler angles in degrees and shortest-arc quaternion interpolation.  

A face asset can include `surface: { canvas, placements }`.  
Canvas defaults to enabled for existing projects.  
Placements map mesh component identifiers to position, rotation, and scale transforms.  
Face coordinates use one face width, positive Y upward, and positive Z outward.  
Clip transforms are applied after per-face placement.  
Assigning a child face replaces inherited canvas and mesh face bindings together.  

Accessory data adds `node` for the rig anchor and `hides` for the replaced parts.  
Accessory coordinates use metres in the part's local frame.  
Visibility changes last only while an enabled accessory clip is bound.  
Geometry and transform channels are portable across Studio, Blender composition baking, and project exports.  

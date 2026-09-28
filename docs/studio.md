# Studio guide

Pets Studio edits persona projects in the browser.  
See [Run the studio](../README.md#run-the-studio) for installation and startup.  

## Viewport and playback

| Control | Action |
| --- | --- |
| Drag | Orbit the model. |
| Scroll | Zoom in or out. |
| Timeline | Scrub the animation or step through frames. |
| `Space` | Play or pause. |

The playback controls set animation speed and looping.  
The Scene workspace provides camera views, lighting, the ground grid, wireframes, and joint markers.  

### Travel preview

**Preview travel** moves the character across the ground while the camera follows it.  
Walk speed sets metres travelled per second.  
Animation speed changes cadence independently.  

Disable **Preview travel** in the Scene workspace to inspect motion in place.  
Pausing playback pauses travel.  
Seeking or switching to a different action resets the travel origin.  

## Persona

The Persona workspace shows identity, asset counts, and links to editing workspaces.  
The viewport stays loaded when changing pages.  

## Screen editor

The Screen workspace provides a reusable screen library, an enlarged display canvas, and collapsible inspector sections.  
Create, duplicate, rename, and export screens independently of compositions.  
Assign a screen in the Animation workspace with **Composition screen**.  
Child compositions inherit the parent screen unless they select another one.  

A screen combines four independent face component types:  

- **Background** sets the base appearance.
- **Activity** shows tasks such as programming.
- **Eyes** control eye shapes and expressions.
- **Mouth** controls mouth shapes and expressions.

### Layer controls

Select a layer to adjust visibility, solo preview, opacity, color, position, scale, rotation, mirroring, and draw order.  
Undo and redo are available for screen and face component edits.  

### Face component library

The Components workspace provides separate libraries for eyes, mouth, background, and activity.  
Create pixel animations, duplicate assets, or import reusable clips.  
Screen slots select assets by reference and set their clock, speed, phase offset, and visibility.  
Editing an asset updates every screen using it.  
Duplicate it to create a separate variant.  

Choose paired eyes, a mirrored left eye, or independent left and right eyes.  
Independent eyes can use different assets, clocks, and transforms.  
Mirrored eyes share the source animation and reflect its left half.  

### Colors

Background, line, and text colors have separate controls.  
Line and text colors are linked by default.  
Unlink them to set each color independently.  

### Screen files

Save a screen project as JSON to reuse it or import it into the companion.  

## Animation editor

The Animation workspace combines independent clips into compositions.  

### Components and clips

- Reuse joint motion, display, prop, and FX clips.
- Create pixel clips, screen layers, and joint rotation clips.
- Attach particle effects to rig nodes and edit their appearance and motion.

Undo and redo are available for animation edits.  

### Composition parenting

Child compositions inherit their parent's content.  
Override selected components or movement properties to create a variant.  

### Movement presets

| Composition | Controls and variants |
| --- | --- |
| Move | Facing, travel direction, turning, sidesteps, backward travel, and diagonals. |
| Fly | Hover motion and a separate thruster effect. |
| Climb | Rope, Ladder, and Border variants. |

Animation speed controls cadence.  
Walk speed controls travel speed.  

See [Animation composition](animation.md) for clocks, inheritance, movement properties, and FX.  

## Import and export

Use **File** to import or save complete projects.  
Use **Export** for reusable screens, clips, composition bundles, HTML applications, and rendered packages.  
Menus support arrow keys, Enter, and Escape.  

| Output | Contents |
| --- | --- |
| Project | Persona assets, compositions, screen settings, and Studio state. |
| Reusable asset | A component, clip, or composition with its dependencies. |
| Offline application | A self-contained Studio or companion HTML file. |
| Codex or Shimeji package | Rendered animation frames and host metadata. |

Use **Assets > Download 3D model** for the skeletal character GLB.  
Use **Assets > Animation data** for source motion data and the edited project.  
See [Character exports](animation.md#character-exports) for engine integration and Blender baking.  

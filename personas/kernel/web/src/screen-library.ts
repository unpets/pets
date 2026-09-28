import {
  resolveComposition,
  uniqueId,
  type AnimationProject,
} from '@pets/three-runtime/project';
import {
  defaultScreenProject,
  parseScreenProject,
  type ScreenProject,
} from './screen-project';

/** Lift legacy screen bindings into reusable objects without changing their appearance. */
export function migrateScreens(
  project: AnimationProject,
  settings: ScreenProject = defaultScreenProject(),
) {
  for (const [side, label] of [
    ['Left', 'Left eye'],
    ['Right', 'Right eye'],
  ]) {
    project.components[`screen/eye${side}`] ??= {
      label,
      kind: 'screen',
      data: { layer: `eye${side}`, family: 'eyes', order: 2 },
    };
  }
  if (project.screens && Object.keys(project.screens).length) return project;
  const screens: NonNullable<AnimationProject['screens']> = {};
  const ids: Record<string, string> = {};
  const signatures = new Map<string, string>();
  for (const [id, composition] of Object.entries(project.compositions).sort(
    ([a], [b]) => Number(b === 'idle') - Number(a === 'idle'),
  )) {
    const bindings = Object.fromEntries(
      Object.entries(resolveComposition(project, id).bindings).filter(
        ([component]) => project.components[component].kind === 'screen',
      ),
    );
    const signature = JSON.stringify(
      Object.entries(bindings).sort(([a], [b]) => a.localeCompare(b)),
    );
    let screen = signatures.get(signature);
    if (!screen) {
      screen = uniqueId(composition.label, screens);
      const data = parseScreenProject(settings);
      for (const [id, binding] of Object.entries(bindings)) {
        const layer = project.components[id].data
          .layer as keyof ScreenProject['layers'];
        if (
          data.layers[layer] &&
          project.clips[binding.clip].data.generator === 'look'
        )
          data.layers[layer].followHead = true;
      }
      screens[screen] = {
        label: composition.label,
        data: { ...data },
        bindings,
      };
      signatures.set(signature, screen);
    }
    ids[id] = screen;
  }
  for (const [id, composition] of Object.entries(project.compositions)) {
    if (!composition.parent || ids[composition.parent] !== ids[id])
      composition.screen = ids[id];
    for (const component of Object.keys(composition.bindings))
      if (project.components[component].kind === 'screen')
        delete composition.bindings[component];
  }
  project.screens = screens;
  return project;
}

import {
  resolveComposition,
  type AnimationProject,
} from '@pets/three-runtime/project';

/** Legacy direction recipes become children of one local-space movement recipe. */
export function migrateMovement(project: AnimationProject) {
  const right = project.compositions['running-right'];
  const left = project.compositions['running-left'];
  if (project.compositions.move || !right || !left) return project;
  const base = resolveComposition(project, 'running-right');
  const bindings = { ...base.bindings };
  for (const [id, source] of Object.entries(base.bindings)) {
    if (project.components[id].kind !== 'rig') continue;
    const clip = project.clips[source.clip];
    if (!['running-right', 'running-left'].includes(String(clip.data.source)))
      continue;
    const name = `${id}/move`;
    project.clips[name] ??= {
      ...clip,
      label: 'Move',
      data: { source: 'move' },
    };
    bindings[id] = { ...source, clip: name };
  }
  project.compositions.move = {
    label: 'Move',
    description: '',
    duration: base.duration,
    properties: { ...base.properties, heading: 0 },
    bindings,
  };
  for (const [id, sign] of [
    ['running-right', 1],
    ['running-left', -1],
  ] as const) {
    const child = project.compositions[id];
    const resolved = resolveComposition(project, id);
    child.parent = 'move';
    child.properties = {
      ...resolved.properties,
      heading: (sign * 0.95 * 180) / Math.PI,
    };
    child.bindings = { ...resolved.bindings };
    for (const [component, source] of Object.entries(child.bindings)) {
      const clip = project.clips[source.clip];
      // Preserve authored head compensation while sharing the body gait.
      if (
        project.components[component].kind === 'rig' &&
        component !== 'rig/head' &&
        ['running-right', 'running-left'].includes(String(clip.data.source)) &&
        project.clips[`${component}/move`]
      )
        child.bindings[component] = { ...source, clip: `${component}/move` };
      if (
        JSON.stringify(child.bindings[component]) ===
        JSON.stringify(bindings[component])
      )
        delete child.bindings[component];
    }
  }
  for (const exports of Object.values(project.exports))
    for (const [intent, value] of Object.entries(exports)) {
      if (value === 'running-right' || value === 'running-left')
        exports[intent] = {
          composition: 'move',
          headingSpace: 'view',
          properties: { heading: value === 'running-right' ? 90 : -90 },
        };
    }
  return project;
}

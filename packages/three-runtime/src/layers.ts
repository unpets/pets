import {
  resolveComposition,
  binding,
  type AnimationProject,
  type Binding,
} from './project';

export function motionLayers(project: AnimationProject) {
  const layers = new Map<string, { label: string; components: string[] }>();
  for (const [id, component] of Object.entries(project.components)) {
    const layer = component.data.layer;
    if (component.kind !== 'rig' || typeof layer !== 'string') continue;
    if (!layers.has(layer))
      layers.set(layer, {
        label: String(component.data.layerLabel ?? layer),
        components: [],
      });
    layers.get(layer)!.components.push(id);
  }
  return [...layers].map(([id, layer]) => ({ id, ...layer }));
}

export function layerSources(project: AnimationProject, components: string[]) {
  const sources = Object.values(project.clips)
    .filter(
      (clip) =>
        clip.component === components[0] &&
        typeof clip.data.source === 'string',
    )
    .map((clip) => ({ source: clip.data.source as string, label: clip.label }));
  return sources.filter(({ source }) =>
    components.every((component) =>
      Object.values(project.clips).some(
        (clip) => clip.component === component && clip.data.source === source,
      ),
    ),
  );
}

export function bindMotionLayer(
  project: AnimationProject,
  composition: string,
  components: string[],
  update: Partial<Binding>,
  source?: string,
): AnimationProject {
  const next = structuredClone(project);
  for (const component of components) {
    const old = resolveComposition(next, composition).bindings[component];
    const clip =
      source === undefined
        ? old?.clip
        : Object.entries(next.clips).find(
            ([, clip]) =>
              clip.component === component && clip.data.source === source,
          )?.[0];
    if (!clip) throw new Error(`Missing motion clip for ${component}.`);
    next.compositions[composition].bindings[component] = {
      ...(old ?? binding(clip)),
      ...update,
      clip,
    };
  }
  return next;
}

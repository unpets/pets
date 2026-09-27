import {
  parseAnimationProject,
  uniqueId,
  type AnimationProject,
  type Component,
  type Clip,
  type Composition,
} from './project';

export type AssetKind = 'composition' | 'component' | 'clip';
export interface AssetBundle {
  format: 'pets-assets';
  version: 1;
  selection: { kind: AssetKind; id: string };
  components: Record<string, Component>;
  clips: Record<string, Clip>;
  compositions: Record<string, Composition>;
}
export function exportAsset(
  project: AnimationProject,
  kind: AssetKind,
  id: string,
): AssetBundle {
  const result: AssetBundle = {
    format: 'pets-assets',
    version: 1,
    selection: { kind, id },
    components: {},
    clips: {},
    compositions: {},
  };
  function component(name: string) {
    result.components[name] = project.components[name];
  }
  function clip(name: string) {
    result.clips[name] = project.clips[name];
    component(project.clips[name].component);
  }
  function composition(name: string) {
    if (result.compositions[name]) return;
    const value = project.compositions[name];
    result.compositions[name] = value;
    if (value.parent) composition(value.parent);
    for (const source of Object.values(value.bindings)) clip(source.clip);
  }
  if (kind === 'composition') composition(id);
  else if (kind === 'clip') clip(id);
  else {
    component(id);
    for (const [name, value] of Object.entries(project.clips))
      if (value.component === id) clip(name);
  }
  return structuredClone(result);
}
export function parseAssetBundle(value: unknown): AssetBundle {
  if (!value || typeof value !== 'object')
    throw new Error('Invalid asset bundle.');
  const bundle = value as AssetBundle;
  if (
    bundle.format !== 'pets-assets' ||
    bundle.version !== 1 ||
    !bundle.selection ||
    !['composition', 'component', 'clip'].includes(bundle.selection.kind)
  )
    throw new Error('Unsupported asset bundle.');
  const project = parseAnimationProject({
    ...bundle,
    format: 'pets-animation',
    version: 2,
    compositions: Object.keys(bundle.compositions ?? {}).length
      ? bundle.compositions
      : { preview: { label: 'Preview', duration: 1, bindings: {} } },
    exports: {},
  });
  const collection =
    bundle.selection.kind === 'composition'
      ? bundle.compositions
      : bundle.selection.kind === 'clip'
        ? project.clips
        : project.components;
  if (!Object.hasOwn(collection, bundle.selection.id))
    throw new Error('The selected asset is missing.');
  return structuredClone({
    ...bundle,
    components: project.components,
    clips: project.clips,
    compositions: Object.keys(bundle.compositions ?? {}).length
      ? project.compositions
      : {},
  });
}
export function importAsset(
  project: AnimationProject,
  value: unknown,
  conflicts: 'rename' | 'replace' = 'rename',
) {
  const bundle = parseAssetBundle(value);
  const next = structuredClone(project);
  const maps = {
    component: {} as Record<string, string>,
    clip: {} as Record<string, string>,
    composition: {} as Record<string, string>,
  };
  function allocate<T>(
    incoming: Record<string, T>,
    target: Record<string, T>,
    map: Record<string, string>,
  ) {
    const taken = { ...target };
    for (const [id, value] of Object.entries(incoming)) {
      const equal = JSON.stringify(value) === JSON.stringify(target[id]);
      map[id] =
        !Object.hasOwn(target, id) || equal || conflicts === 'replace'
          ? id
          : uniqueId(id, taken);
      taken[map[id]] = value;
    }
  }
  allocate(bundle.components, next.components, maps.component);
  // Target identities are stable. Reusing a rig or material target never creates a second writer.
  for (const [id, value] of Object.entries(bundle.components)) {
    const match = Object.entries(next.components).find(
      ([, existing]) =>
        existing.kind === value.kind &&
        JSON.stringify(existing.data) === JSON.stringify(value.data),
    );
    if (match && conflicts === 'rename') maps.component[id] = match[0];
  }
  const clips = Object.fromEntries(
    Object.entries(bundle.clips).map(([id, clip]) => [
      id,
      { ...clip, component: maps.component[clip.component] },
    ]),
  );
  allocate(clips, next.clips, maps.clip);
  for (const [id, component] of Object.entries(bundle.components)) {
    if (!next.components[maps.component[id]] || conflicts === 'replace')
      next.components[maps.component[id]] = component;
  }
  for (const [id, clip] of Object.entries(clips))
    next.clips[maps.clip[id]] = clip;
  function mergeComposition(id: string) {
    if (maps.composition[id]) return;
    const composition = bundle.compositions[id];
    if (composition.parent) mergeComposition(composition.parent);
    const incoming = {
      ...composition,
      ...(composition.parent
        ? { parent: maps.composition[composition.parent] }
        : {}),
      bindings: Object.fromEntries(
        Object.entries(composition.bindings).map(([component, binding]) => [
          maps.component[component],
          { ...binding, clip: maps.clip[binding.clip] },
        ]),
      ),
    };
    allocate({ [id]: incoming }, next.compositions, maps.composition);
    next.compositions[maps.composition[id]] = incoming;
  }
  for (const id of Object.keys(bundle.compositions)) mergeComposition(id);
  return {
    project: parseAnimationProject(next),
    selection: {
      kind: bundle.selection.kind,
      id: maps[bundle.selection.kind][bundle.selection.id],
    },
  };
}

export interface Component {
  label: string;
  kind: string;
  data: Record<string, unknown>;
}
export interface Clip {
  label: string;
  component: string;
  duration: number;
  looping: boolean;
  data: Record<string, unknown>;
}
export interface Binding {
  clip: string;
  clock: 'independent' | 'composition';
  speed: number;
  offset: number;
  enabled: boolean;
}
export interface Composition {
  label: string;
  description: string;
  parent?: string;
  duration?: number;
  bindings: Record<string, Binding>;
}
export interface AnimationProject {
  format: 'pets-animation';
  version: 1 | 2;
  components: Record<string, Component>;
  clips: Record<string, Clip>;
  compositions: Record<string, Composition>;
  exports: Record<string, Record<string, string>>;
}
export interface ComponentSample {
  clip: string;
  phase: number;
}
export const binding = (clip: string): Binding => ({
  clip,
  clock: 'independent',
  speed: 1,
  offset: 0,
  enabled: true,
});
const identifier = (id: string) =>
  /^[a-z0-9_.:/-]{1,128}$/i.test(id) &&
  !['__proto__', 'constructor', 'prototype'].includes(id);
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const positive = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

export function parseAnimationProject(value: unknown): AnimationProject {
  if (
    !record(value) ||
    value.format !== 'pets-animation' ||
    ![1, 2].includes(value.version as number) ||
    !record(value.components) ||
    !record(value.clips) ||
    !record(value.compositions)
  )
    throw new Error('Unsupported animation project.');
  const project = JSON.parse(
    JSON.stringify(value),
  ) as unknown as AnimationProject;
  if (
    !Object.keys(project.components).length ||
    !Object.keys(project.compositions).length
  )
    throw new Error('Components and compositions are required.');
  for (const [id, component] of Object.entries(project.components)) {
    if (
      !identifier(id) ||
      !record(component) ||
      typeof component.label !== 'string' ||
      !component.label.trim() ||
      typeof component.kind !== 'string' ||
      !component.kind.trim()
    )
      throw new Error(`Invalid component: ${id}`);
    component.data ??= {};
  }
  for (const [id, clip] of Object.entries(project.clips)) {
    if (
      !identifier(id) ||
      !record(clip) ||
      typeof clip.label !== 'string' ||
      !clip.label.trim() ||
      !Object.hasOwn(project.components, clip.component) ||
      !positive(clip.duration) ||
      typeof clip.looping !== 'boolean'
    )
      throw new Error(`Invalid clip: ${id}`);
    clip.data ??= {};
  }
  for (const [id, composition] of Object.entries(project.compositions)) {
    if (
      !identifier(id) ||
      !record(composition) ||
      typeof composition.label !== 'string' ||
      !composition.label.trim() ||
      (composition.duration !== undefined && !positive(composition.duration)) ||
      (composition.parent !== undefined &&
        typeof composition.parent !== 'string') ||
      !record(composition.bindings)
    )
      throw new Error(`Invalid composition: ${id}`);
    composition.description ??= '';
    for (const [component, source] of Object.entries(composition.bindings)) {
      const b = Object.assign(binding(''), source);
      if (
        !project.clips[b.clip] ||
        project.clips[b.clip].component !== component ||
        !['independent', 'composition'].includes(b.clock) ||
        !Number.isFinite(b.speed) ||
        b.speed < 0 ||
        !Number.isFinite(b.offset) ||
        typeof b.enabled !== 'boolean'
      )
        throw new Error(`Invalid binding: ${id}/${component}`);
      composition.bindings[component] = b;
    }
  }
  for (const id of Object.keys(project.compositions))
    resolveComposition(project, id);
  project.version = 2;
  project.exports ??= {};
  if (!record(project.exports)) throw new Error('Invalid export bindings.');
  for (const exports of Object.values(project.exports)) {
    if (
      !record(exports) ||
      Object.values(exports).some(
        (id) =>
          typeof id !== 'string' || !Object.hasOwn(project.compositions, id),
      )
    )
      throw new Error('Unknown export composition.');
  }
  return project;
}

export interface ResolvedComposition extends Omit<Composition, 'duration'> {
  duration: number;
  origins: Record<string, string>;
}

/** Child bindings replace whole component bindings; omitted bindings stay live. */
export function resolveComposition(
  project: AnimationProject,
  id: string,
): ResolvedComposition {
  const chain: string[] = [];
  let cursor: string | undefined = id;
  while (cursor !== undefined) {
    if (chain.includes(cursor))
      throw new Error(`Composition cycle: ${[...chain, cursor].join(' > ')}`);
    if (!Object.hasOwn(project.compositions, cursor))
      throw new Error(`Unknown parent composition: ${cursor}`);
    chain.push(cursor);
    cursor = project.compositions[cursor].parent;
  }
  const bindings: Record<string, Binding> = {};
  const origins: Record<string, string> = {};
  let duration: number | undefined;
  for (const entry of chain.reverse()) {
    const composition = project.compositions[entry];
    duration = composition.duration ?? duration;
    for (const [component, value] of Object.entries(composition.bindings)) {
      bindings[component] = { ...value };
      origins[component] = entry;
    }
  }
  if (!duration || !Number.isFinite(duration))
    throw new Error(`Composition needs a duration: ${id}`);
  return { ...project.compositions[id], duration, bindings, origins };
}

export function compositionTree(project: AnimationProject) {
  const result: { id: string; depth: number }[] = [];
  const walk = (parent: string | undefined, depth: number) => {
    for (const [id, value] of Object.entries(project.compositions)) {
      if (value.parent === parent) {
        result.push({ id, depth });
        walk(id, depth + 1);
      }
    }
  };
  walk(undefined, 0);
  return result;
}

export function sampleComposition(
  project: AnimationProject,
  id: string,
  seconds: number,
  independentSeconds: number,
): Record<string, ComponentSample> {
  const composition = resolveComposition(project, id);
  if (
    !composition ||
    !Number.isFinite(seconds) ||
    !Number.isFinite(independentSeconds)
  )
    throw new Error('Invalid composition clock.');
  return Object.fromEntries(
    Object.entries(composition.bindings)
      .filter(([, b]) => b.enabled)
      .map(([component, b]) => {
        const clip = project.clips[b.clip];
        const cycles =
          (b.clock === 'composition'
            ? seconds / composition.duration
            : independentSeconds / clip.duration) *
            b.speed +
          b.offset;
        const phase = clip.looping
          ? ((cycles % 1) + 1) % 1
          : Math.max(0, Math.min(1, cycles));
        return [component, { clip: b.clip, phase }];
      }),
  );
}

export function uniqueId(
  label: string,
  entries: Record<string, unknown>,
): string {
  const base =
    label
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 100) || 'untitled';
  let id = base;
  for (let index = 2; Object.hasOwn(entries, id); index++)
    id = `${base}-${index}`;
  return id;
}

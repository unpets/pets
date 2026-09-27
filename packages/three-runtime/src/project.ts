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
  duration: number;
  bindings: Record<string, Binding>;
}
export interface AnimationProject {
  format: 'pets-animation';
  version: 1;
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
    value.version !== 1 ||
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
      !positive(composition.duration) ||
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

export function sampleComposition(
  project: AnimationProject,
  id: string,
  seconds: number,
  independentSeconds: number,
): Record<string, ComponentSample> {
  const composition = project.compositions[id];
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

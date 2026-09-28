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
/** Heading in degrees about the character up axis; zero faces local forward. */
export interface CompositionProperties {
  heading?: number;
  turnSpeed?: number;
  travelHeading?: number;
  animationSpeed?: number;
  moveSpeed?: number;
}
export interface CompositionInstance {
  composition: string;
  properties?: CompositionProperties;
  headingSpace?: 'world' | 'view';
}
export type ExportBinding = string | CompositionInstance;
export function compositionInstance(value: ExportBinding): CompositionInstance {
  return typeof value === 'string' ? { composition: value } : value;
}
export function headingRadians(properties: CompositionProperties = {}): number {
  return ((properties.heading ?? 0) * Math.PI) / 180;
}
export interface Composition {
  label: string;
  description: string;
  parent?: string;
  screen?: string;
  duration?: number;
  properties?: CompositionProperties;
  bindings: Record<string, Binding>;
}
export interface ScreenAsset {
  label: string;
  data: Record<string, unknown>;
  bindings: Record<string, Binding>;
}
export interface AnimationProject {
  format: 'pets-animation';
  version: 1 | 2 | 3;
  components: Record<string, Component>;
  clips: Record<string, Clip>;
  screens?: Record<string, ScreenAsset>;
  compositions: Record<string, Composition>;
  exports: Record<string, Record<string, ExportBinding>>;
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

export function compatibleClip(
  project: AnimationProject,
  target: string,
  clip: string,
) {
  const source = project.clips[clip]?.component;
  if (!source) return false;
  if (source === target) return true;
  const a = project.components[target],
    b = project.components[source];
  return (
    a?.kind === 'screen' &&
    b?.kind === 'screen' &&
    (a.data.family ?? a.data.layer) === (b.data.family ?? b.data.layer)
  );
}

function validateProperties(value: unknown) {
  if (value === undefined) return;
  if (
    !record(value) ||
    Object.keys(value).some(
      (key) =>
        ![
          'heading',
          'turnSpeed',
          'travelHeading',
          'animationSpeed',
          'moveSpeed',
        ].includes(key),
    ) ||
    (value.heading !== undefined &&
      (typeof value.heading !== 'number' || !Number.isFinite(value.heading))) ||
    (value.turnSpeed !== undefined && !positive(value.turnSpeed)) ||
    (value.animationSpeed !== undefined && !positive(value.animationSpeed)) ||
    (value.moveSpeed !== undefined &&
      (typeof value.moveSpeed !== 'number' ||
        !Number.isFinite(value.moveSpeed) ||
        value.moveSpeed < 0)) ||
    (value.travelHeading !== undefined &&
      (typeof value.travelHeading !== 'number' ||
        !Number.isFinite(value.travelHeading)))
  )
    throw new Error('Invalid composition properties.');
}

export function parseAnimationProject(value: unknown): AnimationProject {
  if (
    !record(value) ||
    value.format !== 'pets-animation' ||
    ![1, 2, 3].includes(value.version as number) ||
    !record(value.components) ||
    !record(value.clips) ||
    !record(value.compositions)
  )
    throw new Error('Unsupported animation project.');
  const project = JSON.parse(
    JSON.stringify(value),
  ) as unknown as AnimationProject;
  if (
    (!Object.keys(project.components).length &&
      !Object.keys(project.screens ?? {}).length) ||
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
      (composition.screen !== undefined &&
        (typeof composition.screen !== 'string' ||
          !Object.hasOwn(project.screens ?? {}, composition.screen))) ||
      !record(composition.bindings)
    )
      throw new Error(`Invalid composition: ${id}`);
    validateProperties(composition.properties);
    composition.description ??= '';
    for (const [component, source] of Object.entries(composition.bindings)) {
      const b = Object.assign(binding(''), source);
      if (
        !project.clips[b.clip] ||
        !compatibleClip(project, component, b.clip) ||
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
  if (project.screens !== undefined) {
    if (!record(project.screens)) throw new Error('Invalid screen library.');
    for (const [id, screen] of Object.entries(project.screens)) {
      if (
        !identifier(id) ||
        !record(screen) ||
        typeof screen.label !== 'string' ||
        !screen.label.trim() ||
        !record(screen.data) ||
        !record(screen.bindings)
      )
        throw new Error(`Invalid screen: ${id}`);
      for (const [component, source] of Object.entries(screen.bindings)) {
        const b = Object.assign(binding(''), source);
        if (
          project.components[component]?.kind !== 'screen' ||
          !compatibleClip(project, component, b.clip) ||
          !['independent', 'composition'].includes(b.clock) ||
          !Number.isFinite(b.speed) ||
          b.speed < 0 ||
          !Number.isFinite(b.offset) ||
          typeof b.enabled !== 'boolean'
        )
          throw new Error(`Invalid screen binding: ${id}/${component}`);
        screen.bindings[component] = b;
      }
    }
  }
  for (const id of Object.keys(project.compositions))
    resolveComposition(project, id);
  project.version = 3;
  project.exports ??= {};
  if (!record(project.exports)) throw new Error('Invalid export bindings.');
  for (const exports of Object.values(project.exports)) {
    if (!record(exports)) throw new Error('Invalid export bindings.');
    for (const source of Object.values(exports)) {
      if (typeof source !== 'string' && !record(source))
        throw new Error('Invalid export composition.');
      const instance = compositionInstance(source);
      if (!Object.hasOwn(project.compositions, instance.composition))
        throw new Error('Unknown export composition.');
      validateProperties(instance.properties);
      if (
        instance.headingSpace !== undefined &&
        !['world', 'view'].includes(instance.headingSpace)
      )
        throw new Error('Invalid export heading space.');
    }
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
  let screen: string | undefined;
  const properties: CompositionProperties = {};
  for (const entry of chain.reverse()) {
    const composition = project.compositions[entry];
    if (composition.screen !== undefined) {
      screen = composition.screen;
      applyScreenBindings(project, bindings, screen);
      for (const component of Object.keys(origins))
        if (project.components[component].kind === 'screen')
          delete origins[component];
      for (const component of Object.keys(project.screens![screen].bindings))
        origins[component] = entry;
    }
    duration = composition.duration ?? duration;
    Object.assign(properties, composition.properties);
    for (const [component, value] of Object.entries(composition.bindings)) {
      bindings[component] = { ...value };
      origins[component] = entry;
    }
  }
  if (!duration || !Number.isFinite(duration))
    throw new Error(`Composition needs a duration: ${id}`);
  return {
    ...project.compositions[id],
    duration,
    ...(screen ? { screen } : {}),
    properties,
    bindings,
    origins,
  };
}

function applyScreenBindings(
  project: AnimationProject,
  bindings: Record<string, Binding>,
  id: string,
) {
  const screen = project.screens?.[id];
  if (!screen) throw new Error(`Unknown screen: ${id}`);
  for (const component of Object.keys(bindings))
    if (project.components[component].kind === 'screen')
      delete bindings[component];
  Object.assign(bindings, structuredClone(screen.bindings));
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
  screenOverride?: string,
  overrides?: Record<string, Binding>,
): Record<string, ComponentSample> {
  const composition = resolveComposition(project, id);
  if (screenOverride)
    applyScreenBindings(project, composition.bindings, screenOverride);
  if (overrides) {
    for (const component of Object.keys(composition.bindings))
      if (project.components[component].kind === 'screen')
        delete composition.bindings[component];
    Object.assign(composition.bindings, overrides);
  }
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
            ? (seconds * (composition.properties?.animationSpeed ?? 1)) /
              composition.duration
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

/** Locomotion variants retain their synchronized gait phase. */
export function sharesMotionClock(
  project: AnimationProject,
  first: string,
  second: string,
) {
  const a = resolveComposition(project, first),
    b = resolveComposition(project, second);
  const rig = (composition: ResolvedComposition) =>
    Object.entries(composition.bindings)
      .filter(([id]) => project.components[id].kind === 'rig')
      .sort(([a], [b]) => a.localeCompare(b));
  return (
    rig(a).some(
      ([, source]) =>
        source.enabled &&
        Array.isArray(project.clips[source.clip].data.blendSpace),
    ) &&
    a.duration === b.duration &&
    JSON.stringify(rig(a)) === JSON.stringify(rig(b))
  );
}

export function compositionLoops(project: AnimationProject, id: string) {
  return Object.values(resolveComposition(project, id).bindings).every(
    (source) =>
      !source.enabled ||
      source.clock !== 'composition' ||
      project.clips[source.clip].looping,
  );
}

export function playbackDuration(
  project: AnimationProject,
  id: string,
  properties: CompositionProperties = {},
) {
  const composition = resolveComposition(project, id);
  return (
    composition.duration /
    (properties.animationSpeed ?? composition.properties?.animationSpeed ?? 1)
  );
}

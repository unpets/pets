import {
  parseAnimationProject,
  type AnimationProject,
} from '@pets/three-runtime/project';
import source from '../../generated/assets/animations.json?raw';

const catalog = parseAnimationProject(JSON.parse(source).project);
export const defaultAnimationProject = (): AnimationProject =>
  parseAnimationProject(catalog);
export function loadAnimationProject(): AnimationProject {
  try {
    const saved = localStorage.getItem('pets-animation-project');
    if (saved) return parseKernelProject(JSON.parse(saved));
  } catch {
    /* Import and export remain available without browser storage. */
  }
  return defaultAnimationProject();
}
export function saveAnimationProject(project: AnimationProject) {
  try {
    localStorage.setItem('pets-animation-project', JSON.stringify(project));
  } catch {
    /* File export remains available. */
  }
}
export function parseKernelProject(value: unknown): AnimationProject {
  const project = parseAnimationProject(value);
  const defaults = catalog;
  const nodes = new Set(
    Object.values(defaults.components)
      .filter((c) => c.kind === 'rig')
      .flatMap((c) => c.data.nodes as string[]),
  );
  const sources = new Set(
    Object.values(defaults.clips)
      .filter((c) => c.data.source)
      .map((c) => c.data.source),
  );
  const targets = new Set<string>();
  const props = new Set(
    Object.values(defaults.components)
      .filter((component) => component.kind === 'visibility')
      .map((component) => component.data.node),
  );
  const emissionTargets = new Set(
    Object.values(defaults.components)
      .filter((c) => c.kind === 'emission')
      .map((c) => c.data.material),
  );
  const usedMaterials = new Set();
  for (const [id, component] of Object.entries(project.components)) {
    if (component.kind === 'rig') {
      if (
        !Array.isArray(component.data.nodes) ||
        !component.data.nodes.length ||
        component.data.nodes.some(
          (node) =>
            typeof node !== 'string' || !nodes.has(node) || targets.has(node),
        )
      )
        throw new Error(`Invalid or overlapping rig targets: ${id}`);
      for (const node of component.data.nodes as string[]) targets.add(node);
    } else if (component.kind === 'screen') {
      if (
        typeof component.data.layer !== 'string' ||
        !Number.isFinite(component.data.order)
      )
        throw new Error(`Invalid screen component: ${id}`);
      const style = component.data.style as
        { x?: number; y?: number; opacity?: number } | undefined;
      if (
        style &&
        ([style.x, style.y].some(
          (value) =>
            value !== undefined &&
            (!Number.isInteger(value) || Math.abs(value) > 96),
        ) ||
          (style.opacity !== undefined &&
            (!Number.isFinite(style.opacity) ||
              style.opacity < 0 ||
              style.opacity > 1)))
      )
        throw new Error(`Invalid layer placement: ${id}`);
    } else if (component.kind === 'emission') {
      if (
        !emissionTargets.has(component.data.material) ||
        usedMaterials.has(component.data.material)
      )
        throw new Error(`Invalid or overlapping emission target: ${id}`);
      usedMaterials.add(component.data.material);
    } else if (component.kind === 'visibility') {
      if (!props.has(component.data.node))
        throw new Error(`Unknown prop: ${id}`);
    } else
      throw new Error(
        `Unsupported Kernel component adapter: ${component.kind}`,
      );
  }
  for (const [id, clip] of Object.entries(project.clips)) {
    const kind = project.components[clip.component].kind;
    if (kind === 'rig') {
      if (!sources.has(clip.data.source) && !Array.isArray(clip.data.keyframes))
        throw new Error(`Missing motion source: ${id}`);
      if (clip.data.keyframes) {
        const frames = clip.data.keyframes as {
          time: number;
          rotation: number[];
        }[];
        if (
          !frames.length ||
          frames.length > 2048 ||
          frames.some(
            (f, i) =>
              !Number.isFinite(f.time) ||
              f.time < 0 ||
              f.time > clip.duration ||
              (i > 0 && f.time <= frames[i - 1].time) ||
              !Array.isArray(f.rotation) ||
              f.rotation.length !== 3 ||
              f.rotation.some((v) => !Number.isFinite(v)),
          )
        )
          throw new Error(`Invalid rotation keyframes: ${id}`);
      }
    } else if (kind === 'screen') {
      if (clip.data.frames) {
        const frames = clip.data.frames as unknown[];
        if (
          !Array.isArray(frames) ||
          !frames.length ||
          frames.length > 240 ||
          frames.some(
            (frame) =>
              !Array.isArray(frame) ||
              frame.length > 6144 ||
              frame.some(
                (pixel) =>
                  !Array.isArray(pixel) ||
                  pixel.length !== 3 ||
                  !Number.isInteger(pixel[0]) ||
                  pixel[0] < 0 ||
                  pixel[0] >= 96 ||
                  !Number.isInteger(pixel[1]) ||
                  pixel[1] < 0 ||
                  pixel[1] >= 64 ||
                  typeof pixel[2] !== 'string' ||
                  !/^#[0-9a-f]{6}$/i.test(pixel[2]),
              ),
          )
        )
          throw new Error(`Invalid pixel frames: ${id}`);
      } else if (
        !Object.values(defaults.clips).some(
          (source) =>
            source.component === clip.component &&
            JSON.stringify(clip.data) === JSON.stringify(source.data),
        )
      )
        throw new Error(`Unknown display source: ${id}`);
    } else if (kind === 'emission') {
      const frames = clip.data.keyframes as [number, number][];
      if (
        !Array.isArray(frames) ||
        !frames.length ||
        frames.length > 2048 ||
        frames.some(
          (frame, i) =>
            !Array.isArray(frame) ||
            frame.length !== 2 ||
            !Number.isFinite(frame[0]) ||
            !Number.isFinite(frame[1]) ||
            frame[0] < 0 ||
            frame[0] > clip.duration ||
            (i > 0 && frame[0] <= frames[i - 1][0]) ||
            frame[1] < 0 ||
            frame[1] > 16,
        )
      )
        throw new Error(`Invalid emission keyframes: ${id}`);
    } else if (typeof clip.data.visible !== 'boolean')
      throw new Error(`Invalid visibility clip: ${id}`);
  }
  return project;
}

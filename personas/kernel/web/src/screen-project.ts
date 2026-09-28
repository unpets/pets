export const screenLayers = [
  'background',
  'activity',
  'eyes',
  'mouth',
  'eyeLeft',
  'eyeRight',
] as const;
export type ScreenLayer = (typeof screenLayers)[number];
export interface LayerSettings {
  visible: boolean;
  followHead: boolean;
  opacity: number;
  x: number;
  y: number;
  color: string | null;
  source: number | null;
  mirrorX: boolean;
  mirrorY: boolean;
  scale: number;
  rotation: number;
  order: number;
}
export interface ScreenPalette {
  background: string;
  lines: string | null;
  text: string | null;
  linked: boolean;
}
export interface ScreenProject {
  format: 'kernel-screen';
  version: 3;
  eyeMode: 'paired' | 'mirrored' | 'independent';
  palette: ScreenPalette;
  layers: Record<ScreenLayer, LayerSettings>;
}
export function defaultScreenProject(): ScreenProject {
  return {
    format: 'kernel-screen',
    version: 3,
    eyeMode: 'paired',
    palette: { background: '#07151d', lines: null, text: null, linked: true },
    layers: Object.fromEntries(
      screenLayers.map((name) => [
        name,
        {
          visible: true,
          followHead: false,
          opacity: 1,
          x: 0,
          y: 0,
          color: null,
          source: null,
          mirrorX: false,
          mirrorY: false,
          scale: 1,
          rotation: 0,
          order: name.startsWith('eye') ? 2 : screenLayers.indexOf(name),
        },
      ]),
    ) as ScreenProject['layers'],
  };
}
export function parseScreenProject(value: unknown): ScreenProject {
  if (!value || typeof value !== 'object')
    throw new Error('Invalid screen project.');
  const project = JSON.parse(JSON.stringify(value)) as Omit<
    ScreenProject,
    'version' | 'palette'
  > & {
    version: number;
    palette?: ScreenPalette;
  };
  if (
    project.format !== 'kernel-screen' ||
    ![1, 2, 3].includes(project.version) ||
    !project.layers
  )
    throw new Error('Unsupported screen project format.');
  project.eyeMode ??= 'paired';
  if (!['paired', 'mirrored', 'independent'].includes(project.eyeMode))
    throw new Error('Invalid eye layout.');
  const defaults = defaultScreenProject();
  for (const name of screenLayers) {
    if (project.version < 3)
      project.layers[name] = {
        ...defaults.layers[name],
        ...project.layers[name],
      };
    const layer = project.layers[name];
    if (layer) layer.followHead ??= false;
    if (
      !layer ||
      typeof layer.visible !== 'boolean' ||
      typeof layer.followHead !== 'boolean' ||
      !Number.isFinite(layer.opacity) ||
      layer.opacity < 0 ||
      layer.opacity > 1 ||
      !Number.isInteger(layer.x) ||
      Math.abs(layer.x) > 96 ||
      !Number.isInteger(layer.y) ||
      Math.abs(layer.y) > 64 ||
      (layer.color !== null && !/^#[0-9a-f]{6}$/i.test(layer.color)) ||
      (layer.source !== null &&
        (!Number.isInteger(layer.source) ||
          layer.source < 0 ||
          layer.source > 9)) ||
      typeof layer.mirrorX !== 'boolean' ||
      typeof layer.mirrorY !== 'boolean' ||
      !Number.isFinite(layer.scale) ||
      layer.scale <= 0 ||
      layer.scale > 4 ||
      !Number.isFinite(layer.rotation) ||
      !Number.isFinite(layer.order)
    )
      throw new Error(`Invalid ${name} layer settings.`);
  }
  const palette =
    project.version === 1
      ? {
          background: project.layers.background.color ?? '#07151d',
          lines: project.layers.activity.color,
          text: project.layers.activity.color,
          linked: true,
        }
      : project.palette;
  if (
    !palette ||
    typeof palette.linked !== 'boolean' ||
    typeof palette.background !== 'string' ||
    !/^#[0-9a-f]{6}$/i.test(palette.background) ||
    [palette.lines, palette.text].some(
      (color) =>
        color !== null &&
        (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color)),
    ) ||
    (palette.linked && palette.lines !== palette.text)
  )
    throw new Error('Invalid screen palette.');
  return {
    format: 'kernel-screen',
    version: 3,
    eyeMode: project.eyeMode,
    palette: { ...palette },
    layers: Object.fromEntries(
      screenLayers.map((name) => [
        name,
        {
          ...project.layers[name],
          color:
            name === 'background' || name === 'activity'
              ? null
              : project.layers[name].color,
        },
      ]),
    ) as ScreenProject['layers'],
  };
}
export function updatePalette(
  palette: ScreenPalette,
  update: Partial<ScreenPalette>,
): ScreenPalette {
  const next = { ...palette, ...update };
  if (next.linked) {
    const color =
      'lines' in update
        ? next.lines
        : 'text' in update
          ? next.text
          : next.lines;
    next.lines = color;
    next.text = color;
  }
  return next;
}
export function loadScreenProject(): ScreenProject {
  try {
    const saved = localStorage.getItem('kernel-screen-project');
    if (saved) return parseScreenProject(JSON.parse(saved));
  } catch {
    /* A project can still be imported when storage is unavailable. */
  }
  return defaultScreenProject();
}
export function saveScreenProject(project: ScreenProject) {
  try {
    localStorage.setItem('kernel-screen-project', JSON.stringify(project));
  } catch {
    /* Export remains available without browser storage. */
  }
}

export const screenLayers = [
  'background',
  'activity',
  'eyes',
  'mouth',
] as const;
export type ScreenLayer = (typeof screenLayers)[number];
export interface LayerSettings {
  visible: boolean;
  opacity: number;
  x: number;
  y: number;
  color: string | null;
  source: number | null;
}
export interface ScreenPalette {
  background: string;
  lines: string | null;
  text: string | null;
  linked: boolean;
}
export interface ScreenProject {
  format: 'kernel-screen';
  version: 2;
  palette: ScreenPalette;
  layers: Record<ScreenLayer, LayerSettings>;
}
export function defaultScreenProject(): ScreenProject {
  return {
    format: 'kernel-screen',
    version: 2,
    palette: { background: '#07151d', lines: null, text: null, linked: true },
    layers: Object.fromEntries(
      screenLayers.map((name) => [
        name,
        { visible: true, opacity: 1, x: 0, y: 0, color: null, source: null },
      ]),
    ) as ScreenProject['layers'],
  };
}
export function parseScreenProject(value: unknown): ScreenProject {
  if (!value || typeof value !== 'object')
    throw new Error('Invalid screen project.');
  const project = value as Omit<ScreenProject, 'version' | 'palette'> & {
    version: number;
    palette?: ScreenPalette;
  };
  if (
    project.format !== 'kernel-screen' ||
    (project.version !== 1 && project.version !== 2) ||
    !project.layers
  )
    throw new Error('Unsupported screen project format.');
  for (const name of screenLayers) {
    const layer = project.layers[name];
    if (
      !layer ||
      typeof layer.visible !== 'boolean' ||
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
          layer.source > 9))
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
    version: 2,
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

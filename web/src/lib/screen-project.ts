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
export interface ScreenProject {
  format: 'kernel-screen';
  version: 1;
  layers: Record<ScreenLayer, LayerSettings>;
}
export function defaultScreenProject(): ScreenProject {
  return {
    format: 'kernel-screen',
    version: 1,
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
  const project = value as ScreenProject;
  if (
    project.format !== 'kernel-screen' ||
    project.version !== 1 ||
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
  return {
    format: 'kernel-screen',
    version: 1,
    layers: Object.fromEntries(
      screenLayers.map((name) => [name, { ...project.layers[name] }]),
    ) as ScreenProject['layers'],
  };
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

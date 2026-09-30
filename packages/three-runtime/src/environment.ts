import defaults from '../../../resources/environment.json';
export type Triple = [number, number, number];
export interface EnvironmentPart {
  shape: 'box' | 'cylinder';
  size: Triple;
  position: Triple;
  rotation?: Triple;
  color: string;
}
export interface EnvironmentAsset {
  label: string;
  parts: EnvironmentPart[];
}
export interface EnvironmentObject {
  label: string;
  asset: string;
  position: Triple;
  rotation: Triple;
  scale: Triple;
  enabled: boolean;
}
export interface Environment {
  format: 'pets-environment';
  version: 1;
  assets: Record<string, EnvironmentAsset>;
  objects: Record<string, EnvironmentObject>;
  bindings: Record<string, { object: string; origin: Triple }>;
}
function vector(value: unknown, positive = false): value is Triple {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every(
      (n) =>
        typeof n === 'number' && Number.isFinite(n) && (!positive || n > 0),
    )
  );
}
export function parseEnvironment(value: unknown): Environment {
  const doc = structuredClone(value) as Environment;
  if (
    !doc ||
    doc.format !== 'pets-environment' ||
    doc.version !== 1 ||
    !doc.assets ||
    !doc.objects ||
    !doc.bindings
  )
    throw new Error('Invalid environment document.');
  for (const asset of Object.values(doc.assets)) {
    if (
      typeof asset.label !== 'string' ||
      !Array.isArray(asset.parts) ||
      asset.parts.length > 1000
    )
      throw new Error('Invalid environment asset.');
    for (const part of asset.parts)
      if (
        !['box', 'cylinder'].includes(part.shape) ||
        !vector(part.size, true) ||
        !vector(part.position) ||
        (part.rotation !== undefined && !vector(part.rotation)) ||
        !/^#[\da-f]{6}$/i.test(part.color)
      )
        throw new Error('Invalid environment geometry.');
  }
  for (const object of Object.values(doc.objects))
    if (
      !doc.assets[object.asset] ||
      typeof object.label !== 'string' ||
      typeof object.enabled !== 'boolean' ||
      !vector(object.position) ||
      !vector(object.rotation) ||
      !vector(object.scale, true)
    )
      throw new Error('Invalid environment object.');
  for (const binding of Object.values(doc.bindings))
    if (!doc.objects[binding.object] || !vector(binding.origin))
      throw new Error('Invalid environment binding.');
  return doc;
}
export const defaultEnvironment = () => parseEnvironment(defaults);

/** Import assets without replacing scene objects or interaction bindings. */
export function importEnvironmentAssets(
  scene: Environment,
  source: Environment,
): Environment {
  const result = parseEnvironment(scene);
  for (const [name, asset] of Object.entries(parseEnvironment(source).assets)) {
    let id = name;
    while (
      result.assets[id] &&
      JSON.stringify(result.assets[id]) !== JSON.stringify(asset)
    )
      id += '-copy';
    result.assets[id] = structuredClone(asset);
    let object = id;
    while (result.objects[object]) object += '-copy';
    result.objects[object] = {
      label: asset.label,
      asset: id,
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      enabled: true,
    };
  }
  return result;
}

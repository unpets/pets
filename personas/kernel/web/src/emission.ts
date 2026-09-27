import { Mesh, MeshStandardMaterial, type Object3D } from 'three';
import type {
  AnimationProject,
  ComponentSample,
} from '@pets/three-runtime/project';

export type EmissionFrame = [number, number];

export function sampleEmission(
  frames: EmissionFrame[],
  seconds: number,
): number {
  if (seconds <= frames[0][0]) return frames[0][1];
  const index = frames.findIndex(([time]) => time > seconds);
  if (index < 0) return frames[frames.length - 1][1];
  const [start, a] = frames[index - 1];
  const [end, b] = frames[index];
  return a + ((b - a) * (seconds - start)) / (end - start);
}

export function createEmission(model: Object3D, catalog: AnimationProject) {
  const targets = new Set(
    Object.values(catalog.components)
      .filter((component) => component.kind === 'emission')
      .map((component) => component.data.material as string),
  );
  const materials = new Map<string, Set<MeshStandardMaterial>>();
  model.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    for (const material of Array.isArray(object.material)
      ? object.material
      : [object.material]) {
      if (
        !(material instanceof MeshStandardMaterial) ||
        !targets.has(material.name)
      )
        continue;
      if (!materials.has(material.name))
        materials.set(material.name, new Set());
      materials.get(material.name)!.add(material);
    }
  });
  return (
    project: AnimationProject,
    samples: Record<string, ComponentSample>,
  ) => {
    for (const targets of materials.values())
      for (const material of targets) material.emissiveIntensity = 0;
    for (const [id, sample] of Object.entries(samples)) {
      const component = project.components[id];
      if (component.kind !== 'emission') continue;
      const clip = project.clips[sample.clip];
      const value = sampleEmission(
        clip.data.keyframes as EmissionFrame[],
        sample.phase * clip.duration,
      );
      for (const material of materials.get(component.data.material as string) ??
        [])
        material.emissiveIntensity = value;
    }
  };
}

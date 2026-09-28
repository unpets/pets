import {
  BoxGeometry,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Object3D,
  Quaternion,
  Vector3,
} from 'three';
import type { AnimationProject, ComponentSample } from './project';

export interface ParticleEffect {
  generator: 'particles';
  color: string;
  count: number;
  lifetime: number;
  radius: number;
  spread: number;
  velocity: [number, number, number];
  gravity: [number, number, number];
  offset: [number, number, number];
}
export const defaultEffect = (): ParticleEffect => ({
  generator: 'particles',
  color: '#55e9eb',
  count: 16,
  lifetime: 0.5,
  radius: 0.018,
  spread: 0.12,
  velocity: [0, 0, -0.7],
  gravity: [0, 0, -0.3],
  offset: [0, 0, 0],
});
export function validateEffect(
  value: Record<string, unknown>,
): asserts value is Record<string, unknown> & ParticleEffect {
  const vector = (v: unknown) =>
    Array.isArray(v) &&
    v.length === 3 &&
    v.every(
      (n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 100,
    );
  if (
    value.generator !== 'particles' ||
    typeof value.color !== 'string' ||
    !/^#[\da-f]{6}$/i.test(value.color) ||
    !Number.isInteger(value.count) ||
    Number(value.count) < 1 ||
    Number(value.count) > 128 ||
    typeof value.lifetime !== 'number' ||
    !Number.isFinite(value.lifetime) ||
    value.lifetime <= 0 ||
    value.lifetime > 30 ||
    typeof value.radius !== 'number' ||
    !Number.isFinite(value.radius) ||
    value.radius <= 0 ||
    value.radius > 1 ||
    typeof value.spread !== 'number' ||
    !Number.isFinite(value.spread) ||
    value.spread < 0 ||
    value.spread > 10 ||
    !vector(value.velocity) ||
    !vector(value.gravity) ||
    !vector(value.offset)
  )
    throw new Error('Invalid particle effect.');
}
export function particle(
  effect: ParticleEffect,
  index: number,
  seconds: number,
) {
  const age =
    (((seconds + (index * effect.lifetime) / effect.count) % effect.lifetime) +
      effect.lifetime) %
    effect.lifetime;
  const seed = (axis: number) =>
    (((index + 1) * (axis * 193 + 137)) % 997) / 498.5 - 1;
  return {
    position: effect.offset.map(
      (v, axis) =>
        v +
        (effect.velocity[axis] + seed(axis) * effect.spread) * age +
        (effect.gravity[axis] * age * age) / 2,
    ) as [number, number, number],
    size: effect.radius * Math.sin((Math.PI * age) / effect.lifetime),
  };
}
export function createEffects(nodes: Record<string, Object3D>) {
  const pools = new Map<
    string,
    { signature: string; meshes: InstancedMesh[] }
  >();
  const matrix = new Matrix4(),
    position = new Vector3(),
    scale = new Vector3(),
    rotation = new Quaternion();
  function remove(id: string) {
    const pool = pools.get(id);
    if (!pool) return;
    for (const mesh of pool.meshes) {
      mesh.removeFromParent();
      mesh.geometry.dispose();
      (mesh.material as MeshBasicMaterial).dispose();
      mesh.dispose();
    }
    pools.delete(id);
  }
  return {
    update(
      project: AnimationProject,
      samples: Record<string, ComponentSample>,
    ) {
      const active = new Set<string>();
      for (const [id, sample] of Object.entries(samples)) {
        const component = project.components[id];
        if (component.kind !== 'effect') continue;
        active.add(id);
        const clip = project.clips[sample.clip];
        const effect = clip.data as unknown as ParticleEffect;
        const signature = JSON.stringify([component.data, effect]);
        if (pools.get(id)?.signature !== signature) {
          remove(id);
          pools.set(id, {
            signature,
            meshes: (component.data.nodes as string[]).map((name) => {
              const mesh = new InstancedMesh(
                new BoxGeometry(2, 2, 2),
                new MeshBasicMaterial({
                  color: effect.color,
                  toneMapped: false,
                }),
                effect.count,
              );
              mesh.frustumCulled = false;
              mesh.name = id;
              nodes[name].add(mesh);
              return mesh;
            }),
          });
        }
        for (const mesh of pools.get(id)!.meshes) {
          mesh.visible = true;
          for (let index = 0; index < effect.count; index++) {
            const value = particle(effect, index, sample.phase * clip.duration);
            matrix.compose(
              position.fromArray(value.position),
              rotation,
              scale.setScalar(value.size),
            );
            mesh.setMatrixAt(index, matrix);
          }
          mesh.instanceMatrix.needsUpdate = true;
        }
      }
      for (const [id, pool] of pools)
        if (!active.has(id))
          pool.meshes.forEach((mesh) => {
            mesh.visible = false;
          });
    },
    dispose() {
      for (const id of [...pools.keys()]) remove(id);
    },
  };
}

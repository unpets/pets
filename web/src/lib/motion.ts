import {
  BufferAttribute,
  BufferGeometry,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  Vector3,
} from 'three';
import type { AnimationClip, PoseSample } from './types';

export function sampleClip(
  clip: AnimationClip,
  phase: number,
): [PoseSample, PoseSample, number] {
  const position = Math.max(0, Math.min(1, phase)) * (clip.samples.length - 1);
  const index = Math.floor(position);
  return [
    clip.samples[index],
    clip.samples[Math.min(index + 1, clip.samples.length - 1)],
    position % 1,
  ];
}

export function createMotion(parts: Record<string, Object3D>) {
  const position = new Vector3();
  const targetPosition = new Vector3();
  const rotation = new Quaternion();
  const targetRotation = new Quaternion();
  let transition: {
    started: number;
    parts: Record<string, { p: Vector3; q: Quaternion }>;
  } | null = null;

  return {
    beginTransition() {
      transition = {
        started: performance.now(),
        parts: Object.fromEntries(
          Object.entries(parts).map(([name, part]) => [
            name,
            {
              p: part.position.clone(),
              q: part.quaternion.clone(),
            },
          ]),
        ),
      };
    },
    cancelTransition() {
      transition = null;
    },
    update(a: PoseSample, b: PoseSample, fraction: number, now: number) {
      const blend = transition
        ? Math.min(1, (now - transition.started) / 180)
        : 1;
      for (const [name, part] of Object.entries(parts)) {
        const first = a.parts[name];
        const second = b.parts[name];
        if (!first || !second) continue;
        position
          .fromArray(first.p)
          .lerp(targetPosition.fromArray(second.p), fraction);
        rotation
          .fromArray(first.q)
          .slerp(targetRotation.fromArray(second.q), fraction);
        const previous = transition?.parts[name];
        if (previous) {
          position.lerpVectors(previous.p, position, blend);
          rotation.slerpQuaternions(previous.q, rotation, blend);
        }
        part.position.copy(position);
        part.quaternion.copy(rotation);
        part.updateMatrix();
      }
      if (blend === 1) transition = null;
    },
  };
}

export function createCable() {
  const rings = 32;
  const segments = 8;
  const positions = new Float32Array(rings * segments * 3);
  const indices: number[] = [];
  for (let ring = 0; ring < rings - 1; ring++) {
    for (let segment = 0; segment < segments; segment++) {
      const a = ring * segments + segment;
      const b = ring * segments + ((segment + 1) % segments);
      const c = (ring + 1) * segments + ((segment + 1) % segments);
      const d = (ring + 1) * segments + segment;
      indices.push(a, b, d, b, c, d);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  const material = new MeshStandardMaterial({
    color: 0x347888,
    metalness: 0.15,
    roughness: 0.5,
  });
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  const points = Array.from({ length: rings }, () => new Vector3());
  const target = new Vector3();
  const tangent = new Vector3();
  const side = new Vector3();
  const normal = new Vector3();
  const vertex = new Vector3();

  return {
    mesh,
    update(a: PoseSample, b: PoseSample, fraction: number) {
      points.forEach((point, index) =>
        point
          .fromArray(a.cable[index])
          .lerp(target.fromArray(b.cable[index]), fraction),
      );
      points.forEach((point, index) => {
        tangent
          .copy(points[Math.min(rings - 1, index + 1)])
          .sub(points[Math.max(0, index - 1)])
          .normalize();
        side.set(1, 0, 0).cross(tangent).normalize();
        normal.copy(tangent).cross(side).normalize();
        for (let segment = 0; segment < segments; segment++) {
          const angle = (segment * Math.PI) / 4;
          vertex
            .copy(point)
            .addScaledVector(side, 0.025 * Math.cos(angle))
            .addScaledVector(normal, 0.025 * Math.sin(angle));
          vertex.toArray(positions, (index * segments + segment) * 3);
        }
      });
      geometry.attributes.position.needsUpdate = true;
      geometry.computeVertexNormals();
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}

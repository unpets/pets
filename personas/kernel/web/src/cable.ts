import {
  BufferAttribute,
  BufferGeometry,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Vector3,
} from 'three';

export function createCable(
  wrist: Object3D,
  wristPort: Vector3,
  serverPort: Vector3,
) {
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
  const start = new Vector3();
  const control1 = new Vector3();
  const control2 = serverPort.clone().add(new Vector3(0, -0.36, 0));
  const tangent = new Vector3();
  const side = new Vector3();
  const normal = new Vector3();
  const vertex = new Vector3();

  return {
    mesh,
    update() {
      start.copy(wristPort).applyMatrix4(wrist.matrixWorld);
      control1
        .set(0, 1, 0)
        .transformDirection(wrist.matrixWorld)
        .multiplyScalar(0.2)
        .add(start);
      points.forEach((point, index) => {
        const t = index / (rings - 1);
        const u = 1 - t;
        point
          .copy(start)
          .multiplyScalar(u ** 3)
          .addScaledVector(control1, 3 * u * u * t)
          .addScaledVector(control2, 3 * u * t * t)
          .addScaledVector(serverPort, t ** 3);
      });
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

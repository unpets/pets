import {
  BufferAttribute,
  BufferGeometry,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  Vector3,
} from 'three';

export function createCable(
  attachment: Object3D,
  attachmentPort: Vector3,
  serverPort: Vector3,
  root: Object3D,
  radius: number,
) {
  const rings = 64;
  const segments = 16;
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
  const raw = Array.from({ length: 257 }, () => new Vector3());
  const distances = new Float64Array(raw.length);
  const controls = Array.from({ length: 6 }, () => new Vector3());
  const binomial = [1, 5, 10, 10, 5, 1];
  const direction = new Vector3();
  const tangent = new Vector3(),
    previous = new Vector3();
  const side = new Vector3(),
    normal = new Vector3(),
    vertex = new Vector3();
  const rotation = new Quaternion();
  return {
    mesh,
    update() {
      controls[0].copy(attachmentPort).applyMatrix4(attachment.matrixWorld);
      controls[5].copy(serverPort).applyMatrix4(root.matrixWorld);
      direction.set(0, 1, 0).transformDirection(attachment.matrixWorld);
      controls[1].copy(controls[0]).addScaledVector(direction, 0.14);
      controls[2]
        .set(0, -0.12, -0.12)
        .applyQuaternion(root.quaternion)
        .add(controls[0])
        .addScaledVector(direction, 0.26);
      controls[3]
        .copy(serverPort)
        .add(new Vector3(0, -0.28, -0.2))
        .applyMatrix4(root.matrixWorld);
      controls[4]
        .copy(serverPort)
        .add(new Vector3(0, -0.14, 0))
        .applyMatrix4(root.matrixWorld);
      raw.forEach((point, index) => {
        const t = index / (raw.length - 1);
        point.set(0, 0, 0);
        controls.forEach((control, i) =>
          point.addScaledVector(
            control,
            binomial[i] * (1 - t) ** (5 - i) * t ** i,
          ),
        );
        distances[index] = index
          ? distances[index - 1] + point.distanceTo(raw[index - 1])
          : 0;
      });
      let cursor = 1;
      points.forEach((point, index) => {
        const distance = (distances[raw.length - 1] * index) / (rings - 1);
        while (cursor < raw.length - 1 && distances[cursor] < distance)
          cursor++;
        const length = distances[cursor] - distances[cursor - 1];
        point
          .copy(raw[cursor - 1])
          .lerp(
            raw[cursor],
            length ? (distance - distances[cursor - 1]) / length : 0,
          );
      });
      side.set(1, 0, 0).transformDirection(attachment.matrixWorld);
      points.forEach((point, index) => {
        tangent
          .copy(points[Math.min(rings - 1, index + 1)])
          .sub(points[Math.max(0, index - 1)])
          .normalize();
        if (index)
          side.applyQuaternion(rotation.setFromUnitVectors(previous, tangent));
        side.addScaledVector(tangent, -side.dot(tangent)).normalize();
        normal.copy(tangent).cross(side).normalize();
        for (let segment = 0; segment < segments; segment++) {
          const angle = (segment * 2 * Math.PI) / segments;
          vertex
            .copy(point)
            .addScaledVector(side, radius * Math.cos(angle))
            .addScaledVector(normal, radius * Math.sin(angle));
          vertex.toArray(positions, (index * segments + segment) * 3);
        }
        previous.copy(tangent);
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

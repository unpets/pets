import {
  BufferGeometry,
  Float32BufferAttribute,
  BoxGeometry,
  PlaneGeometry,
  SphereGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  Matrix4,
  Vector3,
  Quaternion,
  Euler,
  DoubleSide,
  type Object3D,
} from 'three';
import {
  identityTransform,
  type FaceGeometry,
  type FaceFrame,
  type FaceTransform,
  type FaceSurface,
} from './face';
import type { AnimationProject, ComponentSample } from './project';

export function meshGeometry(value: FaceGeometry): BufferGeometry {
  if (value.type === 'box') return new BoxGeometry(1, 1, 1);
  if (value.type === 'plane') return new PlaneGeometry(1, 1);
  if (value.type === 'sphere') return new SphereGeometry(0.5, 32, 24);
  if (value.type !== 'mesh') throw new Error('Unknown mesh geometry.');
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    'position',
    new Float32BufferAttribute(value.positions, 3),
  );
  geometry.setIndex(value.indices);
  geometry.computeVertexNormals();
  return geometry;
}
export function applyTransform(object: Object3D, value: FaceTransform) {
  object.position.fromArray(value.position);
  object.quaternion.setFromEuler(
    new Euler(
      ...(value.rotation.map((v) => (v * Math.PI) / 180) as [
        number,
        number,
        number,
      ]),
      'XYZ',
    ),
  );
  object.scale.fromArray(value.scale);
}
export function sampleMeshFrame(frames: FaceFrame[], time: number) {
  const end = frames.findIndex((f) => f.time >= time);
  const a = frames[end < 0 ? frames.length - 1 : Math.max(0, end - 1)];
  const b = frames[end < 0 ? frames.length - 1 : end];
  const t =
    a.time === b.time
      ? 0
      : Math.max(0, Math.min(1, (time - a.time) / (b.time - a.time)));
  const quaternion = (f: FaceFrame) =>
    new Quaternion().setFromEuler(
      new Euler(
        ...(f.rotation.map((v) => (v * Math.PI) / 180) as [
          number,
          number,
          number,
        ]),
        'XYZ',
      ),
    );
  return {
    position: new Vector3(...a.position).lerp(new Vector3(...b.position), t),
    scale: new Vector3(...a.scale).lerp(new Vector3(...b.scale), t),
    quaternion: quaternion(a).slerp(quaternion(b), t),
    opacity: a.opacity + (b.opacity - a.opacity) * t,
  };
}
/** Derive the face frame from display UVs so geometry follows the real surface. */
export function createFaceAnchor(display: Mesh) {
  const geometry = display.geometry;
  const positions = geometry.getAttribute('position'),
    uv = geometry.getAttribute('uv');
  const ids = [0, 1, 2].map((i) => geometry.index?.getX(i) ?? i);
  const points = ids.map((i) =>
    new Vector3().fromBufferAttribute(positions, i),
  );
  const du1 = uv.getX(ids[1]) - uv.getX(ids[0]),
    dv1 = uv.getY(ids[1]) - uv.getY(ids[0]);
  const du2 = uv.getX(ids[2]) - uv.getX(ids[0]),
    dv2 = uv.getY(ids[2]) - uv.getY(ids[0]);
  const denominator = du1 * dv2 - du2 * dv1;
  if (Math.abs(denominator) < 1e-12)
    throw new Error('Display UV frame is degenerate.');
  const edge1 = points[1].clone().sub(points[0]),
    edge2 = points[2].clone().sub(points[0]);
  const u = edge1
    .clone()
    .multiplyScalar(dv2)
    .addScaledVector(edge2, -dv1)
    .divideScalar(denominator);
  const v = edge2
    .clone()
    .multiplyScalar(du1)
    .addScaledVector(edge1, -du2)
    .divideScalar(denominator);
  const width = u.length();
  const center = points[0]
    .clone()
    .addScaledVector(u, 0.5 - uv.getX(ids[0]))
    .addScaledVector(v, 0.5 - uv.getY(ids[0]));
  const normal = u.clone().cross(v).normalize().multiplyScalar(width);
  const basis = new Matrix4()
    .makeBasis(
      u.normalize().multiplyScalar(width),
      v.normalize().multiplyScalar(width),
      normal,
    )
    .setPosition(center);
  display.updateMatrix();
  const anchor = new Group();
  anchor.name = 'face-layers';
  anchor.matrixAutoUpdate = false;
  anchor.matrix.multiplyMatrices(display.matrix, basis);
  display.parent!.add(anchor);
  return anchor;
}

export function createMeshLayers(
  anchor: Object3D,
  kind: 'face-mesh' | 'attachment',
  parts: Record<string, Object3D> = {},
  anchors: Record<string, Object3D> = parts,
) {
  const entries = new Map<
    string,
    {
      signature: string;
      group: Group;
      mesh: Mesh<BufferGeometry, MeshBasicMaterial>;
    }
  >();
  const hidden = new Map<Object3D, boolean>();
  function remove(id: string) {
    const entry = entries.get(id)!;
    entry.group.removeFromParent();
    entry.mesh.geometry.dispose();
    entry.mesh.material.dispose();
    entries.delete(id);
  }
  return {
    update(
      project: AnimationProject,
      samples: Record<string, ComponentSample>,
      surface?: FaceSurface,
    ) {
      for (const [part, visible] of hidden) part.visible = visible;
      hidden.clear();
      for (const id of entries.keys())
        if (project.components[id]?.kind !== kind) remove(id);
      for (const [id, component] of Object.entries(project.components)) {
        if (component.kind !== kind) continue;
        const signature = JSON.stringify(component.data);
        if (entries.get(id)?.signature !== signature) {
          if (entries.has(id)) remove(id);
          const group = new Group();
          group.name = id;
          const mesh = new Mesh(
            meshGeometry(component.data.geometry as FaceGeometry),
            new MeshBasicMaterial({
              color: component.data.color as string,
              transparent: true,
              side: DoubleSide,
              toneMapped: false,
            }),
          );
          group.add(mesh);
          (kind === 'attachment'
            ? anchors[component.data.node as string]
            : anchor
          )?.add(group);
          entries.set(id, { signature, group, mesh });
        }
        const { group, mesh } = entries.get(id)!;
        const sample = samples[id];
        group.visible = !!sample;
        if (!sample) continue;
        applyTransform(group, surface?.placements[id] ?? identityTransform());
        const clip = project.clips[sample.clip];
        const frame = sampleMeshFrame(
          clip.data.keyframes as FaceFrame[],
          sample.phase * clip.duration,
        );
        mesh.position.copy(frame.position);
        mesh.quaternion.copy(frame.quaternion);
        mesh.scale.copy(frame.scale);
        mesh.material.opacity = frame.opacity;
        if (kind === 'attachment')
          for (const name of component.data.hides as string[]) {
            const part = parts[name];
            if (part) {
              if (!hidden.has(part)) hidden.set(part, part.visible);
              part.visible = false;
            }
          }
      }
    },
    dispose() {
      for (const [part, visible] of hidden) part.visible = visible;
      for (const id of entries.keys()) remove(id);
    },
  };
}

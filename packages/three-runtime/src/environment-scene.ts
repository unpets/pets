import {
  BoxGeometry,
  CylinderGeometry,
  Euler,
  Group,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Vector3,
} from 'three';
import type { Environment, Triple } from './environment';
const rotation = (value: Triple) =>
  new Euler(...(value.map((v) => (v * Math.PI) / 180) as Triple));
export function createEnvironmentScene(document: Environment) {
  const root = new Group();
  root.name = 'Environment';
  const objects: Record<string, Group> = {};
  for (const [id, object] of Object.entries(document.objects)) {
    const group = new Group();
    group.name = object.label;
    group.position.set(...object.position);
    group.rotation.copy(rotation(object.rotation));
    group.scale.set(...object.scale);
    for (const part of document.assets[object.asset].parts) {
      const geometry =
        part.shape === 'box'
          ? new BoxGeometry(...part.size)
          : new CylinderGeometry(
              part.size[0],
              part.size[1],
              part.size[2],
              24,
            ).rotateX(Math.PI / 2);
      const mesh = new Mesh(
        geometry,
        new MeshStandardMaterial({ color: part.color, roughness: 0.75 }),
      );
      mesh.position.set(...part.position);
      mesh.rotation.copy(rotation(part.rotation ?? [0, 0, 0]));
      group.add(mesh);
    }
    root.add(group);
    objects[id] = group;
  }
  function update(
    composition: string,
    parent?: (id: string) => string | undefined,
  ) {
    let cursor: string | undefined = composition;
    const seen = new Set<string>();
    while (cursor && !document.bindings[cursor] && !seen.has(cursor)) {
      seen.add(cursor);
      cursor = parent?.(cursor);
    }
    const binding = cursor ? document.bindings[cursor] : undefined;
    for (const [id, object] of Object.entries(objects))
      object.visible =
        document.objects[id].enabled &&
        (!Object.values(document.bindings).some((b) => b.object === id) ||
          binding?.object === id);
    const placement = new Matrix4();
    if (binding) {
      const object = objects[binding.object];
      // Asset scale changes geometry; placement stays a rigid character transform.
      placement.makeRotationFromEuler(object.rotation);
      placement.setPosition(object.position);
      placement.multiply(
        new Matrix4().makeTranslation(
          ...(binding.origin.map((v) => -v) as Triple),
        ),
      );
    }
    return placement;
  }
  function dispose() {
    root.traverse((object) => {
      if (object instanceof Mesh) {
        object.geometry.dispose();
        (object.material as MeshStandardMaterial).dispose();
      }
    });
    root.removeFromParent();
  }
  return { root, update, dispose };
}

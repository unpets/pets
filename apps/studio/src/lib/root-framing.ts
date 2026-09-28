import { Vector3, type Object3D } from 'three';

/** Follow authored root travel while leaving small idle and gait motion in frame. */
export function createRootFraming(
  model: Object3D,
  root: Object3D,
  camera: Object3D,
  target?: Vector3,
  deadZone = 0.25,
) {
  const origin = model.worldToLocal(root.getWorldPosition(new Vector3()));
  const rest = new Vector3();
  const position = new Vector3();
  const offset = new Vector3();
  const delta = new Vector3();
  return {
    offset,
    update(enabled = true) {
      position.set(0, 0, 0);
      if (enabled) {
        model.localToWorld(rest.copy(origin));
        root.getWorldPosition(position).sub(rest);
        for (const axis of ['x', 'y', 'z'] as const)
          position[axis] =
            Math.sign(position[axis]) *
            Math.max(0, Math.abs(position[axis]) - deadZone);
      }
      delta.copy(position).sub(offset);
      camera.position.add(delta);
      target?.add(delta);
      offset.copy(position);
    },
  };
}

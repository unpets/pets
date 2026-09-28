import { Vector3, type Object3D } from 'three';

/** Translate the character in metres while the inspection camera follows it. */
export function createTravelPreview(
  model: Object3D,
  camera: Object3D,
  target: Vector3,
  grid: Object3D,
  gridSpacing = 0.25,
) {
  const origin = model.position.clone();
  const delta = new Vector3();
  let distance = 0;

  function shift() {
    model.position.add(delta);
    camera.position.add(delta);
    target.add(delta);
    grid.position.x = Math.round(model.position.x / gridSpacing) * gridSpacing;
    grid.position.y = Math.round(model.position.y / gridSpacing) * gridSpacing;
    model.updateMatrixWorld(true);
  }

  return {
    get distance() {
      return distance;
    },
    get position() {
      return model.position;
    },
    advance(velocity: { x: number; y: number; z: number }, seconds: number) {
      delta.set(velocity.x, velocity.y, velocity.z).multiplyScalar(seconds);
      distance += delta.length();
      shift();
    },
    reset() {
      delta.copy(origin).sub(model.position);
      distance = 0;
      shift();
    },
  };
}

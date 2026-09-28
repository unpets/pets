import { Euler, MathUtils, Object3D, Quaternion, Vector3 } from 'three';

export interface LookAtSettings {
  target: 'point' | 'pointer';
  position: [number, number, number];
  response: number;
  weight: number;
}
export const defaultLookAt = (): LookAtSettings => ({
  target: 'pointer',
  position: [0, -3, 2.2],
  response: 8,
  weight: 1,
});
export function parseLookAt(value: unknown): LookAtSettings {
  const settings = value as LookAtSettings;
  if (
    !settings ||
    !['point', 'pointer'].includes(settings.target) ||
    !Array.isArray(settings.position) ||
    settings.position.length !== 3 ||
    settings.position.some((value) => !Number.isFinite(value)) ||
    !Number.isFinite(settings.response) ||
    settings.response <= 0 ||
    settings.response > 60 ||
    !Number.isFinite(settings.weight) ||
    settings.weight < 0 ||
    settings.weight > 1
  )
    throw new Error('Invalid Lookat target settings.');
  return structuredClone(settings);
}

/** Aim in the body's frame, preserving the authored joint attachment and neck limits. */
export function createLookAt(head: Object3D, body: Object3D, joint: Object3D) {
  const headPosition = new Vector3();
  const bodyRotation = new Quaternion();
  const headRotation = new Quaternion();
  const jointRotation = new Quaternion();
  const parentInverse = new Quaternion();
  const desired = new Quaternion();
  const direction = new Vector3();
  const angles = new Euler(0, 0, 0, 'ZYX');
  let yaw = 0,
    pitch = 0,
    active = false;
  return {
    reset() {
      active = false;
    },
    update(
      target: Vector3,
      elapsed: number,
      settings: LookAtSettings,
      immediate = false,
    ) {
      if (!joint.parent) return;
      body.getWorldQuaternion(bodyRotation);
      head.getWorldPosition(headPosition);
      direction
        .copy(target)
        .sub(headPosition)
        .applyQuaternion(bodyRotation.clone().invert());
      if (direction.lengthSq() < 1e-10) return;
      const targetYaw = MathUtils.clamp(
        Math.atan2(direction.x, -direction.y),
        -0.72,
        0.72,
      );
      const targetPitch = MathUtils.clamp(
        -Math.atan2(direction.z, Math.hypot(direction.x, direction.y)),
        -0.4,
        0.4,
      );
      if (!active) {
        yaw = 0;
        pitch = 0;
        active = true;
      }
      const weight = immediate
        ? 1
        : 1 - Math.exp(-settings.response * Math.max(0, elapsed));
      yaw = MathUtils.lerp(yaw, targetYaw, weight);
      pitch = MathUtils.lerp(pitch, targetPitch, weight);
      head.getWorldQuaternion(headRotation);
      joint.getWorldQuaternion(jointRotation);
      joint.parent.getWorldQuaternion(parentInverse).invert();
      angles.set(pitch, 0, yaw);
      desired
        .copy(bodyRotation)
        .multiply(new Quaternion().setFromEuler(angles));
      desired
        .copy(headRotation.clone().slerp(desired, settings.weight))
        .multiply(headRotation.invert())
        .multiply(jointRotation);
      joint.quaternion.copy(parentInverse.multiply(desired));
      joint.updateWorldMatrix(false, true);
    },
  };
}
export function headGaze(
  head: Object3D,
  body: Object3D,
  target = new Vector3(),
) {
  const relative = body
    .getWorldQuaternion(new Quaternion())
    .invert()
    .multiply(head.getWorldQuaternion(new Quaternion()));
  target.set(0, -1, 0).applyQuaternion(relative);
  return {
    x: MathUtils.clamp(Math.atan2(target.x, -target.y) * 12, -8, 8),
    y: MathUtils.clamp(
      -Math.atan2(target.z, Math.hypot(target.x, target.y)) * 15,
      -6,
      6,
    ),
  };
}

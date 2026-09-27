import { Euler, MathUtils, Object3D, Quaternion, Vector3 } from 'three';

export const neckLimits = { yaw: 0.72, pitch: 0.4 } as const;
export interface GazeAngles {
  yaw: number;
  pitch: number;
}

export function cursorAngles(
  dx: number,
  dy: number,
  height: number,
): GazeAngles {
  const distance = Math.max(1, height) * 0.75;
  return {
    yaw: MathUtils.clamp(
      Math.atan2(dx, distance),
      -neckLimits.yaw,
      neckLimits.yaw,
    ),
    pitch: MathUtils.clamp(
      Math.atan2(dy, distance),
      -neckLimits.pitch,
      neckLimits.pitch,
    ),
  };
}

export function smoothGaze(
  current: GazeAngles,
  target: GazeAngles,
  elapsed: number,
): GazeAngles {
  const weight = 1 - Math.exp(-10 * Math.max(0, Math.min(elapsed, 0.1)));
  return {
    yaw: MathUtils.lerp(current.yaw, target.yaw, weight),
    pitch: MathUtils.lerp(current.pitch, target.pitch, weight),
  };
}

export function createGaze(head: Object3D, body: Object3D, joint: Object3D) {
  let angles: GazeAngles = { yaw: 0, pitch: 0 };
  let influence = 0;
  const worldHead = new Quaternion();
  const worldBody = new Quaternion();
  const worldJoint = new Quaternion();
  const parentInverse = new Quaternion();
  const desired = new Quaternion();
  const rotation = new Euler(0, 0, 0, 'ZYX');
  const front = new Vector3();
  return {
    update(
      target: GazeAngles,
      elapsed: number,
      enabled: boolean,
      cameraYaw: number,
    ) {
      angles = smoothGaze(angles, target, elapsed);
      influence = MathUtils.damp(influence, enabled ? 1 : 0, 10, elapsed);
      if (influence < 0.001 || !joint.parent) return;
      body.getWorldQuaternion(worldBody);
      head.getWorldQuaternion(worldHead);
      joint.getWorldQuaternion(worldJoint);
      joint.parent.getWorldQuaternion(parentInverse).invert();
      front.set(0, -1, 0).applyQuaternion(worldBody);
      const bodyYaw = Math.atan2(front.x, -front.y);
      const relativeYaw = Math.atan2(
        Math.sin(cameraYaw + angles.yaw - bodyYaw),
        Math.cos(cameraYaw + angles.yaw - bodyYaw),
      );
      rotation.set(
        angles.pitch,
        0,
        MathUtils.clamp(relativeYaw, -neckLimits.yaw, neckLimits.yaw),
      );
      desired.copy(worldBody).multiply(new Quaternion().setFromEuler(rotation));
      desired
        .copy(worldHead.clone().slerp(desired, influence))
        .multiply(worldHead.invert())
        .multiply(worldJoint);
      joint.quaternion.copy(parentInverse.multiply(desired));
      joint.updateWorldMatrix(false, true);
    },
    get angles() {
      return { ...angles };
    },
  };
}

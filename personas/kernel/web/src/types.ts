import type { AnimationProject } from '@pets/three-runtime/project';
export const animationModes: Record<
  string,
  { label: string; description: string }
> = {
  idle: {
    label: 'Idle',
    description: 'A quiet breathing cycle, with an occasional blink.',
  },
  'running-right': {
    label: 'Move right',
    description: 'Alternating foot contact and opposing arm swing.',
  },
  'running-left': {
    label: 'Move left',
    description: 'The same articulated gait, turned toward the left.',
  },
  waving: {
    label: 'Wave',
    description: 'A raised forearm and a small wrist-led greeting.',
  },
  jumping: {
    label: 'Jump',
    description: 'Anticipation, lift, and a soft return to the ground.',
  },
  failed: {
    label: 'Failure',
    description: 'A subdued head dip and a tired display.',
  },
  waiting: {
    label: 'Waiting',
    description: 'Open hands and an expectant upward glance.',
  },
  running: {
    label: 'Active work',
    description:
      'Terminal output and digital rain. The wrist cable connects to the server.',
  },
  review: {
    label: 'Review',
    description:
      'A thoughtful scan, a hand beneath the chin, and a confirming nod.',
  },
  look: {
    label: 'Look around',
    description:
      'Measured glances through sixteen directions, with coordinated eyes.',
  },
};

export type AnimationMode = string;
export type VectorTuple = [number, number, number];
export type QuaternionTuple = [number, number, number, number];
export interface PartTransform {
  p: VectorTuple;
  q: QuaternionTuple;
}
export interface PoseSample {
  parts: Record<string, PartTransform>;
  cable: VectorTuple[];
}
export interface AnimationClip {
  duration: number;
  frames: number;
  screenRow: number;
  samples: PoseSample[];
}
export interface AnimationData {
  project: AnimationProject;
  version: string;
  voxelCount: number;
  ports: { wrist: VectorTuple; server: VectorTuple };
  states: Record<AnimationMode, AnimationClip>;
}

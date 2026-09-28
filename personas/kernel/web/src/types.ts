import type { AnimationProject } from '@pets/three-runtime/project';
export const animationModes: Record<
  string,
  { label: string; description: string }
> = {
  idle: {
    label: 'Idle',
    description: 'A quiet breathing cycle, with an occasional blink.',
  },
  move: {
    label: 'Move',
    description:
      'One articulated gait with independent heading and smooth turns.',
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
  flying: {
    label: 'Fly',
    description: 'Balanced hover with independent thruster effects.',
  },
  'climb-rope': {
    label: 'Rope',
    description: 'Close hand grips and a leg brace for rope climbing.',
  },
  'climb-ladder': {
    label: 'Ladder',
    description: 'Alternating rung contacts with coordinated opposite limbs.',
  },
  'climb-border': {
    label: 'Border',
    description: 'A two-handed edge grip and controlled pull-up.',
  },
  climbing: {
    label: 'Climb',
    description:
      'Alternating hand and foot holds with independent grip control.',
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
  ports: {
    wrist: VectorTuple;
    server: VectorTuple;
    node?: string;
    radius?: number;
  };
  states: Record<AnimationMode, AnimationClip>;
}

// Numeric screen source identities are stable across project schema versions.
export const screenSourceModes = [
  'idle',
  'move',
  'move',
  'waving',
  'jumping',
  'failed',
  'waiting',
  'running',
  'review',
  'look',
];

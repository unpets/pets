import type { Object3D, PerspectiveCamera } from 'three';

export const animationModes = {
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
    description: 'A hand near the chin and a deliberate inspection sweep.',
  },
  look: {
    label: 'Look around',
    description: 'A clockwise sweep through sixteen directions.',
  },
} as const;

export type AnimationMode = keyof typeof animationModes;
export type VectorTuple = [number, number, number];
export type QuaternionTuple = [number, number, number, number];
export type CameraView = 'home' | 'front' | 'side' | 'back';
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
  version: string;
  voxelCount: number;
  ports: { wrist: VectorTuple; server: VectorTuple };
  states: Record<AnimationMode, AnimationClip>;
}
export interface PlaybackState {
  mode: AnimationMode;
  phase: number;
  playing: boolean;
  speed: number;
  seconds: number;
}
export interface StudioController {
  setMode(mode: AnimationMode): void;
  setPlaying(playing: boolean): void;
  setSpeed(speed: number): void;
  seek(phase: number): void;
  setCamera(view: CameraView): void;
  setWireframe(visible: boolean): void;
  setJoints(visible: boolean): void;
  destroy(): void;
  readonly camera: PerspectiveCamera;
  readonly parts: Record<string, Object3D>;
  readonly state: AnimationMode;
  readonly serverVisible: boolean;
  readonly ready: boolean;
}

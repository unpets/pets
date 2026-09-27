import type { ScreenProject } from '@pets/kernel/screen-project';
import type { Object3D, PerspectiveCamera } from 'three';
import type { AnimationMode, CameraView } from '@pets/kernel/types';
export * from '@pets/kernel/types';

export interface PlaybackState {
  mode: AnimationMode;
  phase: number;
  playing: boolean;
  speed: number;
  seconds: number;
}
export interface StudioController {
  setScreenProject(project: ScreenProject): void;
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

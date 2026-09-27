import type { AnimationProject } from '@pets/three-runtime/project';
import type { ScreenProject } from '@pets/kernel/screen-project';
import type { Object3D, PerspectiveCamera } from 'three';
import type { AnimationMode } from '@pets/kernel/types';
export * from '@pets/kernel/types';

export type Workspace = 'scene' | 'screen' | 'animation';
export type CameraView = 'home' | 'front' | 'side' | 'left' | 'back' | 'top';
export interface ViewSettings {
  grid: boolean;
  wireframe: boolean;
  joints: boolean;
  orbit: boolean;
  lighting: number;
  fov: number;
}
export const defaultViewSettings = (): ViewSettings => ({
  grid: true,
  wireframe: false,
  joints: false,
  orbit: false,
  lighting: 1,
  fov: 32,
});

export interface PlaybackState {
  mode: AnimationMode;
  phase: number;
  playing: boolean;
  speed: number;
  seconds: number;
  duration: number;
  frames: number;
  looping: boolean;
}
export interface StudioController {
  setScreenProject(project: ScreenProject): void;
  setAnimationProject(project: AnimationProject): void;
  setMode(mode: AnimationMode): void;
  setPlaying(playing: boolean): void;
  setSpeed(speed: number): void;
  setLooping(looping: boolean): void;
  stepFrame(direction: number): void;
  seek(phase: number): void;
  setCamera(view: CameraView): void;
  setWireframe(visible: boolean): void;
  setJoints(visible: boolean): void;
  setViewSettings(settings: ViewSettings): void;
  destroy(): void;
  readonly camera: PerspectiveCamera;
  readonly parts: Record<string, Object3D>;
  readonly state: AnimationMode;
  readonly serverVisible: boolean;
  readonly ready: boolean;
}

import {
  compositionLoops,
  playbackDuration,
} from '@pets/three-runtime/project';
import { sharesMotionClock } from '@pets/three-runtime/project';
import type { StudioProject } from '../studio-project';
import { resolveComposition } from '@pets/three-runtime/project';
import type { AnimationProject } from '@pets/three-runtime/project';
import { loadAnimationProject } from '@pets/kernel/animation-project';
import {
  DirectionalLight,
  HemisphereLight,
  NoToneMapping,
  OrthographicCamera,
  Raycaster,
  Scene,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { createCharacter } from '@pets/kernel/character';
import type { AnimationMode } from '../types';
import { createGaze, cursorAngles } from '@pets/kernel/gaze';
import {
  loadScreenProject,
  type ScreenProject,
} from '@pets/kernel/screen-project';

export async function createPetScene(
  viewport: HTMLDivElement,
  project?: StudioProject,
) {
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 64;
  const character = await createCharacter(canvas, project?.assets);
  character.screen.setProject(project?.screen ?? loadScreenProject());
  character.setProject(project?.animations ?? loadAnimationProject());
  const renderer = new WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NoToneMapping;
  viewport.appendChild(renderer.domElement);
  const scene = new Scene();
  scene.add(
    character.model,
    character.cable.mesh,
    new HemisphereLight(0xd6edff, 0x384555, 2.2),
  );
  for (const [x, y, z, color, intensity] of [
    [-3, -5, 7, 0xedf6ff, 3.5],
    [4, -2, 4, 0xbcdcff, 1.7],
    [-2, 4, 6, 0xd9caff, 2.7],
  ]) {
    const light = new DirectionalLight(color, intensity);
    light.position.set(x, y, z);
    scene.add(light);
  }
  const camera = new OrthographicCamera(-1.8, 1.8, 2, -2, 0.05, 30);
  camera.up.set(0, 0, 1);
  camera.position.set(3.2, -9, 3.5);
  camera.lookAt(0.18, 0, 1.5);
  camera.updateMatrixWorld();
  const authoredHead = character.joints.head.quaternion.clone();
  const gaze = createGaze(
    character.parts.head,
    character.parts.body,
    character.joints.head,
  );
  const cameraYaw = Math.atan2(camera.position.x - 0.18, -camera.position.y);
  const ray = new Raycaster();
  const headScreen = new Vector3();
  let cursor = { x: 0, y: 0, valid: false };
  let mode: AnimationMode = project?.selection.composition ?? 'idle';
  let looping = compositionLoops(character.project, mode);
  let phase = 0;
  let headingOverride: number | undefined;
  let travelOverride: number | undefined;
  let walkSpeed: number | undefined;
  let animationSpeed = 1;
  let independentSeconds = 0;
  let playing = true;
  let tracking = true;
  let disposed = false;
  let frame = 0;
  let previous = performance.now();
  character.setMode(mode);
  const observer = new ResizeObserver(() => {
    const width = Math.max(1, viewport.clientWidth);
    const height = Math.max(1, viewport.clientHeight);
    renderer.setSize(width, height);
    camera.left = (-2 * width) / height;
    camera.right = (2 * width) / height;
    camera.updateProjectionMatrix();
  });
  observer.observe(viewport);
  function animate(now: number) {
    if (disposed) return;
    frame = requestAnimationFrame(animate);
    if (now - previous < 1000 / 30) return;
    const elapsed = Math.min(0.1, (now - previous) / 1000);
    previous = now;
    if (document.hidden) return;
    if (playing) {
      independentSeconds += elapsed;
      const next =
        phase +
        (elapsed * animationSpeed) / playbackDuration(character.project, mode);
      phase = looping ? next % 1 : Math.min(1, next);
    }
    character.joints.head.quaternion.copy(authoredHead);
    character.update(mode, playing ? elapsed : 0, phase, independentSeconds, {
      ...(headingOverride === undefined ? {} : { heading: headingOverride }),
      ...(travelOverride === undefined
        ? {}
        : { travelHeading: travelOverride }),
      ...(walkSpeed === undefined ? {} : { moveSpeed: walkSpeed }),
    });
    authoredHead.copy(character.joints.head.quaternion);
    character.parts.head.getWorldPosition(headScreen).project(camera);
    const x = ((headScreen.x + 1) * viewport.clientWidth) / 2;
    const y = ((1 - headScreen.y) * viewport.clientHeight) / 2;
    gaze.update(
      cursorAngles(cursor.x - x, cursor.y - y, viewport.clientHeight),
      elapsed,
      tracking && cursor.valid,
      cameraYaw,
    );
    const eyes = gaze.angles;
    character.screen.setGaze(
      tracking && cursor.valid ? eyes.yaw * 10 : 0,
      tracking && cursor.valid ? eyes.pitch * 12 : 0,
    );
    character.updateScreen();
    renderer.render(scene, camera);
  }
  frame = requestAnimationFrame(animate);
  return {
    get compositions() {
      return character.project.compositions;
    },
    setAnimationProject(project: AnimationProject) {
      character.setProject(project);
      if (!project.compositions[mode])
        mode = Object.keys(project.compositions)[0];
      character.setMode(mode);
      looping = compositionLoops(character.project, mode);
    },
    setScreenProject(project: ScreenProject) {
      character.screen.setProject(project);
    },
    get heading() {
      return (
        (character.heading.angle * 180) / Math.PI - (cameraYaw * 180) / Math.PI
      );
    },
    get travelHeading() {
      return (
        (character.locomotion.angle * 180) / Math.PI -
        (cameraYaw * 180) / Math.PI
      );
    },
    get walkSpeed() {
      return character.locomotion.speed;
    },
    setTravelHeading(value?: number) {
      if (value !== undefined && !Number.isFinite(value))
        throw new Error('Travel heading must be finite.');
      travelOverride = value;
    },
    setWalkSpeed(value: number) {
      if (!Number.isFinite(value) || value < 0)
        throw new Error('Walk speed must be nonnegative.');
      walkSpeed = value;
    },
    setAnimationSpeed(value: number) {
      if (!Number.isFinite(value) || value <= 0)
        throw new Error('Animation speed must be positive.');
      animationSpeed = value;
    },
    get targetHeading() {
      return (
        (headingOverride ??
          resolveComposition(character.project, mode).properties?.heading ??
          0) -
        (cameraYaw * 180) / Math.PI
      );
    },
    setHeading(value: number, space: 'world' | 'view' = 'world') {
      if (!Number.isFinite(value)) throw new Error('Heading must be finite.');
      headingOverride =
        value + (space === 'view' ? (cameraYaw * 180) / Math.PI : 0);
    },
    setMode(next: AnimationMode) {
      if (!character.project.compositions[next])
        next = Object.keys(character.project.compositions)[0];
      if (next === mode && next === 'move') return;
      const preservePhase = sharesMotionClock(character.project, mode, next);
      character.setMode(next);
      mode = next;
      looping = compositionLoops(character.project, mode);
      headingOverride = undefined;
      if (!preservePhase) phase = 0;
    },
    setPlaying(value: boolean) {
      playing = value;
    },
    setTracking(value: boolean) {
      tracking = value;
    },
    setCursor(x: number, y: number) {
      cursor = { x, y, valid: Number.isFinite(x) && Number.isFinite(y) };
    },
    hitTest(x: number, y: number) {
      ray.setFromCamera(
        new Vector2(
          (x / viewport.clientWidth) * 2 - 1,
          1 - (y / viewport.clientHeight) * 2,
        ),
        camera,
      );
      return ray.intersectObject(character.model, true).some(({ object }) => {
        for (let node: typeof object | null = object; node; node = node.parent)
          if (!node.visible) return false;
        return true;
      });
    },
    get ready() {
      return !disposed;
    },
    get state() {
      return mode;
    },
    get angles() {
      return gaze.angles;
    },
    parts: character.parts,
    destroy() {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      character.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

export type PetScene = Awaited<ReturnType<typeof createPetScene>>;

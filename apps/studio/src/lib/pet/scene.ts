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

export async function createPetScene(viewport: HTMLDivElement) {
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 64;
  const character = await createCharacter(canvas);
  character.screen.setProject(loadScreenProject());
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
  const cameraYaw = Math.atan2(camera.position.x, -camera.position.y);
  const ray = new Raycaster();
  const headScreen = new Vector3();
  let cursor = { x: 0, y: 0, valid: false };
  let mode: AnimationMode = 'idle';
  let phase = 0;
  let playing = true;
  let tracking = true;
  let disposed = false;
  let frame = 0;
  let previous = performance.now();
  character.motion.setMode(mode);
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
    if (playing)
      phase = (phase + elapsed / character.data.states[mode].duration) % 1;
    character.joints.head.quaternion.copy(authoredHead);
    character.update(mode, elapsed, phase);
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
    character.screen.update(character.data.states[mode].screenRow, phase);
    renderer.render(scene, camera);
  }
  frame = requestAnimationFrame(animate);
  return {
    setScreenProject(project: ScreenProject) {
      character.screen.setProject(project);
    },
    setMode(next: AnimationMode) {
      character.motion.setMode(next);
      mode = next;
      phase = 0;
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

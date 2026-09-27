import {
  DirectionalLight,
  GridHelper,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  NoToneMapping,
  PerspectiveCamera,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createCharacter } from './character';
import type {
  AnimationMode,
  CameraView,
  PlaybackState,
  StudioController,
  VectorTuple,
} from './types';

const jointNames = [
  'upper_arm.L',
  'forearm.L',
  'hand.L',
  'upper_arm.R',
  'forearm.R',
  'hand.R',
  'thigh.L',
  'shin.L',
  'foot.L',
  'thigh.R',
  'shin.R',
  'foot.R',
];
const cameraPositions: Record<CameraView, VectorTuple> = {
  home: [3.2, -7.5, 3.5],
  front: [0, -10, 1.5],
  side: [9, -0.1, 2.5],
  back: [0, 10, 2.8],
};

export async function createStudio(
  viewport: HTMLDivElement,
  displayCanvas: HTMLCanvasElement,
  onPlayback: (state: PlaybackState) => void,
  onDetails: (voxelCount: number) => void,
): Promise<StudioController> {
  const character = await createCharacter(displayCanvas);
  const { model, parts, data, display, motion, cable, screen } = character;
  const scene = new Scene();
  const renderer = new WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NoToneMapping;
  viewport.appendChild(renderer.domElement);
  const camera = new PerspectiveCamera(32, 1, 0.05, 100);
  camera.up.set(0, 0, 1);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.minDistance = 3;
  controls.maxDistance = 12;
  controls.maxPolarAngle = Math.PI * 0.95;

  scene.add(new HemisphereLight(0xd6edff, 0x384555, 2.2));
  const lights: [VectorTuple, number, number][] = [
    [[-3, -5, 7], 0xedf6ff, 3.5],
    [[4, -2, 4], 0xbcdcff, 1.7],
    [[-2, 4, 6], 0xd9caff, 2.7],
  ];
  for (const [position, color, power] of lights) {
    const light = new DirectionalLight(color, power);
    light.position.set(...position);
    scene.add(light);
  }
  const grid = new GridHelper(12, 48, 0x3a5667, 0x273e4d);
  grid.rotation.x = Math.PI / 2;
  grid.position.z = -0.026;
  grid.material.transparent = true;
  grid.material.opacity = 0.36;
  scene.add(grid, model);

  scene.add(cable.mesh);
  const markers = new Group();
  const markerGeometry = new SphereGeometry(0.055, 12, 8);
  const markerMaterial = new MeshBasicMaterial({
    color: 0xefd394,
    depthTest: false,
    transparent: true,
    opacity: 0.8,
  });
  jointNames.forEach(() =>
    markers.add(new Mesh(markerGeometry, markerMaterial)),
  );
  markers.visible = false;
  scene.add(markers);

  let mode: AnimationMode = 'running';
  let phase = 0;
  let playing = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  let speed = 1;
  let animationFrame = 0;
  let previousTime = performance.now();
  let destroyed = false;

  function setCamera(view: CameraView) {
    camera.position.set(...cameraPositions[view]);
    controls.target.set(0.1, 0, 1.43);
    controls.update();
  }
  function update(elapsed: number) {
    const clip = data.states[mode];
    character.update(mode, elapsed, phase);
    markers.children.forEach((marker, index) =>
      parts[jointNames[index]].getWorldPosition(marker.position),
    );
    onPlayback({ mode, phase, playing, speed, seconds: phase * clip.duration });
  }
  const observer = new ResizeObserver(() => {
    const { clientWidth: width, clientHeight: height } = viewport;
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  });
  observer.observe(viewport);
  setCamera('home');
  onDetails(data.voxelCount);

  function animate(now: number) {
    if (destroyed) return;
    const elapsed = Math.max(0, Math.min((now - previousTime) / 1000, 0.05));
    previousTime = now;
    if (playing)
      phase = (phase + (elapsed * speed) / data.states[mode].duration) % 1;
    update(elapsed);
    controls.update();
    renderer.render(scene, camera);
    animationFrame = requestAnimationFrame(animate);
  }
  animationFrame = requestAnimationFrame(animate);

  return {
    setMode(next) {
      motion.setMode(next);
      mode = next;
      phase = 0;
      update(0);
    },
    setPlaying(value) {
      playing = value;
      update(0);
    },
    setSpeed(value) {
      speed = value;
    },
    seek(value) {
      playing = false;
      phase = Math.max(0, Math.min(1, value));
      motion.cancelTransition();
      update(0);
    },
    setCamera,
    setScreenProject(project) {
      screen.setProject(project);
      update(0);
    },
    setWireframe(visible) {
      model.traverse((object) => {
        if (!(object instanceof Mesh) || object === display) return;
        for (const material of Array.isArray(object.material)
          ? object.material
          : [object.material]) {
          if ('wireframe' in material) material.wireframe = visible;
        }
      });
    },
    setJoints(visible) {
      markers.visible = visible;
    },
    destroy() {
      destroyed = true;
      cancelAnimationFrame(animationFrame);
      observer.disconnect();
      controls.dispose();
      character.dispose();
      markerGeometry.dispose();
      markerMaterial.dispose();
      grid.geometry.dispose();
      grid.material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
    camera,
    parts,
    get state() {
      return mode;
    },
    get serverVisible() {
      return parts.server.visible;
    },
    get ready() {
      return !destroyed;
    },
  };
}

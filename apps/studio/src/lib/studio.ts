import {
  defaultEnvironment,
  type Environment,
} from '@pets/three-runtime/environment';
import { createEnvironmentScene } from '@pets/three-runtime/environment-scene';
import {
  binding,
  type AnimationProject,
  playbackDuration,
} from '@pets/three-runtime/project';
import { sharesMotionClock } from '@pets/three-runtime/project';
import type { CharacterAssets } from '@pets/kernel/assets';
import { createTravelPreview } from './travel-preview';
import { createRootFraming } from './root-framing';
import {
  DirectionalLight,
  GridHelper,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  NoToneMapping,
  PerspectiveCamera,
  Plane,
  Raycaster,
  Vector2,
  Vector3,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createCharacter } from '@pets/kernel/character';
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
  left: [-9, -0.1, 2.5],
  back: [0, 10, 2.8],
  top: [0, -0.01, 11],
};

export async function createStudio(
  viewport: HTMLDivElement,
  displayCanvas: HTMLCanvasElement,
  onPlayback: (state: PlaybackState) => void,
  onDetails: (voxelCount: number) => void,
  assets?: CharacterAssets,
): Promise<StudioController> {
  const character = await createCharacter(displayCanvas, assets);
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

  const ambient = new HemisphereLight(0xd6edff, 0x384555, 2.2);
  scene.add(ambient);
  const lights: [VectorTuple, number, number][] = [
    [[-3, -5, 7], 0xedf6ff, 3.5],
    [[4, -2, 4], 0xbcdcff, 1.7],
    [[-2, 4, 6], 0xd9caff, 2.7],
  ];
  const studioLights = lights.map(([position, color, power]) => {
    const light = new DirectionalLight(color, power);
    light.position.set(...position);
    scene.add(light);
    return light;
  });
  const grid = new GridHelper(12, 48, 0x3a5667, 0x273e4d);
  grid.rotation.x = Math.PI / 2;
  grid.position.z = -0.026;
  grid.material.transparent = true;
  grid.material.opacity = 0.36;
  scene.add(grid);
  const placement = new Group();
  placement.matrixAutoUpdate = false;
  placement.add(model);
  scene.add(placement);
  let environment = createEnvironmentScene(defaultEnvironment());
  scene.add(environment.root);

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
  const targetMarker = new Mesh(markerGeometry, markerMaterial);
  targetMarker.visible = false;
  scene.add(targetMarker);
  const pointerRay = new Raycaster();
  const targetPlane = new Plane();
  const targetNormal = new Vector3();
  const targetPoint = new Vector3();
  function pointerMove(event: PointerEvent) {
    const bounds = renderer.domElement.getBoundingClientRect();
    pointerRay.setFromCamera(
      new Vector2(
        ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
        1 - ((event.clientY - bounds.top) / bounds.height) * 2,
      ),
      camera,
    );
    camera.getWorldDirection(targetNormal);
    parts.head.getWorldPosition(targetPoint);
    targetPoint.addScaledVector(targetNormal, -2);
    targetPlane.setFromNormalAndCoplanarPoint(targetNormal, targetPoint);
    if (pointerRay.ray.intersectPlane(targetPlane, targetPoint))
      character.setLookTarget(targetPoint.toArray());
  }
  const pointerLeave = () => character.setLookTarget();
  renderer.domElement.addEventListener('pointermove', pointerMove);
  renderer.domElement.addEventListener('pointerleave', pointerLeave);

  let mode: AnimationMode = 'running';
  let phase = 0;
  let independentSeconds = 0;
  let playing = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  let speed = 1;
  let looping = true;
  let animationFrame = 0;
  let previousTime = performance.now();
  const resetClock = () => (previousTime = performance.now());
  document.addEventListener('visibilitychange', resetClock);
  let destroyed = false;
  let suspended = false;
  let previewTravel = true;
  const travel = createTravelPreview(model, camera, controls.target, grid);
  const rootFraming = createRootFraming(
    model,
    parts.body,
    camera,
    controls.target,
  );

  let sourceProject = character.project;
  let preview: { component: string; clip: string } | undefined;
  const previewId = '__studio_clip_preview';
  const activeMode = () => (preview ? previewId : mode);
  function applyProject() {
    const clip = preview && sourceProject.clips[preview.clip];
    if (!clip) preview = undefined;
    const project: AnimationProject =
      preview && clip
        ? {
            ...sourceProject,
            compositions: {
              ...sourceProject.compositions,
              [previewId]: {
                label: clip.label,
                description: '',
                duration: clip.duration,
                bindings: { [preview.component]: binding(preview.clip) },
              },
            },
          }
        : sourceProject;
    character.setProject(project);
    if (!sourceProject.compositions[mode])
      mode = Object.keys(sourceProject.compositions)[0];
  }

  function setCamera(view: CameraView) {
    camera.position.set(...cameraPositions[view]);
    camera.position.add(model.position);
    controls.target.set(0.1, 0, 1.43);
    controls.target.add(model.position);
    camera.position.add(rootFraming.offset);
    controls.target.add(rootFraming.offset);
    controls.update();
  }
  function update(elapsed: number, immediate = false) {
    character.update(
      activeMode(),
      elapsed,
      phase,
      independentSeconds,
      {},
      immediate,
    );
    if (playing && previewTravel && elapsed > 0) {
      travel.advance(character.velocity, elapsed);
      if (cable.mesh.visible) cable.update();
    }
    placement.matrix.copy(
      environment.update(
        activeMode(),
        (id) => character.project.compositions[id]?.parent,
      ),
    );
    placement.updateMatrixWorld(true);
    rootFraming.update(previewTravel);
    targetMarker.visible = !!character.lookTarget;
    if (character.lookTarget) targetMarker.position.copy(character.lookTarget);
    markers.children.forEach((marker, index) =>
      parts[jointNames[index]].getWorldPosition(marker.position),
    );
    onPlayback({
      mode,
      phase: looping ? phase % 1 : phase,
      playing,
      speed,
      seconds:
        (looping ? phase % 1 : phase) *
        playbackDuration(character.project, activeMode()),
      duration: playbackDuration(character.project, activeMode()),
      frames: 121,
      looping,
    });
  }
  const observer = new ResizeObserver(() => {
    const { clientWidth: width, clientHeight: height } = viewport;
    if (!width || !height) return;
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  });
  observer.observe(viewport);
  setCamera('home');
  onDetails(data.voxelCount);

  function animate(now: number) {
    if (destroyed) return;
    const elapsed = Math.max(0, (now - previousTime) / 1000);
    previousTime = now;
    if (suspended || document.hidden) {
      animationFrame = requestAnimationFrame(animate);
      return;
    }
    if (playing) {
      independentSeconds += elapsed * speed;
      const next =
        phase +
        (elapsed * speed) / playbackDuration(character.project, activeMode());
      phase = looping ? next : Math.min(1, next);
      if (!looping && next >= 1) playing = false;
    }
    update(elapsed);
    controls.update();
    renderer.render(scene, camera);
    animationFrame = requestAnimationFrame(animate);
  }
  animationFrame = requestAnimationFrame(animate);

  function setWireframe(visible: boolean) {
    model.traverse((object) => {
      if (!(object instanceof Mesh) || object === display) return;
      for (const material of Array.isArray(object.material)
        ? object.material
        : [object.material]) {
        if ('wireframe' in material) material.wireframe = visible;
      }
    });
  }

  return {
    setEnvironment(document: Environment) {
      environment.dispose();
      environment = createEnvironmentScene(document);
      scene.add(environment.root);
      update(0, true);
    },
    setAnimationProject(project) {
      sourceProject = project;
      applyProject();
      update(0);
    },
    setLookTarget(position) {
      character.setLookTarget(position);
      update(0);
    },
    setClipPreview(component, clip) {
      if (preview?.component === component && preview?.clip === clip) return;
      preview = component && clip ? { component, clip } : undefined;
      applyProject();
      phase = 0;
      independentSeconds = 0;
      travel.reset();
      motion.cancelTransition();
      update(0, true);
    },
    setMode(next) {
      const preservePhase = sharesMotionClock(character.project, mode, next);
      if (!preview) character.setMode(next);
      mode = next;
      if (!preservePhase) {
        phase = 0;
        travel.reset();
      }
      update(0);
    },
    setSuspended(value) {
      suspended = value;
      resetClock();
    },
    setPlaying(value) {
      if (value && !looping && phase >= 1) phase = 0;
      playing = value;
      resetClock();
      update(0);
    },
    setSpeed(value) {
      speed = Math.max(0.1, Math.min(4, value));
      update(0);
    },
    setLooping(value) {
      looping = value;
      update(0);
    },
    stepFrame(direction) {
      playing = false;
      const intervals = 120;
      phase =
        Math.max(
          0,
          Math.min(
            intervals,
            Math.round((looping ? phase % 1 : phase) * intervals) + direction,
          ),
        ) / intervals;
      independentSeconds =
        phase * playbackDuration(character.project, activeMode());
      motion.cancelTransition();
      update(0, true);
    },
    seek(value) {
      travel.reset();
      playing = false;
      phase = Math.max(0, Math.min(1, value));
      independentSeconds =
        phase * playbackDuration(character.project, activeMode());
      motion.cancelTransition();
      update(0, true);
    },
    setCamera,
    setScreenProject(project) {
      screen.setProject(project);
      update(0);
    },
    setScreenPreview(id, project, bindings) {
      character.setScreenPreview(id, project, bindings);
      update(0);
    },
    setWireframe,
    setJoints(visible) {
      markers.visible = visible;
    },
    setViewSettings(settings) {
      previewTravel = settings.travel;
      if (!previewTravel) travel.reset();
      setWireframe(settings.wireframe);
      markers.visible = settings.joints;
      grid.visible = settings.grid;
      controls.autoRotate = settings.orbit;
      ambient.intensity = 2.2 * settings.lighting;
      studioLights.forEach((light, index) => {
        light.intensity = lights[index][2] * settings.lighting;
      });
      camera.fov = settings.fov;
      camera.updateProjectionMatrix();
    },
    destroy() {
      environment.dispose();
      destroyed = true;
      cancelAnimationFrame(animationFrame);
      document.removeEventListener('visibilitychange', resetClock);
      observer.disconnect();
      renderer.domElement.removeEventListener('pointermove', pointerMove);
      renderer.domElement.removeEventListener('pointerleave', pointerLeave);
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
    get travelDistance() {
      return travel.distance;
    },
  };
}

import { playbackDuration } from '@pets/three-runtime/project';
import {
  Box3,
  DirectionalLight,
  HemisphereLight,
  NoToneMapping,
  OrthographicCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  type Object3D,
} from 'three';
import { createCharacter } from '@pets/kernel/character';
import {
  resolveComposition,
  compositionInstance,
  type ExportBinding,
} from '@pets/three-runtime/project';
import type { StudioProject } from './studio-project';
import { coreRequest } from './core';
import { version } from '../../package.json';

interface ExportPlan {
  persona: {
    id: string;
    name: string;
    version: string;
    cell: [number, number];
    animations: Record<string, { frames: number; frameDurationMs: number }>;
  };
  compositions: Record<string, ExportBinding>;
}
export async function renderExport(
  project: StudioProject,
  target: 'codex' | 'shimeji',
  progress: (message: string) => void,
  signal: AbortSignal,
) {
  const plan = await coreRequest<ExportPlan>({
    operation: 'plan',
    project: project.animations,
    target,
    ...project.persona,
    version,
  });
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 64;
  const character = await createCharacter(canvas, project.assets);
  const renderer = new WebGLRenderer({
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
  });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NoToneMapping;
  renderer.setSize(384, 416);
  renderer.setClearColor(0, 0);
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
  character.setProject(project.animations);
  character.screen.setProject(project.screen);
  const camera = new OrthographicCamera(-2, 2, 2, -2, 0.05, 50);
  camera.up.set(0, 0, 1);
  camera.position.set(2.26, -10, 5.27);
  camera.lookAt(0.06, 0, 1.47);
  camera.updateMatrixWorld();
  const samples = Object.entries(plan.persona.animations).flatMap(
    ([intent, clip]) =>
      Array.from({ length: clip.frames }, (_, index) => ({
        intent,
        index,
        composition: plan.compositions[intent],
        phase: index / (intent === 'jumping' ? clip.frames - 1 : clip.frames),
      })),
  );
  const min = new Vector3(Infinity, Infinity, Infinity),
    max = new Vector3(-Infinity, -Infinity, -Infinity);
  const vector = new Vector3();
  const box = new Box3();
  function pose(source: ExportBinding, phase: number) {
    const {
      composition,
      properties: authored,
      headingSpace,
    } = compositionInstance(source);
    const properties = { ...authored };
    if (headingSpace === 'view') {
      const azimuth =
        (Math.atan2(camera.position.x - 0.06, -camera.position.y) * 180) /
        Math.PI;
      if (properties.heading !== undefined) properties.heading += azimuth;
      if (properties.travelHeading !== undefined)
        properties.travelHeading += azimuth;
    }
    character.setMode(composition);
    character.motion.cancelTransition();
    character.update(
      composition,
      0,
      phase,
      phase * playbackDuration(project.animations, composition, properties),
      properties,
      true,
    );
    scene.updateMatrixWorld(true);
  }
  function addBounds(object: Object3D) {
    if (!object.visible) return;
    const bounds = box.setFromObject(object);
    if (bounds.isEmpty()) return;
    for (let i = 0; i < 8; i++) {
      vector
        .set(
          i & 1 ? bounds.max.x : bounds.min.x,
          i & 2 ? bounds.max.y : bounds.min.y,
          i & 4 ? bounds.max.z : bounds.min.z,
        )
        .applyMatrix4(camera.matrixWorldInverse);
      min.min(vector);
      max.max(vector);
    }
  }
  const yieldFrame = () =>
    new Promise<void>((resolve) => setTimeout(resolve, 0));
  try {
    for (const [index, sample] of samples.entries()) {
      signal.throwIfAborted();
      pose(sample.composition, sample.phase);
      for (const part of Object.values(character.parts)) addBounds(part);
      addBounds(character.cable.mesh);
      if (index % 8 === 0) {
        progress(`Framing ${index + 1}/${samples.length}`);
        await yieldFrame();
      }
    }
    const cx = (min.x + max.x) / 2,
      cy = (min.y + max.y) / 2;
    const height =
      Math.max(max.y - min.y, ((max.x - min.x) * 208) / 192) * 1.16;
    const width = (height * 192) / 208;
    camera.left = cx - width / 2;
    camera.right = cx + width / 2;
    camera.top = cy + height / 2;
    camera.bottom = cy - height / 2;
    camera.updateProjectionMatrix();
    const output = document.createElement('canvas');
    output.width = 192;
    output.height = 208;
    const context = output.getContext('2d')!;
    const files: Record<string, number[]> = {};
    for (const [index, sample] of samples.entries()) {
      signal.throwIfAborted();
      pose(sample.composition, sample.phase);
      renderer.render(scene, camera);
      context.clearRect(0, 0, 192, 208);
      context.drawImage(renderer.domElement, 0, 0, 192, 208);
      const blob = await new Promise<Blob>((resolve, reject) =>
        output.toBlob(
          (blob) =>
            blob ? resolve(blob) : reject(new Error('PNG encoding failed.')),
          'image/png',
        ),
      );
      files[
        `frames/${sample.intent}/${String(sample.index).padStart(2, '0')}.png`
      ] = Array.from(new Uint8Array(await blob.arrayBuffer()));
      progress(`Rendering ${index + 1}/${samples.length}`);
      await yieldFrame();
    }
    signal.throwIfAborted();
    progress('Packaging with Rust core');
    await yieldFrame();
    const result = await coreRequest<{
      files: Record<string, number[]>;
      report: unknown;
    }>({
      operation: 'export',
      request: {
        operation: 'export',
        target,
        persona: plan.persona,
        frames: 'frames',
        output:
          target === 'codex' ? 'output/spritesheet.png' : 'output/package',
      },
      files,
    });
    return Object.fromEntries(
      Object.entries(result.files).map(([path, bytes]) => [
        path,
        new Uint8Array(bytes),
      ]),
    );
  } finally {
    character.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
}

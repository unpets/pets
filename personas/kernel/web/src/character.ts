import { createEffects } from '@pets/three-runtime/effects';
import {
  createLocomotion,
  type DirectionSample,
} from '@pets/three-runtime/locomotion';
import { playbackDuration } from '@pets/three-runtime/project';
import { createHeading } from '@pets/three-runtime/heading';
import {
  headingRadians,
  type CompositionProperties,
} from '@pets/three-runtime/project';
import { resolveComposition } from '@pets/three-runtime/project';
import {
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Vector3,
  AnimationClip,
  QuaternionKeyframeTrack,
  Quaternion,
  Euler,
  type Material,
} from 'three';
import { loadAssets, type CharacterAssets } from './assets';
import { createMotion } from '@pets/three-runtime/motion';
import { createCable } from './cable';
import { createEmission } from './emission';
import { createScreen } from './screen';
import { parseScreenProject, type ScreenProject } from './screen-project';
import type { AnimationMode } from './types';
import {
  sampleComposition,
  type AnimationProject,
} from '@pets/three-runtime/project';
import { parseKernelProject } from './animation-project';

export async function createCharacter(
  canvas: HTMLCanvasElement,
  assets?: CharacterAssets,
) {
  const { model, clips, data, screenImages } = await loadAssets(assets);
  const parts: Record<string, Object3D> = {};
  const joints: Record<string, Object3D> = {};
  let display: Mesh | undefined;
  model.traverse((object) => {
    if (object.userData.rig_part) parts[object.userData.rig_part] = object;
    if (object.userData.joint) joints[object.userData.joint] = object;
    if (object.userData.is_display && object instanceof Mesh) display = object;
  });
  if (!display || !parts.head || !parts.body || !joints.head || !parts.server)
    throw new Error('Required character nodes are missing.');
  const screen = createScreen(canvas, screenImages);
  for (const material of Array.isArray(display.material)
    ? display.material
    : [display.material])
    material.dispose();
  display.material = new MeshBasicMaterial({
    map: screen.texture,
    toneMapped: false,
  });
  const effects = createEffects(parts);
  const motion = createMotion(model, clips, 'running');
  const updateEmission = createEmission(model, data.project);
  let project = data.project;
  let selected = '';
  let layerSignature = '';
  let locomoting = false;
  const locomotion = createLocomotion();
  let velocity = { x: 0, y: 0, z: 0 };
  const heading = createHeading(model.rotation.z);
  let samples: ReturnType<typeof sampleComposition> = {};
  let screenSeconds = 0;
  let previewScreen: string | undefined;
  let previewSettings: ScreenProject | undefined;
  let activeSettings: unknown;
  let previewBindings:
    Record<string, import('@pets/three-runtime/project').Binding> | undefined;
  function select(mode: string) {
    const composition = resolveComposition(project, mode);
    if (!composition) throw new Error(`Unknown composition: ${mode}`);
    const layers = Object.entries(composition.bindings)
      .filter(([id, b]) => b.enabled && project.components[id].kind === 'rig')
      .map(([id, b]) => {
        const component = project.components[id];
        const clip = project.clips[b.clip];
        const nodes = (component.data.nodes as string[]).map(
          (node) => joints[node].name,
        );
        let source = clip.data.source as string;
        if (clip.data.keyframes) {
          source = `${b.clip}:${JSON.stringify(clip.data.keyframes)}`;
          const frames = clip.data.keyframes as {
            time: number;
            rotation: [number, number, number];
          }[];
          motion.addClip(
            new AnimationClip(
              source,
              clip.duration,
              nodes.map(
                (node) =>
                  new QuaternionKeyframeTrack(
                    `${node}.quaternion`,
                    frames.map((f) => f.time),
                    frames.flatMap((f) =>
                      new Quaternion()
                        .setFromEuler(
                          new Euler(
                            ...(f.rotation.map((v) => (v * Math.PI) / 180) as [
                              number,
                              number,
                              number,
                            ]),
                          ),
                        )
                        .toArray(),
                    ),
                  ),
              ),
            ),
          );
        }
        return {
          id,
          source,
          nodes,
          blendSpace: clip.data.blendSpace as DirectionSample[] | undefined,
        };
      });
    locomoting = layers.some(
      (layer) =>
        layer.blendSpace &&
        project.components[layer.id].data.layer === 'posture',
    );
    const signature = JSON.stringify(layers);
    if (signature !== layerSignature) {
      motion.setLayers(layers);
      layerSignature = signature;
    }
    selected = mode;
  }
  const cable = createCable(
    parts[data.ports.node ?? 'hand.R'],
    new Vector3(...data.ports.wrist),
    new Vector3(...data.ports.server),
    model,
    data.ports.radius ?? 0.025,
  );
  return {
    model,
    parts,
    joints,
    data,
    display,
    motion,
    heading,
    locomotion,
    get velocity() {
      return velocity;
    },
    cable,
    screen,
    get project() {
      return project;
    },
    setProject(value: AnimationProject) {
      project = parseKernelProject(value);
      selected = '';
      screen.invalidate();
    },
    setMode(mode: string) {
      select(mode);
    },
    setScreenPreview(
      id?: string,
      settings?: ScreenProject,
      bindings?: typeof previewBindings,
    ) {
      previewScreen = id;
      previewBindings = bindings;
      previewSettings = settings;
      activeSettings = undefined;
      screen.invalidate();
    },
    updateScreen() {
      screen.update(project, samples, screenSeconds);
    },
    update(
      mode: AnimationMode,
      elapsed: number,
      phase: number,
      independentSeconds = phase * playbackDuration(project, mode),
      overrides: CompositionProperties = {},
      immediate = false,
    ) {
      if (selected !== mode) select(mode);
      const properties = {
        ...resolveComposition(project, mode).properties,
        ...overrides,
      };
      const targetHeading = headingRadians(properties);
      model.rotation.z = immediate
        ? heading.snap(targetHeading)
        : heading.update(targetHeading, elapsed, properties.turnSpeed);

      velocity = locomotion.update(
        heading.angle,
        properties.travelHeading,
        locomoting ? (properties.moveSpeed ?? 0.7) : 0,
        elapsed,
        properties.turnSpeed,
        immediate,
      );
      screenSeconds = independentSeconds;
      samples = sampleComposition(
        project,
        mode,
        phase * playbackDuration(project, mode),
        independentSeconds,
        previewScreen,
        previewBindings,
      );
      const screenId =
        previewScreen ?? resolveComposition(project, mode).screen;
      const settings =
        previewSettings ??
        (screenId ? project.screens?.[screenId]?.data : undefined);
      if (settings && settings !== activeSettings) {
        screen.setProject(parseScreenProject(settings));
        activeSettings = settings;
      }
      motion.update(
        elapsed,
        Object.fromEntries(
          Object.entries(samples).map(([id, sample]) => [id, sample.phase]),
        ),
        ((locomotion.angle - heading.angle) * 180) / Math.PI,
      );
      for (const component of Object.values(data.project.components)) {
        if (component.kind === 'visibility' && component.data.node !== 'cable')
          parts[component.data.node as string].visible = false;
      }
      cable.mesh.visible = false;
      for (const [id, sample] of Object.entries(samples)) {
        const component = project.components[id];
        if (component.kind !== 'visibility') continue;
        const target =
          component.data.node === 'cable'
            ? cable.mesh
            : parts[component.data.node as string];
        target.visible = project.clips[sample.clip].data.visible as boolean;
      }
      model.updateMatrixWorld(true);
      if (cable.mesh.visible) cable.update();
      updateEmission(project, samples);
      effects.update(project, samples);
      screen.update(project, samples, screenSeconds);
    },
    dispose() {
      effects.dispose();
      motion.dispose();
      cable.dispose();
      screen.dispose();
      const materials = new Set<Material>();
      model.traverse((object) => {
        if (!(object instanceof Mesh)) return;
        object.geometry.dispose();
        (Array.isArray(object.material)
          ? object.material
          : [object.material]
        ).forEach((material) => materials.add(material));
      });
      materials.forEach((material) => material.dispose());
    },
  };
}

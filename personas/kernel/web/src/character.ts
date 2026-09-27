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
import { loadAssets } from './assets';
import { createMotion } from '@pets/three-runtime/motion';
import { createCable } from './cable';
import { createEmission } from './emission';
import { createScreen } from './screen';
import type { AnimationMode } from './types';
import {
  sampleComposition,
  type AnimationProject,
} from '@pets/three-runtime/project';
import { parseKernelProject } from './animation-project';

export async function createCharacter(canvas: HTMLCanvasElement) {
  const { model, clips, data, screenImages } = await loadAssets();
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
  const motion = createMotion(model, clips, 'running');
  const updateEmission = createEmission(model, data.project);
  let project = data.project;
  let selected = '';
  let samples: ReturnType<typeof sampleComposition> = {};
  let screenSeconds = 0;
  function select(mode: string) {
    const composition = project.compositions[mode];
    if (!composition) throw new Error(`Unknown composition: ${mode}`);
    motion.setLayers(
      Object.entries(composition.bindings)
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
                              ...(f.rotation.map(
                                (v) => (v * Math.PI) / 180,
                              ) as [number, number, number]),
                            ),
                          )
                          .toArray(),
                      ),
                    ),
                ),
              ),
            );
          }
          return { id, source, nodes };
        }),
    );
    selected = mode;
  }
  const cable = createCable(
    parts['hand.R'],
    new Vector3(...data.ports.wrist),
    new Vector3(...data.ports.server),
  );
  return {
    model,
    parts,
    joints,
    data,
    display,
    motion,
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
    updateScreen() {
      screen.update(project, samples, screenSeconds);
    },
    update(
      mode: AnimationMode,
      elapsed: number,
      phase: number,
      independentSeconds = phase * project.compositions[mode].duration,
    ) {
      if (selected !== mode) select(mode);
      screenSeconds = independentSeconds;
      samples = sampleComposition(
        project,
        mode,
        phase * project.compositions[mode].duration,
        independentSeconds,
      );
      motion.update(
        elapsed,
        Object.fromEntries(
          Object.entries(samples).map(([id, sample]) => [id, sample.phase]),
        ),
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
      if (cable.mesh.visible) cable.update();
      updateEmission(project, samples);
      screen.update(project, samples, screenSeconds);
    },
    dispose() {
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

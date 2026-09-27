import {
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Vector3,
  type Material,
} from 'three';
import { loadAssets } from './assets';
import { createMotion } from '@pets/three-runtime/motion';
import { createCable } from './cable';
import { createScreen } from './screen';
import type { AnimationMode } from './types';

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
    update(mode: AnimationMode, elapsed: number, phase: number) {
      motion.update(elapsed, phase);
      parts.server.visible = mode === 'running';
      cable.mesh.visible = mode === 'running';
      if (cable.mesh.visible) cable.update();
      screen.update(data.states[mode].screenRow, phase);
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

import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { Group, Mesh, MeshStandardMaterial, BoxGeometry } from 'three';
import { bindMotionLayer, motionLayers } from '@pets/three-runtime/layers';
import {
  parseAnimationProject,
  sampleComposition,
} from '@pets/three-runtime/project';
import {
  createEmission,
  sampleEmission,
} from '../../../personas/kernel/web/src/emission';

const project = parseAnimationProject(
  JSON.parse(
    readFileSync('personas/kernel/generated/assets/animations.json', 'utf8'),
  ).project,
);

test('posture, either arm and head are disjoint masks that can be reused together', () => {
  const layers = motionLayers(project);
  const all = layers.flatMap((layer) => layer.components);
  expect(new Set(all).size).toBe(all.length);
  expect(all.length).toBe(44);
  let mixed = project;
  for (const [layer, source] of [
    ['posture', 'running-left'],
    ['arm.R', 'waving'],
    ['head', 'look'],
  ]) {
    const components = layers.find((item) => item.id === layer)!.components;
    mixed = bindMotionLayer(
      mixed,
      'idle',
      components,
      { clock: 'independent', speed: 0.8 },
      source,
    );
  }
  const bindings = mixed.compositions.idle.bindings;
  expect(bindings['rig/upper_arm.R'].clip).toBe('rig/upper_arm.R/waving');
  expect(bindings['rig/upper_arm.L']).toEqual(
    project.compositions.idle.bindings['rig/upper_arm.L'],
  );
  expect(bindings['rig/head'].clip).toBe('rig/head/look');
  expect(bindings['screen/eyes']).toEqual(
    project.compositions.idle.bindings['screen/eyes'],
  );
  expect(project.compositions.idle.bindings['rig/head'].clip).toBe(
    'rig/head/idle',
  );
  expect(
    sampleComposition(mixed, 'idle', 0, 0.3)['rig/head'].phase,
  ).toBeCloseTo((0.3 * 0.8) / mixed.clips['rig/head/look'].duration);
});

test('key material clips light the pressed key and clear when disabled or hidden', () => {
  const model = new Group();
  const materials = ['key.R.index.1', 'key.L.index.1'].map((name) => {
    const material = new MeshStandardMaterial();
    material.name = name;
    model.add(new Mesh(new BoxGeometry(), material));
    return material;
  });
  const update = createEmission(model, project);
  const duration = project.compositions.running.duration;
  update(project, sampleComposition(project, 'running', duration * 0.105, 0));
  expect(materials[0].emissiveIntensity).toBeCloseTo(4);
  expect(materials[1].emissiveIntensity).toBeLessThan(4);
  update(project, sampleComposition(project, 'idle', 0, 0));
  expect(materials.map((m) => m.emissiveIntensity)).toEqual([0, 0]);
  update(project, {});
  expect(materials.map((m) => m.emissiveIntensity)).toEqual([0, 0]);
  expect(
    sampleEmission(
      [
        [0, 0],
        [0.5, 4],
        [1, 0],
      ],
      0.25,
    ),
  ).toBe(2);
  expect(
    sampleEmission(
      [
        [0, 0],
        [0.5, 4],
        [1, 0],
      ],
      2,
    ),
  ).toBe(0);
  model.children.forEach((child) => (child as Mesh).geometry.dispose());
  materials.forEach((material) => material.dispose());
});

import { expect, test } from 'bun:test';
import { Group, Quaternion } from 'three';
import {
  binding,
  parseAnimationProject,
  resolveComposition,
  sampleComposition,
  type AnimationProject,
} from '@pets/three-runtime/project';
import { identityFrame, identityTransform } from '@pets/three-runtime/face';
import {
  createMeshLayers,
  sampleMeshFrame,
} from '@pets/three-runtime/face-scene';
import { exportAsset, importAsset } from '@pets/three-runtime/assets';

function project(): AnimationProject {
  return parseAnimationProject({
    format: 'pets-animation',
    version: 3,
    components: {
      eye: {
        label: 'Mesh eye',
        kind: 'face-mesh',
        data: { geometry: { type: 'sphere' }, color: '#55e9eb' },
      },
    },
    clips: {
      blink: {
        label: 'Blink',
        component: 'eye',
        duration: 1,
        looping: true,
        data: { keyframes: [identityFrame(0), identityFrame(1)] },
      },
    },
    screens: {
      mixed: {
        label: 'Mixed',
        data: {},
        surface: {
          canvas: false,
          placements: {
            eye: { ...identityTransform(), position: [0.2, 0, 0.1] },
          },
        },
        bindings: { eye: binding('blink') },
      },
      empty: { label: 'Empty', data: {}, bindings: {} },
    },
    compositions: {
      idle: { label: 'Idle', duration: 1, screen: 'mixed', bindings: {} },
      child: { label: 'Child', parent: 'idle', screen: 'empty', bindings: {} },
    },
    exports: {},
  });
}
test('face assignment replaces inherited mesh bindings and preserves portable placements', () => {
  const value = project();
  expect(resolveComposition(value, 'child').bindings).toEqual({});
  const bundle = exportAsset(value, 'screen', 'mixed');
  const imported = importAsset(value, bundle);
  expect(imported.project.screens![imported.selection.id].surface).toEqual(
    value.screens!.mixed.surface,
  );
  const invalid = structuredClone(value);
  invalid.screens!.mixed.surface!.placements.eye.scale[0] = 0;
  expect(() => parseAnimationProject(invalid)).toThrow();
});
test('mesh frame rotation uses the shortest arc', () => {
  const a = {
    ...identityFrame(0),
    rotation: [0, 0, 170] as [number, number, number],
  };
  const b = {
    ...identityFrame(1),
    rotation: [0, 0, -170] as [number, number, number],
  };
  expect(
    sampleMeshFrame([a, b], 0.5).quaternion.angleTo(new Quaternion(0, 0, 1, 0)),
  ).toBeLessThan(1e-7);
});
test('replacement layers follow rig anchors and restore ordinary part visibility', () => {
  const value = project();
  value.components.grip = {
    label: 'Grip',
    kind: 'attachment',
    data: {
      node: 'hand',
      hides: ['hand'],
      geometry: { type: 'box' },
      color: '#718394',
    },
  };
  value.clips.grip = {
    label: 'Grip',
    component: 'grip',
    duration: 1,
    looping: true,
    data: { keyframes: [identityFrame(0)] },
  };
  value.compositions.idle.bindings.grip = binding('grip');
  const anchor = new Group(),
    hand = new Group(),
    bone = new Group();
  const layers = createMeshLayers(
    anchor,
    'attachment',
    { hand },
    { hand: bone },
  );
  layers.update(value, sampleComposition(value, 'idle', 0, 0));
  expect(hand.visible).toBe(false);
  expect(bone.children[0].visible).toBe(true);
  layers.update(value, {});
  expect(hand.visible).toBe(true);
  expect(bone.children[0].visible).toBe(false);
  layers.dispose();
  expect(bone.children).toHaveLength(0);
});
test('portable mesh indices and keyframe bounds are validated', () => {
  const value = project();
  value.components.eye.data.geometry = {
    type: 'mesh',
    positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
    indices: [0, 1, 4],
  };
  expect(() => parseAnimationProject(value)).toThrow();
  value.components.eye.data.geometry = { type: 'sphere' };
  (
    value.clips.blink.data.keyframes as ReturnType<typeof identityFrame>[]
  )[1].time = 2;
  expect(() => parseAnimationProject(value)).toThrow();
});

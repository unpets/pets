import { test, expect } from 'bun:test';
import {
  defaultEnvironment,
  parseEnvironment,
  importEnvironmentAssets,
} from '@pets/three-runtime/environment';
import { createEnvironmentScene } from '@pets/three-runtime/environment-scene';
import { Vector3 } from 'three';

test('environment instances share assets and place characters through rigid contact frames', () => {
  const document = defaultEnvironment();
  document.objects.rope.position = [3, 2, 1];
  document.objects.rope.rotation = [0, 0, 90];
  document.objects.rope.scale = [2, 2, 2];
  const scene = createEnvironmentScene(document);
  const placement = scene.update('climb-rope');
  const point = new Vector3(
    ...document.bindings['climb-rope'].origin,
  ).applyMatrix4(placement);
  expect(point.distanceTo(new Vector3(3, 2, 1))).toBeLessThan(1e-8);
  expect(new Vector3(1, 0, 0).transformDirection(placement).y).toBeCloseTo(1);
  expect(placement.determinant()).toBeCloseTo(1);
  expect(scene.root.children.filter((child) => child.visible).length).toBe(1);
  scene.update('custom', (id) =>
    id === 'custom' ? 'climb-ladder' : undefined,
  );
  expect(
    scene.root.children.find((child) => child.name === 'Ladder')?.visible,
  ).toBe(true);
  scene.dispose();
});

test('environment imports reject invalid geometry and dangling asset references', () => {
  const document = defaultEnvironment();
  delete document.assets.rope;
  expect(() => parseEnvironment(document)).toThrow(
    'Invalid environment object',
  );
  const invalid = defaultEnvironment();
  invalid.assets.rope.parts[0].size[0] = -1;
  expect(() => parseEnvironment(invalid)).toThrow(
    'Invalid environment geometry',
  );
});

test('standalone asset imports preserve scene objects and isolate conflicting assets', () => {
  const scene = defaultEnvironment();
  const source = defaultEnvironment();
  source.assets.rope.parts[0].color = '#ff0000';
  source.assets = { rope: source.assets.rope };
  source.objects = {};
  source.bindings = {};
  const result = importEnvironmentAssets(scene, source);
  expect(result.objects.rope).toEqual(scene.objects.rope);
  expect(result.bindings).toEqual(scene.bindings);
  expect(result.assets['rope-copy'].parts[0].color).toBe('#ff0000');
  expect(result.objects['rope-copy'].asset).toBe('rope-copy');
});

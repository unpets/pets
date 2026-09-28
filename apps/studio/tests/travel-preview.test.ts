import { expect, test } from 'bun:test';
import { Object3D, Vector3 } from 'three';
import { createTravelPreview } from '../src/lib/travel-preview';

test('travel uses metres per second and preserves the inspection camera framing', () => {
  const model = new Object3D();
  const camera = new Object3D();
  camera.position.set(3, -7, 4);
  const target = new Vector3(0, 0, 1.5);
  const grid = new Object3D();
  const travel = createTravelPreview(model, camera, target, grid);
  for (let i = 0; i < 60; i++) travel.advance({ x: 1.4, y: 0, z: 0 }, 1 / 60);
  expect(model.position.x).toBeCloseTo(1.4);
  expect(travel.distance).toBeCloseTo(1.4);
  expect(camera.position.x - model.position.x).toBeCloseTo(3);
  expect(target.x).toBeCloseTo(model.position.x);
  expect(Math.abs(grid.position.x - model.position.x)).toBeLessThanOrEqual(
    0.125,
  );
  travel.reset();
  expect(model.position.toArray()).toEqual([0, 0, 0]);
  expect(camera.position.x).toBeCloseTo(3);
  expect(camera.position.y).toBeCloseTo(-7);
  expect(camera.position.z).toBeCloseTo(4);
  expect(target.toArray()).toEqual([0, 0, 1.5]);
  expect(travel.distance).toBe(0);
});

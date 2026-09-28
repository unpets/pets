import { test, expect } from 'bun:test';
import { Object3D, Vector3 } from 'three';
import { createRootFraming } from '../src/lib/root-framing';

test('camera follows a mantle without double counting travel or following idle bobbing', () => {
  const model = new Object3D(),
    root = new Object3D(),
    camera = new Object3D();
  model.add(root);
  root.position.z = 0.13;
  const target = new Vector3(0, 0, 1.5);
  camera.position.set(3, -8, 3.5);
  const framing = createRootFraming(model, root, camera, target);
  root.position.z += 0.02;
  framing.update();
  expect(camera.position.z).toBe(3.5);
  root.position.z = 0.13 + 1.72;
  framing.update();
  expect(camera.position.z).toBeCloseTo(4.97, 8);
  expect(target.z).toBeCloseTo(2.97, 8);
  model.position.set(2, 3, 0);
  framing.update();
  expect(camera.position.x).toBe(3);
  expect(camera.position.y).toBe(-8);
  expect(camera.position.z).toBeCloseTo(4.97, 8);
  framing.update(false);
  expect(camera.position.x).toBe(3);
  expect(camera.position.y).toBe(-8);
  expect(camera.position.z).toBeCloseTo(3.5, 8);
  expect(target.z).toBeCloseTo(1.5, 8);
  framing.update();
  root.position.z = 0.13;
  framing.update();
  expect(framing.offset.length()).toBe(0);
  expect(camera.position.z).toBeCloseTo(3.5, 8);
});

import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
const root = 'personas/kernel/generated/assets/';
const data = JSON.parse(readFileSync(root + 'animations.json', 'utf8'));
test('every animation has complete finite rigid transforms and cable anchors', () => {
  expect(Object.keys(data.states).length).toBe(10);
  for (const state of Object.values(data.states)) {
    expect(state.samples.length).toBe(121);
    for (const sample of state.samples) {
      expect(Object.keys(sample.parts).length).toBe(44);
      for (const transform of Object.values(sample.parts)) {
        expect(transform.p.length).toBe(3);
        expect(transform.q.length).toBe(4);
        expect([...transform.p, ...transform.q].every(Number.isFinite)).toBe(
          true,
        );
        expect(Math.hypot(...transform.q)).toBeCloseTo(1, 5);
      }
      expect(sample.cable.length).toBe(32);
    }
  }
});
test('exported model is glTF 2 and has the screen attached to its head', () => {
  const file = readFileSync(root + 'kernel.glb');
  expect(file.toString('utf8', 0, 4)).toBe('glTF');
  expect(file.readUInt32LE(4)).toBe(2);
  const len = file.readUInt32LE(12);
  const gltf = JSON.parse(file.toString('utf8', 20, 20 + len));
  const screen = gltf.nodes.findIndex((n) => n.extras?.is_display);
  const head = gltf.nodes.find((n) => n.extras?.rig_part === 'head');
  expect(screen).toBeGreaterThanOrEqual(0);
  expect(head.children).toContain(screen);
  expect(gltf.nodes.filter((n) => n.extras?.rig_part).length).toBe(47);
  for (const name of ['keyboard', 'keyboard.L'])
    expect(gltf.nodes.some((n) => n.extras?.rig_part === name)).toBe(true);
  for (const side of ['L', 'R'])
    for (const digit of ['index', 'middle', 'ring', 'little'])
      expect(
        gltf.materials
          .find((m) => m.name === `key.${side}.${digit}.1`)
          .emissiveFactor.some((v) => v > 0),
      ).toBe(true);
});

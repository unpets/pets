import { describe, expect, test } from 'bun:test';
import { Object3D, Vector3 } from 'three';
import {
  createGaze,
  cursorAngles,
  neckLimits,
  smoothGaze,
} from '../src/lib/pet/gaze';
import {
  defaultScreenProject,
  parseScreenProject,
  updatePalette,
} from '../src/lib/screen-project';

describe('desktop gaze', () => {
  test('cursor direction, neck limits, and smoothing are stable at different frame rates', () => {
    expect(cursorAngles(100, -100, 380).yaw).toBeGreaterThan(0);
    expect(cursorAngles(100, -100, 380).pitch).toBeLessThan(0);
    expect(cursorAngles(-1e6, 1e6, 380)).toEqual({
      yaw: -neckLimits.yaw,
      pitch: neckLimits.pitch,
    });
    const target = { yaw: 0.6, pitch: -0.3 };
    const sample = (fps: number) => {
      let value = { yaw: 0, pitch: 0 };
      for (let i = 0; i < fps; i++) value = smoothGaze(value, target, 1 / fps);
      return value;
    };
    expect(sample(30).yaw).toBeCloseTo(sample(60).yaw, 8);
    expect(sample(30).pitch).toBeCloseTo(sample(60).pitch, 8);
  });
  test('head actually follows the cursor while its attachment stays fixed', () => {
    const body = new Object3D();
    const joint = new Object3D();
    joint.position.z = 2;
    const head = new Object3D();
    body.add(joint);
    joint.add(head);
    const gaze = createGaze(head, body, joint);
    for (let i = 0; i < 90; i++) {
      joint.quaternion.identity();
      body.updateMatrixWorld(true);
      gaze.update({ yaw: 0.6, pitch: -0.3 }, 1 / 30, true, 0);
    }
    const front = head
      .localToWorld(new Vector3(0, -1, 0))
      .sub(head.getWorldPosition(new Vector3()));
    expect(front.x).toBeGreaterThan(0.4);
    expect(front.z).toBeGreaterThan(0.2);
    expect(joint.position.toArray()).toEqual([0, 0, 2]);
  });
});

test('screen projects reject invalid values and keep independent layer settings', () => {
  const project = defaultScreenProject();
  project.layers.eyes.x = 7;
  project.layers.mouth.visible = false;
  const loaded = parseScreenProject(JSON.parse(JSON.stringify(project)));
  expect(loaded.layers.eyes.x).toBe(7);
  expect(loaded.layers.activity.x).toBe(0);
  expect(loaded.layers.mouth.visible).toBe(false);
  loaded.layers.eyes.opacity = NaN;
  expect(() => parseScreenProject(loaded)).toThrow();
  expect(() => parseScreenProject({ ...project, version: 3 })).toThrow();
});

test('screen palette links colors, allows independent colors, and migrates earlier projects', () => {
  const project = defaultScreenProject();
  const linked = updatePalette(project.palette, { lines: '#ff2200' });
  expect(linked.text).toBe('#ff2200');
  const independent = updatePalette(
    { ...linked, linked: false },
    { text: '#00ff88' },
  );
  expect(independent.lines).toBe('#ff2200');
  expect(independent.text).toBe('#00ff88');
  expect(updatePalette(independent, { linked: true }).text).toBe('#ff2200');
  const legacy = {
    format: 'kernel-screen',
    version: 1,
    layers: project.layers,
  };
  legacy.layers.background.color = '#112233';
  legacy.layers.activity.color = '#abcdef';
  const upgraded = parseScreenProject(legacy);
  expect(upgraded.version).toBe(2);
  expect(upgraded.palette).toEqual({
    background: '#112233',
    lines: '#abcdef',
    text: '#abcdef',
    linked: true,
  });
  expect(() =>
    parseScreenProject({ ...project, palette: { ...linked, text: '#000000' } }),
  ).toThrow();
});

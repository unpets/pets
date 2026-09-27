import { resolveComposition } from '@pets/three-runtime/project';
import { beforeAll, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { Group, Quaternion, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createMotion } from '@pets/three-runtime/motion';
import type { AnimationData } from '../src/lib/types';

const data: AnimationData = JSON.parse(
  readFileSync('personas/kernel/generated/assets/animations.json', 'utf8'),
);
let model: Group;
let motion: ReturnType<typeof createMotion>;
const parts: Record<string, Group> = {};

beforeAll(async () => {
  // Geometry tests use the exported binary and clips without a browser image decoder.
  const source = readFileSync('personas/kernel/generated/assets/kernel.glb');
  const jsonLength = source.readUInt32LE(12);
  const json = JSON.parse(source.toString('utf8', 20, 20 + jsonLength));
  delete json.images;
  delete json.textures;
  json.materials = [{}];
  for (const mesh of json.meshes)
    for (const primitive of mesh.primitives) primitive.material = 0;
  const encoded = Buffer.from(JSON.stringify(json));
  const padded = Buffer.alloc(Math.ceil(encoded.length / 4) * 4, 32);
  encoded.copy(padded);
  const binary = source.subarray(20 + jsonLength);
  const glb = Buffer.alloc(20 + padded.length + binary.length);
  source.copy(glb, 0, 0, 20);
  glb.writeUInt32LE(glb.length, 8);
  glb.writeUInt32LE(padded.length, 12);
  padded.copy(glb, 20);
  binary.copy(glb, 20 + padded.length);
  const result = await new GLTFLoader().parseAsync(glb.buffer, '');
  model = result.scene;
  model.traverse((object) => {
    if (object.userData.rig_part)
      parts[object.userData.rig_part] = object as Group;
  });
  motion = createMotion(model, result.animations, 'running');
});

function assertConnections() {
  for (const side of ['L', 'R']) {
    for (const [a, b, length] of [
      ['upper_arm', 'forearm', 0.33],
      ['forearm', 'hand', 0.34],
      ['thigh', 'shin', 0.42],
      ['shin', 'foot', 0.42],
    ] as const) {
      const start = parts[`${a}.${side}`].getWorldPosition(new Vector3());
      const end = parts[`${b}.${side}`].getWorldPosition(new Vector3());
      expect(start.distanceTo(end)).toBeCloseTo(length, 5);
      if (a === 'upper_arm' || a === 'thigh') {
        const firstAxis = new Vector3(1, 0, 0).transformDirection(
          parts[`${a}.${side}`].matrixWorld,
        );
        const secondAxis = new Vector3(1, 0, 0).transformDirection(
          parts[`${b}.${side}`].matrixWorld,
        );
        expect(firstAxis.distanceTo(secondAxis)).toBeLessThan(0.0001);
      }
    }
    for (const [digit, lengths] of Object.entries({
      index: [0.057, 0.041],
      middle: [0.062, 0.046],
      ring: [0.058, 0.041],
      little: [0.045, 0.034],
      thumb: [0.048, 0.042],
    })) {
      for (let segment = 0; segment < 2; segment++) {
        const first = parts[`${digit}.0${segment + 1}.${side}`];
        const second = parts[`${digit}.0${segment + 2}.${side}`];
        const tip = new Vector3(0, 0, lengths[segment]).applyMatrix4(
          first.matrixWorld,
        );
        expect(
          tip.distanceTo(second.getWorldPosition(new Vector3())),
        ).toBeLessThan(0.00001);
      }
    }
  }
}

test('all exported clips preserve the authored poses', () => {
  for (const [name, clip] of Object.entries(data.states)) {
    motion.setMode(name);
    motion.cancelTransition();
    for (let i = 0; i <= 120; i += 10) {
      motion.update(0, i / 120);
      assertConnections();
      for (const [name, expected] of Object.entries(clip.samples[i].parts)) {
        const position = parts[name].getWorldPosition(new Vector3());
        const rotation = parts[name].getWorldQuaternion(new Quaternion());
        expect(position.distanceTo(new Vector3(...expected.p))).toBeLessThan(
          0.0001,
        );
        expect(
          rotation
            .normalize()
            .angleTo(new Quaternion(...expected.q).normalize()),
        ).toBeLessThan(0.0001);
      }
    }
  }
});

test('every transition and interrupted transition keeps joints connected', () => {
  for (const from of Object.keys(data.states))
    for (const to of Object.keys(data.states)) {
      if (from === to) continue;
      motion.setMode(from);
      motion.cancelTransition();
      motion.update(0, 0.35);
      const before = parts.head.matrixWorld.clone();
      motion.setMode(to);
      motion.update(0, 0);
      before.elements.forEach((value, index) =>
        expect(parts.head.matrixWorld.elements[index]).toBeCloseTo(value, 5),
      );
      for (let i = 0; i < 18; i++) {
        motion.update(1 / 60, i / 120);
        assertConnections();
        if (i === 5) motion.setMode('review');
      }
    }
});

test('waiting to waving raises the hand in front without dropping behind the torso', () => {
  for (const phase of [0, 0.25, 0.5, 0.75]) {
    motion.setMode('waiting');
    motion.cancelTransition();
    motion.update(0, phase);
    const initial = parts['hand.R'].getWorldPosition(new Vector3());
    let previousHeight = initial.z;
    motion.setMode('waving');
    for (let i = 0; i <= 30; i++) {
      motion.update(i === 0 ? 0 : 0.24 / 30, 0);
      const hand = parts['hand.R'].getWorldPosition(new Vector3());
      expect(hand.y).toBeLessThan(0);
      expect(hand.z).toBeGreaterThanOrEqual(previousHeight - 0.00001);
      previousHeight = hand.z;
      assertConnections();
    }
  }
});

test('active work keeps the hand planted between baked samples while the torso moves', () => {
  motion.setMode('running');
  motion.cancelTransition();
  motion.update(0, 0);
  const anchor = parts['hand.R'].getWorldPosition(new Vector3());
  const orientation = parts['hand.R'].getWorldQuaternion(new Quaternion());
  const heights: number[] = [];
  for (let i = 0; i <= 240; i++) {
    motion.update(0, i / 240);
    expect(
      parts['hand.R'].getWorldPosition(new Vector3()).distanceTo(anchor),
    ).toBeLessThan(0.00001);
    expect(
      parts['hand.R'].getWorldQuaternion(new Quaternion()).angleTo(orientation),
    ).toBeLessThan(0.00001);
    heights.push(parts.body.getWorldPosition(new Vector3()).z);
    assertConnections();
  }
  expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(0.013);
});

test('independent joint tracks preserve default poses and arbitrary limb combinations', () => {
  const joints: Record<string, string> = {};
  model.traverse((object) => {
    if (object.userData.joint) joints[object.userData.joint] = object.name;
  });
  for (const mode of ['idle', 'running', 'waving', 'review']) {
    const composition = resolveComposition(data.project, mode);
    motion.setLayers(
      Object.entries(composition.bindings)
        .filter(([id]) => data.project.components[id].kind === 'rig')
        .map(([id, binding]) => ({
          id,
          source: data.project.clips[binding.clip].data.source as string,
          nodes: (data.project.components[id].data.nodes as string[]).map(
            (name) => joints[name],
          ),
        })),
    );
    motion.cancelTransition();
    for (let index = 0; index <= 120; index += 10) {
      motion.update(
        0,
        Object.fromEntries(
          Object.keys(composition.bindings).map((id) => [id, index / 120]),
        ),
      );
      assertConnections();
      for (const [name, expected] of Object.entries(
        data.states[mode].samples[index].parts,
      )) {
        expect(
          parts[name]
            .getWorldPosition(new Vector3())
            .distanceTo(new Vector3(...expected.p)),
        ).toBeLessThan(0.0001);
      }
    }
  }
  const composition = data.project.compositions.idle;
  motion.setLayers(
    Object.entries(composition.bindings)
      .filter(([id]) => data.project.components[id].kind === 'rig')
      .map(([id]) => ({
        id,
        source: id.endsWith('.R') ? 'waving' : 'idle',
        nodes: (data.project.components[id].data.nodes as string[]).map(
          (name) => joints[name],
        ),
      })),
  );
  for (let index = 0; index < 120; index++) {
    motion.update(
      1 / 60,
      Object.fromEntries(
        Object.keys(composition.bindings).map((id) => [
          id,
          (id.endsWith('.R') ? index / 120 : index / 40) % 1,
        ]),
      ),
    );
    assertConnections();
  }
});

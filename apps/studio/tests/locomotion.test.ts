import { expect, test } from 'bun:test';
import { createHeading } from '@pets/three-runtime/heading';
import { blendWeights, createLocomotion } from '@pets/three-runtime/locomotion';
import {
  parseAnimationProject,
  resolveComposition,
  sampleComposition,
  playbackDuration,
  sharesMotionClock,
  compositionLoops,
} from '@pets/three-runtime/project';
import fixture from '../../../tests/fixtures/animation-project.json';

test('turns take the shortest arc with bounded velocity and no wrap jump', () => {
  const heading = createHeading((179 * Math.PI) / 180);
  let previous = heading.angle;
  for (let frame = 0; frame < 120; frame++) {
    const angle = heading.update((-179 * Math.PI) / 180, 1 / 60, 90);
    expect(Math.abs(angle - previous)).toBeLessThanOrEqual(
      Math.PI / 120 + 1e-9,
    );
    previous = angle;
  }
  expect((heading.angle * 180) / Math.PI).toBeCloseTo(181, 4);
});
test('mid-turn reversal stays continuous and converges across frame rates', () => {
  for (const fps of [30, 60, 120]) {
    const heading = createHeading();
    for (let frame = 0; frame < fps / 3; frame++)
      heading.update(Math.PI / 2, 1 / fps);
    const before = heading.angle;
    heading.update(-Math.PI / 2, 1 / fps);
    expect(Math.abs(heading.angle - before)).toBeLessThan((5 * Math.PI) / fps);
    for (let frame = 0; frame < fps * 3; frame++)
      heading.update(-Math.PI / 2, 1 / fps);
    expect(heading.angle).toBeCloseTo(-Math.PI / 2, 4);
  }
});
test('cyclic blend weights cover strafe, backward and diagonal directions', () => {
  const points = [0, 90, 180, 270].map((heading) => ({
    source: `${heading}`,
    heading,
  }));
  expect([...blendWeights(points, 45).values()]).toEqual([0.5, 0.5, 0, 0]);
  expect([...blendWeights(points, -45).values()]).toEqual([0.5, 0, 0, 0.5]);
  expect(blendWeights(points, -90).get('270')).toBe(1);
  expect(blendWeights(points, 180).get('180')).toBe(1);
});
test('travel speed ramps independently of facing and animation rate', () => {
  const locomotion = createLocomotion();
  for (let frame = 0; frame < 120; frame++) locomotion.update(0, 90, 2, 1 / 60);
  const velocity = locomotion.update(0, 90, 2, 1 / 60);
  expect(velocity.x).toBeCloseTo(2, 4);
  expect(velocity.y).toBeCloseTo(0, 4);
  const project = parseAnimationProject(fixture);
  project.compositions.greeting.properties = {
    heading: 45,
    animationSpeed: 2,
    moveSpeed: 0.2,
  };
  project.compositions.child = {
    label: 'Child',
    description: '',
    parent: 'greeting',
    properties: { travelHeading: 135 },
    bindings: {},
  };
  expect(resolveComposition(project, 'child').properties).toEqual({
    heading: 45,
    animationSpeed: 2,
    moveSpeed: 0.2,
    travelHeading: 135,
  });
  expect(playbackDuration(project, 'child')).toBe(1);
  expect(playbackDuration(project, 'child', { animationSpeed: 4 })).toBe(0.5);
  expect(sampleComposition(project, 'child', 0.5, 7).body.phase).toBe(0.5);
  expect(sampleComposition(project, 'child', 0.5, 7).eyes.phase).toBe(0.75);
});

test('only synchronized locomotion shares phase and one-shot actions hold their end', () => {
  const project = parseAnimationProject(fixture);
  project.compositions.child = {
    label: 'Child',
    parent: 'greeting',
    properties: { heading: 90 },
    bindings: {},
  };
  expect(sharesMotionClock(project, 'greeting', 'child')).toBe(false);
  project.clips.walk.data.blendSpace = [{ source: 'walk', heading: 0 }];
  expect(sharesMotionClock(project, 'greeting', 'child')).toBe(true);
  expect(compositionLoops(project, 'child')).toBe(true);
  project.clips.walk.looping = false;
  expect(compositionLoops(project, 'child')).toBe(false);
});

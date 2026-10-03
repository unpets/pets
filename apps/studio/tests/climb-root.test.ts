import { expect, test } from 'bun:test';
import { AnimationClip, Group, Vector3, VectorKeyframeTrack } from 'three';
import { createMotion } from '@pets/three-runtime/motion';

test('stationary mixer samples retain an absolute climb offset over repeated cycles', () => {
  const model = new Group(),
    body = new Group();
  body.name = 'body';
  body.userData.joint = 'body';
  model.add(body);
  const motion = createMotion(
    model,
    [
      new AnimationClip('climb', 1, [
        new VectorKeyframeTrack(
          'body.position',
          [0, 0.2, 1],
          [0, 0, 0, 0, 0, 0, 0, 0, 0.28],
        ),
      ]),
    ],
    'climb',
  );
  const offset = new Vector3();
  for (let cycle = 0; cycle < 5; cycle++)
    for (let i = 0; i < 12; i++) {
      body.position.sub(offset);
      offset.set(0, 0, 0);
      const phase = i / 60;
      const weight = motion.update(1 / 60, phase);
      offset.z = cycle * 0.28 * weight;
      body.position.add(offset);
      expect(body.position.z).toBeCloseTo(cycle * 0.28, 8);
    }
  motion.dispose();
});

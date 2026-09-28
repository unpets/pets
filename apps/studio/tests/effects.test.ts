import { expect, test } from 'bun:test';
import {
  defaultEffect,
  particle,
  validateEffect,
} from '@pets/three-runtime/effects';

test('effect particles are deterministic, continuous at recycle, and bounded', () => {
  const effect = defaultEffect();
  validateEffect({ ...effect });
  expect(particle(effect, 3, 7)).toEqual(particle(effect, 3, 7));
  const before = particle(effect, 0, effect.lifetime - 1e-8);
  const after = particle(effect, 0, effect.lifetime + 1e-8);
  expect(before.size).toBeLessThan(1e-8);
  expect(after.size).toBeLessThan(1e-8);
  expect(() => validateEffect({ ...effect, count: 1e9 })).toThrow();
  expect(() => validateEffect({ ...effect, radius: -1 })).toThrow();
});

import { expect, test } from 'bun:test';
import { sampleClip } from '../web/src/lib/motion';
import type { AnimationClip, PoseSample } from '../web/src/lib/types';

test('animation sampling tolerates frame timestamps outside the clip range', () => {
  const start: PoseSample = { parts: {}, cable: [] };
  const end: PoseSample = { parts: {}, cable: [] };
  const clip: AnimationClip = {
    duration: 1,
    frames: 2,
    screenRow: 0,
    samples: [start, end],
  };
  expect(sampleClip(clip, -0.01)).toEqual([start, end, 0]);
  expect(sampleClip(clip, 1.01)).toEqual([end, end, 0]);
  expect(sampleClip(clip, 0.5)).toEqual([start, end, 0.5]);
});

import { test, expect } from 'bun:test';
import fixture from '../../../tests/fixtures/animation-project.json';
import {
  parseAnimationProject,
  sampleComposition,
} from '@pets/three-runtime/project';

test('independent clips continue while a composition clock restarts', () => {
  const project = parseAnimationProject(fixture);
  expect(sampleComposition(project, 'greeting', 0.5, 7)).toEqual({
    body: { clip: 'walk', phase: 0.25 },
    eyes: { clip: 'blink', phase: 0.75 },
  });
  expect(sampleComposition(project, 'thinking', 0, 7).eyes.phase).toBe(0.75);
  project.compositions.greeting.bindings.eyes.speed = 0.5;
  project.compositions.greeting.bindings.eyes.offset = -0.25;
  expect(sampleComposition(project, 'greeting', 0, 0).eyes.phase).toBe(0.75);
  project.clips.blink.looping = false;
  expect(sampleComposition(project, 'greeting', 0, 100).eyes.phase).toBe(1);
  project.compositions.greeting.bindings.eyes.enabled = false;
  expect(sampleComposition(project, 'greeting', 0, 100).eyes).toBeUndefined();
});
test('project validation rejects incompatible bindings without limiting identifiers to builtin modes', () => {
  const project = parseAnimationProject(fixture);
  project.compositions['my-dance'] = {
    ...project.compositions.greeting,
    label: 'My dance',
  };
  expect(parseAnimationProject(project).compositions['my-dance']).toBeDefined();
  project.compositions.greeting.bindings.body.clip = 'blink';
  expect(() => parseAnimationProject(project)).toThrow();
});

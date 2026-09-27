import { expect, test } from 'bun:test';
import fixture from '../../../tests/fixtures/animation-project.json';
import {
  parseAnimationProject,
  resolveComposition,
  sampleComposition,
} from '@pets/three-runtime/project';
import { exportAsset, importAsset } from '@pets/three-runtime/assets';

test('nested children inherit live parent edits, clocks, and disabled overrides', () => {
  const project = parseAnimationProject(fixture);
  project.compositions.child = {
    label: 'Child',
    description: '',
    parent: 'greeting',
    bindings: {},
  };
  project.compositions.grandchild = {
    label: 'Grandchild',
    description: '',
    parent: 'child',
    bindings: {
      eyes: { ...project.compositions.greeting.bindings.eyes, enabled: false },
    },
  };
  expect(resolveComposition(project, 'child').duration).toBe(2);
  project.compositions.greeting.duration = 5;
  project.compositions.greeting.bindings.body.speed = 0.25;
  expect(resolveComposition(project, 'child').duration).toBe(5);
  expect(resolveComposition(project, 'child').origins.body).toBe('greeting');
  expect(sampleComposition(project, 'child', 2, 7).body.phase).toBeCloseTo(0.1);
  expect(sampleComposition(project, 'grandchild', 2, 7).eyes).toBeUndefined();
  expect(project.compositions.child.bindings).toEqual({});
});
test('cycles, missing parents and durationless roots are rejected', () => {
  const project = parseAnimationProject(fixture);
  project.compositions.greeting.parent = 'thinking';
  project.compositions.thinking.parent = 'greeting';
  expect(() => parseAnimationProject(project)).toThrow('cycle');
  project.compositions.greeting.parent = 'missing';
  expect(() => parseAnimationProject(project)).toThrow('parent');
  delete project.compositions.greeting.parent;
  delete project.compositions.thinking.parent;
  delete project.compositions.greeting.duration;
  expect(() => parseAnimationProject(project)).toThrow('duration');
});
test('composition exports include ancestor and clip dependencies; collisions remap references', () => {
  const project = parseAnimationProject(fixture);
  project.compositions.child = {
    label: 'Child',
    description: '',
    parent: 'greeting',
    bindings: {},
  };
  const bundle = exportAsset(project, 'composition', 'child');
  expect(bundle.compositions.greeting).toBeDefined();
  expect(bundle.clips.blink).toBeDefined();
  const destination = parseAnimationProject(fixture);
  destination.compositions.greeting.label = 'Existing greeting';
  const imported = importAsset(destination, bundle);
  const parent = imported.project.compositions[imported.selection.id].parent!;
  expect(parent).not.toBe('greeting');
  expect(imported.project.compositions.greeting.label).toBe(
    'Existing greeting',
  );
  expect(
    sampleComposition(imported.project, imported.selection.id, 0.5, 7),
  ).toEqual(sampleComposition(project, 'child', 0.5, 7));
  const clip = exportAsset(project, 'clip', 'blink');
  expect(Object.keys(clip.compositions)).toHaveLength(0);
  expect(importAsset(destination, clip).project.clips.blink).toEqual(
    project.clips.blink,
  );
});

test('identical composition IDs still remap changed clip dependencies', () => {
  const source = parseAnimationProject(fixture);
  const destination = parseAnimationProject(fixture);
  destination.clips.blink.label = 'Destination blink';
  const imported = importAsset(
    destination,
    exportAsset(source, 'composition', 'greeting'),
  );
  expect(imported.selection.id).not.toBe('greeting');
  const eyes = resolveComposition(imported.project, imported.selection.id)
    .bindings.eyes;
  expect(eyes.clip).not.toBe('blink');
  expect(imported.project.clips[eyes.clip]).toEqual(source.clips.blink);
  expect(imported.project.clips.blink.label).toBe('Destination blink');
});

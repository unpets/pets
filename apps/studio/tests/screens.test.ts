import { test, expect } from 'bun:test';
import fixture from '../../../tests/fixtures/animation-project.json';
import {
  binding,
  parseAnimationProject,
  resolveComposition,
  sampleComposition,
} from '@pets/three-runtime/project';
import { exportAsset, importAsset } from '@pets/three-runtime/assets';
import { migrateScreens } from '../../../personas/kernel/web/src/screen-library';
import {
  defaultScreenProject,
  parseScreenProject,
} from '@pets/kernel/screen-project';

function legacyProject() {
  const result = parseAnimationProject(fixture);
  result.components.eyes.kind = 'screen';
  result.components.eyes.data = { layer: 'eyes', order: 2 };
  return result;
}
function project() {
  const result = migrateScreens(legacyProject());
  return parseAnimationProject(result);
}
test('blank screens export without requiring a face component', () => {
  const value = project();
  value.screens!.blank = {
    label: 'Blank',
    data: { ...defaultScreenProject() },
    bindings: {},
  };
  const restored = importAsset(value, exportAsset(value, 'screen', 'blank'));
  expect(restored.project.screens!.blank.bindings).toEqual({});
});
test('composition bundles preserve destination components for shared face clips', () => {
  const value = project();
  value.components.left = {
    label: 'Left eye',
    kind: 'screen',
    data: { layer: 'left', family: 'eyes' },
  };
  value.compositions.greeting.bindings.left = binding('blink');
  const asset = exportAsset(value, 'composition', 'greeting');
  expect(asset.components.left).toEqual(value.components.left);
  expect(importAsset(project(), asset).project.components.left).toBeDefined();
});
test('migration preserves screen clocks and separates the library from compositions', () => {
  const original = legacyProject(),
    next = project();
  expect(sampleComposition(next, 'greeting', 0.5, 7)).toEqual(
    sampleComposition(original, 'greeting', 0.5, 7),
  );
  expect(next.compositions.greeting.bindings.eyes).toBeUndefined();
  const id = next.compositions.greeting.screen!;
  next.compositions.child = {
    label: 'Child',
    parent: 'greeting',
    bindings: {},
    description: '',
  };
  next.screens![id].bindings.eyes.speed = 0.5;
  expect(resolveComposition(next, 'child').screen).toBe(id);
  expect(sampleComposition(next, 'child', 0, 7).eyes.phase).toBe(0.875);
});
test('screens include dependencies and remap imported references on conflict', () => {
  const source = project();
  const id = source.compositions.greeting.screen!;
  const bundle = exportAsset(source, 'screen', id);
  const target = project();
  target.screens![id].label = 'Changed locally';
  target.clips.blink.label = 'Different blink';
  const imported = importAsset(target, bundle);
  expect(imported.selection.kind).toBe('screen');
  expect(imported.selection.id).not.toBe(id);
  const clip =
    imported.project.screens![imported.selection.id].bindings.eyes.clip;
  expect(clip).not.toBe('blink');
  expect(imported.project.clips[clip].label).toBe(source.clips.blink.label);
  const composition = exportAsset(source, 'composition', 'greeting');
  expect(composition.screens![id]).toEqual(source.screens![id]);
});
test('screen bindings reject broken references and incompatible face components', () => {
  const value = project(),
    id = value.compositions.greeting.screen!;
  value.screens![id].bindings.eyes = binding('missing');
  expect(() => parseAnimationProject(value)).toThrow();
  value.screens![id].bindings.eyes = binding('walk');
  expect(() => parseAnimationProject(value)).toThrow();
  delete value.screens![id];
  expect(() => parseAnimationProject(value)).toThrow();
});
test('eye transforms survive serialization and old palettes migrate without losing offsets', () => {
  const screen = defaultScreenProject();
  screen.eyeMode = 'independent';
  screen.layers.eyeLeft.mirrorX = true;
  screen.layers.eyeRight.x = 5;
  screen.layers.eyeRight.scale = 1.25;
  expect(parseScreenProject(JSON.parse(JSON.stringify(screen)))).toEqual(
    screen,
  );
  const legacy = {
    ...screen,
    version: 2,
    layers: {
      ...screen.layers,
      eyes: {
        visible: true,
        opacity: 0.75,
        x: -3,
        y: 2,
        color: null,
        source: null,
      },
    },
  };
  const next = parseScreenProject(legacy);
  expect(next.layers.eyes.x).toBe(-3);
  expect(next.layers.eyes.scale).toBe(1);
  screen.layers.eyeLeft.scale = 0;
  expect(() => parseScreenProject(screen)).toThrow();
});

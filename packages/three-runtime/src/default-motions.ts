import type { AnimationProject } from './project';

export const defaultMotions: Readonly<Record<string, string>> = Object.freeze({
  idle: 'Idle',
  move: 'Move',
  waving: 'Wave',
  jumping: 'Jump',
  failed: 'Failure',
  waiting: 'Waiting',
  running: 'Active work',
  review: 'Review',
  look: 'Look around',
  flying: 'Fly',
  climbing: 'Climb',
  'climb-rope': 'Rope',
  'climb-ladder': 'Ladder',
  'climb-border': 'Border',
});
export const isDefaultMotion = (id: string) =>
  Object.hasOwn(defaultMotions, id);

export function ensureDefaultMotions(project: AnimationProject) {
  for (const [id, label] of Object.entries(defaultMotions)) {
    project.compositions[id] ??= {
      label,
      description: '',
      duration: 2,
      enabled: false,
      bindings: {},
    };
    project.compositions[id].label = label;
  }
  return project;
}

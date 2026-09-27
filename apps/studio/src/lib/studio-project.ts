import {
  parseKernelProject,
  defaultAnimationProject,
} from '@pets/kernel/animation-project';
import {
  parseScreenProject,
  defaultScreenProject,
  type ScreenProject,
} from '@pets/kernel/screen-project';
import {
  parseAssets,
  defaultAssets,
  type CharacterAssets,
} from '@pets/kernel/assets';
import type { AnimationProject } from '@pets/three-runtime/project';
import {
  defaultViewSettings,
  type ViewSettings,
  type Workspace,
} from './types';
export interface StudioProject {
  format: 'pets-studio';
  version: 1;
  persona: { id: string; name: string };
  assets: CharacterAssets;
  animations: AnimationProject;
  screen: ScreenProject;
  view: ViewSettings;
  selection: {
    composition: string;
    component: string;
    clip: string;
    workspace: Workspace;
  };
}
export function parseStudioProject(value: unknown): StudioProject {
  const project = value as StudioProject;
  if (
    !project ||
    project.format !== 'pets-studio' ||
    project.version !== 1 ||
    !project.persona ||
    !/^[a-z0-9_-]+$/i.test(project.persona.id) ||
    !project.persona.name?.trim()
  )
    throw new Error('Invalid Studio project.');
  const animations = parseKernelProject(project.animations);
  const screen = parseScreenProject(project.screen);
  const assets = parseAssets(project.assets);
  const view = { ...defaultViewSettings(), ...project.view };
  if (
    ['grid', 'wireframe', 'joints', 'orbit'].some(
      (k) => typeof view[k as keyof ViewSettings] !== 'boolean',
    ) ||
    !Number.isFinite(view.lighting) ||
    view.lighting < 0 ||
    view.lighting > 4 ||
    !Number.isFinite(view.fov) ||
    view.fov < 15 ||
    view.fov > 80
  )
    throw new Error('Invalid view settings.');
  const selection = project.selection;
  if (
    !selection ||
    !animations.compositions[selection.composition] ||
    !animations.components[selection.component] ||
    (selection.clip &&
      animations.clips[selection.clip]?.component !== selection.component) ||
    !['scene', 'screen', 'animation'].includes(selection.workspace)
  )
    throw new Error('Invalid project selection.');
  return structuredClone({ ...project, animations, screen, assets, view });
}
export function defaultStudioProject(): StudioProject {
  return {
    format: 'pets-studio',
    version: 1,
    persona: { id: 'kernel', name: 'Kernel' },
    assets: defaultAssets(),
    animations: defaultAnimationProject(),
    screen: defaultScreenProject(),
    view: defaultViewSettings(),
    selection: {
      composition: 'idle',
      component: 'screen/eyes',
      clip: 'screen/eyes/blink',
      workspace: 'scene',
    },
  };
}
export function embeddedProject(): StudioProject | undefined {
  const source = document.getElementById('pets-project-boot')?.textContent;
  return source ? parseStudioProject(JSON.parse(source)) : undefined;
}
export function standaloneHtml(
  project: StudioProject,
  companion = false,
): string {
  const page = document.documentElement.cloneNode(true) as HTMLElement;
  page.querySelector('#app')?.replaceChildren();
  page.querySelector('#pets-project-boot')?.remove();
  const data = document.createElement('script');
  data.id = 'pets-project-boot';
  data.type = 'application/json';
  data.textContent = JSON.stringify(project).replaceAll('<', '\\u003c');
  page.querySelector('head')!.append(data);
  page.setAttribute('data-pets-host', companion ? 'companion' : 'studio');
  return '<!doctype html>\n' + page.outerHTML;
}

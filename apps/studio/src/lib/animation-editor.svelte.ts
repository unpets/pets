import { defaultEffect } from '@pets/three-runtime/effects';
import { compositionInstance } from '@pets/three-runtime/project';
import {
  resolveComposition,
  binding,
  uniqueId,
  type AnimationProject,
  type Binding,
  type Clip,
} from '@pets/three-runtime/project';
import {
  defaultAnimationProject,
  parseKernelProject,
  saveAnimationProject,
} from '@pets/kernel/animation-project';

export class AnimationEditorState {
  project = $state.raw<AnimationProject>(defaultAnimationProject());
  component = $state('screen/eyes');
  clip = $state('screen/eyes/blink');
  private past = $state.raw<AnimationProject[]>([]);
  private future = $state.raw<AnimationProject[]>([]);
  private group: string | undefined;
  private reconcileSelection() {
    if (!this.project.components[this.component])
      this.component = Object.keys(this.project.components)[0];
    if (this.project.clips[this.clip]?.component !== this.component)
      this.clip =
        Object.keys(this.project.clips).find(
          (id) => this.project.clips[id].component === this.component,
        ) ?? '';
  }
  get canUndo() {
    return this.past.length > 0;
  }
  get canRedo() {
    return this.future.length > 0;
  }
  load(project: AnimationProject) {
    this.project = parseKernelProject(project);
    this.reconcileSelection();
    this.past = [];
    this.future = [];
  }
  replace(project: AnimationProject, group?: string) {
    const next = parseKernelProject(project);
    if (JSON.stringify(next) === JSON.stringify(this.project)) return;
    if (!group || this.group !== group)
      this.past = [...this.past.slice(-39), parseKernelProject(this.project)];
    this.group = group;
    this.future = [];
    this.project = next;
    this.reconcileSelection();
    saveAnimationProject(next);
  }
  endGesture() {
    this.group = undefined;
  }
  undo() {
    const next = this.past.at(-1);
    if (!next) return;
    this.future = [...this.future, parseKernelProject(this.project)];
    this.past = this.past.slice(0, -1);
    this.project = next;
    this.reconcileSelection();
    this.endGesture();
    saveAnimationProject(next);
  }
  redo() {
    const next = this.future.at(-1);
    if (!next) return;
    this.past = [...this.past, parseKernelProject(this.project)];
    this.future = this.future.slice(0, -1);
    this.project = next;
    this.reconcileSelection();
    this.endGesture();
    saveAnimationProject(next);
  }
  bind(composition: string, update: Partial<Binding>) {
    const project = parseKernelProject(this.project);
    const old =
      resolveComposition(project, composition).bindings[this.component] ??
      binding(this.clip);
    project.compositions[composition].bindings[this.component] = {
      ...old,
      ...update,
    };
    this.replace(project);
  }
  duplicateComposition(source: string, label: string) {
    const project = parseKernelProject(this.project);
    const id = uniqueId(label, project.compositions);
    const {
      origins: _,
      parent: __,
      ...resolved
    } = resolveComposition(project, source);
    project.compositions[id] = { ...resolved, label };
    this.replace(project);
    return id;
  }
  createComposition(label: string, parent?: string) {
    const project = parseKernelProject(this.project);
    const id = uniqueId(label, project.compositions);
    project.compositions[id] = {
      label,
      description: '',
      ...(parent ? { parent } : { duration: 2 }),
      bindings: {},
    };
    this.replace(project);
    return id;
  }
  updateComposition(
    id: string,
    update: Partial<AnimationProject['compositions'][string]>,
  ) {
    const project = parseKernelProject(this.project);
    Object.assign(project.compositions[id], update);
    this.replace(project);
  }
  resetBinding(composition: string, components = [this.component]) {
    const project = parseKernelProject(this.project);
    for (const component of components)
      delete project.compositions[composition].bindings[component];
    this.replace(project);
  }
  detachComposition(id: string) {
    const {
      origins: _,
      parent: __,
      ...resolved
    } = resolveComposition(this.project, id);
    const project = parseKernelProject(this.project);
    project.compositions[id] = resolved;
    this.replace(project);
  }
  deleteComposition(id: string) {
    const project = parseKernelProject(this.project);
    if (Object.keys(project.compositions).length === 1)
      throw new Error('Keep at least one composition.');
    if (Object.values(project.compositions).some((c) => c.parent === id))
      throw new Error('Reparent or detach child compositions first.');
    if (
      Object.values(project.exports).some((map) =>
        Object.values(map).some(
          (value) => compositionInstance(value).composition === id,
        ),
      )
    )
      throw new Error(
        'Update export mappings before deleting this composition.',
      );
    delete project.compositions[id];
    this.replace(project);
  }
  duplicateClip(label: string, composition: string) {
    const project = parseKernelProject(this.project);
    const id = uniqueId(label, project.clips);
    project.clips[id] = { ...project.clips[this.clip], label };
    const old =
      resolveComposition(project, composition).bindings[this.component] ??
      binding(id);
    project.compositions[composition].bindings[this.component] = {
      ...old,
      clip: id,
    };
    this.replace(project);
    this.clip = id;
  }
  deleteClip() {
    const project = parseKernelProject(this.project);
    if (
      Object.values(project.compositions).some((c) =>
        Object.values(c.bindings).some((b) => b.clip === this.clip),
      )
    )
      throw new Error('Unassign this clip before deleting it.');
    delete project.clips[this.clip];
    this.replace(project);
  }
  editComponent(update: Partial<AnimationProject['components'][string]>) {
    const project = parseKernelProject(this.project);
    Object.assign(project.components[this.component], update);
    this.replace(project);
  }
  deleteComponent() {
    const project = parseKernelProject(this.project);
    if (
      Object.values(project.compositions).some(
        (c) => c.bindings[this.component],
      )
    )
      throw new Error('Unassign this component from every composition first.');
    for (const [id, clip] of Object.entries(project.clips))
      if (clip.component === this.component) delete project.clips[id];
    delete project.components[this.component];
    this.replace(project);
  }
  editClip(update: Partial<Clip>, group?: string) {
    const project = parseKernelProject(this.project);
    project.clips[this.clip] = { ...project.clips[this.clip], ...update };
    this.replace(project, group);
  }
  createClip(label: string, composition: string) {
    const project = parseKernelProject(this.project);
    const id = uniqueId(label, project.clips);
    const kind = project.components[this.component].kind;
    const data =
      kind === 'screen'
        ? { frames: [[]] }
        : kind === 'rig'
          ? {
              keyframes: [
                { time: 0, rotation: [0, 0, 0] },
                { time: 1, rotation: [0, 0, 0] },
              ],
            }
          : kind === 'emission'
            ? {
                keyframes: [
                  [0, 0],
                  [0.5, 4],
                  [1, 0],
                ],
              }
            : kind === 'effect'
              ? { ...defaultEffect() }
              : { visible: true };
    project.clips[id] = {
      label,
      component: this.component,
      duration: 1,
      looping: true,
      data,
    };
    project.compositions[composition].bindings[this.component] = binding(id);
    this.replace(project);
    this.clip = id;
  }
  addEffect(label: string, composition: string) {
    const project = parseKernelProject(this.project);
    const id = uniqueId(label, project.components);
    const node = Object.values(project.components).find(
      (component) => component.kind === 'rig',
    )?.data.nodes as string[];
    project.components[id] = {
      label,
      kind: 'effect',
      data: { nodes: [node[0]] },
    };
    const clip = uniqueId(`${label}-effect`, project.clips);
    project.clips[clip] = {
      label,
      component: id,
      duration: 1,
      looping: true,
      data: { ...defaultEffect() },
    };
    project.compositions[composition].bindings[id] = binding(clip);
    this.replace(project);
    this.component = id;
    this.clip = clip;
  }
  addScreen(label: string, composition: string) {
    const project = parseKernelProject(this.project);
    const id = uniqueId(label, project.components);
    project.components[id] = {
      label,
      kind: 'screen',
      data: { layer: id, order: Object.keys(project.components).length },
    };
    const clip = uniqueId(`${label}-clip`, project.clips);
    project.clips[clip] = {
      label,
      component: id,
      duration: 1,
      looping: true,
      data: { frames: [[]] },
    };
    project.compositions[composition].bindings[id] = binding(clip);
    this.replace(project);
    this.component = id;
    this.clip = clip;
  }
}

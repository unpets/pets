import {
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
  project = $state<AnimationProject>(defaultAnimationProject());
  component = $state('screen/eyes');
  clip = $state('screen/eyes/blink');
  private past = $state<AnimationProject[]>([]);
  private future = $state<AnimationProject[]>([]);
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
      project.compositions[composition].bindings[this.component] ??
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
    project.compositions[id] = { ...project.compositions[source], label };
    this.replace(project);
    return id;
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

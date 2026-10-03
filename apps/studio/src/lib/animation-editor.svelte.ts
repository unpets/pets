import {
  identityFrame,
  isFaceComponent,
  type FaceSurface,
} from '@pets/three-runtime/face';
import { isDefaultMotion } from '@pets/three-runtime/default-motions';
import { defaultLookAt } from '@pets/kernel/look-at';
import { defaultEffect } from '@pets/three-runtime/effects';
import { compositionInstance } from '@pets/three-runtime/project';
import {
  resolveComposition,
  binding,
  uniqueId,
  type AnimationProject,
  type Binding,
  type Clip,
  compatibleClip,
} from '@pets/three-runtime/project';
import {
  defaultAnimationProject,
  parseKernelProject,
  saveAnimationProject,
} from '@pets/kernel/animation-project';
import {
  defaultScreenProject,
  parseScreenProject,
  type ScreenProject,
} from '@pets/kernel/screen-project';

export class AnimationEditorState {
  constructor(private persist = true) {}
  project = $state.raw<AnimationProject>(defaultAnimationProject());
  component = $state('screen/eyes');
  clip = $state('screen/eyes/blink');
  private past = $state.raw<AnimationProject[]>([]);
  private future = $state.raw<AnimationProject[]>([]);
  private group: string | undefined;
  private reconcileSelection() {
    if (!this.project.components[this.component])
      this.component = Object.keys(this.project.components)[0];
    if (!compatibleClip(this.project, this.component, this.clip))
      this.clip =
        Object.keys(this.project.clips).find(
          (id) => this.project.clips[id].component === this.component,
        ) ?? '';
  }
  get canUndo() {
    return this.past.length > 0;
  }
  createScreen(label: string, source?: string) {
    const project = parseKernelProject(this.project);
    const id = uniqueId(label, project.screens!);
    project.screens![id] = source
      ? { ...structuredClone(project.screens![source]), label }
      : { label, data: { ...defaultScreenProject() }, bindings: {} };
    this.replace(project);
    return id;
  }
  createFaceClip(label: string, source?: string) {
    const project = parseKernelProject(this.project);
    const id = uniqueId(label, project.clips);
    project.clips[id] = source
      ? { ...structuredClone(project.clips[source]), label }
      : {
          label,
          component: this.component,
          duration: 1,
          looping: true,
          data:
            this.project.components[this.component].kind === 'face-mesh'
              ? { keyframes: [identityFrame(0), identityFrame(1)] }
              : { frames: [[]] },
        };
    if (
      source &&
      project.components[project.clips[source].component].kind === 'face-mesh'
    ) {
      const component = uniqueId(label, project.components);
      project.components[component] = {
        ...structuredClone(project.components[project.clips[source].component]),
        label,
      };
      project.clips[id].component = component;
    }
    this.replace(project);
    this.component = project.clips[id].component;
    this.clip = id;
  }
  addMesh(label: string, kind: 'face-mesh' | 'attachment' = 'face-mesh') {
    const project = parseKernelProject(this.project);
    const id = uniqueId(label, project.components),
      clip = uniqueId(`${label}-clip`, project.clips);
    project.components[id] = {
      label,
      kind,
      data: {
        geometry: { type: 'sphere' },
        color: '#55e9eb',
        ...(kind === 'attachment' ? { node: 'hand.R', hides: [] } : {}),
      },
    };
    const frames = [identityFrame(0), identityFrame(1)];
    for (const f of frames) {
      f.scale = kind === 'attachment' ? [0.1, 0.1, 0.1] : [0.15, 0.15, 0.05];
      f.position = kind === 'attachment' ? [0, 0, 0] : [0, 0, 0.04];
    }
    project.clips[clip] = {
      label,
      component: id,
      duration: 1,
      looping: true,
      data: { keyframes: frames },
    };
    this.replace(project);
    this.component = id;
    this.clip = clip;
  }
  updateFaceSurface(id: string, surface: FaceSurface) {
    this.replace({
      ...this.project,
      screens: {
        ...this.project.screens,
        [id]: { ...this.project.screens![id], surface },
      },
    });
  }
  unbindScreen(id: string, component: string) {
    const screen = structuredClone(this.project.screens![id]);
    delete screen.bindings[component];
    if (
      component === 'screen/eyeLeft' &&
      parseScreenProject(screen.data).eyeMode === 'mirrored'
    )
      delete screen.bindings['screen/eyeRight'];
    this.replace({
      ...this.project,
      screens: { ...this.project.screens, [id]: screen },
    });
  }
  updateScreen(id: string, data: ScreenProject, group?: string) {
    this.replace(
      {
        ...this.project,
        screens: {
          ...this.project.screens,
          [id]: {
            ...this.project.screens![id],
            data: { ...parseScreenProject(data) },
          },
        },
      },
      group,
    );
  }
  renameScreen(id: string, label: string) {
    if (!label.trim()) return;
    this.replace({
      ...this.project,
      screens: {
        ...this.project.screens,
        [id]: { ...this.project.screens![id], label: label.trim() },
      },
    });
  }
  deleteScreen(id: string) {
    if (Object.values(this.project.compositions).some((c) => c.screen === id))
      throw new Error('Assign a different screen before deleting this one.');
    if (Object.keys(this.project.screens!).length < 2)
      throw new Error('Keep at least one screen.');
    const screens = { ...this.project.screens };
    delete screens[id];
    this.replace({ ...this.project, screens });
  }
  bindScreen(id: string, component: string, update: Partial<Binding>) {
    const screen = this.project.screens![id];
    const next = {
      ...(screen.bindings[component] ?? binding(update.clip ?? '')),
      ...update,
    };
    const bindings = { ...screen.bindings, [component]: next };
    if (
      component === 'screen/eyeLeft' &&
      parseScreenProject(screen.data).eyeMode === 'mirrored'
    )
      bindings['screen/eyeRight'] = { ...next };
    this.replace({
      ...this.project,
      screens: { ...this.project.screens, [id]: { ...screen, bindings } },
    });
  }
  eyeMode(id: string, eyeMode: ScreenProject['eyeMode']) {
    const screen = structuredClone(this.project.screens![id]);
    const data = parseScreenProject(screen.data);
    const source =
      screen.bindings['screen/eyes'] ?? screen.bindings['screen/eyeLeft'];
    if (!source) throw new Error('Assign an eyes component first.');
    if (eyeMode === 'paired') {
      screen.bindings['screen/eyes'] = { ...source };
      delete screen.bindings['screen/eyeLeft'];
      delete screen.bindings['screen/eyeRight'];
    } else {
      screen.bindings['screen/eyeLeft'] = { ...source };
      screen.bindings['screen/eyeRight'] =
        eyeMode === 'mirrored'
          ? { ...source }
          : { ...(screen.bindings['screen/eyeRight'] ?? source) };
      delete screen.bindings['screen/eyes'];
    }
    screen.data = { ...data, eyeMode };
    this.replace({
      ...this.project,
      screens: { ...this.project.screens, [id]: screen },
    });
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
    if (this.persist) saveAnimationProject(next);
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
    if (this.persist) saveAnimationProject(next);
  }
  redo() {
    const next = this.future.at(-1);
    if (!next) return;
    this.past = [...this.past, parseKernelProject(this.project)];
    this.future = this.future.slice(0, -1);
    this.project = next;
    this.reconcileSelection();
    this.endGesture();
    if (this.persist) saveAnimationProject(next);
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
      origins,
      parent: __,
      ...resolved
    } = resolveComposition(project, source);
    for (const component of Object.keys(resolved.bindings))
      if (
        isFaceComponent(project.components[component].kind) &&
        !project.compositions[origins[component]].bindings[component]
      )
        delete resolved.bindings[component];
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
    if (isDefaultMotion(id) && update.label !== undefined)
      throw new Error('Default motion names cannot be changed.');
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
      origins,
      parent: __,
      ...resolved
    } = resolveComposition(this.project, id);
    const project = parseKernelProject(this.project);
    for (const component of Object.keys(resolved.bindings))
      if (
        isFaceComponent(project.components[component].kind) &&
        !project.compositions[origins[component]].bindings[component]
      )
        delete resolved.bindings[component];
    project.compositions[id] = resolved;
    this.replace(project);
  }
  deleteComposition(id: string) {
    if (isDefaultMotion(id))
      throw new Error(
        'Disable unsupported default motions instead of deleting them.',
      );
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
  duplicateClip(label: string, composition?: string) {
    const project = parseKernelProject(this.project);
    const id = uniqueId(label, project.clips);
    project.clips[id] = { ...project.clips[this.clip], label };
    if (composition) {
      const old =
        resolveComposition(project, composition).bindings[this.component] ??
        binding(id);
      project.compositions[composition].bindings[this.component] = {
        ...old,
        clip: id,
      };
    }
    this.replace(project);
    this.clip = id;
  }
  deleteClip() {
    const project = parseKernelProject(this.project);
    if (
      Object.values(project.compositions).some((c) =>
        Object.values(c.bindings).some((b) => b.clip === this.clip),
      ) ||
      Object.values(project.screens ?? {}).some((s) =>
        Object.values(s.bindings).some((b) => b.clip === this.clip),
      )
    )
      throw new Error('Unassign this clip before deleting it.');
    delete project.clips[this.clip];
    this.replace(project);
  }
  extractJoint(node: string) {
    const project = parseKernelProject(this.project);
    const component = project.components[this.component];
    const nodes = component.data.nodes as string[];
    if (component.kind !== 'rig' || nodes.length < 2 || !nodes.includes(node))
      throw new Error('Select a joint in a motion group.');
    const id = uniqueId(`rig-${node}`, project.components);
    project.components[id] = {
      ...structuredClone(component),
      label: node,
      data: { ...component.data, nodes: [node] },
    };
    component.data.nodes = nodes.filter((value) => value !== node);
    const clips = new Map<string, string>();
    for (const [source, clip] of Object.entries(project.clips)) {
      if (clip.component !== this.component) continue;
      const target = uniqueId(`${id}-${clip.label}`, project.clips);
      project.clips[target] = { ...structuredClone(clip), component: id };
      clips.set(source, target);
    }
    for (const composition of Object.values(project.compositions)) {
      const source = composition.bindings[this.component];
      if (source)
        composition.bindings[id] = { ...source, clip: clips.get(source.clip)! };
    }
    const clip = clips.get(this.clip) ?? [...clips.values()][0];
    this.replace(project);
    this.component = id;
    this.clip = clip;
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
      ) ||
      Object.values(project.screens ?? {}).some(
        (s) => s.bindings[this.component],
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
  createLookAtClip(label: string) {
    const project = parseKernelProject(this.project);
    if (project.components[this.component].data.nodes?.toString() !== 'head')
      throw new Error('Select the head target first.');
    const id = uniqueId(label, project.clips);
    project.clips[id] = {
      label,
      component: this.component,
      duration: 2,
      looping: true,
      data: { lookAt: defaultLookAt() },
    };
    this.replace(project);
    this.clip = id;
  }
  createClip(label: string, composition?: string) {
    const project = parseKernelProject(this.project);
    const id = uniqueId(label, project.clips);
    const kind = project.components[this.component].kind;
    const data =
      kind === 'face-mesh' || kind === 'attachment'
        ? { keyframes: [identityFrame(0), identityFrame(1)] }
        : kind === 'screen'
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
    if (composition)
      project.compositions[composition].bindings[this.component] = binding(id);
    this.replace(project);
    this.clip = id;
  }
  addEffect(label: string, composition?: string) {
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
    if (composition)
      project.compositions[composition].bindings[id] = binding(clip);
    this.replace(project);
    this.component = id;
    this.clip = clip;
  }
  addScreen(label: string, composition?: string) {
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
    if (composition)
      project.compositions[composition].bindings[id] = binding(clip);
    this.replace(project);
    this.component = id;
    this.clip = clip;
  }
}

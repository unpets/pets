import {
  defaultScreenProject,
  parseScreenProject,
  saveScreenProject,
  updatePalette,
  screenLayers,
  type LayerSettings,
  type ScreenLayer,
  type ScreenPalette,
  type ScreenProject,
} from './screen-project';

export class ScreenEditorState {
  project = $state<ScreenProject>(defaultScreenProject());
  selected = $state<ScreenLayer>('eyes');
  solo = $state<ScreenLayer | null>(null);
  private past = $state<ScreenProject[]>([]);
  private future = $state<ScreenProject[]>([]);
  private group: string | undefined;
  constructor(
    private onchange?: (project: ScreenProject, group?: string) => void,
    private oncommit?: () => void,
    private persist = true,
  ) {}

  get canUndo() {
    return this.past.length > 0;
  }
  get canRedo() {
    return this.future.length > 0;
  }
  get preview(): ScreenProject {
    const project = parseScreenProject(this.project);
    if (this.solo) {
      for (const name of screenLayers)
        project.layers[name].visible = name === this.solo;
    }
    return project;
  }
  load(project: ScreenProject) {
    this.project = parseScreenProject(project);
    this.past = [];
    this.future = [];
    this.endGesture();
  }
  replace(project: ScreenProject, group?: string) {
    const next = parseScreenProject(project);
    if (JSON.stringify(next) === JSON.stringify(this.project)) return;
    if (!group || group !== this.group) {
      this.past = [...this.past.slice(-39), parseScreenProject(this.project)];
    }
    this.group = group;
    this.future = [];
    this.project = next;
    if (this.persist) saveScreenProject(next);
    this.onchange?.(next, group);
  }
  endGesture() {
    this.group = undefined;
    this.oncommit?.();
  }
  changeLayer(update: Partial<LayerSettings>, group?: string) {
    const project = parseScreenProject(this.project);
    project.layers[this.selected] = {
      ...project.layers[this.selected],
      ...update,
    };
    this.replace(project, group);
  }
  changePalette(update: Partial<ScreenPalette>, group?: string) {
    this.replace(
      { ...this.project, palette: updatePalette(this.project.palette, update) },
      group,
    );
  }
  resetLayer() {
    this.changeLayer(defaultScreenProject().layers[this.selected]);
  }
  reset() {
    this.replace(defaultScreenProject());
    this.solo = null;
  }
  undo() {
    const previous = this.past.at(-1);
    if (!previous) return;
    this.future = [...this.future, parseScreenProject(this.project)];
    this.past = this.past.slice(0, -1);
    this.project = previous;
    this.endGesture();
    if (this.persist) saveScreenProject(previous);
    this.onchange?.(previous);
  }
  redo() {
    const next = this.future.at(-1);
    if (!next) return;
    this.past = [...this.past, parseScreenProject(this.project)];
    this.future = this.future.slice(0, -1);
    this.project = next;
    this.endGesture();
    if (this.persist) saveScreenProject(next);
    this.onchange?.(next);
  }
}

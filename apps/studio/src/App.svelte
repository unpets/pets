<script lang="ts">
  import { isFaceComponent } from '@pets/three-runtime/face';
  import PanelResize from './components/PanelResize.svelte';
  import EnvironmentEditor from './components/EnvironmentEditor.svelte';
  import {
    defaultEnvironment,
    parseEnvironment,
  } from '@pets/three-runtime/environment';
  let environment = $state.raw(defaultEnvironment());
  $effect(() => {
    const supplied = assets.environmentAssets;
    if (!supplied) return;
    const previous = untrack(() => environment);
    environment = parseEnvironment({
      ...previous,
      assets: { ...supplied.assets, ...previous.assets },
    });
  });
  onMount(() => {
    try {
      const saved = localStorage.getItem('pets-environment');
      if (saved) environment = parseEnvironment(JSON.parse(saved));
    } catch {}
  });
  $effect(() => {
    studio?.setEnvironment(environment);
    try {
      localStorage.setItem('pets-environment', JSON.stringify(environment));
    } catch {}
  });
  import { version } from '../package.json';
  const buildLabel = `${version}${__PETS_COMMIT_SHA__ ? ` [${__PETS_COMMIT_SHA__}]` : ''}${import.meta.env.DEV ? ' (dev)' : ''}`;
  import ExportProgress from './components/ExportProgress.svelte';
  import {
    PersonaLibrary,
    personaIdentity,
    type PersonaEntry,
  } from './lib/persona-library';
  import CompositionInspector from './components/CompositionInspector.svelte';
  import AnimationBrowser from './components/AnimationBrowser.svelte';
  import PersonaPage from './components/PersonaPage.svelte';
  import ScreenBrowser from './components/ScreenBrowser.svelte';
  import ScreenComposition from './components/ScreenComposition.svelte';
  import FaceBrowser from './components/FaceBrowser.svelte';
  import FaceInspector from './components/FaceInspector.svelte';
  import { download } from './lib/files';
  import { saveProject, type ProjectExport } from './lib/project-export';
  import type { StudioMenu } from './lib/studio-menu';
  import {
    parseStudioProject,
    defaultStudioProject,
    embeddedProject,
    type StudioProject,
  } from './lib/studio-project';
  import { defaultStudioAssets } from './lib/studio-assets';
  import { importAsset, exportAsset } from '@pets/three-runtime/assets';
  import { resolveComposition, binding } from '@pets/three-runtime/project';
  import { coreRequest } from './lib/core';
  import { onMount, untrack } from 'svelte';
  import { AnimationEditorState } from './lib/animation-editor.svelte';
  import AnimationInspector from './components/AnimationInspector.svelte';
  import PixelClipEditor from './components/PixelClipEditor.svelte';
  import {
    loadAnimationProject,
    parseKernelProject,
  } from '@pets/kernel/animation-project';
  import ScreenEditor from '@pets/kernel/components/ScreenEditor.svelte';
  import ScreenPreview from '@pets/kernel/components/ScreenPreview.svelte';
  import { ScreenEditorState } from '@pets/kernel/screen-editor';
  import {
    defaultScreenProject,
    parseScreenProject,
  } from '@pets/kernel/screen-project';
  import StudioHeader from './components/StudioHeader.svelte';
  import ModelViewport from './components/ModelViewport.svelte';
  import AnimationPanel from './components/AnimationPanel.svelte';
  import PlaybackControls from './components/PlaybackControls.svelte';
  import ViewportInspector from './components/ViewportInspector.svelte';
  import { createStudio } from './lib/studio';
  import {
    defaultViewSettings,
    type PlaybackState,
    type StudioController,
    type Workspace,
  } from './lib/types';

  let viewport = $state<HTMLDivElement>();
  let canvas = $state<HTMLCanvasElement>();
  let input = $state<HTMLInputElement>();
  let studio = $state.raw<StudioController>();
  let error = $state('');
  let projectError = $state('');
  let renderTarget = $state<'codex' | 'shimeji'>();
  const templateAssets = defaultStudioAssets();
  let assets = $state.raw(templateAssets);
  let persona = $state({ id: 'kernel', name: 'Kernel' });
  let importBusy = $state(true);
  let library: PersonaLibrary;
  let personas = $state.raw<PersonaEntry[]>([]);
  let activePersona = $state('');
  let initialized = $state(false);
  let storage = $state('Loading personas');
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let revision = 0;

  let disposed = false;
  function snapshot(): StudioProject {
    return {
      environment: $state.snapshot(environment),
      format: 'pets-studio',
      version: 1,
      persona: $state.snapshot(persona),
      assets,
      animations: $state.snapshot(animations.project),
      screen: $state.snapshot(editor.project),
      view: $state.snapshot(settings),
      selection: {
        composition: selectedComposition,
        component: animations.component,
        clip: animations.clip,
        workspace,
        screen: selectedScreen,
      },
    };
  }
  let voxelCount = $state(0);
  let workspace = $state<Workspace>('scene');
  let settings = $state(defaultViewSettings());
  const animations = new AnimationEditorState(false);
  let selectedScreen = $state('');
  let faceKind = $state('eyes');
  const editor = new ScreenEditorState(
    (project, group) => {
      if (selectedScreen)
        animations.updateScreen(selectedScreen, project, group);
    },
    () => animations.endGesture(),
    false,
  );
  const history = animations;
  const screenWorkspace = $derived(
    workspace === 'screen' || workspace === 'components',
  );
  const editingPixels = $derived(
    (workspace === 'animation' || workspace === 'components') &&
      !!animations.project.clips[animations.clip]?.data.frames,
  );
  let playback = $state<PlaybackState>({
    mode: 'running',
    phase: 0,
    playing: false,
    speed: 1,
    seconds: 0,
    duration: 0,
    frames: 121,
    looping: true,
  });

  const selectedComposition = $derived(playback.mode);

  $effect(() =>
    studio?.setSuspended(
      !!renderTarget || importBusy || workspace === 'persona',
    ),
  );
  $effect(() => {
    studio?.setAnimationProject(animations.project);
  });
  $effect(() => {
    studio?.setClipPreview(
      workspace === 'animation' ? animations.component : undefined,
      workspace === 'animation' ? animations.clip : undefined,
    );
  });
  $effect(() => {
    // Track document edits and stable selection values, never the playback clock.
    const values = [
      animations.project,
      assets,
      persona.name,
      persona.id,
      workspace,
      selectedScreen,
      selectedComposition,
      animations.component,
      animations.clip,
      settings.grid,
      settings.wireframe,
      settings.joints,
      settings.orbit,
      settings.travel,
      settings.lighting,
      settings.fov,
    ];
    if (!initialized || importBusy) return;
    void values;
    revision++;
    storage = 'Saving persona';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void persist().catch(reportStorageError), 200);
    return () => clearTimeout(saveTimer);
  });
  function reportStorageError(reason: unknown) {
    storage = 'Changes are not saved locally. Export the persona to keep them.';
    projectError = reason instanceof Error ? reason.message : String(reason);
  }
  async function persist() {
    if (!initialized || !activePersona) return;
    clearTimeout(saveTimer);
    const savedRevision = revision;
    await library.save(activePersona, untrack(snapshot));
    personas = library.list();
    if (revision === savedRevision)
      storage = library.persistent
        ? 'Saved locally in this browser'
        : 'Temporary session. Export personas to keep them.';
  }
  function faceCategory() {
    const component = animations.project.components[animations.component];
    if (component?.kind === 'face-mesh') return 'mesh';
    if (!isFaceComponent(component?.kind ?? '')) return 'eyes';
    const name = String(component.data.family ?? component.data.layer);
    return ['eyes', 'mouth', 'background', 'activity'].includes(name)
      ? name
      : 'custom';
  }
  function setWorkspace(value: Workspace) {
    workspace = value;
    if (value === 'animation' || value === 'composition') {
      if (
        isFaceComponent(
          animations.project.components[animations.component]?.kind ?? '',
        )
      ) {
        animations.component = animations.project.components['rig/head']
          ? 'rig/head'
          : Object.keys(animations.project.components).find(
              (id) => !isFaceComponent(animations.project.components[id].kind),
            )!;
        animations.clip =
          Object.keys(animations.project.clips).find(
            (id) =>
              animations.project.clips[id].component === animations.component,
          ) ?? '';
      }
    }
  }
  async function selectPersona(key: string) {
    if (importBusy || key === activePersona) return;
    importBusy = true;
    try {
      await persist();
      const project = await library.get(key);
      await openProject({
        ...project,
        selection: { ...project.selection, workspace: 'persona' },
      });
      activePersona = key;
      await library.activate(key);
    } catch (reason) {
      reportStorageError(reason);
    } finally {
      importBusy = false;
    }
  }
  async function createPersona(name: string, duplicate: boolean) {
    if (importBusy) return;
    const identity = personaIdentity(name, personas);
    importBusy = true;
    try {
      await persist();
      const project = duplicate
        ? snapshot()
        : { ...defaultStudioProject(), assets: templateAssets };
      project.persona = identity;
      project.selection = { ...project.selection, workspace: 'persona' };
      const key = await library.add(project);
      await openProject(project);
      activePersona = key;
      await library.activate(key);
      personas = library.list();
    } finally {
      importBusy = false;
    }
  }
  async function renamePersona(name: string) {
    const identity = personaIdentity(name, []);
    importBusy = true;
    try {
      persona = { ...persona, name: identity.name };
      await persist();
    } finally {
      importBusy = false;
    }
  }
  async function deletePersona() {
    const next = personas.find((entry) => entry.key !== activePersona);
    if (!next || importBusy) return;
    importBusy = true;
    try {
      const previous = activePersona;
      const project = await library.get(next.key);
      await openProject({
        ...project,
        selection: { ...project.selection, workspace: 'persona' },
      });
      activePersona = next.key;
      await library.activate(next.key);
      await library.remove(previous);
      personas = library.list();
    } finally {
      importBusy = false;
    }
  }

  $effect(() => {
    const screens = animations.project.screens!;
    if (!screens[selectedScreen])
      selectedScreen =
        resolveComposition(animations.project, selectedComposition).screen ??
        Object.keys(screens)[0];
    const settings = parseScreenProject(screens[selectedScreen].data);
    if (JSON.stringify(settings) !== JSON.stringify(editor.project))
      editor.load(settings);
    const visibleLayers =
      editor.project.eyeMode === 'paired'
        ? ['background', 'activity', 'eyes', 'mouth']
        : ['background', 'activity', 'eyeLeft', 'eyeRight', 'mouth'];
    if (!visibleLayers.includes(editor.selected))
      editor.selected =
        editor.project.eyeMode === 'paired' ? 'eyes' : 'eyeLeft';
  });
  $effect(() => {
    const face =
      workspace === 'components' &&
      isFaceComponent(
        animations.project.components[animations.component]?.kind ?? '',
      ) &&
      animations.clip
        ? { [animations.component]: binding(animations.clip) }
        : undefined;
    studio?.setScreenPreview(
      screenWorkspace ? selectedScreen : undefined,
      workspace === 'components'
        ? defaultScreenProject()
        : workspace === 'screen'
          ? editor.preview
          : undefined,
      face,
    );
  });
  $effect(() => {
    studio?.setViewSettings(settings);
  });

  const menus = $derived<StudioMenu[]>([
    {
      id: 'file',
      label: 'File',
      groups: [
        [
          {
            label: 'Import project or asset',
            action: () => input?.click(),
            disabled: importBusy,
          },
          {
            label: 'Save complete project',
            action: () => save('project'),
            disabled: importBusy,
            hint: 'JSON',
          },
        ],
      ],
    },
    {
      id: 'export',
      label: 'Export',
      groups: [
        [
          {
            label: 'Save animations',
            action: () => save('animation'),
            disabled: importBusy,
            hint: 'JSON',
          },
          {
            label: 'Save screen',
            action: () => save('screen'),
            disabled: importBusy,
            hint: 'JSON',
          },
          {
            label: 'Export reusable screen',
            action: () =>
              download(
                `${selectedScreen}.pets-asset.json`,
                JSON.stringify(
                  exportAsset(animations.project, 'screen', selectedScreen),
                ),
              ),
            disabled: importBusy || !selectedScreen,
          },
        ],
        [
          {
            label: 'Export composition',
            action: () => save('composition'),
            disabled: importBusy,
          },
          {
            label: 'Export component',
            action: () => save('component'),
            disabled: importBusy,
          },
          {
            label: 'Export reusable clip',
            action: () => save('clip'),
            disabled: importBusy || !animations.clip,
          },
        ],
        [
          {
            label: 'Export Studio HTML',
            action: () => save('html'),
            disabled: importBusy,
            hint: 'HTML',
          },
          {
            label: 'Export standalone pet',
            action: () => save('pet'),
            disabled: importBusy,
            hint: 'HTML',
          },
        ],
        [
          {
            label: 'Export Codex',
            action: () => (renderTarget = 'codex'),
            disabled: importBusy,
            hint: 'ZIP',
          },
          {
            label: 'Export Shimeji',
            action: () => (renderTarget = 'shimeji'),
            disabled: importBusy,
            hint: 'ZIP',
          },
        ],
      ],
    },
    {
      id: 'assets',
      label: 'Assets',
      groups: [
        [
          {
            label: 'Download 3D model',
            action: downloadModel,
            disabled: importBusy,
            hint: 'GLB',
          },
          {
            label: 'Animation data',
            action: () =>
              download(
                'animations.json',
                JSON.stringify({ ...assets.data, project: animations.project }),
              ),
            disabled: importBusy,
            hint: 'JSON',
          },
        ],
      ],
    },
  ]);
  function save(kind: ProjectExport) {
    try {
      saveProject(snapshot(), kind);
      projectError = '';
    } catch (reason) {
      projectError =
        reason instanceof Error ? reason.message : 'Export failed.';
    }
  }
  function downloadModel() {
    const link = document.createElement('a');
    link.href = assets.characterModel ?? assets.model;
    link.download = `${persona.id}.glb`;
    link.click();
  }
  async function openProject(project: StudioProject) {
    if (project.environment)
      environment = parseEnvironment(project.environment);
    if (!viewport || !canvas) return;
    const sameAssets =
      studio &&
      assets.model === project.assets.model &&
      assets.screens.every(
        (screen, index) => screen === project.assets.screens[index],
      ) &&
      assets.data === project.assets.data;
    const next = sameAssets
      ? studio!
      : await createStudio(
          viewport,
          canvas,
          (state) => (playback = state),
          (count) => (voxelCount = count),
          project.assets,
        );
    if (disposed) {
      next.destroy();
      return;
    }
    try {
      next.setAnimationProject(project.animations);
      next.setViewSettings(project.view);
      next.setMode(project.selection.composition);
    } catch (reason) {
      if (next !== studio) next.destroy();
      throw reason;
    }
    if (next !== studio) studio?.destroy();
    assets = project.assets;
    persona = project.persona;
    animations.load(project.animations);
    selectedScreen =
      project.selection.screen ?? Object.keys(project.animations.screens!)[0];
    editor.load(project.screen);
    editor.solo = null;
    settings = project.view;
    animations.component = project.selection.component;
    animations.clip = project.selection.clip;
    faceKind = faceCategory();
    setWorkspace(project.selection.workspace);
    next.setAnimationProject(project.animations);
    next.setViewSettings(project.view);
    next.setMode(project.selection.composition);
    studio = next;
    window.kernelViewer = next;
  }
  async function importScreen() {
    const file = input?.files?.[0];
    if (!file || importBusy) return;
    importBusy = true;
    try {
      await persist();
      if (file.size > 96_000_000)
        throw new Error('Projects must be under 96 MB.');
      if (file.name.toLowerCase().endsWith('.glb')) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        let binary = '';
        for (let i = 0; i < bytes.length; i += 32768)
          binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
        const project = snapshot();
        project.assets = {
          ...assets,
          model: `data:model/gltf-binary;base64,${btoa(binary)}`,
          characterModel: undefined,
        };
        await openProject(parseStudioProject(project));
      } else {
        const value = JSON.parse(await file.text());
        if (value.format === 'pets-studio') {
          const project = parseStudioProject(value);
          await coreRequest({
            operation: 'project',
            project: project.animations,
          });
          const adding =
            workspace === 'persona' || project.persona.id !== persona.id;
          if (
            adding &&
            personas.some((entry) => entry.id === project.persona.id)
          )
            project.persona = personaIdentity(project.persona.name, personas);
          const key = adding ? await library.add(project) : activePersona;
          await openProject(project);
          activePersona = key;
          await library.activate(key);
          personas = library.list();
        } else if (value.format === 'pets-assets') {
          const result = importAsset(
            $state.snapshot(animations.project),
            value,
          );
          const project = parseKernelProject(result.project);
          await coreRequest({ operation: 'project', project });
          animations.replace(project);
          studio?.setAnimationProject(project);
          if (result.selection.kind === 'screen') {
            selectedScreen = result.selection.id;
            workspace = 'screen';
          } else if (result.selection.kind === 'composition')
            studio?.setMode(result.selection.id);
          else if (result.selection.kind === 'component')
            animations.component = result.selection.id;
          else {
            animations.component = project.clips[result.selection.id].component;
            animations.clip = result.selection.id;
          }
          if (result.selection.kind !== 'screen') {
            const component = project.components[animations.component];
            workspace =
              isFaceComponent(component.kind) &&
              result.selection.kind !== 'composition'
                ? 'components'
                : result.selection.kind === 'composition'
                  ? 'composition'
                  : 'animation';
            if (workspace === 'components') faceKind = faceCategory();
          }
        } else if (value.format === 'pets-animation') {
          const project = parseKernelProject(value);
          await coreRequest({ operation: 'project', project });
          animations.replace(project);
          setWorkspace('composition');
        } else {
          selectedScreen = animations.createScreen(
            file.name.replace(/\.json$/i, ''),
            selectedScreen,
          );
          animations.updateScreen(selectedScreen, parseScreenProject(value));
          editor.solo = null;
          workspace = 'screen';
        }
      }
      projectError = '';
    } catch (reason) {
      projectError =
        reason instanceof Error ? reason.message : 'Invalid project.';
    } finally {
      importBusy = false;
      if (input) input.value = '';
    }
  }
  function shortcut(event: KeyboardEvent) {
    const target = event.target as HTMLElement;
    if (target.closest('input, select, textarea, [contenteditable="true"]'))
      return;
    if (renderTarget || target.closest('[role="menubar"], dialog')) return;
    if (
      workspace !== 'persona' &&
      (event.ctrlKey || event.metaKey) &&
      event.key.toLowerCase() === 'z'
    ) {
      event.preventDefault();
      if (event.shiftKey) history.redo();
      else history.undo();
    } else if (
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      workspace !== 'persona' &&
      event.code === 'Space' &&
      !target.closest('button, a')
    ) {
      event.preventDefault();
      studio?.setPlaying(!playback.playing);
    }
  }
  onMount(() => {
    async function initialize() {
      try {
        try {
          library = await PersonaLibrary.open();
        } catch {
          library = PersonaLibrary.temporary();
        }
        const boot = embeddedProject();
        let project: StudioProject;
        let key = library.active;
        if (boot) {
          key = await library.embedded(boot, location.href);
          project = await library.get(key);
        } else if (key) project = await library.get(key);
        else {
          project = defaultStudioProject();
          project.assets = templateAssets;
          project.animations = loadAnimationProject();
          project.selection.composition = 'running';
          key = await library.add(project);
        }
        await openProject(project);
        if (disposed) return;
        activePersona = key;
        await library.activate(key);
        personas = library.list();
        initialized = true;
      } catch (reason) {
        error = String(reason);
      } finally {
        importBusy = false;
      }
    }
    void initialize();
    const flush = () => {
      if (initialized && !importBusy) void persist().catch(reportStorageError);
    };
    const visibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      flush();
      clearTimeout(saveTimer);
      disposed = true;
      studio?.destroy();
      library?.close();
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', visibility);
      delete window.kernelViewer;
    };
  });
</script>

<svelte:window onkeydown={shortcut} />
{#if renderTarget}<ExportProgress
    project={snapshot()}
    target={renderTarget}
    onclose={() => (renderTarget = undefined)}
  />{/if}
<div class="studio-shell" aria-busy={importBusy}>
  <StudioHeader
    {workspace}
    onworkspace={setWorkspace}
    editor={history}
    {menus}
    personaName={persona.name}
  />
  <input
    bind:this={input}
    type="file"
    accept=".json,.glb,application/json,model/gltf-binary"
    aria-label="Import project file"
    class="hidden"
    onchange={importScreen}
  />
  <main class="studio-main">
    {#if projectError}<div class="project-error" role="alert">
        {projectError}<button class="button" onclick={() => (projectError = '')}
          >Dismiss</button
        >
      </div>{/if}
    {#if workspace === 'persona'}<PersonaPage
        {persona}
        project={animations.project}
        entries={personas}
        active={activePersona}
        busy={importBusy}
        {storage}
        onselect={selectPersona}
        oncreate={createPersona}
        onrename={renamePersona}
        ondelete={deletePersona}
        onimport={() => input?.click()}
        onexport={() => save('project')}
        onworkspace={setWorkspace}
      />{/if}
    <div class="studio-layout" class:workspace-hidden={workspace === 'persona'}>
      <PanelResize side="left" /><PanelResize side="right" />
      {#if workspace === 'screen' || workspace === 'components'}<div
          class="face-library"
        >
          <nav class="face-categories" aria-label="Face library">
            <button
              class:active={workspace === 'screen'}
              onclick={() => setWorkspace('screen')}>Faces</button
            ><button
              class:active={workspace === 'components'}
              onclick={() => setWorkspace('components')}>Components</button
            >
          </nav>
          {#if workspace === 'screen'}<ScreenBrowser
              editor={animations}
              selected={selectedScreen}
              onselect={(id) => (selectedScreen = id)}
            />
          {:else if workspace === 'components'}<FaceBrowser
              editor={animations}
              bind:kind={faceKind}
            />
          {/if}
        </div>
      {:else if workspace === 'animation'}<AnimationBrowser
          editor={animations}
        />
      {:else}<AnimationPanel
          {playback}
          {studio}
          project={animations.project}
          onrename={(label) =>
            animations.updateComposition(playback.mode, { label })}
        />{/if}
      <div class="studio-center">
        <div
          class="studio-stage"
          class:editing-screen={screenWorkspace}
          class:editing-clip={editingPixels}
        >
          <ModelViewport
            bind:viewport
            {studio}
            {error}
            {workspace}
            personaName={persona.name}
          />
          {#if editingPixels}<PixelClipEditor editor={animations} />{/if}
          <ScreenPreview
            bind:canvas
            label={screenWorkspace
              ? animations.project.screens?.[selectedScreen]?.label
              : undefined}
            mode={playback.mode}
            active={screenWorkspace}
            solo={editor.solo}
          />
        </div>
        <PlaybackControls
          {playback}
          {studio}
          label={workspace === 'animation'
            ? animations.project.clips[animations.clip]?.label
            : animations.project.compositions[selectedComposition]?.label}
        />
      </div>
      <aside
        class="studio-inspector"
        aria-label={workspace === 'screen'
          ? 'Screen editor'
          : workspace === 'components'
            ? 'Face component editor'
            : workspace === 'composition'
              ? 'Composition editor'
              : workspace === 'animation'
                ? 'Animation editor'
                : 'Scene settings'}
      >
        {#if workspace === 'composition'}<CompositionInspector
            editor={animations}
            mode={selectedComposition}
            {studio}
            onedit={() => setWorkspace('animation')}
          />
        {:else if workspace === 'animation'}<AnimationInspector
            editor={animations}
          />{:else if workspace === 'components'}<FaceInspector
            editor={animations}
            oncustom={() => (faceKind = faceCategory())}
          />
        {:else if workspace === 'screen'}<ScreenComposition
            editor={animations}
            selected={selectedScreen}
            oncomponents={(component) => {
              animations.component = component;
              animations.clip =
                animations.project.screens![selectedScreen].bindings[component]
                  ?.clip ?? '';
              faceKind = faceCategory();
              workspace = 'components';
            }}
          /><ScreenEditor
            {editor}
            onanimation={() => {
              const id = `screen/${editor.selected}`;
              if (animations.project.components[id]) {
                animations.component = id;
                animations.clip =
                  animations.project.screens![selectedScreen].bindings[id]
                    ?.clip ??
                  Object.keys(animations.project.clips).find(
                    (clip) => animations.project.clips[clip].component === id,
                  ) ??
                  '';
              }
              faceKind = editor.selected.startsWith('eye')
                ? 'eyes'
                : editor.selected;
              workspace = 'components';
            }}
          />{:else}<ViewportInspector
            {settings}
            onchange={(value) => (settings = value)}
            {studio}
          /><EnvironmentEditor
            composition={playback.mode}
            document={environment}
            onchange={(value) => (environment = value)}
          />{/if}
      </aside>
    </div>
  </main>
  <footer class="studio-status">
    <span class="flex items-center gap-2"
      ><span
        class="size-1.5 rounded-full"
        class:bg-accent={!!studio}
        class:bg-muted={!studio}
      ></span>{importBusy
        ? 'Loading project'
        : error
          ? 'Model unavailable'
          : studio
            ? 'Ready'
            : 'Loading model'}</span
    ><span class="hidden sm:inline">{buildLabel}</span><span
      >{voxelCount ? `${voxelCount.toLocaleString()} voxels` : 'Kernel'}</span
    >
  </footer>
</div>

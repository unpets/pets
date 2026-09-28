<script lang="ts">
  import { version } from '../package.json';
  const buildLabel = `${version} [${__PETS_COMMIT_TAG__}]${import.meta.env.DEV ? ' (dev)' : ''}`;
  import ProjectFiles from './components/ProjectFiles.svelte';
  import {
    parseStudioProject,
    embeddedProject,
    type StudioProject,
  } from './lib/studio-project';
  import { defaultStudioAssets } from './lib/studio-assets';
  import { importAsset } from '@pets/three-runtime/assets';
  import { resolveComposition } from '@pets/three-runtime/project';
  import { coreRequest } from './lib/core';
  import { onMount } from 'svelte';
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
    loadScreenProject,
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
  let studio = $state<StudioController>();
  let error = $state('');
  let projectError = $state('');
  let filesOpen = $state(false);
  let assets = $state.raw(defaultStudioAssets());
  let persona = $state({ id: 'kernel', name: 'Kernel' });
  let importBusy = $state(false);
  let disposed = false;
  function snapshot(): StudioProject {
    return {
      format: 'pets-studio',
      version: 1,
      persona: $state.snapshot(persona),
      assets,
      animations: $state.snapshot(animations.project),
      screen: $state.snapshot(editor.project),
      view: $state.snapshot(settings),
      selection: {
        composition: playback.mode,
        component: animations.component,
        clip: animations.clip,
        workspace,
      },
    };
  }
  let voxelCount = $state(0);
  let workspace = $state<Workspace>('scene');
  let settings = $state(defaultViewSettings());
  const editor = new ScreenEditorState();
  const animations = new AnimationEditorState();
  const history = $derived(workspace === 'animation' ? animations : editor);
  const editingPixels = $derived(
    workspace === 'animation' &&
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

  $effect(() => studio?.setSuspended(filesOpen || importBusy));
  $effect(() => {
    studio?.setAnimationProject(animations.project);
  });
  $effect(() => {
    studio?.setScreenProject(editor.preview);
  });
  $effect(() => {
    studio?.setViewSettings(settings);
  });

  function exportScreen() {
    filesOpen = true;
  }
  async function openProject(project: StudioProject) {
    if (!viewport || !canvas) return;
    const next = await createStudio(
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
      next.setScreenProject(project.screen);
      next.setViewSettings(project.view);
      next.setMode(project.selection.composition);
    } catch (reason) {
      next.destroy();
      throw reason;
    }
    studio?.destroy();
    assets = project.assets;
    persona = project.persona;
    animations.load(project.animations);
    editor.load(project.screen);
    editor.solo = null;
    settings = project.view;
    animations.component = project.selection.component;
    animations.clip = project.selection.clip;
    workspace = project.selection.workspace;
    next.setAnimationProject(project.animations);
    next.setScreenProject(project.screen);
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
          await openProject(project);
        } else if (value.format === 'pets-assets') {
          const result = importAsset(
            $state.snapshot(animations.project),
            value,
          );
          const project = parseKernelProject(result.project);
          await coreRequest({ operation: 'project', project });
          animations.replace(project);
          studio?.setAnimationProject(project);
          if (result.selection.kind === 'composition')
            studio?.setMode(result.selection.id);
          else if (result.selection.kind === 'component')
            animations.component = result.selection.id;
          else {
            animations.component = project.clips[result.selection.id].component;
            animations.clip = result.selection.id;
          }
          workspace = 'animation';
        } else if (value.format === 'pets-animation') {
          const project = parseKernelProject(value);
          await coreRequest({ operation: 'project', project });
          animations.replace(project);
          workspace = 'animation';
        } else {
          editor.replace(parseScreenProject(value));
          editor.solo = null;
          workspace = 'screen';
        }
      }
      filesOpen = false;
      projectError = '';
    } catch (reason) {
      projectError =
        reason instanceof Error ? reason.message : 'Invalid project.';
      filesOpen = false;
    } finally {
      importBusy = false;
      if (input) input.value = '';
    }
  }
  function shortcut(event: KeyboardEvent) {
    const target = event.target as HTMLElement;
    if (target.closest('input, select, textarea, [contenteditable="true"]'))
      return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) history.redo();
      else history.undo();
    } else if (
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      event.code === 'Space' &&
      !target.closest('button, a')
    ) {
      event.preventDefault();
      studio?.setPlaying(!playback.playing);
    }
  }
  onMount(() => {
    editor.load(loadScreenProject());
    animations.load(loadAnimationProject());
    if (!viewport || !canvas) return;
    try {
      const boot = embeddedProject();
      if (boot) {
        void openProject(boot).catch((reason) => (error = String(reason)));
        return () => {
          disposed = true;
          studio?.destroy();
          delete window.kernelViewer;
        };
      }
    } catch (reason) {
      error = String(reason);
      return;
    }
    createStudio(
      viewport,
      canvas,
      (state) => (playback = state),
      (count) => (voxelCount = count),
    )
      .then((controller) => {
        if (disposed) {
          controller.destroy();
          return;
        }
        studio = controller;
        window.kernelViewer = controller;
      })
      .catch(() => {
        error = 'The model could not load. Reload the page to retry.';
      });
    return () => {
      disposed = true;
      studio?.destroy();
      delete window.kernelViewer;
    };
  });
</script>

<svelte:window onkeydown={shortcut} />
{#if filesOpen}<ProjectFiles
    project={snapshot()}
    onimport={() => input?.click()}
    onclose={() => (filesOpen = false)}
  />{/if}
<div class="studio-shell" aria-busy={importBusy}>
  <StudioHeader
    {workspace}
    busy={importBusy}
    onworkspace={(value) => (workspace = value)}
    editor={history}
    onimport={() => input?.click()}
    onexport={exportScreen}
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
  <main class="studio-layout">
    <AnimationPanel
      {playback}
      {studio}
      project={animations.project}
      {assets}
      {persona}
    />
    <div class="studio-center">
      {#if projectError}<div
          class="border-b border-red-300/20 bg-red-300/5 px-4 py-3 text-xs text-red-200"
          role="alert"
        >
          {projectError}<button
            class="float-right underline"
            onclick={() => (projectError = '')}>Dismiss</button
          >
        </div>{/if}
      <div
        class="studio-stage"
        class:editing-screen={workspace === 'screen'}
        class:editing-clip={editingPixels}
      >
        <ModelViewport bind:viewport {studio} {error} {workspace} />
        {#if editingPixels}<PixelClipEditor editor={animations} />{/if}
        <ScreenPreview
          bind:canvas
          mode={playback.mode}
          active={workspace === 'screen'}
          solo={editor.solo}
        />
      </div>
      <PlaybackControls {playback} {studio} />
    </div>
    <aside
      class="studio-inspector"
      aria-label={workspace === 'screen' ? 'Screen editor' : 'Scene settings'}
    >
      {#if workspace === 'animation'}<AnimationInspector
          editor={animations}
          mode={playback.mode}
          {studio}
        />{:else if workspace === 'screen'}<ScreenEditor
          {editor}
          onanimation={() => {
            const id = `screen/${editor.selected}`;
            if (animations.project.components[id]) {
              animations.component = id;
              animations.clip =
                resolveComposition(animations.project, playback.mode).bindings[
                  id
                ]?.clip ??
                Object.keys(animations.project.clips).find(
                  (clip) => animations.project.clips[clip].component === id,
                ) ??
                '';
            }
            workspace = 'animation';
          }}
        />{:else}<ViewportInspector
          {settings}
          onchange={(value) => (settings = value)}
          {studio}
          mode={playback.mode}
        />{/if}
    </aside>
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

<script lang="ts">
  import { onMount } from 'svelte';
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
  let voxelCount = $state(0);
  let workspace = $state<Workspace>('scene');
  let settings = $state(defaultViewSettings());
  const editor = new ScreenEditorState();
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

  $effect(() => {
    studio?.setScreenProject(editor.preview);
  });
  $effect(() => {
    studio?.setViewSettings(settings);
  });

  function exportScreen() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(editor.project, null, 2) + '\n'], {
        type: 'application/json',
      }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'kernel-screen.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function importScreen() {
    const file = input?.files?.[0];
    if (!file) return;
    try {
      if (file.size > 65536)
        throw new Error('Screen projects must be under 64 KB.');
      editor.replace(parseScreenProject(JSON.parse(await file.text())));
      editor.solo = null;
      workspace = 'screen';
      projectError = '';
    } catch (reason) {
      projectError =
        reason instanceof Error ? reason.message : 'Invalid screen project.';
    }
    if (input) input.value = '';
  }
  function shortcut(event: KeyboardEvent) {
    const target = event.target as HTMLElement;
    if (target.closest('input, select, textarea, [contenteditable="true"]'))
      return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) editor.redo();
      else editor.undo();
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
    if (!viewport || !canvas) return;
    let disposed = false;
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
<div class="studio-shell">
  <StudioHeader
    {workspace}
    onworkspace={(value) => (workspace = value)}
    {editor}
    onimport={() => input?.click()}
    onexport={exportScreen}
  />
  <input
    bind:this={input}
    type="file"
    accept=".json,application/json"
    aria-label="Import screen project file"
    class="hidden"
    onchange={importScreen}
  />
  <main class="studio-layout">
    <AnimationPanel {playback} {studio} />
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
      <div class="studio-stage" class:editing-screen={workspace === 'screen'}>
        <ModelViewport bind:viewport {studio} {error} {workspace} />
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
      {#if workspace === 'screen'}<ScreenEditor
          {editor}
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
      ></span>{error
        ? 'Model unavailable'
        : studio
          ? 'Ready'
          : 'Loading model'}</span
    ><span class="hidden sm:inline"
      >{workspace === 'screen'
        ? 'Screen changes preview live on the model'
        : 'Space to play or pause'}</span
    ><span
      >{voxelCount ? `${voxelCount.toLocaleString()} voxels` : 'Kernel'}</span
    >
  </footer>
</div>

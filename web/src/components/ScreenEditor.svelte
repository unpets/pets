<script lang="ts">
  import { onMount } from 'svelte';
  import ScreenPalette from './ScreenPalette.svelte';
  import { Download, Upload, RotateCcw, Layers } from '@lucide/svelte';
  import { animationModes, type StudioController } from '../lib/types';
  import {
    defaultScreenProject,
    loadScreenProject,
    parseScreenProject,
    saveScreenProject,
    screenLayers,
    updatePalette,
    type ScreenProject,
  } from '../lib/screen-project';
  let { studio }: { studio?: StudioController } = $props();
  let project = $state<ScreenProject>(defaultScreenProject());
  let selected = $state<(typeof screenLayers)[number]>('eyes');
  let error = $state('');
  let input: HTMLInputElement;
  let undo: ScreenProject[] = [];
  onMount(() => {
    project = loadScreenProject();
  });
  $effect(() => {
    studio?.setScreenProject($state.snapshot(project));
  });
  function checkpoint() {
    undo.push(parseScreenProject($state.snapshot(project)));
    undo = undo.slice(-40);
  }
  function change(update: Partial<ScreenProject['layers']['eyes']>) {
    checkpoint();
    project.layers[selected] = { ...project.layers[selected], ...update };
    saveScreenProject($state.snapshot(project));
  }
  function download() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify($state.snapshot(project), null, 2) + '\n'], {
        type: 'application/json',
      }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'kernel-screen.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function importProject() {
    const file = input.files?.[0];
    if (!file) return;
    try {
      if (file.size > 65536)
        throw new Error('Screen projects must be under 64 KB.');
      project = parseScreenProject(JSON.parse(await file.text()));
      saveScreenProject($state.snapshot(project));
      error = '';
    } catch (reason) {
      error = reason instanceof Error ? reason.message : 'Invalid project.';
    }
    input.value = '';
  }
</script>

<section
  class="border-t border-line bg-panel px-[4vw] py-7"
  aria-label="Screen editor"
>
  <div class="mb-5 flex flex-wrap items-center justify-between gap-4">
    <div>
      <h2 class="flex items-center gap-2 text-sm font-semibold">
        <Layers size={16} />Screen editor
      </h2>
      <p class="mt-1 text-xs text-muted">
        Four independent layers. Changes appear on the model as you edit.
      </p>
    </div>
    <div class="flex gap-3 text-xs">
      <button
        class="flex items-center gap-1"
        onclick={() => {
          const previous = undo.pop();
          if (previous) {
            project = previous;
            saveScreenProject(project);
          }
        }}><RotateCcw size={14} />Undo</button
      >
      <button
        onclick={() => {
          checkpoint();
          project = defaultScreenProject();
          saveScreenProject(project);
        }}>Reset</button
      >
      <button class="flex items-center gap-1" onclick={() => input.click()}
        ><Upload size={14} />Import</button
      >
      <button class="flex items-center gap-1" onclick={download}
        ><Download size={14} />Export project</button
      >
      <input
        bind:this={input}
        type="file"
        accept=".json,application/json"
        class="hidden"
        onchange={importProject}
      />
    </div>
  </div>
  <ScreenPalette
    palette={project.palette}
    onchange={(update) => {
      checkpoint();
      project.palette = updatePalette(project.palette, update);
      saveScreenProject($state.snapshot(project));
    }}
  />
  <div class="grid gap-5 md:grid-cols-[200px_1fr]">
    <div
      class="grid grid-cols-2 gap-2 md:grid-cols-1"
      role="group"
      aria-label="Screen layers"
    >
      {#each screenLayers as name}<button
          aria-pressed={selected === name}
          class="rounded-lg border px-3 py-2 text-left text-xs capitalize {selected ===
          name
            ? 'border-accent bg-accent/10 text-accent'
            : 'border-line text-muted'}"
          onclick={() => {
            selected = name;
          }}
          >{name}<span class="float-right"
            >{project.layers[name].visible ? 'Visible' : 'Hidden'}</span
          ></button
        >{/each}
    </div>
    <div class="grid content-start gap-4 text-xs sm:grid-cols-3">
      <label class="flex items-center gap-2"
        ><input
          aria-label="Layer visible"
          type="checkbox"
          checked={project.layers[selected].visible}
          onchange={(event) => change({ visible: event.currentTarget.checked })}
        />Visible</label
      >
      {#if selected === 'eyes' || selected === 'mouth'}
        <label class="flex items-center gap-2"
          >Color<input
            aria-label="Layer color"
            type="color"
            value={project.layers[selected].color ?? '#4feff3'}
            oninput={(event) => change({ color: event.currentTarget.value })}
          /><button onclick={() => change({ color: null })}>Original</button
          ></label
        >
      {/if}
      <label class="grid gap-2"
        >Expression<select
          aria-label="Layer expression"
          class="rounded border border-line bg-surface p-2"
          value={project.layers[selected].source ?? ''}
          onchange={(event) =>
            change({
              source:
                event.currentTarget.value === ''
                  ? null
                  : Number(event.currentTarget.value),
            })}
          ><option value="">Follow animation</option
          >{#each Object.values(animationModes) as mode, index}<option
              value={index}>{mode.label}</option
            >{/each}</select
        ></label
      >
      <label class="grid gap-2"
        >Opacity<input
          aria-label="Layer opacity"
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={project.layers[selected].opacity}
          oninput={(event) =>
            change({ opacity: Number(event.currentTarget.value) })}
        /></label
      >
      <label class="grid gap-2"
        >Horizontal offset<input
          aria-label="Layer horizontal offset"
          type="range"
          min="-48"
          max="48"
          value={project.layers[selected].x}
          oninput={(event) => change({ x: Number(event.currentTarget.value) })}
        /></label
      >
      <label class="grid gap-2"
        >Vertical offset<input
          aria-label="Layer vertical offset"
          type="range"
          min="-32"
          max="32"
          value={project.layers[selected].y}
          oninput={(event) => change({ y: Number(event.currentTarget.value) })}
        /></label
      >
    </div>
  </div>
  {#if error}<p class="mt-3 text-sm text-red-300" role="alert">{error}</p>{/if}
</section>

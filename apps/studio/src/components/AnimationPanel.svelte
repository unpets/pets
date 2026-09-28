<script lang="ts">
  import {
    Activity,
    ArrowRight,
    Hand,
    ArrowUp,
    TriangleAlert,
    Clock,
    Terminal,
    ScanEye,
    Compass,
    Download,
    ChevronRight,
    Box,
  } from '@lucide/svelte';
  import { compositionTree } from '@pets/three-runtime/project';
  import { download } from '../lib/files';
  import type { AnimationProject } from '@pets/three-runtime/project';
  import type { CharacterAssets } from '@pets/kernel/assets';
  import { type PlaybackState, type StudioController } from '../lib/types';
  let {
    playback,
    studio,
    project,
    assets,
    persona,
  }: {
    playback: PlaybackState;
    studio?: StudioController;
    project: AnimationProject;
    assets: CharacterAssets;
    persona: { id: string; name: string };
  } = $props();
  const icons: Record<string, typeof Activity> = {
    idle: Activity,
    move: ArrowRight,
    waving: Hand,
    jumping: ArrowUp,
    failed: TriangleAlert,
    waiting: Clock,
    running: Terminal,
    review: ScanEye,
    look: Compass,
  };
  const modes = $derived(compositionTree(project));
</script>

<aside class="animation-browser" aria-label="Animation browser">
  <div class="border-b border-line p-4">
    <div class="mb-3 flex items-center justify-between">
      <span class="eyebrow">PERSONA</span><span class="badge">3D</span>
    </div>
    <div
      class="flex items-center gap-2.5 rounded-md border border-line bg-surface px-3 py-2.5"
    >
      <Box size={17} class="text-accent" /><span class="text-xs font-medium"
        >{persona.name}</span
      >
    </div>
  </div>
  <div class="flex items-center justify-between px-4 pt-5 pb-3">
    <h2 class="eyebrow">COMPOSITIONS</h2>
    <span class="text-[10px] text-muted">{modes.length}</span>
  </div>
  <div class="clip-list" role="group" aria-label="Animation mode">
    {#each modes as { id, depth }, index}
      {@const mode = project.compositions[id]}
      {@const Icon = icons[id] ?? Activity}
      <button
        class="clip-button"
        style:padding-left={`${12 + depth * 14}px`}
        title={mode.parent
          ? `Inherits ${project.compositions[mode.parent].label}`
          : 'Root composition'}
        data-state={id}
        data-selected={playback.mode === id}
        aria-pressed={playback.mode === id}
        disabled={!studio}
        onclick={() => studio?.setMode(id)}
      >
        <Icon size={15} /><span class="min-w-0 flex-1 text-left"
          >{mode.label}</span
        >
        {#if playback.mode === id}<ChevronRight size={13} />{:else}<span
            class="text-[10px] tabular-nums opacity-40"
            >{String(index + 1).padStart(2, '0')}</span
          >{/if}
      </button>
    {/each}
  </div>
  <div class="mt-auto border-t border-line p-4">
    <h2 class="eyebrow mb-3">SOURCE ASSETS</h2>
    <a
      class="asset-link"
      href={assets.characterModel ?? assets.model}
      download={`${persona.id}.glb`}
      aria-label="Download 3D model"
      ><Download size={13} />Download 3D model<span class="ml-auto text-[9px]"
        >GLB</span
      ></a
    >
    <a
      class="asset-link mt-3"
      href="#animation-data"
      onclick={(event) => {
        event.preventDefault();
        download(
          'animations.json',
          JSON.stringify({ ...assets.data, project }),
        );
      }}
      download="animations.json"
      aria-label="Animation data"
      ><Download size={13} />Animation data<span class="ml-auto text-[9px]"
        >JSON</span
      ></a
    >
  </div>
</aside>

<script lang="ts">
  import {
    Activity,
    ArrowRight,
    ArrowLeft,
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
  import { downloads } from '@pets/kernel/assets';
  import {
    animationModes,
    type AnimationMode,
    type PlaybackState,
    type StudioController,
  } from '../lib/types';
  let {
    playback,
    studio,
  }: { playback: PlaybackState; studio?: StudioController } = $props();
  const icons = {
    idle: Activity,
    'running-right': ArrowRight,
    'running-left': ArrowLeft,
    waving: Hand,
    jumping: ArrowUp,
    failed: TriangleAlert,
    waiting: Clock,
    running: Terminal,
    review: ScanEye,
    look: Compass,
  };
  const modes = Object.entries(animationModes) as [
    AnimationMode,
    (typeof animationModes)[AnimationMode],
  ][];
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
        >Kernel</span
      ><span class="ml-auto text-[9px] text-muted">DEFAULT</span>
    </div>
  </div>
  <div class="flex items-center justify-between px-4 pt-5 pb-3">
    <h2 class="eyebrow">ANIMATION CLIPS</h2>
    <span class="text-[10px] text-muted">10</span>
  </div>
  <div class="clip-list" role="group" aria-label="Animation mode">
    {#each modes as [id, mode], index}
      {@const Icon = icons[id]}
      <button
        class="clip-button"
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
      href={downloads.model}
      download="kernel.glb"
      aria-label="Download 3D model"
      ><Download size={13} />Download 3D model<span class="ml-auto text-[9px]"
        >GLB</span
      ></a
    >
    <a
      class="asset-link mt-3"
      href={downloads.animations}
      download="animations.json"
      aria-label="Animation data"
      ><Download size={13} />Animation data<span class="ml-auto text-[9px]"
        >JSON</span
      ></a
    >
  </div>
</aside>

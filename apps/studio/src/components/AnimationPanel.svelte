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
    ChevronRight,
  } from '@lucide/svelte';
  import { compositionTree } from '@pets/three-runtime/project';
  import type { AnimationProject } from '@pets/three-runtime/project';
  import { type PlaybackState, type StudioController } from '../lib/types';
  let {
    playback,
    studio,
    project,
  }: {
    playback: PlaybackState;
    studio?: StudioController;
    project: AnimationProject;
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

<aside class="animation-browser" aria-label="Compositions library">
  <div class="flex items-center justify-between px-4 pt-5 pb-3">
    <h2 class="eyebrow">COMPOSITIONS</h2>
    <span class="text-[10px] text-muted">{modes.length}</span>
  </div>
  <div class="clip-list" role="group" aria-label="Composition">
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
</aside>

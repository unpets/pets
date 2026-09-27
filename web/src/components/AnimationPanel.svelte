<script lang="ts">
  import Activity from '@lucide/svelte/icons/activity';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import Hand from '@lucide/svelte/icons/hand';
  import ArrowUp from '@lucide/svelte/icons/arrow-up';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import Clock from '@lucide/svelte/icons/clock';
  import Terminal from '@lucide/svelte/icons/terminal';
  import ScanEye from '@lucide/svelte/icons/scan-eye';
  import Compass from '@lucide/svelte/icons/compass';
  import PlaybackControls from './PlaybackControls.svelte';
  import ScreenPreview from './ScreenPreview.svelte';
  import {
    animationModes,
    type AnimationMode,
    type PlaybackState,
    type StudioController,
  } from '../lib/types';

  let {
    canvas = $bindable(),
    playback,
    studio,
  }: {
    canvas?: HTMLCanvasElement;
    playback: PlaybackState;
    studio?: StudioController;
  } = $props();
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

<aside class="border-t border-line bg-panel p-6 lg:border-t-0 lg:border-l">
  <div class="mb-5 flex items-center justify-between">
    <span class="eyebrow">ANIMATION</span><span class="text-[11px] text-muted"
      >10 modes</span
    >
  </div>
  <div class="grid grid-cols-2 gap-2" role="group" aria-label="Animation mode">
    {#each modes as [id, mode]}
      {@const Icon = icons[id]}
      <button
        class="button justify-start py-3 text-xs data-[selected=true]:border-[#509a9f] data-[selected=true]:bg-[#253d45] data-[selected=true]:text-accent"
        data-state={id}
        data-selected={playback.mode === id}
        aria-pressed={playback.mode === id}
        disabled={!studio}
        onclick={() => studio?.setMode(id)}
      >
        <Icon size={14} />{mode.label}
      </button>
    {/each}
  </div>
  <PlaybackControls {playback} {studio} />
  <ScreenPreview bind:canvas mode={playback.mode} />
</aside>

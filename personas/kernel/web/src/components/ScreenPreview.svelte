<script lang="ts">
  import { Monitor, Grid2x2, Crosshair } from '@lucide/svelte';
  import { animationModes, type AnimationMode } from '../types';
  import type { ScreenLayer } from '../screen-project';
  let {
    canvas = $bindable(),
    mode,
    active,
    solo,
  }: {
    canvas?: HTMLCanvasElement;
    mode: AnimationMode;
    active: boolean;
    solo: ScreenLayer | null;
  } = $props();
  let zoom = $state('fit');
  let grid = $state(false);
  let guides = $state(true);
  let width = $state(0);
  let height = $state(0);
  const scale = $derived(
    zoom === 'fit'
      ? Math.max(
          1,
          Math.min(
            8,
            Math.floor(Math.min((width - 48) / 96, (height - 48) / 64)),
          ),
        )
      : Number(zoom),
  );
</script>

<section class="screen-workspace" class:active aria-label="Screen canvas">
  <div
    class="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3"
  >
    <h2 class="eyebrow flex items-center gap-2">
      <Monitor size={14} />DISPLAY CANVAS
      <span class="hidden tracking-normal normal-case opacity-60 sm:inline"
        >96 × 64</span
      >
    </h2>
    <div class="flex items-center gap-1">
      <button
        class="icon-button"
        class:selected={grid}
        aria-label="Pixel grid"
        aria-pressed={grid}
        onclick={() => (grid = !grid)}><Grid2x2 size={14} /></button
      >
      <button
        class="icon-button"
        class:selected={guides}
        aria-label="Center guides"
        aria-pressed={guides}
        onclick={() => (guides = !guides)}><Crosshair size={14} /></button
      >
      <select
        class="field compact ml-2"
        aria-label="Screen zoom"
        bind:value={zoom}
        ><option value="fit">Fit</option
        >{#each [1, 2, 3, 4, 6, 8] as value}<option {value}>{value}×</option
          >{/each}</select
      >
    </div>
  </div>
  <div
    class="screen-canvas-stage"
    bind:clientWidth={width}
    bind:clientHeight={height}
  >
    <div
      class="screen-canvas-frame"
      style:width={`${96 * scale}px`}
      style:height={`${64 * scale}px`}
    >
      <canvas
        bind:this={canvas}
        id="screen"
        width="96"
        height="64"
        class="block size-full [image-rendering:pixelated]"
        aria-label={`${animationModes[mode]?.label ?? mode} display`}
      ></canvas>
      {#if grid}<div
          class="pixel-grid"
          style:background-size={`${scale}px ${scale}px`}
        ></div>{/if}
      {#if guides}<div class="screen-guides"></div>{/if}
    </div>
  </div>
  <div
    class="flex items-center justify-between px-4 py-2 text-[10px] text-muted"
  >
    <span
      >{solo ? `Solo preview: ${solo}` : 'Composite preview'}
      <span class="mx-1 text-line">/</span>
      {animationModes[mode]?.label ?? mode}</span
    ><span>{scale * 100}%</span>
  </div>
</section>

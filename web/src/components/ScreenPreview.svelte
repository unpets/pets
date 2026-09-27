<script lang="ts">
  import Terminal from '@lucide/svelte/icons/terminal';
  import Download from '@lucide/svelte/icons/download';
  import { animationModes, type AnimationMode } from '../lib/types';
  let {
    canvas = $bindable(),
    mode,
  }: { canvas?: HTMLCanvasElement; mode: AnimationMode } = $props();
</script>

<div class="mt-7 mb-3 flex items-center justify-between">
  <span class="eyebrow flex items-center gap-2"
    ><Terminal size={13} />LIVE DISPLAY</span
  >
  <span class="text-[9px] tracking-wider text-[#70c6ab]">CONNECTED</span>
</div>
<canvas
  bind:this={canvas}
  id="screen"
  width="96"
  height="64"
  class="w-full max-w-[280px] rounded border border-line bg-[#07151d] [image-rendering:pixelated]"
  aria-label={`${animationModes[mode].label} display`}
></canvas>
<p class="mt-3 min-h-12 text-xs leading-7 text-muted">
  {animationModes[mode].description}
</p>
<div
  class="mt-5 flex flex-col gap-3 border-t border-line pt-5 text-xs text-[#a4bbc9]"
>
  <a
    class="flex items-center gap-2 hover:text-accent"
    href="assets/kernel.glb"
    download><Download size={13} />Download 3D model</a
  >
  <a
    class="flex items-center gap-2 hover:text-accent"
    href="assets/animations.json"
    download><Download size={13} />Animation data</a
  >
</div>

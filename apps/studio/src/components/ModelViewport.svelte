<script lang="ts">
  import { Move3d, RotateCcw, Box } from '@lucide/svelte';
  import type { StudioController, Workspace } from '../lib/types';
  let {
    viewport = $bindable(),
    studio,
    error,
    workspace,
    personaName,
  }: {
    viewport?: HTMLDivElement;
    studio?: StudioController;
    error: string;
    workspace: Workspace;
    personaName: string;
  } = $props();
</script>

<section class="model-panel" aria-label="Interactive 3D model">
  <div class="viewport-label">
    <Box size={13} /><span
      >{workspace === 'screen' ? 'MODEL PREVIEW' : '3D VIEWPORT'}</span
    ><span class="ml-2 text-muted/60">{personaName}</span>
  </div>
  <div
    bind:this={viewport}
    id="viewport"
    class="absolute inset-0"
    aria-label="Drag to rotate the model. Scroll or pinch to zoom."
  ></div>
  {#if !studio}<div
      class="absolute top-1/2 w-full text-center text-sm text-accent"
      role={error ? 'alert' : 'status'}
    >
      {error || `Loading ${personaName}…`}
    </div>{/if}
  <div
    class="pointer-events-none absolute inset-x-4 bottom-4 flex items-center justify-between text-[10px] text-muted"
  >
    <span class="flex items-center gap-1.5"
      ><Move3d size={13} />Orbit · pan · zoom</span
    >
    <button
      class="icon-button pointer-events-auto bg-panel/80"
      aria-label="Reset view"
      title="Reset view"
      disabled={!studio}
      onclick={() => studio?.setCamera('home')}><RotateCcw size={14} /></button
    >
  </div>
</section>

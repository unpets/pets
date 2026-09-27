<script lang="ts">
  import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
  import Move3d from '@lucide/svelte/icons/move-3d';
  import type { CameraView, StudioController } from '../lib/types';

  let {
    viewport = $bindable(),
    studio,
    error,
  }: {
    viewport?: HTMLDivElement;
    studio?: StudioController;
    error: string;
  } = $props();
  let wireframe = $state(false);
  let joints = $state(false);
  const views: { id: CameraView; label: string }[] = [
    { id: 'home', label: 'Reset view' },
    { id: 'front', label: 'Front' },
    { id: 'side', label: 'Side' },
    { id: 'back', label: 'Back' },
  ];
</script>

<section
  class="relative min-h-[485px] overflow-hidden bg-[radial-gradient(ellipse_at_49%_45%,#293a4a_0%,#15202b_49%,#10171f_79%)] sm:min-h-[560px] lg:min-h-[760px]"
  aria-label="Interactive 3D model"
>
  <div
    bind:this={viewport}
    id="viewport"
    class="absolute inset-0"
    aria-label="Drag to rotate the model. Scroll or pinch to zoom."
  ></div>
  <div class="pointer-events-none absolute top-7 left-[4vw]">
    <span class="eyebrow">YOUR WORKSPACE COMPANION</span>
    <h1
      class="mt-3 text-xl leading-tight font-normal tracking-tight text-ink sm:text-4xl"
    >
      Small robot.<br class="hidden sm:block" /> Real character.
    </h1>
  </div>
  {#if !studio}
    <div
      class="absolute top-1/2 w-full text-center text-accent"
      role={error ? 'alert' : 'status'}
    >
      {error || 'Building the view…'}
    </div>
  {/if}
  <div
    class="absolute right-0 bottom-[72px] left-0 flex justify-center gap-2"
    aria-label="Camera controls"
  >
    {#each views as view}
      <button
        class="button bg-panel/90 text-xs backdrop-blur"
        data-view={view.id}
        onclick={() => studio?.setCamera(view.id)}
        disabled={!studio}
      >
        {#if view.id === 'home'}<RotateCcw size={13} />{/if}{view.label}
      </button>
    {/each}
  </div>
  <div
    class="absolute right-4 bottom-5 left-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[11px] text-muted"
  >
    <span
      class="flex basis-full items-center justify-center gap-1.5 sm:basis-auto"
      ><Move3d size={13} />Drag to orbit · scroll to zoom</span
    >
    <label class="flex items-center gap-1.5"
      ><input
        id="wireframe"
        type="checkbox"
        bind:checked={wireframe}
        onchange={() => studio?.setWireframe(wireframe)}
      />Wireframe</label
    >
    <label class="flex items-center gap-1.5"
      ><input
        id="joints"
        type="checkbox"
        bind:checked={joints}
        onchange={() => studio?.setJoints(joints)}
      />Joints</label
    >
  </div>
</section>

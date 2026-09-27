<script lang="ts">
  import { onMount } from 'svelte';
  import ScreenEditor from './components/ScreenEditor.svelte';
  import StudioHeader from './components/StudioHeader.svelte';
  import ModelViewport from './components/ModelViewport.svelte';
  import AnimationPanel from './components/AnimationPanel.svelte';
  import { createStudio } from './lib/studio';
  import type { PlaybackState, StudioController } from './lib/types';

  let viewport = $state<HTMLDivElement>();
  let canvas = $state<HTMLCanvasElement>();
  let studio = $state<StudioController>();
  let error = $state('');
  let voxelCount = $state(0);
  let playback = $state<PlaybackState>({
    mode: 'running',
    phase: 0,
    playing: false,
    speed: 1,
    seconds: 0,
  });

  onMount(() => {
    if (!viewport || !canvas) return;
    let disposed = false;
    createStudio(
      viewport,
      canvas,
      (state) => {
        playback = state;
      },
      (count) => {
        voxelCount = count;
      },
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

<StudioHeader />
<main class="grid lg:grid-cols-[minmax(0,1fr)_320px]">
  <ModelViewport bind:viewport {studio} {error} />
  <AnimationPanel bind:canvas {playback} {studio} />
</main>
<ScreenEditor {studio} />
<footer
  class="flex flex-wrap justify-between gap-4 border-t border-line px-[4vw] py-5 text-[10px] tracking-wide text-muted"
>
  <span>Kernel · a little presence, always in motion</span>
  <span
    >{voxelCount
      ? `${voxelCount.toLocaleString()} source voxels · 35 mm grid`
      : 'Fine voxel geometry'}</span
  >
</footer>

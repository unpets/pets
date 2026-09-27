<script lang="ts">
  import Play from '@lucide/svelte/icons/play';
  import Pause from '@lucide/svelte/icons/pause';
  import {
    animationModes,
    type PlaybackState,
    type StudioController,
  } from '../lib/types';
  let {
    playback,
    studio,
  }: { playback: PlaybackState; studio?: StudioController } = $props();
</script>

<div class="mt-6 flex items-center justify-between gap-3">
  <button
    id="play"
    class="button min-w-24 border-[#c0d7df] bg-[#c0d7df] text-[#192c37] hover:bg-[#e3edf2]"
    onclick={() => studio?.setPlaying(!playback.playing)}
    disabled={!studio}
    aria-label={playback.playing ? 'Pause animation' : 'Play animation'}
  >
    {#if playback.playing}<Pause size={14} />Pause{:else}<Play
        size={14}
      />Play{/if}
  </button>
  <label class="flex items-center gap-2 text-xs text-muted"
    >Speed
    <select
      id="speed"
      class="button"
      value={playback.speed}
      onchange={(event) => studio?.setSpeed(Number(event.currentTarget.value))}
    >
      {#each [0.25, 0.5, 1, 2] as speed}
        <option value={speed}>{speed}×</option>
      {/each}
    </select>
  </label>
</div>
<label
  class="mt-5 mb-2 flex justify-between text-[11px] text-muted"
  for="timeline"
>
  <span>{animationModes[playback.mode].label}</span><output class="tabular-nums"
    >{playback.seconds.toFixed(2)} s</output
  >
</label>
<input
  id="timeline"
  class="w-full accent-accent"
  type="range"
  min="0"
  max="1000"
  value={Math.round(playback.phase * 1000)}
  oninput={(event) => studio?.seek(Number(event.currentTarget.value) / 1000)}
  aria-label="Animation timeline"
/>

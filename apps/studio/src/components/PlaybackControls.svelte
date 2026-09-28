<script lang="ts">
  import {
    Play,
    Pause,
    SkipBack,
    SkipForward,
    Repeat2,
    RotateCcw,
  } from '@lucide/svelte';
  import {
    animationModes,
    type PlaybackState,
    type StudioController,
  } from '../lib/types';
  let {
    playback,
    studio,
    label,
  }: { playback: PlaybackState; studio?: StudioController; label?: string } =
    $props();
  const frame = $derived(
    Math.round(playback.phase * (playback.frames - 1)) + 1,
  );
</script>

<section class="timeline-panel" aria-label="Animation playback">
  <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
    <div class="flex items-center gap-1">
      <button
        class="icon-button"
        aria-label="Restart animation"
        disabled={!studio}
        onclick={() => studio?.seek(0)}><RotateCcw size={14} /></button
      >
      <button
        class="icon-button"
        aria-label="Previous frame"
        disabled={!studio}
        onclick={() => studio?.stepFrame(-1)}><SkipBack size={15} /></button
      >
      <button
        id="play"
        class="icon-button play-button"
        onclick={() => studio?.setPlaying(!playback.playing)}
        disabled={!studio}
        aria-label={playback.playing ? 'Pause animation' : 'Play animation'}
      >
        {#if playback.playing}<Pause
            size={17}
            fill="currentColor"
          />{:else}<Play size={17} fill="currentColor" />{/if}
      </button>
      <button
        class="icon-button"
        aria-label="Next frame"
        disabled={!studio}
        onclick={() => studio?.stepFrame(1)}><SkipForward size={15} /></button
      >
      <button
        class="icon-button ml-2"
        class:selected={playback.looping}
        aria-label="Loop animation"
        aria-pressed={playback.looping}
        disabled={!studio}
        onclick={() => studio?.setLooping(!playback.looping)}
        ><Repeat2 size={16} /></button
      >
    </div>
    <div class="flex items-center gap-4 text-[11px]">
      <span class="hidden text-muted sm:block"
        >{label ?? animationModes[playback.mode]?.label ?? playback.mode}</span
      >
      <output aria-label="Current frame" class="text-muted tabular-nums"
        >{String(frame).padStart(3, '0')} <span class="text-line">/</span>
        {playback.frames}</output
      >
      <label class="flex items-center gap-2 text-muted"
        >Animation speed<select
          id="speed"
          class="field compact"
          value={playback.speed}
          disabled={!studio}
          onchange={(event) =>
            studio?.setSpeed(Number(event.currentTarget.value))}
          >{#each [0.25, 0.5, 1, 1.5, 2] as speed}<option value={speed}
              >{speed}×</option
            >{/each}</select
        ></label
      >
    </div>
  </div>
  <div class="mt-4 flex items-center gap-3">
    <output class="w-12 text-[10px] text-muted tabular-nums"
      >{playback.seconds.toFixed(2)} s</output
    >
    <div class="min-w-0 flex-1">
      <input
        id="timeline"
        class="timeline"
        type="range"
        min="0"
        max="1000"
        value={Math.round(playback.phase * 1000)}
        disabled={!studio}
        oninput={(event) =>
          studio?.seek(Number(event.currentTarget.value) / 1000)}
        aria-label="Animation timeline"
      />
      <div class="timeline-ticks"></div>
    </div>
    <span class="w-12 text-right text-[10px] text-muted tabular-nums"
      >{playback.duration.toFixed(2)} s</span
    >
  </div>
</section>

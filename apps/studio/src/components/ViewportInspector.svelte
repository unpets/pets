<script lang="ts">
  import { SlidersHorizontal, RotateCcw } from '@lucide/svelte';
  import {
    defaultViewSettings,
    animationModes,
    type ViewSettings,
    type CameraView,
    type StudioController,
    type AnimationMode,
  } from '../lib/types';
  let {
    settings,
    onchange,
    studio,
    mode,
  }: {
    settings: ViewSettings;
    onchange: (settings: ViewSettings) => void;
    studio?: StudioController;
    mode: AnimationMode;
  } = $props();
  const views: { id: CameraView; label: string }[] = [
    { id: 'home', label: 'Perspective' },
    { id: 'front', label: 'Front' },
    { id: 'back', label: 'Back' },
    { id: 'left', label: 'Left' },
    { id: 'side', label: 'Right' },
    { id: 'top', label: 'Top' },
  ];
  function update(value: Partial<ViewSettings>) {
    onchange({ ...settings, ...value });
  }
</script>

<div class="inspector-heading">
  <h2><SlidersHorizontal size={15} />Scene inspector</h2>
  <button
    class="icon-button"
    aria-label="Reset viewport settings"
    onclick={() => {
      onchange(defaultViewSettings());
      studio?.setCamera('home');
    }}><RotateCcw size={14} /></button
  >
</div>
<details class="inspector-stack" open>
  <summary>Camera</summary>
  <div class="inspector-section">
    <div class="grid grid-cols-3 gap-1.5" aria-label="Camera controls">
      {#each views as view}<button
          class="button justify-center px-1.5"
          data-view={view.id}
          disabled={!studio}
          onclick={() => studio?.setCamera(view.id)}>{view.label}</button
        >{/each}
    </div>
    <label class="range-label mt-5"
      ><span>Field of view<output>{settings.fov}°</output></span><input
        type="range"
        aria-label="Field of view"
        min="20"
        max="60"
        value={settings.fov}
        oninput={(event) => update({ fov: Number(event.currentTarget.value) })}
      /></label
    >
    <label class="toggle-row mt-4"
      ><span>Orbit automatically</span><input
        type="checkbox"
        checked={settings.orbit}
        onchange={(event) => update({ orbit: event.currentTarget.checked })}
      /></label
    >
  </div>
</details>
<details class="inspector-stack" open>
  <summary>Display</summary>
  <div class="inspector-section">
    {#each [{ key: 'grid', label: 'Ground grid' }, { key: 'wireframe', label: 'Wireframe' }, { key: 'joints', label: 'Joint markers' }] as const as option}<label
        class="toggle-row"
        ><span>{option.label}</span><input
          id={option.key}
          type="checkbox"
          checked={settings[option.key]}
          onchange={(event) =>
            update({ [option.key]: event.currentTarget.checked })}
        /></label
      >{/each}
  </div>
</details>
<details class="inspector-stack" open>
  <summary>Movement</summary>
  <div class="inspector-section">
    <label class="toggle-row"
      ><span>Preview travel</span><input
        type="checkbox"
        aria-label="Preview travel"
        checked={settings.travel}
        onchange={(event) => update({ travel: event.currentTarget.checked })}
      /></label
    >
    <p class="mt-2 text-xs text-muted">
      Follow the character as it moves across the ground. Disable to inspect
      motion in place.
    </p>
  </div>
</details>
<details class="inspector-stack" open>
  <summary>Lighting</summary>
  <div class="inspector-section">
    <label class="range-label"
      ><span
        >Intensity<output>{Math.round(settings.lighting * 100)}%</output></span
      ><input
        type="range"
        aria-label="Light intensity"
        min="0.25"
        max="2"
        step="0.05"
        value={settings.lighting}
        oninput={(event) =>
          update({ lighting: Number(event.currentTarget.value) })}
      /></label
    >
  </div>
</details>
<details class="inspector-stack" open>
  <summary>Selected clip</summary>
  <div class="inspector-section">
    <p class="mb-2 text-xs font-medium">
      {animationModes[mode]?.label ?? mode}
    </p>
    <p class="text-xs leading-6 text-muted">
      {animationModes[mode]?.description ?? 'Custom composition'}
    </p>
    <p
      class="mt-5 rounded-md border border-line bg-surface p-3 text-[11px] leading-5 text-muted"
    >
      Switch to <strong class="font-medium text-ink">Screen</strong> to edit the display's
      layers, expressions, and colors.
    </p>
  </div>
</details>

<script lang="ts">
  import {
    Layers,
    Eye,
    EyeOff,
    CircleDot,
    RotateCcw,
    ArrowLeft,
    ArrowRight,
    ArrowUp,
    ArrowDown,
  } from '@lucide/svelte';
  import ScreenPalette from './ScreenPalette.svelte';
  import { animationModes } from '../types';
  import { screenLayers } from '../screen-project';
  import type { ScreenEditorState } from '../screen-editor.svelte';
  let { editor }: { editor: ScreenEditorState } = $props();
  const layer = $derived(editor.project.layers[editor.selected]);
  function offset(axis: 'x' | 'y', value: number, group?: string) {
    if (!Number.isFinite(value)) return;
    const limit = axis === 'x' ? 96 : 64;
    editor.changeLayer(
      { [axis]: Math.max(-limit, Math.min(limit, Math.round(value))) },
      group,
    );
  }
</script>

<div class="inspector-heading">
  <h2><Layers size={15} />Screen inspector</h2>
  <span class="badge">4 LAYERS</span>
</div>
<section class="inspector-section screen-layers" aria-label="Screen layers">
  <div class="mb-3 flex items-center justify-between">
    <h3 class="mb-0!">Layers</h3>
    <span class="text-[9px] text-muted">TOP TO BOTTOM</span>
  </div>
  <div class="layer-list">
    {#each [...screenLayers].reverse() as name}
      <div class="layer-row" class:active={editor.selected === name}>
        <button
          class="icon-button"
          aria-label={`Toggle ${name} visibility`}
          aria-pressed={editor.project.layers[name].visible}
          onclick={() => {
            editor.selected = name;
            editor.changeLayer({
              visible: !editor.project.layers[name].visible,
            });
          }}
          >{#if editor.project.layers[name].visible}<Eye
              size={14}
            />{:else}<EyeOff size={14} />{/if}</button
        >
        <button
          class="min-w-0 flex-1 py-2 text-left text-xs capitalize"
          aria-label={`Edit ${name} layer`}
          aria-pressed={editor.selected === name}
          onclick={() => {
            editor.endGesture();
            editor.selected = name;
          }}>{name}</button
        >
        <button
          class="icon-button"
          class:selected={editor.solo === name}
          aria-label={`Solo ${name} layer`}
          aria-pressed={editor.solo === name}
          onclick={() => (editor.solo = editor.solo === name ? null : name)}
          ><CircleDot size={12} /></button
        >
      </div>
    {/each}
  </div>
</section>
<section class="inspector-section" aria-label="Layer properties">
  <div class="mb-4 flex items-center justify-between">
    <h3 class="mb-0! capitalize">{editor.selected}</h3>
    <button
      class="icon-button"
      aria-label="Reset selected layer"
      title="Reset selected layer"
      onclick={() => editor.resetLayer()}><RotateCcw size={13} /></button
    >
  </div>
  <label class="toggle-row mb-3"
    ><span>Visible</span><input
      aria-label="Layer visible"
      type="checkbox"
      checked={layer.visible}
      onchange={(event) =>
        editor.changeLayer({ visible: event.currentTarget.checked })}
    /></label
  >
  <label class="field-label"
    >Expression<select
      aria-label="Layer expression"
      class="field mt-2 w-full"
      value={layer.source ?? ''}
      onchange={(event) =>
        editor.changeLayer({
          source:
            event.currentTarget.value === ''
              ? null
              : Number(event.currentTarget.value),
        })}
      ><option value="">Follow animation</option
      >{#each Object.values(animationModes) as mode, index}<option value={index}
          >{mode.label}</option
        >{/each}</select
    ></label
  >
  <label class="range-label mt-5"
    ><span>Opacity<output>{Math.round(layer.opacity * 100)}%</output></span
    ><input
      aria-label="Layer opacity"
      type="range"
      min="0"
      max="1"
      step="0.01"
      value={layer.opacity}
      oninput={(event) =>
        editor.changeLayer(
          { opacity: Number(event.currentTarget.value) },
          'opacity',
        )}
      onchange={() => editor.endGesture()}
      onblur={() => editor.endGesture()}
    /></label
  >
  {#if editor.selected === 'eyes' || editor.selected === 'mouth'}<div
      class="palette-row mt-3"
    >
      <label class="flex flex-1 items-center justify-between"
        >Color<span class="color-control"
          ><input
            aria-label="Layer color"
            type="color"
            value={layer.color ?? '#4feff3'}
            oninput={(event) =>
              editor.changeLayer(
                { color: event.currentTarget.value },
                'layer-color',
              )}
            onchange={() => editor.endGesture()}
            onblur={() => editor.endGesture()}
          /><span class="text-[10px] text-muted"
            >{layer.color ?? 'Original'}</span
          ></span
        ></label
      ><button
        class="icon-button"
        aria-label="Reset layer color"
        onclick={() => editor.changeLayer({ color: null })}
        ><RotateCcw size={12} /></button
      >
    </div>{/if}
  <div class="mt-5 flex items-center justify-between text-[11px]">
    <span class="text-muted">Position</span><button
      class="text-[10px] text-muted hover:text-accent"
      onclick={() => editor.changeLayer({ x: 0, y: 0 })}>Center layer</button
    >
  </div>
  <div class="mt-2 grid grid-cols-2 gap-2">
    {#each ['x', 'y'] as const as axis}<label class="numeric-field"
        ><span>{axis.toUpperCase()}</span><input
          type="number"
          aria-label={`Layer ${axis === 'x' ? 'horizontal' : 'vertical'} offset`}
          min={axis === 'x' ? -96 : -64}
          max={axis === 'x' ? 96 : 64}
          step="1"
          value={layer[axis]}
          oninput={(event) =>
            offset(axis, event.currentTarget.valueAsNumber, `offset-${axis}`)}
          onchange={() => editor.endGesture()}
          onblur={() => editor.endGesture()}
        /><span>px</span></label
      >{/each}
  </div>
  <div class="mt-3 flex justify-end gap-1" aria-label="Nudge layer">
    <button
      class="icon-button"
      aria-label="Nudge layer left"
      onclick={() => offset('x', layer.x - 1)}><ArrowLeft size={13} /></button
    ><button
      class="icon-button"
      aria-label="Nudge layer right"
      onclick={() => offset('x', layer.x + 1)}><ArrowRight size={13} /></button
    ><button
      class="icon-button"
      aria-label="Nudge layer up"
      onclick={() => offset('y', layer.y - 1)}><ArrowUp size={13} /></button
    ><button
      class="icon-button"
      aria-label="Nudge layer down"
      onclick={() => offset('y', layer.y + 1)}><ArrowDown size={13} /></button
    >
  </div>
</section>
<ScreenPalette
  palette={editor.project.palette}
  onchange={(update, group) => editor.changePalette(update, group)}
  oncommit={() => editor.endGesture()}
/>
<div class="p-4">
  <button class="button w-full" onclick={() => editor.reset()}
    ><RotateCcw size={13} />Reset screen project</button
  >
</div>

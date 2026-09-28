<script lang="ts">
  import {
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
  import { screenLayers } from '../screen-project';
  import type { ScreenEditorState } from '../screen-editor.svelte';
  let {
    editor,
    onanimation,
  }: { editor: ScreenEditorState; onanimation: () => void } = $props();
  const layers = $derived(
    screenLayers.filter((name) =>
      editor.project.eyeMode === 'paired'
        ? name !== 'eyeLeft' && name !== 'eyeRight'
        : name !== 'eyes',
    ),
  );
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

<details class="inspector-stack" open>
  <summary>Layers</summary>
  <section class="inspector-section" aria-label="Screen layers">
    <p class="mb-3 text-[9px] text-muted">TOP TO BOTTOM</p>
    <div class="layer-list">
      {#each [...layers].reverse() as name}
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
            }}
            >{name === 'eyeLeft'
              ? 'Left eye'
              : name === 'eyeRight'
                ? 'Right eye'
                : name}</button
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
</details>
<details class="inspector-stack" open>
  <summary>Layer properties</summary>
  <section class="inspector-section" aria-label="Layer properties">
    <div class="mb-4 flex items-center justify-between">
      <h3 class="mb-0! capitalize">
        {editor.selected === 'eyeLeft'
          ? 'Left eye'
          : editor.selected === 'eyeRight'
            ? 'Right eye'
            : editor.selected}
      </h3>
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
    <button class="button w-full" onclick={onanimation}
      >Edit layer animation</button
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
    {#if editor.selected.startsWith('eye') || editor.selected === 'mouth'}<div
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
        onclick={() => offset('x', layer.x + 1)}
        ><ArrowRight size={13} /></button
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
    <div class="mt-4 grid grid-cols-2 gap-2">
      {#each ['scale', 'rotation', 'order'] as const as field}
        <label class="field-label"
          >{field === 'scale'
            ? 'Scale'
            : field === 'rotation'
              ? 'Rotation'
              : 'Layer order'}<input
            class="field mt-2 w-full"
            aria-label={`Layer ${field}`}
            type="number"
            min={field === 'scale' ? 0.05 : undefined}
            max={field === 'scale' ? 4 : undefined}
            step={field === 'scale' ? 0.05 : 1}
            value={layer[field]}
            onchange={(event) => {
              const value = event.currentTarget.valueAsNumber;
              if (
                Number.isFinite(value) &&
                (field !== 'scale' || (value > 0 && value <= 4))
              )
                editor.changeLayer({ [field]: value });
            }}
          /></label
        >
      {/each}
    </div>
    {#each ['mirrorX', 'mirrorY'] as const as axis}<label
        class="toggle-row mt-2"
        ><span
          >{axis === 'mirrorX'
            ? 'Mirror horizontally'
            : 'Mirror vertically'}</span
        ><input
          type="checkbox"
          aria-label={`Layer ${axis}`}
          checked={layer[axis]}
          onchange={(event) =>
            editor.changeLayer({ [axis]: event.currentTarget.checked })}
        /></label
      >{/each}
  </section>
</details>
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

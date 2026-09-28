<script lang="ts">
  import EffectEditor from './EffectEditor.svelte';
  import ExportBindings from './ExportBindings.svelte';
  import CompositionEditor from './CompositionEditor.svelte';
  import KeyframeEditor from './KeyframeEditor.svelte';
  import { resolveComposition } from '@pets/three-runtime/project';
  import { exportAsset, importAsset } from '@pets/three-runtime/assets';
  import CompositionLayers from './CompositionLayers.svelte';
  import { Layers3, Plus, Copy, Upload, Download } from '@lucide/svelte';
  import type { AnimationEditorState } from '../lib/animation-editor.svelte';
  import type { StudioController } from '../lib/types';
  let {
    editor,
    mode,
    studio,
  }: { editor: AnimationEditorState; mode: string; studio?: StudioController } =
    $props();
  let label = $state('New animation');
  let error = $state('');
  let input = $state<HTMLInputElement>();
  let source = $state('');
  const composition = $derived(resolveComposition(editor.project, mode));
  const component = $derived(editor.project.components[editor.component]);
  const selected = $derived(composition?.bindings[editor.component]);
  const clip = $derived(editor.project.clips[editor.clip]);
  $effect(() => {
    if (selected?.clip) editor.clip = selected.clip;
  });
  $effect(() => {
    source = JSON.stringify(clip?.data, null, 2);
  });
  function selectComponent(value: string) {
    editor.component = value;
    editor.clip =
      composition.bindings[value]?.clip ??
      Object.keys(editor.project.clips).find(
        (id) => editor.project.clips[id].component === value,
      )!;
  }
  function applyData() {
    try {
      editor.editClip({ data: JSON.parse(source) });
      error = '';
    } catch (reason) {
      error = String(reason);
    }
  }
  async function importClip() {
    const file = input?.files?.[0];
    if (!file) return;
    try {
      if (file.size > 2_000_000) throw new Error('Clips must be under 2 MB.');
      const value = JSON.parse(await file.text());
      if (value.format === 'pets-assets') {
        const result = importAsset($state.snapshot(editor.project), value);
        editor.replace(result.project);
        if (result.selection.kind === 'clip') {
          editor.component =
            result.project.clips[result.selection.id].component;
          editor.clip = result.selection.id;
        }
      } else editor.editClip({ data: value });
      error = '';
    } catch (reason) {
      error = String(reason);
    }
    if (input) input.value = '';
  }
  function exportClip() {
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            exportAsset($state.snapshot(editor.project), 'clip', editor.clip),
            null,
            2,
          ),
        ],
        {
          type: 'application/json',
        },
      ),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `${editor.clip.replaceAll('/', '-')}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
</script>

<div class="inspector-heading">
  <h2><Layers3 size={15} />Animation inspector</h2>
</div>
<CompositionEditor {editor} {mode} {studio} bind:label />
<CompositionLayers {editor} {mode} />
<section class="inspector-section">
  <h3>Component binding</h3>
  <label class="field-label mb-3"
    >Component name<input
      class="field mt-2 w-full"
      aria-label="Component name"
      value={component.label}
      onchange={(e) => {
        try {
          editor.editComponent({ label: e.currentTarget.value });
          error = '';
        } catch (reason) {
          error = String(reason);
        }
      }}
    /></label
  >
  <button
    class="button mb-3 w-full"
    onclick={() => {
      try {
        editor.deleteComponent();
        error = '';
      } catch (reason) {
        error = String(reason);
      }
    }}>Delete unassigned component</button
  >
  <p class="mb-3 text-xs text-muted">
    {composition.origins[editor.component] &&
    composition.origins[editor.component] !== mode
      ? `Inherited from ${editor.project.compositions[composition.origins[editor.component]].label}`
      : 'Local binding'}
  </p>
  <label class="field-label"
    >Component<select
      class="field mt-2 w-full"
      aria-label="Animation component"
      value={editor.component}
      onchange={(event) => selectComponent(event.currentTarget.value)}
      >{#each Object.entries(editor.project.components) as [id, c]}<option
          value={id}>{c.label} ({c.kind})</option
        >{/each}</select
    ></label
  >
  <label class="field-label mt-4 block"
    >Clip<select
      class="field mt-2 w-full"
      aria-label="Component clip"
      value={selected?.clip ?? ''}
      onchange={(event) => {
        editor.clip = event.currentTarget.value;
        editor.bind(mode, { clip: editor.clip });
      }}
      ><option value="" disabled>Unassigned</option
      >{#each Object.entries(editor.project.clips).filter(([, c]) => c.component === editor.component) as [id, c]}<option
          value={id}>{c.label}</option
        >{/each}</select
    ></label
  >
  {#if selected}
    <button class="button mt-3 w-full" onclick={() => editor.resetBinding(mode)}
      >{editor.project.compositions[mode].parent
        ? 'Reset to parent'
        : 'Unassign component'}</button
    >
    <label class="toggle-row mt-4"
      ><span>Enabled</span><input
        type="checkbox"
        checked={selected.enabled}
        onchange={(event) =>
          editor.bind(mode, { enabled: event.currentTarget.checked })}
      /></label
    >
    <label class="field-label mt-4 block"
      >Clock<select
        class="field mt-2 w-full"
        aria-label="Component clock"
        value={selected.clock}
        onchange={(event) =>
          editor.bind(mode, {
            clock: event.currentTarget.value as 'independent' | 'composition',
          })}
        ><option value="independent">Independent</option><option
          value="composition">Sync to composition</option
        ></select
      ></label
    >
    <div class="mt-4 grid grid-cols-2 gap-2">
      <label class="field-label"
        >Speed<input
          class="field mt-2 w-full"
          aria-label="Component speed"
          type="number"
          min="0"
          max="16"
          step="0.1"
          value={selected.speed}
          onchange={(event) => {
            if (event.currentTarget.valueAsNumber >= 0)
              editor.bind(mode, { speed: event.currentTarget.valueAsNumber });
          }}
        /></label
      >
      <label class="field-label"
        >Phase offset<input
          class="field mt-2 w-full"
          aria-label="Component phase offset"
          type="number"
          min="-10"
          max="10"
          step="0.05"
          value={selected.offset}
          onchange={(event) => {
            if (Number.isFinite(event.currentTarget.valueAsNumber))
              editor.bind(mode, { offset: event.currentTarget.valueAsNumber });
          }}
        /></label
      >
    </div>
  {/if}
</section>
{#if clip && component.kind === 'effect'}<EffectEditor
    {editor}
  />{:else if clip}<KeyframeEditor {editor} />{/if}
{#if component.kind === 'screen' && !['eyes', 'mouth', 'background', 'activity'].includes(component.data.layer as string)}
  <section class="inspector-section">
    <h3>Layer placement</h3>
    {#each ['x', 'y', 'opacity'] as field}
      <label class="field-label mt-3 block"
        >{field === 'opacity' ? 'Opacity' : field.toUpperCase()}
        <input
          class="field mt-2 w-full"
          type="number"
          min={field === 'opacity' ? 0 : -96}
          max={field === 'opacity' ? 1 : 96}
          step={field === 'opacity' ? 0.05 : 1}
          value={(component.data.style as Record<string, number> | undefined)?.[
            field
          ] ?? (field === 'opacity' ? 1 : 0)}
          onchange={(event) => {
            const value = event.currentTarget.valueAsNumber;
            if (!Number.isFinite(value)) return;
            editor.replace({
              ...editor.project,
              components: {
                ...editor.project.components,
                [editor.component]: {
                  ...component,
                  data: {
                    ...component.data,
                    style: {
                      ...(component.data.style as object),
                      [field]: Math.max(
                        field === 'opacity' ? 0 : -96,
                        Math.min(field === 'opacity' ? 1 : 96, value),
                      ),
                    },
                  },
                },
              },
            });
          }}
        />
      </label>
    {/each}
  </section>
{/if}
<section class="inspector-section">
  <h3>Clip library</h3>
  <label class="field-label mb-3"
    >Browse clips<select
      class="field mt-2 w-full"
      aria-label="Library clip"
      value={editor.clip}
      onchange={(e) => (editor.clip = e.currentTarget.value)}
      >{#each Object.entries(editor.project.clips).filter(([, c]) => c.component === editor.component) as [id, c]}<option
          value={id}>{c.label}</option
        >{/each}</select
    ></label
  >
  <button
    class="button mb-3 w-full"
    disabled={!clip}
    onclick={() => editor.bind(mode, { clip: editor.clip, enabled: true })}
    >Assign selected clip</button
  >
  <button
    class="button w-full"
    disabled={!label.trim()}
    onclick={() => editor.createClip(label.trim(), mode)}
    ><Plus size={13} />New {component.kind === 'screen'
      ? 'pixel'
      : component.kind === 'rig'
        ? 'rotation'
        : component.kind === 'emission'
          ? 'emission'
          : component.kind === 'effect'
            ? 'effect'
            : 'visibility'} clip</button
  >
  <button
    class="button mt-2 w-full"
    disabled={!label.trim()}
    onclick={() => editor.addScreen(label.trim(), mode)}
    ><Layers3 size={13} />Add screen layer</button
  >
  <button
    class="button mt-2 w-full"
    disabled={!label.trim()}
    onclick={() => editor.addEffect(label.trim(), mode)}
    ><Plus size={13} />Add FX layer</button
  >
  {#if clip}
    <label class="field-label mt-3"
      >Clip name<input
        class="field mt-2 w-full"
        aria-label="Clip name"
        value={clip.label}
        onchange={(e) => editor.editClip({ label: e.currentTarget.value })}
      /></label
    >
    <button
      class="button mt-2 w-full"
      onclick={() =>
        editor.duplicateClip(label.trim() || `${clip.label} copy`, mode)}
      >Duplicate clip for this composition</button
    >
    <button
      class="button mt-2 w-full"
      onclick={() => {
        try {
          editor.deleteClip();
          error = '';
        } catch (reason) {
          error = String(reason);
        }
      }}>Delete unassigned clip</button
    >
    <label class="field-label mt-4 block"
      >Clip duration (seconds)<input
        aria-label="Clip duration"
        class="field mt-2 w-full"
        type="number"
        min="0.05"
        step="0.05"
        value={clip.duration}
        onchange={(event) => {
          try {
            editor.editClip({ duration: event.currentTarget.valueAsNumber });
            error = '';
          } catch (reason) {
            error = String(reason);
          }
        }}
      /></label
    >
    <label class="toggle-row mt-3"
      ><span>Loop clip</span><input
        type="checkbox"
        checked={clip.looping}
        onchange={(event) =>
          editor.editClip({ looping: event.currentTarget.checked })}
      /></label
    >
    <details class="mt-4">
      <summary class="cursor-pointer text-xs text-muted">Clip data</summary
      ><textarea
        aria-label="Clip data"
        class="field mt-3 h-48 w-full resize-y font-mono text-[10px]"
        bind:value={source}></textarea><button
        class="button mt-2 w-full"
        onclick={applyData}>Apply clip data</button
      >
    </details>
    <div class="mt-3 flex gap-2">
      <button class="button flex-1" onclick={() => input?.click()}
        ><Upload size={12} />Import clip</button
      ><button class="button flex-1" onclick={exportClip}
        ><Download size={12} />Save clip</button
      >
    </div>
  {/if}
  <input
    class="hidden"
    bind:this={input}
    type="file"
    accept=".json"
    aria-label="Import clip data"
    onchange={importClip}
  />
  {#if error}<p class="mt-3 text-xs text-red-200" role="alert">{error}</p>{/if}
</section>

<ExportBindings {editor} />

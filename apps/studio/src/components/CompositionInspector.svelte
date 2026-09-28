<script lang="ts">
  import InspectorSection from '@pets/kernel/components/InspectorSection.svelte';
  import { Layers3 } from '@lucide/svelte';
  import {
    resolveComposition,
    compatibleClip,
  } from '@pets/three-runtime/project';
  import CompositionEditor from './CompositionEditor.svelte';
  import CompositionLayers from './CompositionLayers.svelte';
  import ExportBindings from './ExportBindings.svelte';
  import type { AnimationEditorState } from '../lib/animation-editor.svelte';
  import type { StudioController } from '../lib/types';
  let {
    editor,
    mode,
    studio,
    onedit,
  }: {
    editor: AnimationEditorState;
    mode: string;
    studio?: StudioController;
    onedit: () => void;
  } = $props();
  const composition = $derived(resolveComposition(editor.project, mode));
  const selected = $derived(composition.bindings[editor.component]);
  $effect(() => {
    if (editor.project.components[editor.component]?.kind === 'screen')
      selectComponent(
        Object.keys(editor.project.components).find(
          (id) => editor.project.components[id].kind !== 'screen',
        )!,
      );
  });
  function selectComponent(id: string) {
    editor.component = id;
    editor.clip =
      composition.bindings[id]?.clip ??
      Object.keys(editor.project.clips).find((clip) =>
        compatibleClip(editor.project, id, clip),
      ) ??
      '';
  }
</script>

<div class="inspector-heading">
  <h2><Layers3 size={15} />Composition inspector</h2>
</div>
<CompositionEditor {editor} {mode} {studio} />
<CompositionLayers {editor} {mode} />
<InspectorSection open>
  {#snippet heading()}Component binding{/snippet}
  <div class="inspector-section">
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
        >{#each Object.entries(editor.project.components).filter(([, c]) => c.kind !== 'screen') as [id, c]}<option
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
        >{#each Object.entries(editor.project.clips).filter( ([id]) => compatibleClip(editor.project, editor.component, id) ) as [id, c]}<option
            value={id}>{c.label}</option
          >{/each}</select
      ></label
    >
    {#if selected}
      <button
        class="button mt-3 w-full"
        onclick={() => editor.resetBinding(mode)}
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
                editor.bind(mode, {
                  offset: event.currentTarget.valueAsNumber,
                });
            }}
          /></label
        >
      </div>
    {/if}
    {#if selected}<button
        class="button mt-4 w-full"
        onclick={() => {
          editor.clip = selected.clip;
          onedit();
        }}>Edit animation part</button
      >{/if}
  </div>
</InspectorSection>

<ExportBindings {editor} />

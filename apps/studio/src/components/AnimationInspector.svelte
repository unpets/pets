<script lang="ts">
  import LookAtEditor from './LookAtEditor.svelte';
  import InspectorSection from '@pets/kernel/components/InspectorSection.svelte';
  import EffectEditor from './EffectEditor.svelte';
  import KeyframeEditor from './KeyframeEditor.svelte';
  import { compatibleClip } from '@pets/three-runtime/project';
  import { exportAsset, importAsset } from '@pets/three-runtime/assets';
  import { Layers3, Plus, Copy, Upload, Download } from '@lucide/svelte';
  import type { AnimationEditorState } from '../lib/animation-editor.svelte';
  let { editor }: { editor: AnimationEditorState } = $props();
  let label = $state('New animation');
  let joint = $state('');
  let error = $state('');
  let input = $state<HTMLInputElement>();
  let source = $state('');
  const component = $derived(editor.project.components[editor.component]);
  const clip = $derived(editor.project.clips[editor.clip]);
  $effect(() => {
    source = JSON.stringify(clip?.data, null, 2);
  });
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
  <h2><Layers3 size={15} />Animation part</h2>
</div>
<InspectorSection open
  >{#snippet heading()}Target{/snippet}
  <div class="inspector-section">
    {#if component.kind === 'rig' && (component.data.nodes as string[]).length > 1}
      <details class="mt-3">
        <summary class="field-label">Individual joint authoring</summary>
        <label class="field-label mt-3"
          >Joint<select
            class="field mt-2 w-full"
            aria-label="Extract joint"
            bind:value={joint}
            ><option value="">Select a joint</option
            >{#each component.data.nodes as string[] as node}<option
                value={node}>{node}</option
              >{/each}</select
          ></label
        >
        <button
          class="button mt-3"
          disabled={!(component.data.nodes as string[]).includes(joint)}
          onclick={() => {
            editor.extractJoint(joint);
            joint = '';
          }}>Extract joint layer</button
        >
      </details>
    {/if}
    <p class="mt-3 text-xs text-muted">
      Edit reusable clips here. Assemble and assign them in Composition.
    </p>
    <button
      class="button mt-3 w-full"
      onclick={() => {
        try {
          editor.deleteComponent();
          error = '';
        } catch (reason) {
          error = String(reason);
        }
      }}>Delete unassigned component</button
    >
  </div></InspectorSection
>
{#if clip?.data.lookAt}<LookAtEditor
    {editor}
  />{:else if clip && component.kind === 'effect'}<EffectEditor
    {editor}
  />{:else if clip}<KeyframeEditor {editor} />{/if}

<InspectorSection open>
  {#snippet heading()}Clip library{/snippet}
  <div class="inspector-section">
    <label class="field-label mb-3"
      >Browse clips<select
        class="field mt-2 w-full"
        aria-label="Library clip"
        value={editor.clip}
        onchange={(e) => (editor.clip = e.currentTarget.value)}
        >{#each Object.entries(editor.project.clips).filter( ([id]) => compatibleClip(editor.project, editor.component, id) ) as [id, c]}<option
            value={id}>{c.label}</option
          >{/each}</select
      ></label
    >
    <label class="field-label mb-3"
      >New part name<input
        class="field mt-2 w-full"
        aria-label="New animation name"
        bind:value={label}
      /></label
    >
    <button
      class="button w-full"
      disabled={!label.trim()}
      onclick={() => editor.createClip(label.trim())}
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
    {#if component.data.nodes?.toString() === 'head'}<button
        class="button mt-2 w-full"
        disabled={!label.trim()}
        onclick={() => editor.createLookAtClip(label.trim())}
        >New Lookat clip</button
      >{/if}
    <button
      class="button mt-2 w-full"
      disabled={!label.trim()}
      onclick={() => editor.addEffect(label.trim())}
      ><Plus size={13} />Add FX layer</button
    >
    {#if clip}
      <button
        class="button mt-2 w-full"
        onclick={() =>
          editor.duplicateClip(label.trim() || `${clip.label} copy`)}
        >Duplicate clip</button
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
    {#if error}<p class="mt-3 text-xs text-red-200" role="alert">
        {error}
      </p>{/if}
  </div>
</InspectorSection>

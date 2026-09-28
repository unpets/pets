<script lang="ts">
  import { Smile, Plus, Copy, Trash2 } from '@lucide/svelte';
  import type { AnimationEditorState } from '../lib/animation-editor.svelte';
  let { editor }: { editor: AnimationEditorState } = $props();
  const clip = $derived(editor.project.clips[editor.clip]);
  let label = $state('New face component');
  let error = $state('');
  function run(action: () => void) {
    try {
      action();
      error = '';
    } catch (reason) {
      error = String(reason);
    }
  }
</script>

<div class="inspector-heading"><h2><Smile size={15} />Face component</h2></div>
{#if clip}<details class="inspector-stack" open>
    <summary>Asset</summary>
    <div class="inspector-section">
      <label class="field-label"
        >Name<input
          class="field mt-2 w-full"
          aria-label="Face asset name"
          value={clip.label}
          onchange={(event) =>
            run(() => editor.editClip({ label: event.currentTarget.value }))}
        /></label
      >
      <p class="mt-3 text-xs text-muted">
        This asset is shared by every screen that references it.
      </p>
      <label class="field-label mt-4"
        >Duration (seconds)<input
          class="field mt-2 w-full"
          aria-label="Face asset duration"
          type="number"
          min="0.05"
          step="0.05"
          value={clip.duration}
          onchange={(event) =>
            run(() =>
              editor.editClip({ duration: event.currentTarget.valueAsNumber }),
            )}
        /></label
      >
      <label class="toggle-row mt-3"
        ><span>Loop</span><input
          type="checkbox"
          aria-label="Loop face asset"
          checked={clip.looping}
          onchange={(event) =>
            editor.editClip({ looping: event.currentTarget.checked })}
        /></label
      >
      {#if !clip.data.frames}<p class="mt-3 text-xs text-muted">
          Atlas animation. Create a pixel component to draw custom frames.
        </p>{/if}
      <button
        class="button mt-4 w-full"
        onclick={() => run(() => editor.deleteClip())}
        ><Trash2 size={13} />Delete unassigned asset</button
      >
    </div>
  </details>{/if}
<details class="inspector-stack" open>
  <summary>Library</summary>
  <div class="inspector-section">
    <label class="field-label"
      >New asset name<input
        class="field mt-2 w-full"
        aria-label="New face asset name"
        bind:value={label}
      /></label
    >
    <button
      class="button mt-3 w-full"
      disabled={!label.trim()}
      onclick={() => editor.createFaceClip(label.trim())}
      ><Plus size={13} />New pixel component</button
    >
    <button
      class="button mt-2 w-full"
      disabled={!clip || !label.trim()}
      onclick={() => editor.createFaceClip(label.trim(), editor.clip)}
      ><Copy size={13} />Duplicate face component</button
    >
    {#if error}<p role="alert" class="mt-3 text-xs text-red-200">
        {error}
      </p>{/if}
  </div>
</details>

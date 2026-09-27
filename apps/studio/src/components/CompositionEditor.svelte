<script lang="ts">
  import { Plus, Copy, Unlink, Trash2 } from '@lucide/svelte';
  import { resolveComposition } from '@pets/three-runtime/project';
  import type { AnimationEditorState } from '../lib/animation-editor.svelte';
  import type { StudioController } from '../lib/types';
  let {
    editor,
    mode,
    studio,
    label = $bindable('New animation'),
  }: {
    editor: AnimationEditorState;
    mode: string;
    studio?: StudioController;
    label?: string;
  } = $props();
  let error = $state('');
  const composition = $derived(editor.project.compositions[mode]);
  const resolved = $derived(resolveComposition(editor.project, mode));
  const parents = $derived(
    Object.entries(editor.project.compositions).filter(([id]) => {
      let cursor: string | undefined = id;
      while (cursor) {
        if (cursor === mode) return false;
        cursor = editor.project.compositions[cursor].parent;
      }
      return true;
    }),
  );
  function run(action: () => void) {
    try {
      action();
      error = '';
    } catch (reason) {
      error = String(reason);
    }
  }
  function select(id: string) {
    studio?.setAnimationProject(editor.project);
    studio?.setMode(id);
  }
</script>

<section class="inspector-section">
  <h3>Composition</h3>
  <label class="field-label"
    >Name<input
      class="field mt-2 w-full"
      aria-label="Composition name"
      value={composition.label}
      onchange={(e) =>
        run(() =>
          editor.updateComposition(mode, { label: e.currentTarget.value }),
        )}
    /></label
  >
  <label class="field-label mt-3"
    >Description<textarea
      class="field mt-2 w-full"
      aria-label="Composition description"
      value={composition.description}
      onchange={(e) =>
        editor.updateComposition(mode, { description: e.currentTarget.value })}
    ></textarea></label
  >
  <label class="field-label mt-3"
    >Parent<select
      class="field mt-2 w-full"
      aria-label="Composition parent"
      value={composition.parent ?? ''}
      onchange={(e) =>
        run(() =>
          e.currentTarget.value
            ? editor.updateComposition(mode, { parent: e.currentTarget.value })
            : editor.detachComposition(mode),
        )}
      ><option value="">No parent</option>{#each parents as [id, value]}<option
          value={id}>{value.label}</option
        >{/each}</select
    ></label
  >
  {#if composition.parent}<p class="mt-2 text-xs text-muted">
      Inherits {Object.keys(resolved.bindings).length -
        Object.keys(composition.bindings).length} components. Local overrides: {Object.keys(
        composition.bindings,
      ).length}.
    </p>
    <label class="toggle-row mt-3"
      ><span>Inherit duration</span><input
        type="checkbox"
        aria-label="Inherit composition duration"
        checked={composition.duration === undefined}
        onchange={(e) =>
          editor.updateComposition(mode, {
            duration: e.currentTarget.checked ? undefined : resolved.duration,
          })}
      /></label
    >{/if}
  <label class="field-label mt-3"
    >Duration (seconds)<input
      class="field mt-2 w-full"
      aria-label="Composition duration"
      type="number"
      min="0.1"
      max="600"
      step="0.1"
      disabled={!!composition.parent && composition.duration === undefined}
      value={resolved.duration}
      onchange={(e) =>
        run(() =>
          editor.updateComposition(mode, {
            duration: e.currentTarget.valueAsNumber,
          }),
        )}
    /></label
  >
  <label class="field-label mt-4"
    >New asset name<input
      class="field mt-2 w-full"
      aria-label="New animation name"
      bind:value={label}
    /></label
  >
  <div class="mt-3 grid grid-cols-2 gap-2">
    <button
      class="button"
      disabled={!label.trim()}
      onclick={() =>
        run(() => select(editor.createComposition(label.trim(), mode)))}
      ><Plus size={13} />Create child</button
    ><button
      class="button"
      disabled={!label.trim()}
      onclick={() => run(() => select(editor.createComposition(label.trim())))}
      ><Plus size={13} />New composition</button
    >
  </div>
  <button
    class="button mt-2 w-full"
    disabled={!label.trim()}
    onclick={() =>
      run(() => select(editor.duplicateComposition(mode, label.trim())))}
    ><Copy size={13} />Duplicate composition</button
  >
  <div class="mt-2 flex gap-2">
    <button
      class="button flex-1"
      disabled={!composition.parent}
      onclick={() => run(() => editor.detachComposition(mode))}
      ><Unlink size={13} />Detach</button
    ><button
      class="button flex-1"
      onclick={() =>
        run(() => {
          editor.deleteComposition(mode);
          select(Object.keys(editor.project.compositions)[0]);
        })}><Trash2 size={13} />Delete composition</button
    >
  </div>
  {#if error}<p role="alert" class="mt-3 text-xs text-red-200">{error}</p>{/if}
</section>

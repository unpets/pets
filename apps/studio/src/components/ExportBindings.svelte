<script lang="ts">
  import type { AnimationEditorState } from '../lib/animation-editor.svelte';
  let { editor }: { editor: AnimationEditorState } = $props();
  let target = $state('codex');
  let name = $state('');
  let error = $state('');
  function map(intent: string, composition: string) {
    const project = $state.snapshot(editor.project);
    project.exports[target] ??= {};
    if (composition) project.exports[target][intent] = composition;
    else delete project.exports[target][intent];
    editor.replace(project);
  }
</script>

<section class="inspector-section">
  <h3>Export mappings</h3>
  <label class="field-label"
    >Target<select
      class="field mt-2 w-full"
      aria-label="Export target"
      bind:value={target}
      >{#each [...new Set( ['codex', 'shimeji', ...Object.keys(editor.project.exports)] )] as id}<option
          value={id}>{id}</option
        >{/each}</select
    ></label
  >
  {#each Object.entries(editor.project.exports[target] ?? {}) as [intent, composition]}<label
      class="field-label mt-3"
      >{intent}<select
        class="field mt-1 w-full"
        aria-label={`Export ${target} ${intent}`}
        value={composition}
        onchange={(e) => map(intent, e.currentTarget.value)}
        ><option value="">Remove mapping</option
        >{#each Object.entries(editor.project.compositions) as [id, c]}<option
            value={id}>{c.label}</option
          >{/each}</select
      ></label
    >{/each}
  <label class="field-label mt-4"
    >New intent<input
      class="field mt-2 w-full"
      aria-label="New export intent"
      bind:value={name}
    /></label
  ><button
    class="button mt-2 w-full"
    disabled={!name.trim()}
    onclick={() => {
      try {
        map(name.trim(), Object.keys(editor.project.compositions)[0]);
        name = '';
        error = '';
      } catch (reason) {
        error = String(reason);
      }
    }}>Add export mapping</button
  >
  {#if error}<p class="mt-2 text-xs text-red-200" role="alert">{error}</p>{/if}
</section>

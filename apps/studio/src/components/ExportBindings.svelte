<script lang="ts">
  import {
    compositionInstance,
    type CompositionInstance,
  } from '@pets/three-runtime/project';
  import type { AnimationEditorState } from '../lib/animation-editor.svelte';
  let { editor }: { editor: AnimationEditorState } = $props();
  let target = $state('codex');
  let name = $state('');
  let error = $state('');
  function place(intent: string, update: Partial<CompositionInstance>) {
    const project = $state.snapshot(editor.project);
    project.exports[target][intent] = {
      ...compositionInstance(project.exports[target][intent]),
      ...update,
    };
    editor.replace(project);
  }
  function map(intent: string, composition: string) {
    const project = $state.snapshot(editor.project);
    project.exports[target] ??= {};
    if (composition)
      project.exports[target][intent] = {
        ...compositionInstance(project.exports[target][intent] ?? composition),
        composition,
      };
    else delete project.exports[target][intent];
    editor.replace(project);
  }
</script>

<section class="inspector-section">
  <h3>Export mappings</h3>
  <label class="field-label"
    >Target
    <select
      class="field mt-2 w-full"
      aria-label="Export target"
      bind:value={target}
    >
      {#each [...new Set( ['codex', 'shimeji', ...Object.keys(editor.project.exports)] )] as id}<option
          value={id}>{id}</option
        >{/each}
    </select>
  </label>
  {#each Object.entries(editor.project.exports[target] ?? {}) as [intent, source]}
    {@const composition = compositionInstance(source)}
    <label class="field-label mt-3"
      >{intent}
      <select
        class="field mt-1 w-full"
        aria-label={`Export ${target} ${intent}`}
        value={composition.composition}
        onchange={(e) => map(intent, e.currentTarget.value)}
      >
        <option value="">Remove mapping</option>
        {#each Object.entries(editor.project.compositions) as [id, c]}<option
            value={id}>{c.label}</option
          >{/each}
      </select>
    </label>
    <label class="field-label mt-2"
      >Output heading (degrees)
      <input
        class="field mt-1 w-full"
        type="number"
        step="1"
        aria-label={`Heading ${target} ${intent}`}
        placeholder="Inherit composition"
        value={composition.properties?.heading ?? ''}
        onchange={(e) =>
          place(intent, {
            properties:
              e.currentTarget.value === ''
                ? {}
                : {
                    ...composition.properties,
                    heading: e.currentTarget.valueAsNumber,
                  },
          })}
      />
    </label>
    <label class="field-label mt-2"
      >Heading space
      <select
        class="field mt-1 w-full"
        aria-label={`Heading space ${target} ${intent}`}
        value={composition.headingSpace ?? 'world'}
        onchange={(e) =>
          place(intent, {
            headingSpace: e.currentTarget.value as 'world' | 'view',
          })}
      >
        <option value="world">Character coordinates</option><option value="view"
          >Output camera</option
        >
      </select>
    </label>
  {/each}
  <label class="field-label mt-4"
    >New intent<input
      class="field mt-2 w-full"
      aria-label="New export intent"
      bind:value={name}
    /></label
  >
  <button
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

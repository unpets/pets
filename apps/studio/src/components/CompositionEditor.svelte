<script lang="ts">
  import { isDefaultMotion } from '@pets/three-runtime/default-motions';
  import InspectorSection from '@pets/kernel/components/InspectorSection.svelte';
  import { Plus, Copy, Unlink, Trash2 } from '@lucide/svelte';
  import { resolveComposition } from '@pets/three-runtime/project';
  import type { AnimationEditorState } from '../lib/animation-editor.svelte';
  import type { StudioController } from '../lib/types';
  let {
    editor,
    mode,
    studio,
    label = $bindable('New composition'),
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

<InspectorSection open>
  {#snippet heading()}Composition{/snippet}
  <div class="inspector-section">
    <label class="toggle-row"
      ><span>Supported motion</span><input
        type="checkbox"
        aria-label="Supported motion"
        checked={composition.enabled !== false}
        onchange={(event) =>
          editor.updateComposition(mode, {
            enabled: event.currentTarget.checked,
          })}
      /></label
    >
    <label class="field-label mt-3"
      >Description<textarea
        class="field mt-2 w-full"
        aria-label="Composition description"
        value={composition.description}
        onchange={(e) =>
          editor.updateComposition(mode, {
            description: e.currentTarget.value,
          })}></textarea></label
    >
    <label class="field-label mt-3"
      >Parent<select
        class="field mt-2 w-full"
        aria-label="Composition parent"
        value={composition.parent ?? ''}
        onchange={(e) =>
          run(() =>
            e.currentTarget.value
              ? editor.updateComposition(mode, {
                  parent: e.currentTarget.value,
                })
              : editor.detachComposition(mode),
          )}
        ><option value="">No parent</option
        >{#each parents as [id, value]}<option value={id}>{value.label}</option
          >{/each}</select
      ></label
    >
    <label class="field-label mt-3"
      >Screen<select
        class="field mt-2 w-full"
        aria-label="Composition screen"
        value={composition.screen ?? ''}
        onchange={(event) =>
          editor.updateComposition(mode, {
            screen: event.currentTarget.value || undefined,
          })}
      >
        <option value=""
          >{composition.parent
            ? 'Inherit parent screen'
            : 'No screen assigned'}</option
        >
        {#each Object.entries(editor.project.screens ?? {}) as [id, screen]}<option
            value={id}>{screen.label}</option
          >{/each}
      </select></label
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
    <label class="field-label mt-3"
      >Heading (degrees)
      <input
        class="field mt-2 w-full"
        type="number"
        step="1"
        aria-label="Composition heading"
        value={resolved.properties?.heading ?? 0}
        onchange={(e) =>
          run(() =>
            editor.updateComposition(mode, {
              properties: {
                ...composition.properties,
                heading: e.currentTarget.valueAsNumber,
              },
            }),
          )}
      />
    </label>
    <label class="field-label mt-3"
      >Turn speed (degrees per second)
      <input
        class="field mt-2 w-full"
        type="number"
        min="1"
        step="10"
        aria-label="Composition turn speed"
        value={resolved.properties?.turnSpeed ?? 240}
        onchange={(e) =>
          run(() =>
            editor.updateComposition(mode, {
              properties: {
                ...composition.properties,
                turnSpeed: e.currentTarget.valueAsNumber,
              },
            }),
          )}
      />
    </label>
    <label class="field-label mt-3"
      >Travel heading (degrees)
      <input
        class="field mt-2 w-full"
        type="number"
        step="1"
        aria-label="Composition travel heading"
        placeholder="Follow facing"
        value={resolved.properties?.travelHeading ?? ''}
        onchange={(e) =>
          run(() =>
            editor.updateComposition(mode, {
              properties: {
                ...composition.properties,
                travelHeading:
                  e.currentTarget.value === ''
                    ? undefined
                    : e.currentTarget.valueAsNumber,
              },
            }),
          )}
      />
    </label>
    <label class="field-label mt-3"
      >Animation speed
      <input
        class="field mt-2 w-full"
        type="number"
        min="0.01"
        step="0.1"
        aria-label="Composition animation speed"
        value={resolved.properties?.animationSpeed ?? 1}
        onchange={(e) =>
          run(() =>
            editor.updateComposition(mode, {
              properties: {
                ...composition.properties,
                animationSpeed: e.currentTarget.valueAsNumber,
              },
            }),
          )}
      />
    </label>
    <label class="field-label mt-3"
      >Walk speed (metres per second)
      <input
        class="field mt-2 w-full"
        type="number"
        min="0"
        step="0.1"
        aria-label="Composition walk speed"
        value={resolved.properties?.moveSpeed ?? 0.7}
        onchange={(e) =>
          run(() =>
            editor.updateComposition(mode, {
              properties: {
                ...composition.properties,
                moveSpeed: e.currentTarget.valueAsNumber,
              },
            }),
          )}
      />
    </label>
    <p class="mt-2 text-xs text-muted">
      Travel independently of facing to sidestep or walk backward. Animation
      speed sets cadence; walk speed sets distance per second.
    </p>
    {#if composition.properties && Object.keys(composition.properties).length}
      <button
        class="button mt-2 w-full"
        onclick={() => editor.updateComposition(mode, { properties: {} })}
      >
        {composition.parent ? 'Inherit placement' : 'Reset placement'}
      </button>
    {/if}
    <label class="field-label mt-4"
      >New composition name<input
        class="field mt-2 w-full"
        aria-label="New composition name"
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
        onclick={() =>
          run(() => select(editor.createComposition(label.trim())))}
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
        disabled={isDefaultMotion(mode)}
        onclick={() =>
          run(() => {
            editor.deleteComposition(mode);
            select(Object.keys(editor.project.compositions)[0]);
          })}><Trash2 size={13} />Delete composition</button
      >
    </div>
    {#if error}<p role="alert" class="mt-3 text-xs text-red-200">
        {error}
      </p>{/if}
  </div>
</InspectorSection>

<script lang="ts">
  import MeshLayerEditor from './MeshLayerEditor.svelte';
  import InspectorSection from '@pets/kernel/components/InspectorSection.svelte';
  import { Smile, Plus, Copy, Trash2 } from '@lucide/svelte';
  import type { AnimationEditorState } from '../lib/animation-editor.svelte';
  let {
    editor,
    oncustom,
  }: { editor: AnimationEditorState; oncustom: () => void } = $props();
  const component = $derived(editor.project.components[editor.component]);
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
{#if clip}<InspectorSection open>
    {#snippet heading()}Asset{/snippet}
    <div class="inspector-section">
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
      {#if component.kind === 'screen' && !clip.data.frames}<p
          class="mt-3 text-xs text-muted"
        >
          Atlas animation. Create a pixel component to draw custom frames.
        </p>{/if}
      <button
        class="button mt-4 w-full"
        onclick={() => run(() => editor.deleteClip())}
        ><Trash2 size={13} />Delete unassigned asset</button
      >
    </div>
  </InspectorSection>{/if}
{#if component.kind === 'face-mesh' && clip}<InspectorSection open
    >{#snippet heading()}Mesh design{/snippet}
    <div class="inspector-section">
      <MeshLayerEditor {editor} />
    </div></InspectorSection
  >{/if}
<InspectorSection open>
  {#snippet heading()}Library{/snippet}
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
      onclick={() => {
        editor.addMesh(label.trim());
        oncustom();
      }}>New mesh component</button
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
    <button
      class="button mt-2 w-full"
      disabled={!label.trim()}
      onclick={() => {
        editor.addScreen(label.trim());
        oncustom();
      }}>New custom layer</button
    >
    {#if error}<p role="alert" class="mt-3 text-xs text-red-200">
        {error}
      </p>{/if}
  </div>
</InspectorSection>

{#if component.kind === 'screen' && !['eyes', 'mouth', 'background', 'activity'].includes(component.data.layer as string)}
  <InspectorSection open>
    {#snippet heading()}Layer placement{/snippet}
    <div class="inspector-section">
      {#each ['x', 'y', 'opacity'] as field}
        <label class="field-label mt-3 block"
          >{field === 'opacity' ? 'Opacity' : field.toUpperCase()}
          <input
            class="field mt-2 w-full"
            type="number"
            min={field === 'opacity' ? 0 : -96}
            max={field === 'opacity' ? 1 : 96}
            step={field === 'opacity' ? 0.05 : 1}
            value={(
              component.data.style as Record<string, number> | undefined
            )?.[field] ?? (field === 'opacity' ? 1 : 0)}
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
    </div>
  </InspectorSection>
{/if}

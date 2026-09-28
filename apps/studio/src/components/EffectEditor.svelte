<script lang="ts">
  import InspectorSection from '@pets/kernel/components/InspectorSection.svelte';
  import type { AnimationEditorState } from '../lib/animation-editor.svelte';
  let { editor }: { editor: AnimationEditorState } = $props();
  const component = $derived(editor.project.components[editor.component]);
  const clip = $derived(editor.project.clips[editor.clip]);
  const nodes = $derived([
    ...new Set(
      Object.values(editor.project.components)
        .filter((c) => c.kind === 'rig')
        .flatMap((c) => c.data.nodes as string[]),
    ),
  ]);
  let error = $state('');
  function change(update: Record<string, unknown>) {
    try {
      editor.editClip({ data: { ...clip.data, ...update } });
      error = '';
    } catch (reason) {
      error = String(reason);
    }
  }
</script>

<InspectorSection open>
  {#snippet heading()}Particle effect{/snippet}
  <div class="inspector-section">
    <label class="field-label"
      >Attachments<select
        multiple
        class="field mt-2 w-full"
        aria-label="Effect attachments"
        value={component.data.nodes as string[]}
        onchange={(e) => {
          try {
            editor.editComponent({
              data: {
                ...component.data,
                nodes: Array.from(
                  e.currentTarget.selectedOptions,
                  (option) => option.value,
                ),
              },
            });
            error = '';
          } catch (reason) {
            error = String(reason);
          }
        }}
        >{#each nodes as node}<option value={node}>{node}</option
          >{/each}</select
      ></label
    >
    <label class="field-label mt-3"
      >Color<input
        class="field mt-2 w-full"
        type="color"
        aria-label="Effect color"
        value={clip.data.color as string}
        onchange={(e) => change({ color: e.currentTarget.value })}
      /></label
    >
    {#each [{ key: 'count', label: 'Particles', min: 1, max: 128, step: 1 }, { key: 'lifetime', label: 'Lifetime (seconds)', min: 0.01, max: 30, step: 0.05 }, { key: 'radius', label: 'Radius (metres)', min: 0.001, max: 1, step: 0.001 }, { key: 'spread', label: 'Spread', min: 0, max: 10, step: 0.01 }] as field}
      <label class="field-label mt-3"
        >{field.label}<input
          class="field mt-2 w-full"
          type="number"
          aria-label={`Effect ${field.key}`}
          min={field.min}
          max={field.max}
          step={field.step}
          value={clip.data[field.key] as number}
          onchange={(e) =>
            change({ [field.key]: e.currentTarget.valueAsNumber })}
        /></label
      >
    {/each}
    {#each ['offset', 'velocity', 'gravity'] as key}
      <p class="field-label mt-3">{key}</p>
      <div class="grid grid-cols-3 gap-2">
        {#each ['X', 'Y', 'Z'] as axis, index}<label class="field-label"
            >{axis}<input
              class="field mt-1 w-full"
              type="number"
              step="0.01"
              aria-label={`Effect ${key} ${axis}`}
              value={(clip.data[key] as number[])[index]}
              onchange={(e) => {
                const vector = [...(clip.data[key] as number[])];
                vector[index] = e.currentTarget.valueAsNumber;
                change({ [key]: vector });
              }}
            /></label
          >{/each}
      </div>
    {/each}
    {#if error}<p role="alert" class="mt-3 text-xs text-red-200">
        {error}
      </p>{/if}
  </div>
</InspectorSection>

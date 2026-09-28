<script lang="ts">
  import InspectorSection from '@pets/kernel/components/InspectorSection.svelte';
  import {
    bindMotionLayer,
    layerSources,
    motionLayers,
  } from '@pets/three-runtime/layers';
  import { resolveComposition } from '@pets/three-runtime/project';
  import type { Binding } from '@pets/three-runtime/project';
  import type { AnimationEditorState } from '../lib/animation-editor.svelte';
  let { editor, mode }: { editor: AnimationEditorState; mode: string } =
    $props();
  let expanded = $state<Record<string, boolean>>({ head: true });
  const layers = $derived(motionLayers(editor.project));
  const composition = $derived(resolveComposition(editor.project, mode));
  function bindings(components: string[]) {
    return components.map((id) => composition.bindings[id]);
  }
  function shared(components: string[], field: keyof Binding) {
    const values = bindings(components).map((binding) => binding?.[field]);
    return values.every((value) => value === values[0]) ? values[0] : undefined;
  }
  function selectedSource(components: string[]) {
    const values = bindings(components).map(
      (binding) => binding && editor.project.clips[binding.clip].data.source,
    );
    return values.every((value) => value === values[0])
      ? String(values[0] ?? '')
      : '';
  }
  function update(
    components: string[],
    value: Partial<Binding>,
    source?: string,
  ) {
    editor.replace(
      bindMotionLayer(
        $state.snapshot(editor.project),
        mode,
        components,
        value,
        source,
      ),
    );
  }
</script>

<InspectorSection open>
  {#snippet heading()}Motion layers{/snippet}
  <div class="inspector-section">
    {#each layers as layer}
      <details class="mt-4" bind:open={expanded[layer.id]}>
        <summary class="cursor-pointer text-xs font-medium"
          >{layer.label}</summary
        >
        {#if editor.project.compositions[mode].parent}<button
            class="button mt-2 w-full"
            onclick={() => editor.resetBinding(mode, layer.components)}
            >Inherit {layer.label.toLowerCase()}</button
          >{/if}
        <label class="field-label mt-3 block">
          Motion
          <select
            class="field mt-2 w-full"
            aria-label={`${layer.label} motion`}
            value={selectedSource(layer.components)}
            onchange={(event) =>
              update(
                layer.components,
                { enabled: true, clock: 'independent' },
                event.currentTarget.value,
              )}
          >
            <option value="" disabled>Custom combination</option>
            {#each layerSources(editor.project, layer.components) as clip}
              <option value={clip.source}>{clip.label}</option>
            {/each}
          </select>
        </label>
        <label class="toggle-row mt-3"
          ><span>Enabled</span><input
            type="checkbox"
            aria-label={`${layer.label} enabled`}
            checked={shared(layer.components, 'enabled') === true}
            onchange={(event) =>
              update(layer.components, {
                enabled: event.currentTarget.checked,
              })}
          /></label
        >
        <label class="field-label mt-3 block"
          >Clock
          <select
            class="field mt-2 w-full"
            aria-label={`${layer.label} clock`}
            value={shared(layer.components, 'clock') ?? ''}
            onchange={(event) =>
              update(layer.components, {
                clock: event.currentTarget.value as Binding['clock'],
              })}
          >
            <option value="" disabled>Mixed clocks</option><option
              value="independent">Independent</option
            ><option value="composition">Sync to composition</option>
          </select>
        </label>
        <div class="mt-3 grid grid-cols-2 gap-2">
          {#each ['speed', 'offset'] as field}
            <label class="field-label"
              >{field === 'speed' ? 'Speed' : 'Phase offset'}
              <input
                class="field mt-2 w-full"
                type="number"
                step="0.05"
                min={field === 'speed' ? 0 : -10}
                aria-label={`${layer.label} ${field}`}
                value={shared(layer.components, field as keyof Binding) ?? ''}
                onchange={(event) => {
                  const value = event.currentTarget.valueAsNumber;
                  if (
                    Number.isFinite(value) &&
                    (field !== 'speed' || value >= 0)
                  )
                    update(layer.components, { [field]: value });
                }}
              />
            </label>
          {/each}
        </div>
      </details>
    {/each}
  </div>
</InspectorSection>

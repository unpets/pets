<script lang="ts">
  import InspectorSection from '@pets/kernel/components/InspectorSection.svelte';
  import { parseLookAt, type LookAtSettings } from '@pets/kernel/look-at';
  import type { AnimationEditorState } from '../lib/animation-editor.svelte';
  let { editor }: { editor: AnimationEditorState } = $props();
  const settings = $derived(
    parseLookAt(editor.project.clips[editor.clip].data.lookAt),
  );
  let error = $state('');
  function change(update: Partial<LookAtSettings>) {
    try {
      editor.editClip({
        data: { lookAt: parseLookAt({ ...settings, ...update }) },
      });
      error = '';
    } catch (reason) {
      error = String(reason);
    }
  }
</script>

<InspectorSection open>
  {#snippet heading()}Lookat target{/snippet}
  <div class="inspector-section">
    <label class="field-label"
      >Follow target<select
        class="field mt-2 w-full"
        aria-label="Lookat target"
        value={settings.target}
        onchange={(event) =>
          change({
            target: event.currentTarget.value as LookAtSettings['target'],
          })}
        ><option value="point">Scene point</option><option value="pointer"
          >Pointer</option
        ></select
      ></label
    >
    <p class="mt-3 text-xs text-muted">
      {settings.target === 'pointer'
        ? 'Follows the pointer in the viewport. The scene point is used when the pointer is absent and when baking.'
        : 'Follows this point in scene coordinates.'}
    </p>
    <div class="mt-4 grid grid-cols-3 gap-2">
      {#each ['X', 'Y', 'Z'] as axis, index}<label class="field-label"
          >{axis}<input
            class="field mt-2 w-full"
            aria-label={`Lookat ${axis}`}
            type="number"
            step="0.1"
            value={settings.position[index]}
            onchange={(event) => {
              const position: LookAtSettings['position'] = [
                ...settings.position,
              ];
              position[index] = event.currentTarget.valueAsNumber;
              change({ position });
            }}
          /></label
        >{/each}
    </div>
    <label class="field-label mt-4"
      >Response<input
        class="field mt-2 w-full"
        aria-label="Lookat response"
        type="number"
        min="0.1"
        max="60"
        step="0.5"
        value={settings.response}
        onchange={(event) =>
          change({ response: event.currentTarget.valueAsNumber })}
      /></label
    >
    <label class="field-label mt-4"
      >Weight<input
        class="field mt-2 w-full"
        aria-label="Lookat weight"
        type="number"
        min="0"
        max="1"
        step="0.05"
        value={settings.weight}
        onchange={(event) =>
          change({ weight: event.currentTarget.valueAsNumber })}
      /></label
    >
    {#if error}<p role="alert" class="mt-3 text-xs text-red-200">
        {error}
      </p>{/if}
  </div>
</InspectorSection>

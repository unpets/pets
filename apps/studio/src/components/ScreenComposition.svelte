<script lang="ts">
  import { Monitor, Trash2 } from '@lucide/svelte';
  import { compatibleClip, type Binding } from '@pets/three-runtime/project';
  import { parseScreenProject } from '@pets/kernel/screen-project';
  import type { AnimationEditorState } from '../lib/animation-editor.svelte';
  let {
    editor,
    selected,
    oncomponents,
  }: {
    editor: AnimationEditorState;
    selected: string;
    oncomponents: (id: string) => void;
  } = $props();
  const screen = $derived(editor.project.screens![selected]);
  const settings = $derived(parseScreenProject(screen.data));
  const slots = $derived(
    settings.eyeMode === 'paired'
      ? ['eyes', 'mouth', 'background', 'activity']
      : ['eyeLeft', 'eyeRight', 'mouth', 'background', 'activity'],
  );
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

<div class="inspector-heading">
  <h2><Monitor size={15} />Screen composition</h2>
</div>
<details class="inspector-stack" open>
  <summary>Screen</summary>
  <div class="inspector-section">
    <label class="field-label"
      >Name<input
        class="field mt-2 w-full"
        aria-label="Screen name"
        value={screen.label}
        onchange={(event) =>
          editor.renameScreen(selected, event.currentTarget.value)}
      /></label
    >
    <p class="mt-3 text-xs text-muted">
      Changes apply to every composition using this screen.
    </p>
    <button
      class="button mt-4 w-full"
      onclick={() => run(() => editor.deleteScreen(selected))}
      ><Trash2 size={13} />Delete unassigned screen</button
    >
    {#if error}<p role="alert" class="mt-3 text-xs text-red-200">
        {error}
      </p>{/if}
  </div>
</details>
<details class="inspector-stack" open>
  <summary>Face components</summary>
  <div class="inspector-section">
    <label class="field-label"
      >Eye layout<select
        class="field mt-2 w-full"
        aria-label="Eye layout"
        value={settings.eyeMode}
        onchange={(event) =>
          run(() =>
            editor.eyeMode(
              selected,
              event.currentTarget.value as typeof settings.eyeMode,
            ),
          )}
      >
        <option value="paired">Paired eyes</option><option value="mirrored"
          >Mirror left eye</option
        ><option value="independent">Independent eyes</option>
      </select></label
    >
    {#each slots as slot}
      {@const id = `screen/${slot}`}
      {@const label =
        slot === 'eyeLeft'
          ? 'Left eye'
          : slot === 'eyeRight'
            ? 'Right eye'
            : slot[0].toUpperCase() + slot.slice(1)}
      {@const source = screen.bindings[id]}
      {@const linked = slot === 'eyeRight' && settings.eyeMode === 'mirrored'}
      <details class="face-slot mt-4">
        <summary
          >{label}<span
            class="float-right max-w-32 truncate text-[10px] font-normal text-muted"
            >{source
              ? editor.project.clips[source.clip].label
              : 'Unassigned'}</span
          ></summary
        >
        <label class="field-label mt-3"
          >Asset<select
            class="field mt-2 w-full"
            aria-label={`${label} asset`}
            value={source?.clip ?? ''}
            disabled={linked}
            onchange={(event) =>
              editor.bindScreen(selected, id, {
                clip: event.currentTarget.value,
                enabled: true,
              })}
          >
            <option value="" disabled>Select an asset</option>
            {#each Object.entries(editor.project.clips).filter( ([clip]) => compatibleClip(editor.project, id, clip) ) as [clip, value]}<option
                value={clip}>{value.label}</option
              >{/each}
          </select></label
        >
        {#if source}
          <label class="toggle-row mt-2"
            ><span>Enabled</span><input
              aria-label={`${label} enabled`}
              type="checkbox"
              checked={source.enabled}
              disabled={linked}
              onchange={(event) =>
                editor.bindScreen(selected, id, {
                  enabled: event.currentTarget.checked,
                })}
            /></label
          >
          <label class="field-label mt-3"
            >Clock<select
              class="field mt-2 w-full"
              aria-label={`${label} clock`}
              value={source.clock}
              disabled={linked}
              onchange={(event) =>
                editor.bindScreen(selected, id, {
                  clock: event.currentTarget.value as Binding['clock'],
                })}
              ><option value="independent">Independent</option><option
                value="composition">Composition</option
              ></select
            ></label
          >
          <div class="mt-3 grid grid-cols-2 gap-2">
            {#each ['speed', 'offset'] as const as field}<label
                class="field-label"
                >{field === 'speed' ? 'Speed' : 'Phase offset'}<input
                  class="field mt-2 w-full"
                  aria-label={`${label} ${field}`}
                  type="number"
                  step="0.05"
                  min={field === 'speed' ? 0 : undefined}
                  value={source[field]}
                  disabled={linked}
                  onchange={(event) => {
                    if (Number.isFinite(event.currentTarget.valueAsNumber))
                      run(() =>
                        editor.bindScreen(selected, id, {
                          [field]: event.currentTarget.valueAsNumber,
                        }),
                      );
                  }}
                /></label
              >{/each}
          </div>
          <button class="button mt-3 w-full" onclick={() => oncomponents(id)}
            >Edit {label.toLowerCase()} asset</button
          >
        {/if}
      </details>
    {/each}
  </div>
</details>

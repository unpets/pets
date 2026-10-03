<script lang="ts">
  import FaceTransformEditor from './FaceTransformEditor.svelte';
  import { identityTransform } from '@pets/three-runtime/face';
  import InspectorSection from '@pets/kernel/components/InspectorSection.svelte';
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
  const slots = $derived([
    ...(settings.eyeMode === 'paired'
      ? ['eyes', 'mouth', 'background', 'activity']
      : ['eyeLeft', 'eyeRight', 'mouth', 'background', 'activity']
    ).map((slot) => `screen/${slot}`),
    ...Object.entries(editor.project.components)
      .filter(
        ([, component]) =>
          component.kind === 'face-mesh' ||
          (component.kind === 'screen' &&
            ![
              'eyes',
              'eyeLeft',
              'eyeRight',
              'mouth',
              'background',
              'activity',
            ].includes(String(component.data.layer))),
      )
      .map(([id]) => id),
  ]);
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
  <h2><Monitor size={15} />Screen design</h2>
</div>
<InspectorSection open>
  {#snippet heading()}Screen{/snippet}
  <div class="inspector-section">
    <label class="toggle-row"
      ><span>Canvas surface</span><input
        type="checkbox"
        aria-label="Canvas surface"
        checked={screen.surface?.canvas ?? true}
        onchange={(event) =>
          editor.updateFaceSurface(selected, {
            canvas: event.currentTarget.checked,
            placements: screen.surface?.placements ?? {},
          })}
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
</InspectorSection>
<InspectorSection open>
  {#snippet heading()}Face components{/snippet}
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
    {#each slots as id}
      {@const slot = String(editor.project.components[id].data.layer)}
      {@const label = editor.project.components[id].label}
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
          {#if editor.project.components[id].kind === 'face-mesh'}
            <div class="mt-4">
              <FaceTransformEditor
                value={screen.surface?.placements[id] ?? identityTransform()}
                onchange={(value) =>
                  editor.updateFaceSurface(selected, {
                    canvas: screen.surface?.canvas ?? true,
                    placements: { ...screen.surface?.placements, [id]: value },
                  })}
              />
            </div>
          {/if}
          <button
            class="button mt-3 w-full"
            onclick={() => editor.unbindScreen(selected, id)}
            >Unassign asset</button
          >
          <button class="button mt-3 w-full" onclick={() => oncomponents(id)}
            >Edit {label.toLowerCase()} asset</button
          >
        {/if}
      </details>
    {/each}
  </div>
</InspectorSection>

<script lang="ts">
  import { Plus, Trash2 } from '@lucide/svelte';
  import type { AnimationEditorState } from '../lib/animation-editor.svelte';
  let { editor }: { editor: AnimationEditorState } = $props();
  let error = $state('');
  const clip = $derived(editor.project.clips[editor.clip]);
  const kind = $derived(editor.project.components[editor.component].kind);
  const frames = $derived(
    (clip.data.keyframes ?? []) as (
      { time: number; rotation: number[] } | number[]
    )[],
  );
  function update(index: number, field: number, value: number) {
    try {
      const next = structuredClone($state.snapshot(frames));
      if (kind === 'emission') (next[index] as number[])[field] = value;
      else {
        const f = next[index] as { time: number; rotation: number[] };
        if (field === 0) f.time = value;
        else f.rotation[field - 1] = value;
      }
      editor.editClip({ data: { keyframes: next } });
      error = '';
    } catch (reason) {
      error = String(reason);
    }
  }
  function add() {
    const times = frames.map((f) => (Array.isArray(f) ? f[0] : f.time));
    const spans = [0, ...times, clip.duration]
      .map((v, i, a) => [v, a[i + 1] ?? v])
      .sort((a, b) => b[1] - b[0] - (a[1] - a[0]));
    const time = (spans[0][0] + spans[0][1]) / 2;
    if (times.includes(time)) return;
    const next = [
      ...$state.snapshot(frames),
      kind === 'emission' ? [time, 0] : { time, rotation: [0, 0, 0] },
    ];
    next.sort(
      (a, b) =>
        (Array.isArray(a) ? a[0] : a.time) - (Array.isArray(b) ? b[0] : b.time),
    );
    editor.editClip({ data: { keyframes: next } });
  }
</script>

{#if clip.data.keyframes}
  <section class="inspector-section">
    <h3>
      {kind === 'emission' ? 'Emission keyframes' : 'Joint rotation keyframes'}
    </h3>
    <p class="mb-3 text-xs text-muted">
      {kind === 'emission'
        ? 'Time in seconds and emission intensity.'
        : 'Local rotation in degrees. Joint attachment is preserved.'}
    </p>
    {#each frames as frame, index}
      <div class="mb-2 flex items-end gap-1">
        {#each Array.isArray(frame) ? ['Time', 'Value'] : ['Time', 'X', 'Y', 'Z'] as label, field}
          <label class="field-label min-w-0 flex-1"
            >{label}<input
              class="field mt-1 w-full px-1"
              aria-label={`Keyframe ${index + 1} ${label}`}
              type="number"
              step={field === 0 ? 0.05 : 1}
              value={Array.isArray(frame)
                ? frame[field]
                : field === 0
                  ? frame.time
                  : frame.rotation[field - 1]}
              onchange={(e) =>
                update(index, field, e.currentTarget.valueAsNumber)}
            /></label
          >
        {/each}
        <button
          class="icon-button"
          aria-label={`Delete keyframe ${index + 1}`}
          disabled={frames.length === 1}
          onclick={() =>
            editor.editClip({
              data: { keyframes: frames.filter((_, i) => i !== index) },
            })}><Trash2 size={12} /></button
        >
      </div>
    {/each}
    <button class="button mt-2 w-full" onclick={add}
      ><Plus size={13} />Add keyframe</button
    >
    {#if error}<p class="mt-2 text-xs text-red-200" role="alert">
        {error}
      </p>{/if}
  </section>
{:else if kind === 'visibility'}
  <section class="inspector-section">
    <h3>Visibility</h3>
    <label class="toggle-row"
      ><span>Show prop</span><input
        type="checkbox"
        aria-label="Clip prop visible"
        checked={clip.data.visible === true}
        onchange={(e) =>
          editor.editClip({ data: { visible: e.currentTarget.checked } })}
      /></label
    >
  </section>
{/if}

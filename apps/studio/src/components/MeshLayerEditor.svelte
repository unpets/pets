<script lang="ts">
  import FaceTransformEditor from './FaceTransformEditor.svelte';
  import {
    identityFrame,
    type FaceFrame,
    type FaceGeometry,
  } from '@pets/three-runtime/face';
  import type { AnimationEditorState } from '../lib/animation-editor.svelte';
  let { editor }: { editor: AnimationEditorState } = $props();
  const component = $derived(editor.project.components[editor.component]);
  const clip = $derived(editor.project.clips[editor.clip]);
  const geometry = $derived(component.data.geometry as FaceGeometry);
  const frames = $derived(clip.data.keyframes as FaceFrame[]);
  const nodes = $derived(
    Object.values(editor.project.components)
      .filter((c) => c.kind === 'rig')
      .flatMap((c) => c.data.nodes as string[]),
  );
  let index = $state(0),
    source = $state(''),
    error = $state('');
  $effect(() => {
    source = JSON.stringify(geometry, null, 2);
    index = Math.min(index, frames.length - 1);
  });
  function run(action: () => void) {
    try {
      action();
      error = '';
    } catch (reason) {
      error = String(reason);
    }
  }
  function frame(update: Partial<FaceFrame>) {
    const next = structuredClone(frames);
    next[index] = { ...next[index], ...update };
    run(() => editor.editClip({ data: { ...clip.data, keyframes: next } }));
  }
</script>

<div class="space-y-4">
  <label class="field-label"
    >Geometry<select
      class="field mt-2 w-full"
      aria-label="Mesh geometry"
      value={geometry.type}
      onchange={(event) =>
        run(() =>
          editor.editComponent({
            data: {
              ...component.data,
              geometry:
                event.currentTarget.value === 'mesh'
                  ? {
                      type: 'mesh',
                      positions: [-0.5, -0.5, 0, 0.5, -0.5, 0, 0, 0.5, 0],
                      indices: [0, 1, 2],
                    }
                  : { type: event.currentTarget.value },
            },
          }),
        )}
      ><option value="sphere">Sphere</option><option value="box">Box</option
      ><option value="plane">Plane</option><option value="mesh"
        >Indexed mesh</option
      ></select
    ></label
  >
  <label class="field-label"
    >Color<input
      class="field mt-2 w-full"
      aria-label="Mesh color"
      type="color"
      value={component.data.color as string}
      onchange={(event) =>
        editor.editComponent({
          data: { ...component.data, color: event.currentTarget.value },
        })}
    /></label
  >
  {#if geometry.type === 'mesh'}
    <label class="field-label"
      >Portable geometry<textarea
        class="field mt-2 min-h-32 w-full font-mono text-xs"
        aria-label="Portable mesh geometry"
        bind:value={source}></textarea></label
    >
    <button
      class="button"
      onclick={() =>
        run(() =>
          editor.editComponent({
            data: { ...component.data, geometry: JSON.parse(source) },
          }),
        )}>Apply geometry</button
    >
  {/if}
  {#if component.kind === 'attachment'}
    <label class="field-label"
      >Rig anchor<select
        class="field mt-2 w-full"
        aria-label="Attachment rig anchor"
        value={component.data.node as string}
        onchange={(event) =>
          editor.editComponent({
            data: { ...component.data, node: event.currentTarget.value },
          })}
        >{#each nodes as node}<option value={node}>{node}</option
          >{/each}</select
      ></label
    >
    <details>
      <summary class="field-label">Replaced parts</summary
      >{#each nodes as node}<label class="toggle-row"
          ><span>{node}</span><input
            type="checkbox"
            checked={(component.data.hides as string[]).includes(node)}
            onchange={(event) =>
              editor.editComponent({
                data: {
                  ...component.data,
                  hides: event.currentTarget.checked
                    ? [...(component.data.hides as string[]), node]
                    : (component.data.hides as string[]).filter(
                        (n) => n !== node,
                      ),
                },
              })}
          /></label
        >{/each}
    </details>
  {/if}
  <label class="field-label"
    >Keyframe<select
      class="field mt-2 w-full"
      aria-label="Mesh keyframe"
      bind:value={index}
      >{#each frames as f, i}<option value={i}>{f.time.toFixed(3)} s</option
        >{/each}</select
    ></label
  >
  <label class="field-label"
    >Time<input
      class="field mt-2 w-full"
      aria-label="Mesh keyframe time"
      type="number"
      min="0"
      max={clip.duration}
      step="0.01"
      value={frames[index].time}
      onchange={(event) => frame({ time: event.currentTarget.valueAsNumber })}
    /></label
  >
  <FaceTransformEditor
    value={frames[index]}
    units={component.kind === 'attachment' ? 'metres' : 'face widths'}
    onchange={frame}
  />
  <label class="field-label"
    >Opacity<input
      class="field mt-2 w-full"
      aria-label="Mesh opacity"
      type="number"
      min="0"
      max="1"
      step="0.05"
      value={frames[index].opacity}
      onchange={(event) =>
        frame({ opacity: event.currentTarget.valueAsNumber })}
    /></label
  >
  <div class="flex gap-2">
    <button
      class="button"
      onclick={() => {
        const left = frames[index],
          right = frames[index + 1];
        const time = right
          ? (left.time + right.time) / 2
          : (left.time + clip.duration) / 2;
        if (time <= left.time) return;
        const next = [
          ...frames,
          { ...identityFrame(time), ...structuredClone(left), time },
        ].sort((a, b) => a.time - b.time);
        run(() => editor.editClip({ data: { ...clip.data, keyframes: next } }));
        index = next.findIndex((f) => f.time === time);
      }}>Add keyframe</button
    ><button
      class="button"
      disabled={frames.length === 1}
      onclick={() => {
        const next = frames.filter((_, i) => i !== index);
        index = 0;
        editor.editClip({ data: { ...clip.data, keyframes: next } });
      }}>Delete keyframe</button
    >
  </div>
  {#if error}<p role="alert" class="text-xs text-red-200">{error}</p>{/if}
</div>

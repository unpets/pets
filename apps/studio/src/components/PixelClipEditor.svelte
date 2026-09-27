<script lang="ts">
  import { Plus, Copy, Trash2, Eraser, Pencil } from '@lucide/svelte';
  import type { AnimationEditorState } from '../lib/animation-editor.svelte';
  let { editor }: { editor: AnimationEditorState } = $props();
  let canvas = $state<HTMLCanvasElement>();
  let frame = $state(0);
  let color = $state('#4feff3');
  let erasing = $state(false);
  let size = $state(2);
  let painting = false;
  const clip = $derived(editor.project.clips[editor.clip]);
  const frames = $derived(clip.data.frames as [number, number, string][][]);
  $effect(() => {
    if (frame >= frames.length) frame = frames.length - 1;
  });
  $effect(() => {
    const context = canvas?.getContext('2d');
    if (!context) return;
    context.clearRect(0, 0, 96, 64);
    for (const [x, y, fill] of frames[frame] ?? []) {
      context.fillStyle = fill;
      context.fillRect(x, y, 1, 1);
    }
  });
  function draw(event: PointerEvent) {
    if (!painting || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor(((event.clientX - rect.left) / rect.width) * 96);
    const y = Math.floor(((event.clientY - rect.top) / rect.height) * 64);
    const pixels = new Map(
      (frames[frame] ?? []).map(([px, py, fill]) => [
        `${px},${py}`,
        [px, py, fill] as [number, number, string],
      ]),
    );
    for (let dx = 0; dx < size; dx++)
      for (let dy = 0; dy < size; dy++) {
        const px = x + dx,
          py = y + dy;
        if (px < 0 || px >= 96 || py < 0 || py >= 64) continue;
        if (erasing) pixels.delete(`${px},${py}`);
        else pixels.set(`${px},${py}`, [px, py, color]);
      }
    const next = frames.map((pixels, index) =>
      index === frame ? [...pixels] : pixels,
    );
    next[frame] = [...pixels.values()];
    editor.editClip({ data: { frames: next } }, 'paint');
  }
  function stop() {
    painting = false;
    editor.endGesture();
  }
  function add(duplicate: boolean) {
    const next = [...frames, duplicate ? frames[frame].map((p) => [...p]) : []];
    editor.editClip({ data: { frames: next } });
    frame = next.length - 1;
  }
</script>

<section class="pixel-clip-editor" aria-label="Pixel clip editor">
  <div class="flex flex-wrap items-center justify-between gap-3 p-4">
    <span class="eyebrow">{clip.label}</span><span
      class="text-[10px] text-muted">96 × 64 · RGBA</span
    >
  </div>
  <div class="flex flex-wrap items-center justify-center gap-2 px-4">
    <button
      class="icon-button"
      class:selected={!erasing}
      aria-label="Paint pixels"
      onclick={() => (erasing = false)}><Pencil size={15} /></button
    >
    <button
      class="icon-button"
      class:selected={erasing}
      aria-label="Erase pixels"
      onclick={() => (erasing = true)}><Eraser size={15} /></button
    >
    <input type="color" aria-label="Brush color" bind:value={color} />
    <label class="text-xs text-muted"
      >Brush <select
        class="field compact"
        aria-label="Brush size"
        bind:value={size}
        >{#each [1, 2, 4, 8] as value}<option {value}>{value} px</option
          >{/each}</select
      ></label
    >
  </div>
  <div class="flex min-h-0 flex-1 items-center justify-center p-6">
    <canvas
      bind:this={canvas}
      width="96"
      height="64"
      aria-label="Paint clip frame"
      style="width:100%;max-width:576px;aspect-ratio:3/2;image-rendering:pixelated;touch-action:none;background-color:#07151d;background-image:conic-gradient(#152935 25%,transparent 0 50%,#152935 0 75%,transparent 0);background-size:16px 16px;box-shadow:0 0 0 1px #334b5b"
      onpointerdown={(event) => {
        painting = true;
        canvas?.setPointerCapture(event.pointerId);
        draw(event);
      }}
      onpointermove={draw}
      onpointerup={stop}
      onpointercancel={stop}
      onlostpointercapture={stop}
    ></canvas>
  </div>
  <div class="flex flex-wrap items-center justify-center gap-2 p-4">
    <label class="text-xs text-muted"
      >Frame <select
        class="field compact"
        aria-label="Clip frame"
        bind:value={frame}
        >{#each frames as _, index}<option value={index}>{index + 1}</option
          >{/each}</select
      ></label
    >
    <button
      class="icon-button"
      aria-label="Add clip frame"
      disabled={frames.length >= 240}
      onclick={() => add(false)}><Plus size={14} /></button
    >
    <button
      class="icon-button"
      aria-label="Duplicate clip frame"
      disabled={frames.length >= 240}
      onclick={() => add(true)}><Copy size={14} /></button
    >
    <button
      class="icon-button"
      aria-label="Delete clip frame"
      disabled={frames.length === 1}
      onclick={() =>
        editor.editClip({
          data: { frames: frames.filter((_, i) => i !== frame) },
        })}><Trash2 size={14} /></button
    >
  </div>
</section>

<script lang="ts">
  import { Monitor, Plus, Copy } from '@lucide/svelte';
  import type { AnimationEditorState } from '../lib/animation-editor.svelte';
  let {
    editor,
    selected,
    onselect,
  }: {
    editor: AnimationEditorState;
    selected: string;
    onselect: (id: string) => void;
  } = $props();
</script>

<aside class="animation-browser" aria-label="Screens library">
  <div class="browser-heading">
    <h2 class="eyebrow">SCREENS</h2>
    <span>{Object.keys(editor.project.screens ?? {}).length}</span>
  </div>
  <div class="clip-list">
    {#each Object.entries(editor.project.screens ?? {}) as [id, screen]}
      <button
        class="clip-button"
        data-selected={selected === id}
        aria-pressed={selected === id}
        onclick={() => onselect(id)}
        ><Monitor size={15} /><span>{screen.label}</span></button
      >
    {/each}
  </div>
  <div class="mt-auto grid gap-2 border-t border-line p-3">
    <button
      class="button"
      onclick={() => onselect(editor.createScreen('New screen'))}
      ><Plus size={14} />New screen</button
    >
    <button
      class="button"
      disabled={!selected}
      onclick={() =>
        onselect(
          editor.createScreen(
            `${editor.project.screens![selected].label} copy`,
            selected,
          ),
        )}><Copy size={14} />Duplicate screen</button
    >
  </div>
</aside>

<script lang="ts">
  import { Shapes } from '@lucide/svelte';
  import type { AnimationEditorState } from '../lib/animation-editor.svelte';
  let {
    editor,
    kind = $bindable('eyes'),
  }: { editor: AnimationEditorState; kind?: string } = $props();
  const clips = $derived(
    Object.entries(editor.project.clips).filter(([, clip]) => {
      const component = editor.project.components[clip.component];
      return (
        component.kind === 'screen' &&
        (kind === 'custom'
          ? !['eyes', 'mouth', 'background', 'activity'].includes(
              String(component.data.family ?? component.data.layer),
            )
          : (component.data.family ?? component.data.layer) === kind)
      );
    }),
  );
  function select(id: string) {
    editor.component = editor.project.clips[id].component;
    editor.clip = id;
  }
  $effect(() => {
    if (!clips.some(([id]) => id === editor.clip) && clips[0])
      select(clips[0][0]);
  });
</script>

<aside class="animation-browser" aria-label="Face components library">
  <div class="browser-heading"><h2 class="eyebrow">FACE COMPONENTS</h2></div>
  <nav class="face-categories" aria-label="Face component type">
    {#each ['eyes', 'mouth', 'background', 'activity', 'custom'] as type}<button
        class:active={kind === type}
        aria-pressed={kind === type}
        onclick={() => (kind = type)}
        >{type[0].toUpperCase() + type.slice(1)}</button
      >{/each}
  </nav>
  <div class="clip-list mt-3">
    {#each clips as [id, clip]}<button
        class="clip-button"
        data-selected={editor.clip === id}
        aria-pressed={editor.clip === id}
        onclick={() => select(id)}
        ><Shapes size={14} /><span>{clip.label}</span></button
      >{/each}
  </div>
</aside>

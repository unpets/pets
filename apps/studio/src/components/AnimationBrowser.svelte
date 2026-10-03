<script lang="ts">
  import { isFaceComponent } from '@pets/three-runtime/face';
  import SidebarRename from './SidebarRename.svelte';
  import { Clapperboard } from '@lucide/svelte';
  import { compatibleClip } from '@pets/three-runtime/project';
  import type { AnimationEditorState } from '../lib/animation-editor.svelte';
  let { editor }: { editor: AnimationEditorState } = $props();
  const components = $derived(
    Object.entries(editor.project.components).filter(
      ([, value]) => !isFaceComponent(value.kind),
    ),
  );
  const clips = $derived(
    Object.entries(editor.project.clips).filter(([id]) =>
      compatibleClip(editor.project, editor.component, id),
    ),
  );
  function select(id: string) {
    editor.component = id;
    editor.clip =
      Object.keys(editor.project.clips).find((clip) =>
        compatibleClip(editor.project, id, clip),
      ) ?? '';
  }
  $effect(() => {
    if (!components.some(([id]) => id === editor.component) && components[0])
      select(components[0][0]);
  });
</script>

<aside class="animation-browser" aria-label="Animation parts library">
  <div class="browser-heading"><h2 class="eyebrow">ANIMATION PARTS</h2></div>
  <label class="field-label px-3"
    >Target<select
      class="field mt-2 w-full"
      aria-label="Animation component"
      value={editor.component}
      onchange={(event) => select(event.currentTarget.value)}
    >
      {#each components as [id, value]}<option value={id}
          >{value.label} ({value.kind})</option
        >{/each}
    </select></label
  >
  {#if editor.project.components[editor.component]}<SidebarRename
      subject="component"
      value={editor.project.components[editor.component].label}
      onrename={(label) => editor.editComponent({ label })}
    />{/if}
  <div class="clip-list mt-3">
    {#each clips as [id, clip]}<button
        class="clip-button"
        data-selected={editor.clip === id}
        aria-pressed={editor.clip === id}
        onclick={() => (editor.clip = id)}
        ><Clapperboard size={14} /><span>{clip.label}</span></button
      >{/each}
  </div>
  {#if editor.project.clips[editor.clip]}
    <SidebarRename
      subject="clip"
      value={editor.project.clips[editor.clip].label}
      onrename={(label) => editor.editClip({ label })}
    />
  {/if}
</aside>

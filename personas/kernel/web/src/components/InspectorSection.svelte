<script lang="ts">
  import { ChevronRight } from '@lucide/svelte';
  import type { Snippet } from 'svelte';
  let {
    heading,
    children,
    open = $bindable(false),
  }: { heading: Snippet; children: Snippet; open?: boolean } = $props();
  const id = $props.id();
</script>

<section class="inspector-stack" class:expanded={open}>
  <button
    class="inspector-toggle"
    aria-expanded={open}
    aria-controls={id}
    onclick={() => (open = !open)}
  >
    <ChevronRight
      size={13}
      class={open ? 'rotate-90' : ''}
    />{@render heading()}
  </button>
  <div {id} class="inspector-scroll" hidden={!open}>{@render children()}</div>
</section>

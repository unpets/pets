<script lang="ts">
  import { ChevronRight } from '@lucide/svelte';
  import type { Snippet } from 'svelte';
  let {
    heading,
    children,
    open = $bindable(false),
  }: { heading: Snippet; children: Snippet; open?: boolean } = $props();
  const id = $props.id();
  let section: HTMLElement;
  let origin = 0;
  let initial = 0;
  let dragging = false;
  function resize(delta: number) {
    const parent = section.parentElement!;
    const siblings = [
      ...parent.querySelectorAll<HTMLElement>(':scope > .inspector-stack'),
    ];
    const reserved = siblings
      .filter((node) => node !== section)
      .reduce((sum, node) => sum + 38, 0);
    const maximum = Math.max(72, parent.clientHeight - reserved - 48);
    section.style.flexBasis = `${Math.max(38, Math.min(maximum, initial + delta))}px`;
    section.style.flexGrow = '0';
  }
</script>

<section bind:this={section} class="inspector-stack" class:expanded={open}>
  <button
    class="inspector-toggle"
    aria-expanded={open}
    aria-controls={id}
    onclick={() => {
      open = !open;
      if (!open) {
        section.style.flexBasis = '';
        section.style.flexGrow = '';
      }
    }}
  >
    <ChevronRight
      size={13}
      class={open ? 'rotate-90' : ''}
    />{@render heading()}
  </button>
  <div {id} class="inspector-scroll" hidden={!open}>{@render children()}</div>
  {#if open}<button
      class="stack-resize"
      aria-label="Resize inspector section"
      onpointerdown={(event) => {
        origin = event.clientY;
        initial = section.clientHeight;
        dragging = true;
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onpointermove={(event) => {
        if (dragging) resize(event.clientY - origin);
      }}
      onpointerup={() => (dragging = false)}
      onpointercancel={() => (dragging = false)}
      onkeydown={(event) => {
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
          event.preventDefault();
          initial = section.clientHeight;
          resize(event.key === 'ArrowDown' ? 16 : -16);
        }
      }}
    />{/if}
</section>

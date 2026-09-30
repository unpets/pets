<script lang="ts">
  let { side }: { side: 'left' | 'right' } = $props();
  import { untrack } from 'svelte';
  let value = $state(untrack(() => (side === 'left' ? 208 : 304)));
  let start = 0;
  let initial = 0;
  let dragging = $state(false);
  const property = $derived(
    side === 'left' ? '--library-width' : '--inspector-width',
  );
  function set(element: HTMLElement, next: number) {
    value = Math.max(180, Math.min(480, next));
    element.parentElement?.style.setProperty(property, `${value}px`);
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions (Focusable separators implement keyboard-operable window splitters.) -->
<div
  tabindex="0"
  class="panel-resize"
  class:left={side === 'left'}
  class:right={side === 'right'}
  role="separator"
  aria-label={`Resize ${side} panel`}
  aria-orientation="vertical"
  aria-valuemin="180"
  aria-valuemax="480"
  aria-valuenow={value}
  onpointerdown={(event) => {
    start = event.clientX;
    initial = value;
    dragging = true;
    event.currentTarget.setPointerCapture(event.pointerId);
  }}
  onpointermove={(event) => {
    if (dragging)
      set(
        event.currentTarget,
        initial + (event.clientX - start) * (side === 'left' ? 1 : -1),
      );
  }}
  onpointerup={() => (dragging = false)}
  onpointercancel={() => (dragging = false)}
  onkeydown={(event) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      set(
        event.currentTarget,
        value +
          (event.key === 'ArrowRight' ? 16 : -16) * (side === 'left' ? 1 : -1),
      );
    }
  }}
></div>

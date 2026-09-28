<script lang="ts">
  import { tick } from 'svelte';
  import type { StudioMenu } from '../lib/studio-menu';

  let { menus }: { menus: StudioMenu[] } = $props();
  let root: HTMLDivElement;
  let open = $state(-1);
  let focused = $state(0);

  function trigger(index: number) {
    return root.querySelector<HTMLButtonElement>(
      `#studio-menu-${menus[index].id}`,
    );
  }
  function items() {
    return [
      ...root.querySelectorAll<HTMLButtonElement>(
        '[role="menu"] [role="menuitem"]:not(:disabled)',
      ),
    ];
  }
  function close(restore = false) {
    if (restore && open >= 0) trigger(open)?.focus();
    open = -1;
  }
  async function show(index: number, edge?: 'first' | 'last') {
    focused = index;
    open = index;
    if (edge) {
      await tick();
      if (open !== index) return;
      const buttons = items();
      buttons[edge === 'last' ? buttons.length - 1 : 0]?.focus();
    }
  }
  function keydown(event: KeyboardEvent, index: number, inMenu = false) {
    if (event.key === 'Tab') {
      close(true);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      close(true);
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      const next =
        (index + (event.key === 'ArrowRight' ? 1 : -1) + menus.length) %
        menus.length;
      focused = next;
      if (open >= 0) void show(next, 'first');
      else trigger(next)?.focus();
    } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      if (!inMenu) {
        if (event.key === 'Home' || event.key === 'End') {
          focused = event.key === 'Home' ? 0 : menus.length - 1;
          trigger(focused)?.focus();
        } else void show(index, event.key === 'ArrowUp' ? 'last' : 'first');
        return;
      }
      const buttons = items();
      const current = buttons.indexOf(
        document.activeElement as HTMLButtonElement,
      );
      const next =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? buttons.length - 1
            : (current +
                (event.key === 'ArrowDown' ? 1 : -1) +
                buttons.length) %
              buttons.length;
      buttons[next]?.focus();
    } else if (
      inMenu &&
      event.key.length === 1 &&
      !event.ctrlKey &&
      !event.metaKey &&
      event.key !== ' '
    ) {
      const buttons = items();
      const current = buttons.indexOf(
        document.activeElement as HTMLButtonElement,
      );
      const ordered = [
        ...buttons.slice(current + 1),
        ...buttons.slice(0, current + 1),
      ];
      ordered
        .find((button) =>
          button.textContent
            ?.trim()
            .toLowerCase()
            .startsWith(event.key.toLowerCase()),
        )
        ?.focus();
      event.preventDefault();
    }
  }
</script>

<svelte:window
  onpointerdown={(event) => {
    if (event.target instanceof Node && !root.contains(event.target)) close();
  }}
/>

<div
  bind:this={root}
  class="studio-menu-bar"
  role="menubar"
  aria-label="Studio menu"
  onfocusout={(event) => {
    if (
      event.relatedTarget instanceof Node &&
      !root.contains(event.relatedTarget)
    )
      close();
  }}
>
  {#each menus as menu, index (menu.id)}
    <div class="studio-menu" role="presentation">
      <button
        id={`studio-menu-${menu.id}`}
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded={open === index}
        aria-controls={open === index
          ? `studio-menu-${menu.id}-items`
          : undefined}
        tabindex={focused === index ? 0 : -1}
        class="menu-trigger"
        class:active={open === index}
        onfocus={() => (focused = index)}
        onpointerenter={() => {
          if (open >= 0 && open !== index) void show(index);
        }}
        onclick={() => {
          if (open === index) close();
          else void show(index, 'first');
        }}
        onkeydown={(event) => keydown(event, index)}>{menu.label}</button
      >
      {#if open === index}
        <div
          id={`studio-menu-${menu.id}-items`}
          class="menu-popup"
          role="menu"
          aria-labelledby={`studio-menu-${menu.id}`}
        >
          {#each menu.groups as group, groupIndex}
            {#if groupIndex > 0}<div
                class="menu-separator"
                role="separator"
              ></div>{/if}
            {#each group as item}
              <button
                class="menu-item"
                role="menuitem"
                tabindex="-1"
                disabled={item.disabled}
                aria-label={item.label}
                onkeydown={(event) => keydown(event, index, true)}
                onclick={() => {
                  close(true);
                  item.action();
                }}
              >
                <span>{item.label}</span>{#if item.hint}<span
                    class="menu-hint"
                    aria-hidden="true">{item.hint}</span
                  >{/if}
              </button>
            {/each}
          {/each}
        </div>
      {/if}
    </div>
  {/each}
</div>

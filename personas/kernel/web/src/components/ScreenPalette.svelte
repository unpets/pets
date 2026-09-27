<script lang="ts">
  import { Link, Unlink } from '@lucide/svelte';
  import type { ScreenPalette } from '../screen-project';
  let {
    palette,
    onchange,
  }: {
    palette: ScreenPalette;
    onchange: (update: Partial<ScreenPalette>) => void;
  } = $props();
</script>

<fieldset class="mb-5 rounded-lg border border-line p-4">
  <legend class="px-2 text-xs font-semibold">Screen palette</legend>
  <div class="flex flex-wrap items-center gap-x-6 gap-y-3 text-xs">
    {#each ['background', 'lines', 'text'] as const as name}
      <label class="flex items-center gap-2 capitalize">
        {name}
        <input
          type="color"
          aria-label={`Screen ${name} color`}
          value={palette[name] ?? '#4feff3'}
          oninput={(event) => onchange({ [name]: event.currentTarget.value })}
        />
        <button
          class="text-muted"
          onclick={() =>
            onchange({ [name]: name === 'background' ? '#07151d' : null })}
          >Original</button
        >
      </label>
    {/each}
    <button
      class="flex items-center gap-2 rounded border border-line px-3 py-2"
      aria-label="Link line and text colors"
      aria-pressed={palette.linked}
      onclick={() => onchange({ linked: !palette.linked })}
    >
      {#if palette.linked}<Link size={14} />Linked{:else}<Unlink
          size={14}
        />Independent{/if}
    </button>
  </div>
</fieldset>

<script lang="ts">
  import InspectorSection from './InspectorSection.svelte';
  import { Link, Unlink, RotateCcw } from '@lucide/svelte';
  import type { ScreenPalette } from '../screen-project';
  let {
    palette,
    onchange,
    oncommit,
  }: {
    palette: ScreenPalette;
    onchange: (update: Partial<ScreenPalette>, group?: string) => void;
    oncommit: () => void;
  } = $props();
  const presets = [
    { name: 'Original', background: '#07151d', color: null },
    { name: 'Terminal', background: '#06120c', color: '#74ef9a' },
    { name: 'Amber', background: '#181006', color: '#ffc36a' },
    { name: 'Ice', background: '#09101e', color: '#9ac6ff' },
  ];
</script>

<InspectorSection open>
  {#snippet heading()}Palette{/snippet}
  <section class="inspector-section">
    <div class="mb-4 flex items-center justify-between">
      <h3 class="mb-0!">Palette</h3>
      <button
        class="icon-button"
        aria-label="Link line and text colors"
        title={palette.linked
          ? 'Line and text colors are linked'
          : 'Line and text colors are independent'}
        aria-pressed={palette.linked}
        class:selected={palette.linked}
        onclick={() => onchange({ linked: !palette.linked })}
        >{#if palette.linked}<Link size={14} />{:else}<Unlink
            size={14}
          />{/if}</button
      >
    </div>
    <div class="mb-4 grid grid-cols-4 gap-1.5" aria-label="Palette presets">
      {#each presets as preset}<button
          class="palette-preset"
          title={preset.name}
          aria-label={`${preset.name} palette`}
          onclick={() =>
            onchange({
              background: preset.background,
              lines: preset.color,
              text: preset.color,
            })}
          ><span style:background={preset.background}
            ><span style:background={preset.color ?? '#4feff3'}></span></span
          >{preset.name}</button
        >{/each}
    </div>
    {#each ['background', 'lines', 'text'] as const as name}
      <div class="palette-row">
        <label class="flex flex-1 items-center justify-between gap-3 capitalize"
          >{name}<span class="color-control"
            ><input
              type="color"
              aria-label={`Screen ${name} color`}
              value={palette[name] ?? '#4feff3'}
              oninput={(event) =>
                onchange(
                  { [name]: event.currentTarget.value },
                  `palette-${name}`,
                )}
              onchange={oncommit}
              onblur={oncommit}
            /><span class="font-mono text-[10px] text-muted uppercase"
              >{palette[name] ?? 'Auto'}</span
            ></span
          ></label
        ><button
          class="icon-button"
          aria-label={`Reset ${name} color`}
          onclick={() =>
            onchange({ [name]: name === 'background' ? '#07151d' : null })}
          ><RotateCcw size={12} /></button
        >
      </div>
    {/each}
    <p class="mt-3 text-[10px] text-muted">
      {palette.linked
        ? 'Line and text colors change together.'
        : 'Line and text colors are independent.'}
    </p>
  </section>
</InspectorSection>

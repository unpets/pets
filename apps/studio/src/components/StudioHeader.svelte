<script lang="ts">
  import Cpu from '@lucide/svelte/icons/cpu';
  import { version } from '../../package.json';
</script>

<header
  class="flex items-center justify-between gap-5 border-b border-line px-[4vw] py-5"
>
  <a
    class="flex items-center gap-3 text-ink no-underline"
    href="./"
    aria-label="Pets studio"
  >
    <span
      class="grid size-9 place-items-center rounded-md bg-accent text-[#12353d]"
      ><Cpu size={22} /></span
    >
    <span class="text-sm font-semibold tracking-[0.16em]"
      >PETS <small
        class="mt-0.5 block text-[11px] font-normal tracking-wide text-muted"
        >Persona studio</small
      ></span
    >
  </a>
  <span
    class="rounded border border-line px-2.5 py-1.5 text-[10px] tracking-[0.15em] text-muted"
    >STUDIO / {version}</span
  >
</header>

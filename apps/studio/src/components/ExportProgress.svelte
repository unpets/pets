<script lang="ts">
  import { onMount } from 'svelte';
  let dialog: HTMLDialogElement;
  onMount(() => {
    dialog.showModal();
    void render();
    return () => controller?.abort();
  });
  import { X } from '@lucide/svelte';
  import { download, zipFiles } from '../lib/files';
  import type { StudioProject } from '../lib/studio-project';
  import { renderExport } from '../lib/render-export';
  let {
    project,
    target,
    onclose,
  }: {
    project: StudioProject;
    target: 'codex' | 'shimeji';
    onclose: () => void;
  } = $props();
  let progress = $state('');
  let error = $state('');
  let controller: AbortController | undefined;
  async function render() {
    controller = new AbortController();
    error = '';
    progress = 'Preparing export';
    try {
      const files = await renderExport(
        project,
        target,
        (v) => (progress = v),
        controller.signal,
      );
      files['pets-studio.json'] = new TextEncoder().encode(
        JSON.stringify(project),
      );
      download(
        `${project.persona.id}-${target}.zip`,
        zipFiles(files),
        'application/zip',
      );
      onclose();
    } catch (reason) {
      if (!controller.signal.aborted) error = String(reason);
    } finally {
      progress = '';
      controller = undefined;
    }
  }
</script>

<dialog
  bind:this={dialog}
  oncancel={() => {
    controller?.abort();
    onclose();
  }}
  class="m-auto max-h-[90vh] w-[calc(100%-3rem)] max-w-2xl overflow-auto rounded-xl border border-line bg-panel p-6 shadow-2xl backdrop:bg-black/70"
  aria-modal="true"
  aria-label="Export progress"
  tabindex="-1"
>
  <div class="mb-5 flex items-center justify-between">
    <h2 class="text-base font-semibold">
      Export {target === 'codex' ? 'Codex' : 'Shimeji'}
    </h2>
    <button
      class="icon-button"
      aria-label="Close export"
      onclick={() => {
        controller?.abort();
        onclose();
      }}><X size={18} /></button
    >
  </div>
  {#if progress}<div
      class="mt-4 flex items-center justify-between text-xs"
      role="status"
    >
      {progress}<button class="button" onclick={() => controller?.abort()}
        >Cancel export</button
      >
    </div>{/if}
  {#if error}<p class="mt-4 text-xs text-red-200" role="alert">
      {error}
    </p>{/if}
</dialog>

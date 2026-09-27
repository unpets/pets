<script lang="ts">
  import { onMount } from 'svelte';
  let dialog: HTMLDialogElement;
  onMount(() => dialog.showModal());
  import { Download, Upload, X } from '@lucide/svelte';
  import { exportAsset } from '@pets/three-runtime/assets';
  import { download, downloadJson, zipFiles } from '../lib/files';
  import { standaloneHtml, type StudioProject } from '../lib/studio-project';
  import { renderExport } from '../lib/render-export';
  let {
    project,
    onimport,
    onclose,
  }: { project: StudioProject; onimport: () => void; onclose: () => void } =
    $props();
  let progress = $state('');
  let error = $state('');
  let controller: AbortController | undefined;
  function save(
    kind:
      | 'project'
      | 'animation'
      | 'screen'
      | 'composition'
      | 'component'
      | 'clip'
      | 'html'
      | 'pet',
  ) {
    const { selection } = project;
    if (kind === 'project')
      downloadJson(`${project.persona.id}.pets.json`, project);
    else if (kind === 'animation')
      downloadJson('pets-animation.json', project.animations);
    else if (kind === 'screen')
      downloadJson('kernel-screen.json', project.screen);
    else if (kind === 'html' || kind === 'pet')
      download(
        `${project.persona.id}-${kind === 'pet' ? 'pet' : 'studio'}.html`,
        standaloneHtml(project, kind === 'pet'),
        'text/html',
      );
    else
      downloadJson(
        `${selection[kind]!.replaceAll('/', '-')}.pets-asset.json`,
        exportAsset(project.animations, kind, selection[kind]),
      );
  }
  async function render(target: 'codex' | 'shimeji') {
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
  aria-label="Project files"
  tabindex="-1"
>
  <div class="mb-5 flex items-center justify-between">
    <h2 class="text-base font-semibold">Import and export</h2>
    <button
      class="icon-button"
      aria-label="Close project files"
      onclick={() => {
        controller?.abort();
        onclose();
      }}><X size={18} /></button
    >
  </div>
  <button class="button w-full" disabled={!!progress} onclick={onimport}
    ><Upload size={14} />Import project or asset bundle</button
  >
  <p class="mt-3 text-xs text-muted">
    Project files include the model, source animations, screen atlases, authored
    clips, composition hierarchy, palette, export mappings, and view settings.
  </p>
  <div class="mt-5 grid grid-cols-2 gap-2">
    {#each [['project', 'Save complete project'], ['animation', 'Save animations'], ['screen', 'Save screen'], ['composition', 'Export composition'], ['component', 'Export component'], ['clip', 'Export reusable clip'], ['html', 'Export Studio HTML'], ['pet', 'Export standalone pet']] as [kind, label]}
      <button
        class="button"
        disabled={!!progress || (kind === 'clip' && !project.selection.clip)}
        onclick={() => save(kind as Parameters<typeof save>[0])}
        ><Download size={13} />{label}</button
      >
    {/each}
  </div>
  <h3 class="mt-6 mb-3 text-sm">Rendered persona packages</h3>
  <p class="mb-3 text-xs text-muted">
    Render the edited compositions using their export mappings.
  </p>
  <div class="flex gap-2">
    <button
      class="button flex-1"
      disabled={!!progress}
      onclick={() => render('codex')}>Export Codex</button
    ><button
      class="button flex-1"
      disabled={!!progress}
      onclick={() => render('shimeji')}>Export Shimeji</button
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

<script lang="ts">
  import {
    Box,
    Monitor,
    Layers3,
    Undo2,
    Redo2,
    Upload,
    Download,
  } from '@lucide/svelte';
  import { version } from '../../package.json';
  import type { Workspace } from '../lib/types';

  let {
    personaName,
    busy,
    workspace,
    onworkspace,
    editor,
    onimport,
    onexport,
  }: {
    personaName: string;
    busy: boolean;
    workspace: Workspace;
    onworkspace: (value: Workspace) => void;
    editor: { canUndo: boolean; canRedo: boolean; undo(): void; redo(): void };
    onimport: () => void;
    onexport: () => void;
  } = $props();
</script>

<header class="studio-header">
  <div class="flex items-center gap-3">
    <span
      class="grid size-8 place-items-center rounded-lg bg-accent text-[#102522]"
      ><Box size={19} /></span
    >
    <div>
      <h1 class="text-sm font-semibold tracking-tight">
        Pets <span class="font-normal text-muted">Studio</span>
      </h1>
      <p class="mt-0.5 text-[10px] text-muted">
        {personaName} <span class="mx-1 text-line">/</span> Persona
      </p>
    </div>
  </div>
  <nav class="workspace-tabs" aria-label="Workspace">
    <button
      class:active={workspace === 'scene'}
      aria-pressed={workspace === 'scene'}
      onclick={() => onworkspace('scene')}><Box size={15} />Scene</button
    >
    <button
      class:active={workspace === 'screen'}
      aria-pressed={workspace === 'screen'}
      onclick={() => onworkspace('screen')}><Monitor size={15} />Screen</button
    >
    <button
      class:active={workspace === 'animation'}
      aria-pressed={workspace === 'animation'}
      onclick={() => onworkspace('animation')}
      ><Layers3 size={15} />Animation</button
    >
  </nav>
  <div class="flex items-center justify-end gap-1.5">
    <button
      class="icon-button"
      aria-label={workspace === 'animation'
        ? 'Undo animation edit'
        : 'Undo screen edit'}
      title="Undo (Ctrl+Z)"
      disabled={!editor.canUndo}
      onclick={() => editor.undo()}><Undo2 size={16} /></button
    >
    <button
      class="icon-button"
      aria-label={workspace === 'animation'
        ? 'Redo animation edit'
        : 'Redo screen edit'}
      title="Redo (Ctrl+Shift+Z)"
      disabled={!editor.canRedo}
      onclick={() => editor.redo()}><Redo2 size={16} /></button
    >
    <span class="mx-2 h-5 w-px bg-line"></span>
    <button
      class="button header-file"
      disabled={busy}
      aria-label="Import project"
      onclick={onimport}><Upload size={14} /><span>Import project</span></button
    >
    <button
      class="button primary header-file"
      disabled={busy}
      aria-label="Import and export"
      onclick={onexport}
      ><Download size={14} /><span>Import / export</span></button
    >
    <span class="ml-2 hidden text-[10px] text-muted xl:block">v{version}</span>
  </div>
</header>

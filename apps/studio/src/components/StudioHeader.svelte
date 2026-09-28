<script lang="ts">
  import {
    Box,
    Monitor,
    Layers3,
    Undo2,
    Redo2,
    Fingerprint,
    Smile,
  } from '@lucide/svelte';
  import StudioMenuBar from './StudioMenuBar.svelte';
  import type { StudioMenu } from '../lib/studio-menu';
  import type { Workspace } from '../lib/types';

  let {
    personaName,
    workspace,
    onworkspace,
    editor,
    menus,
  }: {
    personaName: string;
    workspace: Workspace;
    onworkspace: (value: Workspace) => void;
    editor: { canUndo: boolean; canRedo: boolean; undo(): void; redo(): void };
    menus: StudioMenu[];
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
  <StudioMenuBar {menus} />
  <nav class="workspace-tabs" aria-label="Workspace">
    <button
      class:active={workspace === 'persona'}
      aria-pressed={workspace === 'persona'}
      onclick={() => onworkspace('persona')}
      ><Fingerprint size={15} />Persona</button
    >
    <button
      class:active={workspace === 'screen'}
      aria-pressed={workspace === 'screen'}
      onclick={() => onworkspace('screen')}><Monitor size={15} />Screen</button
    >
    <button
      class:active={workspace === 'components'}
      aria-pressed={workspace === 'components'}
      onclick={() => onworkspace('components')}
      ><Smile size={15} />Components</button
    >
    <button
      class:active={workspace === 'animation'}
      aria-pressed={workspace === 'animation'}
      onclick={() => onworkspace('animation')}
      ><Layers3 size={15} />Animation</button
    >
    <button
      class:active={workspace === 'composition'}
      aria-pressed={workspace === 'composition'}
      onclick={() => onworkspace('composition')}
      ><Layers3 size={15} />Composition</button
    >
    <button
      class:active={workspace === 'scene'}
      aria-pressed={workspace === 'scene'}
      onclick={() => onworkspace('scene')}><Box size={15} />Scene</button
    >
  </nav>
  <div class="flex items-center justify-end gap-1.5">
    <button
      class="icon-button"
      aria-label={workspace === 'animation' || workspace === 'components'
        ? 'Undo animation edit'
        : 'Undo screen edit'}
      title="Undo (Ctrl+Z)"
      disabled={workspace === 'persona' || !editor.canUndo}
      onclick={() => editor.undo()}><Undo2 size={16} /></button
    >
    <button
      class="icon-button"
      aria-label={workspace === 'animation' || workspace === 'components'
        ? 'Redo animation edit'
        : 'Redo screen edit'}
      title="Redo (Ctrl+Shift+Z)"
      disabled={workspace === 'persona' || !editor.canRedo}
      onclick={() => editor.redo()}><Redo2 size={16} /></button
    >
  </div>
</header>

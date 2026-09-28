<script lang="ts">
  import {
    Box,
    Fingerprint,
    Layers3,
    Monitor,
    ArrowUpRight,
    Plus,
    Copy,
    Pencil,
    Trash2,
    Upload,
    Download,
  } from '@lucide/svelte';
  import type { AnimationProject } from '@pets/three-runtime/project';
  import type { PersonaEntry } from '../lib/persona-library';
  import type { Workspace } from '../lib/types';
  let {
    persona,
    project,
    entries,
    active,
    busy,
    storage,
    onworkspace,
    onselect,
    oncreate,
    onrename,
    ondelete,
    onimport,
    onexport,
  }: {
    persona: { id: string; name: string };
    project: AnimationProject;
    entries: PersonaEntry[];
    active: string;
    busy: boolean;
    storage: string;
    onworkspace: (workspace: Workspace) => void;
    onselect: (key: string) => Promise<void>;
    oncreate: (name: string, duplicate: boolean) => Promise<void>;
    onrename: (name: string) => Promise<void>;
    ondelete: () => Promise<void>;
    onimport: () => void;
    onexport: () => void;
  } = $props();
  let action = $state<'create' | 'duplicate' | 'rename' | 'delete'>();
  let name = $state('');
  let error = $state('');
  const counts = $derived([
    { label: 'Compositions', value: Object.keys(project.compositions).length },
    { label: 'Screens', value: Object.keys(project.screens ?? {}).length },
    { label: 'Animation parts', value: Object.keys(project.clips).length },
  ]);
  function begin(value: typeof action) {
    action = value;
    name =
      value === 'create'
        ? 'New persona'
        : value === 'duplicate'
          ? `${persona.name} copy`
          : persona.name;
    error = '';
  }
  async function submit(event: SubmitEvent) {
    event.preventDefault();
    try {
      if (action === 'delete') await ondelete();
      else if (action === 'rename') await onrename(name.trim());
      else await oncreate(name.trim(), action === 'duplicate');
      action = undefined;
    } catch (reason) {
      error = reason instanceof Error ? reason.message : String(reason);
    }
  }
</script>

<section class="persona-page" aria-label="Persona">
  <div class="persona-content">
    <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h2 class="eyebrow">PERSONAS</h2>
      <div class="flex flex-wrap gap-2">
        <button class="button" disabled={busy} onclick={() => begin('create')}
          ><Plus size={14} />New persona</button
        >
        <button class="button" disabled={busy} onclick={onimport}
          ><Upload size={14} />Import persona</button
        >
      </div>
    </div>
    <div class="persona-library" role="group" aria-label="Persona library">
      {#each entries as entry (entry.key)}
        <button
          class="persona-card"
          aria-pressed={entry.key === active}
          disabled={busy}
          onclick={async () => {
            action = undefined;
            await onselect(entry.key);
          }}
        >
          <Box size={18} /><span class="min-w-0"
            ><span class="block truncate text-sm font-medium">{entry.name}</span
            ><span class="mt-1 block truncate text-xs text-muted"
              >{entry.id}</span
            ></span
          >
        </button>
      {/each}
    </div>
    <div class="mt-8 flex flex-wrap items-start justify-between gap-5">
      <div class="min-w-0">
        <h3 class="text-3xl font-semibold tracking-tight break-words">
          {persona.name}
        </h3>
        <p class="mt-2 flex items-center gap-2 text-sm text-muted">
          <Fingerprint size={14} />{persona.id}
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <button
          class="button"
          disabled={busy}
          onclick={() => begin('duplicate')}
          ><Copy size={14} />Duplicate persona</button
        >
        <button class="button" disabled={busy} onclick={() => begin('rename')}
          ><Pencil size={14} />Rename persona</button
        >
        <button class="button" disabled={busy} onclick={onexport}
          ><Download size={14} />Export persona</button
        >
        <button
          class="button"
          disabled={busy || entries.length < 2}
          onclick={() => begin('delete')}
          ><Trash2 size={14} />Delete persona</button
        >
      </div>
    </div>
    {#if action}
      <form class="persona-form" onsubmit={submit}>
        <h4 class="mb-3 text-sm font-medium">
          {action === 'create'
            ? 'Create persona'
            : action === 'duplicate'
              ? 'Duplicate persona'
              : action === 'rename'
                ? 'Rename persona'
                : 'Delete persona'}
        </h4>
        {#if action === 'delete'}
          <p class="mb-4 text-sm text-muted">
            Delete {persona.name} and its saved editing state? Export the persona
            first to keep a copy.
          </p>
        {:else}
          <label class="field-label"
            >Persona name<input
              class="field mt-2 w-full"
              aria-label="Persona name"
              bind:value={name}
              required
              maxlength="80"
            /></label
          >
          {#if action === 'create'}<p class="mt-3 text-xs text-muted">
              Starts from the Kernel template with independent screens,
              animation parts, and compositions.
            </p>{/if}
        {/if}
        <div class="mt-4 flex gap-2">
          <button
            class="button"
            type="submit"
            disabled={busy || (action !== 'delete' && !name.trim())}
            >{action === 'delete' ? 'Confirm deletion' : 'Save persona'}</button
          >
          <button
            class="button"
            type="button"
            disabled={busy}
            onclick={() => (action = undefined)}>Cancel</button
          >
        </div>
        {#if error}<p class="mt-3 text-sm text-red-200" role="alert">
            {error}
          </p>{/if}
      </form>
    {/if}
    <p class="mt-4 text-xs text-muted" role="status">{storage}</p>
    <dl class="persona-stats">
      {#each counts as count}<div>
          <dt>{count.label}</dt>
          <dd>{count.value}</dd>
        </div>{/each}
    </dl>
    <h3 class="mb-4 text-sm font-medium">Workspaces</h3>
    <div class="persona-workspaces">
      {#each [{ id: 'scene' as const, label: 'Scene', icon: Box, description: 'Inspect the model, camera, lighting, and joints.' }, { id: 'screen' as const, label: 'Screen', icon: Monitor, description: 'Build reusable screens from face components.' }, { id: 'animation' as const, label: 'Animation', icon: Layers3, description: 'Create and edit independent animation parts.' }, { id: 'composition' as const, label: 'Composition', icon: Layers3, description: 'Assemble animation parts and assign a screen.' }] as area}
        <button class="persona-workspace" onclick={() => onworkspace(area.id)}
          ><area.icon size={20} class="text-accent" /><span
            class="flex items-center justify-between gap-3 text-sm font-medium"
            >{area.label}<ArrowUpRight size={15} class="text-muted" /></span
          ><span class="text-xs leading-relaxed text-muted"
            >{area.description}</span
          ></button
        >
      {/each}
    </div>
  </div>
</section>

<script lang="ts">
  import {
    Box,
    Fingerprint,
    Layers3,
    Monitor,
    ArrowUpRight,
  } from '@lucide/svelte';
  import type { AnimationProject } from '@pets/three-runtime/project';
  import type { Workspace } from '../lib/types';

  let {
    persona,
    project,
    onworkspace,
  }: {
    persona: { id: string; name: string };
    project: AnimationProject;
    onworkspace: (workspace: Workspace) => void;
  } = $props();
  const counts = $derived([
    { label: 'Compositions', value: Object.keys(project.compositions).length },
    { label: 'Components', value: Object.keys(project.components).length },
    { label: 'Clips', value: Object.keys(project.clips).length },
  ]);
</script>

<section class="persona-page" aria-label="Persona">
  <div class="persona-content">
    <p class="eyebrow mb-4">PERSONA</p>
    <div class="flex items-center gap-5">
      <div
        class="grid size-16 shrink-0 place-items-center rounded-2xl border border-accent/20 bg-accent/10 text-accent"
      >
        <Box size={30} />
      </div>
      <div class="min-w-0">
        <h2 class="text-3xl font-semibold tracking-tight break-words">
          {persona.name}
        </h2>
        <p class="mt-2 flex items-center gap-2 text-sm text-muted">
          <Fingerprint size={14} />{persona.id}
        </p>
      </div>
    </div>
    <dl class="persona-stats">
      {#each counts as count}<div>
          <dt>{count.label}</dt>
          <dd>{count.value}</dd>
        </div>{/each}
    </dl>
    <h3 class="mb-4 text-sm font-medium">Workspaces</h3>
    <div class="persona-workspaces">
      {#each [{ id: 'scene' as const, label: 'Scene', icon: Box, description: 'Inspect the model, camera, lighting, and joints.' }, { id: 'screen' as const, label: 'Screen', icon: Monitor, description: 'Edit the background, activity, eyes, and mouth.' }, { id: 'animation' as const, label: 'Animation', icon: Layers3, description: 'Compose motion, layers, and reusable clips.' }] as area}
        <button class="persona-workspace" onclick={() => onworkspace(area.id)}>
          <area.icon size={20} class="text-accent" />
          <span
            class="flex items-center justify-between gap-3 text-sm font-medium"
            >{area.label}<ArrowUpRight size={15} class="text-muted" /></span
          >
          <span class="text-xs leading-relaxed text-muted"
            >{area.description}</span
          >
        </button>
      {/each}
    </div>
    <p class="mt-8 text-xs leading-relaxed text-muted">
      Use File to open or save a project, Export to create packages, and Assets
      to download source files.
    </p>
  </div>
</section>

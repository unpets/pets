<script lang="ts">
  import { embeddedProject, parseStudioProject } from './lib/studio-project';
  import { onMount } from 'svelte';
  import {
    parseKernelProject,
    saveAnimationProject,
  } from '@pets/kernel/animation-project';
  import { Eye, Play, Pause, Settings, X, Footprints } from '@lucide/svelte';
  import { animationModes, type AnimationMode } from './lib/types';
  import { createPetScene, type PetScene } from './lib/pet/scene';
  import { connectDesktop, nativeDesktop } from './lib/pet/desktop';
  import {
    parseScreenProject,
    saveScreenProject,
  } from '@pets/kernel/screen-project';
  import persona from '@pets/kernel/manifest';
  let personaName = $state(persona.name);
  let modes = $state(animationModes);
  let projectFile = $state<HTMLInputElement>();
  async function importScreen() {
    const file = projectFile?.files?.[0];
    if (!file) return;
    try {
      if (file.size > 96_000_000)
        throw new Error('Projects must be under 96 MB.');
      const value = JSON.parse(await file.text());
      if (value.format === 'pets-studio') {
        const project = parseStudioProject(value);
        const next = await createPetScene(viewport, project);
        desktop?.destroy();
        pet?.destroy();
        pet = next;
        personaName = project.persona.name;
        window.kernelPet = next;
        modes = next.compositions;
        mode = next.state;
        desktop = await connectDesktop(
          next,
          () => ({ tracking, autonomous, playing, menu, mode }),
          setMode,
          () => (menu = true),
          (message) => (error = message),
        );
      } else if (value.format === 'pets-animation') {
        const project = parseKernelProject(value);
        pet?.setAnimationProject(project);
        saveAnimationProject(project);
        if (pet) {
          modes = pet.compositions;
          mode = pet.state;
        }
      } else {
        const project = parseScreenProject(value);
        pet?.setScreenProject(project);
        saveScreenProject(project);
      }
      error = '';
    } catch (reason) {
      error = String(reason);
    }
    if (projectFile) projectFile.value = '';
  }
  let viewport: HTMLDivElement;
  let pet: PetScene | undefined;
  let desktop: Awaited<ReturnType<typeof connectDesktop>> | undefined;
  let menu = $state(false);
  let tracking = $state(true);
  let autonomous = $state(true);
  let playing = $state(true);
  let mode = $state<AnimationMode>('idle');
  let error = $state('');
  function setMode(value: AnimationMode) {
    mode = value;
    pet?.setMode(value);
  }
  function pointer(event: PointerEvent) {
    if (!nativeDesktop) pet?.setCursor(event.clientX, event.clientY);
  }
  onMount(() => {
    let disposed = false;
    const project = embeddedProject();
    personaName = project?.persona.name ?? persona.name;
    createPetScene(viewport, project)
      .then(async (scene) => {
        if (disposed) {
          scene.destroy();
          return;
        }
        pet = scene;
        modes = scene.compositions;
        mode = scene.state;
        window.kernelPet = scene;
        desktop = await connectDesktop(
          scene,
          () => ({ tracking, autonomous, playing, menu, mode }),
          setMode,
          () => {
            menu = true;
          },
          (message) => {
            error = message;
          },
        );
        if (disposed) desktop.destroy();
      })
      .catch((reason) => {
        error = String(reason);
      });
    return () => {
      disposed = true;
      desktop?.destroy();
      pet?.destroy();
      delete window.kernelPet;
    };
  });
</script>

<svelte:window
  onpointermove={pointer}
  onkeydown={(event) => {
    if (event.key === 'Escape') menu = false;
  }}
/>
<div
  class="pet-stage"
  bind:this={viewport}
  role="img"
  aria-label={`${personaName} desktop companion`}
  oncontextmenu={(event) => {
    event.preventDefault();
    menu = !menu;
  }}
  onpointerdown={(event) => {
    if (event.button === 0 && pet?.hitTest(event.clientX, event.clientY))
      void desktop?.drag();
  }}
></div>
<button
  class="pet-toggle"
  aria-label="Pet controls"
  onclick={() => {
    menu = !menu;
  }}><Settings size={16} /></button
>
{#if menu}
  <section class="pet-controls" aria-label="Pet controls">
    <header>
      <strong>{personaName}</strong><button
        aria-label="Close controls"
        onclick={() => {
          menu = false;
        }}><X size={16} /></button
      >
    </header>
    <label
      >Animation<select
        bind:value={mode}
        onchange={() => {
          autonomous = false;
          setMode(mode);
        }}
        >{#each Object.entries(modes) as [value, details]}<option {value}
            >{details.label}</option
          >{/each}</select
      ></label
    >
    <label
      ><Eye size={16} /><input
        type="checkbox"
        bind:checked={tracking}
        onchange={() => pet?.setTracking(tracking)}
      />Follow mouse</label
    >
    <label
      ><Footprints size={16} /><input
        type="checkbox"
        bind:checked={autonomous}
      />Wander</label
    >
    <button
      onclick={() => {
        playing = !playing;
        pet?.setPlaying(playing);
      }}
      >{#if playing}<Pause size={16} />{:else}<Play size={16} />{/if}{playing
        ? 'Pause animation'
        : 'Resume animation'}</button
    >
    <button onclick={() => projectFile?.click()}>Import project</button>
    <input
      bind:this={projectFile}
      type="file"
      accept=".json,application/json"
      class="hidden"
      onchange={importScreen}
    />
    {#if nativeDesktop}<button onclick={() => desktop?.close()}
        ><X size={16} />Quit Pets</button
      >{/if}
  </section>
{/if}
{#if error}<p class="pet-error" role="alert">{error}</p>{/if}

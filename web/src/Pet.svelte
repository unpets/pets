<script lang="ts">
  import { onMount } from 'svelte';
  import { Eye, Play, Pause, Settings, X, Footprints } from '@lucide/svelte';
  import { animationModes, type AnimationMode } from './lib/types';
  import { createPetScene, type PetScene } from './lib/pet/scene';
  import { connectDesktop, nativeDesktop } from './lib/pet/desktop';
  import { parseScreenProject, saveScreenProject } from './lib/screen-project';
  let projectFile = $state<HTMLInputElement>();
  async function importScreen() {
    const file = projectFile?.files?.[0];
    if (!file) return;
    try {
      if (file.size > 65536)
        throw new Error('Screen projects must be under 64 KB.');
      const project = parseScreenProject(JSON.parse(await file.text()));
      pet?.setScreenProject(project);
      saveScreenProject(project);
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
    createPetScene(viewport)
      .then(async (scene) => {
        if (disposed) {
          scene.destroy();
          return;
        }
        pet = scene;
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
  aria-label="Kernel desktop companion"
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
      <strong>Kernel</strong><button
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
        >{#each Object.entries(animationModes) as [value, details]}<option
            {value}>{details.label}</option
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
    <button onclick={() => projectFile?.click()}>Import screen project</button>
    <input
      bind:this={projectFile}
      type="file"
      accept=".json,application/json"
      class="hidden"
      onchange={importScreen}
    />
    {#if nativeDesktop}<button onclick={() => desktop?.close()}
        ><X size={16} />Quit Kernel</button
      >{/if}
  </section>
{/if}
{#if error}<p class="pet-error" role="alert">{error}</p>{/if}

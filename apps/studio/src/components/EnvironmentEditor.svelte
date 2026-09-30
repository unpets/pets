<script lang="ts">
  import InspectorSection from '@pets/kernel/components/InspectorSection.svelte';
  import {
    parseEnvironment,
    importEnvironmentAssets,
    type Environment,
    type Triple,
  } from '@pets/three-runtime/environment';
  import { download } from '../lib/files';
  import { coreRequest } from '../lib/core';
  import NameDialog from './NameDialog.svelte';
  let {
    document,
    onchange,
    composition,
  }: {
    document: Environment;
    composition: string;
    onchange: (value: Environment) => void;
  } = $props();
  let selected = $state('rope');
  let assetsOnly = false;
  let part = $state(0);
  let error = $state('');
  let rename = $state(false);
  let input: HTMLInputElement;
  const object = $derived(document.objects[selected]);
  function change(
    field: 'position' | 'rotation' | 'scale',
    index: number,
    value: number,
  ) {
    const next = structuredClone(document);
    next.objects[selected][field][index] = value;
    apply(next);
  }
  function apply(next: unknown) {
    try {
      onchange(parseEnvironment(next));
      error = '';
    } catch (reason) {
      error = String(reason);
    }
  }
  async function save(assetOnly = false) {
    try {
      const value = await coreRequest({
        operation: 'environment',
        environment: assetOnly
          ? {
              ...document,
              assets: { [object.asset]: document.assets[object.asset] },
              objects: {},
              bindings: {},
            }
          : document,
      });
      download(
        assetOnly
          ? `${object.asset}.environment-asset.json`
          : 'environment.json',
        JSON.stringify(value, null, 2),
      );
      error = '';
    } catch (reason) {
      error = String(reason);
    }
  }
  async function load() {
    const file = input.files?.[0];
    if (!file) return;
    try {
      if (file.size > 2_000_000)
        throw new Error('Environment files must be under 2 MB.');
      const environment = parseEnvironment(JSON.parse(await file.text()));
      const next = parseEnvironment(
        await coreRequest({ operation: 'environment', environment }),
      );
      const merged = assetsOnly
        ? importEnvironmentAssets(document, next)
        : next;
      onchange(merged);
      selected = assetsOnly
        ? Object.keys(merged.objects).at(-1)!
        : (Object.keys(next.objects)[0] ?? '');
      error = '';
    } catch (reason) {
      error = String(reason);
    }
    input.value = '';
  }
</script>

<InspectorSection open>
  {#snippet heading()}Environment{/snippet}
  <div class="inspector-section">
    <label class="field-label"
      >Object<select
        class="field mt-2 w-full"
        aria-label="Environment object"
        bind:value={selected}
      >
        {#each Object.entries(document.objects) as [id, value]}<option
            value={id}>{value.label}</option
          >{/each}
      </select></label
    >
    {#if object}
      <label class="toggle-row mt-3"
        ><span>Visible</span><input
          type="checkbox"
          checked={object.enabled}
          onchange={(e) => {
            const next = structuredClone(document);
            next.objects[selected].enabled = e.currentTarget.checked;
            apply(next);
          }}
        /></label
      >
      <label class="field-label mt-3"
        >Asset<select
          class="field mt-2 w-full"
          value={object.asset}
          onchange={(e) => {
            const next = structuredClone(document);
            next.objects[selected].asset = e.currentTarget.value;
            apply(next);
          }}
        >
          {#each Object.entries(document.assets) as [id, asset]}<option
              value={id}>{asset.label}</option
            >{/each}
        </select></label
      >
      {#each ['position', 'rotation', 'scale'] as field}
        <fieldset class="mt-3">
          <legend class="field-label"
            >{field}
            {field === 'rotation'
              ? '(degrees)'
              : field === 'position'
                ? '(metres)'
                : ''}</legend
          >
          <div class="mt-2 grid grid-cols-3 gap-2">
            {#each ['X', 'Y', 'Z'] as axis, index}<label class="field-label"
                >{axis}<input
                  class="field mt-1 w-full"
                  aria-label={`Environment ${field} ${axis}`}
                  type="number"
                  step={field === 'rotation' ? 5 : 0.05}
                  value={object[field as 'position'][index]}
                  onchange={(e) =>
                    change(
                      field as 'position',
                      index,
                      e.currentTarget.valueAsNumber,
                    )}
                /></label
              >{/each}
          </div>
        </fieldset>
      {/each}
      <details class="mt-4">
        <summary class="field-label">Asset appearance</summary>
        <label class="field-label mt-3"
          >Part<select
            class="field mt-2 w-full"
            aria-label="Environment asset part"
            bind:value={part}
            >{#each document.assets[object.asset].parts as value, index}<option
                value={index}>{index + 1}: {value.shape}</option
              >{/each}</select
          ></label
        >
        {#if document.assets[object.asset].parts[part]}
          <label class="field-label mt-3"
            >Color<input
              type="color"
              aria-label="Environment asset color"
              value={document.assets[object.asset].parts[part].color}
              onchange={(event) => {
                const next = structuredClone(document);
                next.assets[object.asset].parts[part].color =
                  event.currentTarget.value;
                apply(next);
              }}
            /></label
          >
        {/if}
        <button class="button mt-3" onclick={() => save(true)}
          >Export asset</button
        >
      </details>
      <button class="button mt-3" onclick={() => (rename = true)}
        >Rename object</button
      >
      <button
        class="button mt-3"
        onclick={() => {
          const next = structuredClone(document);
          let id = `${selected}-copy`;
          while (next.objects[id]) id += '-copy';
          next.objects[id] = {
            ...structuredClone(object),
            label: `${object.label} copy`,
          };
          apply(next);
          selected = id;
        }}>Duplicate object</button
      >
    {/if}
    {#if object}<button
        class="button mt-3"
        onclick={() => {
          const next = structuredClone(document);
          next.bindings[composition] = {
            object: selected,
            origin: document.bindings[composition]?.origin ?? [
              ...object.position,
            ],
          };
          apply(next);
        }}>Use for {composition}</button
      >{/if}
    <div class="mt-4 flex gap-2">
      <button
        class="button"
        onclick={() => {
          assetsOnly = false;
          input.click();
        }}>Import environment</button
      ><button class="button" onclick={() => save()}>Export environment</button>
    </div>
    <button
      class="button mt-3"
      onclick={() => {
        assetsOnly = true;
        input.click();
      }}>Import assets</button
    >
    <input
      bind:this={input}
      type="file"
      accept="application/json,.json"
      hidden
      onchange={load}
    />
    {#if error}<p role="alert" class="mt-3 text-xs text-red-200">
        {error}
      </p>{/if}
  </div>
</InspectorSection>
{#if rename && object}<NameDialog
    title="Rename environment object"
    label="Object name"
    value={object.label}
    onsubmit={(label) => {
      const next = structuredClone(document);
      next.objects[selected].label = label;
      apply(next);
    }}
    onclose={() => (rename = false)}
  />{/if}

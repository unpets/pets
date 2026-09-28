<script lang="ts">
  import { onMount } from 'svelte';
  let {
    title,
    label,
    value,
    onsubmit,
    onclose,
  }: {
    title: string;
    label: string;
    value: string;
    onsubmit: (name: string) => void;
    onclose: () => void;
  } = $props();
  let dialog: HTMLDialogElement;
  let input: HTMLInputElement;
  let name = $state('');
  let error = $state('');
  onMount(() => {
    name = value;
    dialog.showModal();
    requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
  });
</script>

<dialog bind:this={dialog} class="studio-dialog" aria-label={title} {onclose}>
  <form
    onsubmit={(event) => {
      event.preventDefault();
      try {
        onsubmit(name.trim());
        dialog.close();
      } catch (reason) {
        error = String(reason);
      }
    }}
  >
    <h2 class="mb-5 text-base font-semibold">{title}</h2>
    <label class="field-label"
      >{label}<input
        bind:this={input}
        class="field mt-2 w-full"
        aria-label={label}
        bind:value={name}
        required
        maxlength="80"
      /></label
    >
    <div class="mt-5 flex justify-end gap-2">
      <button class="button" type="button" onclick={() => dialog.close()}
        >Cancel</button
      ><button class="button" type="submit" disabled={!name.trim()}
        >Save name</button
      >
    </div>
    {#if error}<p role="alert" class="mt-3 text-sm text-red-200">
        {error}
      </p>{/if}
  </form>
</dialog>

<script lang="ts">
  import NameDialog from './NameDialog.svelte';
  let {
    subject,
    value,
    disabled = false,
    onrename,
  }: {
    subject: string;
    value: string;
    disabled?: boolean;
    onrename: (name: string) => void;
  } = $props();
  let open = $state(false);
</script>

<button class="button mx-3 my-3" {disabled} onclick={() => (open = true)}
  >Rename {subject}</button
>
{#if open}
  <NameDialog
    title={`Rename ${subject}`}
    label={`${subject[0].toUpperCase()}${subject.slice(1)} name`}
    {value}
    onsubmit={onrename}
    onclose={() => (open = false)}
  />
{/if}

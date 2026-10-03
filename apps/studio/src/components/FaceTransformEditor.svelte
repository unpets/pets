<script lang="ts">
  import type { FaceTransform } from '@pets/three-runtime/face';
  let {
    value,
    onchange,
    units = 'face widths',
  }: {
    value: FaceTransform;
    onchange: (value: FaceTransform) => void;
    units?: string;
  } = $props();
</script>

<div class="space-y-3">
  {#each ['position', 'rotation', 'scale'] as const as field}
    <fieldset>
      <legend class="field-label"
        >{field} ({field === 'position'
          ? units
          : field === 'rotation'
            ? 'degrees'
            : 'ratio'})</legend
      >
      <div class="mt-2 grid grid-cols-3 gap-2">
        {#each ['X', 'Y', 'Z'] as axis, index}
          <label class="field-label"
            >{axis}<input
              class="field mt-1 w-full"
              aria-label={`${field} ${axis}`}
              type="number"
              step="0.01"
              value={value[field][index]}
              onchange={(event) => {
                const next = event.currentTarget.valueAsNumber;
                if (!Number.isFinite(next) || (field === 'scale' && next === 0))
                  return;
                const updated = structuredClone(value);
                updated[field][index] = next;
                onchange(updated);
              }}
            /></label
          >
        {/each}
      </div>
    </fieldset>
  {/each}
</div>

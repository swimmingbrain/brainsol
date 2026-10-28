<script lang="ts">
  // one result number in a section: a label, the figure in mono and a quiet note
  let {
    label,
    value,
    unit = '',
    note = ''
  }: {
    label: string;
    value: string | null;
    unit?: string;
    note?: string;
  } = $props();
</script>

<div class="figure">
  <span class="label">{label}</span>
  <span class="value">
    {#if value !== null}{value}{#if unit}<span class="unit">{unit}</span>{/if}{:else}<span class="placeholder"></span>{/if}
  </span>
  {#if note}<span class="note">{note}</span>{/if}
</div>

<style>
  .figure {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }

  .label {
    font-size: 11.5px;
    color: var(--text-secondary);
    white-space: nowrap;
  }

  .value {
    height: 30px;
    font-family: var(--font-editor);
    font-size: 24px;
    font-weight: 500;
    line-height: 30px;
    letter-spacing: -0.02em;
    color: var(--text-strong);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .unit {
    margin-left: 4px;
    font-size: 12px;
    letter-spacing: 0;
    color: var(--text-muted);
  }

  .placeholder {
    display: inline-block;
    width: 2.4em;
    height: 2px;
    vertical-align: middle;
    background: var(--border);
  }

  .note {
    font-size: 11.5px;
    color: var(--text-muted);
  }

  @media (max-width: 600px) {
    .value {
      font-size: 20px;
    }
  }
</style>

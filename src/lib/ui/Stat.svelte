<script lang="ts">
  import { fmt } from '$lib/i18n';

  // one value a machine produced: a small label over a mono figure and its
  // unit. while the value is null a quiet bar holds its place, so nothing jumps
  // when the first frame arrives
  let {
    label,
    value,
    unit = '',
    digits = 0,
    size = 'md',
    title,
    tone = 'plain',
    text
  }: {
    label: string;
    value: number | null | undefined;
    unit?: string;
    digits?: number;
    // xl is for presentation mode
    size?: 'sm' | 'md' | 'lg' | 'xl';
    title?: string;
    // state colours only for state
    tone?: 'plain' | 'success' | 'warning' | 'error';
    // a word instead of a number, a mode or a state
    text?: string | null;
  } = $props();

  const shown = $derived(text ?? fmt(value, digits));
</script>

<div class="stat {size} {tone}" {title}>
  <span class="label">{label}</span>
  <span class="figure">
    {#if shown !== null && shown !== undefined}
      <span class="value" class:word={text !== undefined && text !== null}>{shown}</span>
      {#if unit && text == null}<span class="unit">{unit}</span>{/if}
    {:else}
      <span class="placeholder" aria-hidden="true"></span>
    {/if}
  </span>
</div>

<style>
  .stat {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }

  .label {
    font-size: 11px;
    color: var(--text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .figure {
    display: flex;
    align-items: baseline;
    gap: 3px;
    min-height: 1.25em;
    white-space: nowrap;
  }

  .value {
    font-family: var(--font-editor);
    font-weight: 500;
    color: var(--text-strong);
    font-variant-numeric: tabular-nums;
  }

  .value.word {
    font-family: var(--font-ui);
  }

  .unit {
    font-family: var(--font-editor);
    color: var(--text-muted);
  }

  .placeholder {
    display: inline-block;
    width: 2.2em;
    height: 2px;
    margin: 0.5em 0;
    background: var(--border);
    border-radius: 1px;
  }

  .sm .value {
    font-size: 12px;
  }

  .sm .unit {
    font-size: 10px;
  }

  .md .value {
    font-size: 16px;
  }

  .md .unit {
    font-size: 11px;
  }

  .lg .value {
    font-size: 22px;
  }

  .lg .unit {
    font-size: 12px;
  }

  .xl .label {
    font-size: 14px;
  }

  .xl .value {
    font-size: 44px;
    font-weight: 500;
    letter-spacing: -0.02em;
  }

  .xl .unit {
    font-size: 18px;
  }

  .success .value {
    color: var(--success);
  }

  .warning .value {
    color: var(--warning);
  }

  .error .value {
    color: var(--error);
  }
</style>

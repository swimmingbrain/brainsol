<script lang="ts">
  // one key number of the side column. a label, the figure in mono with its
  // unit, and one quiet line under it that says where the number comes from.
  // every line keeps its height while a value is missing, so the grid never moves
  let {
    label,
    value,
    unit = '',
    before = '',
    caption = '',
    tag = '',
    word = false,
    dot = null,
    wide = false,
    title
  }: {
    label: string;
    // already formatted, null draws the placeholder
    value: string | null;
    unit?: string;
    // a small word in front of the figure, like about
    before?: string;
    caption?: string;
    // a boxed word at the end of the caption line, like estimated
    tag?: string;
    // a word instead of a number, set in the text face
    word?: boolean;
    // a state colour for a small dot in front of the value
    dot?: 'neutral' | 'success' | 'warning' | 'error' | null;
    wide?: boolean;
    title?: string;
  } = $props();
</script>

<div class="tile" class:wide {title}>
  <span class="label">{label}</span>
  <span class="figure">
    {#if value !== null}
      {#if dot}<span class="dot {dot}" aria-hidden="true"></span>{/if}
      {#if before}<span class="before">{before}</span>{/if}
      <span class="value" class:word>{value}</span>
      {#if unit}<span class="unit">{unit}</span>{/if}
    {:else}
      <span class="placeholder" aria-hidden="true"></span>
    {/if}
  </span>
  <span class="caption">
    {#if caption}<span class="note">{caption}</span>{/if}
    {#if tag}<span class="tag">{tag}</span>{/if}
  </span>
</div>

<style>
  .tile {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .wide {
    grid-column: 1 / -1;
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
    gap: 4px;
    height: 28px;
    white-space: nowrap;
    overflow: hidden;
  }

  .value {
    font-family: var(--font-editor);
    font-size: 21px;
    font-weight: 500;
    line-height: 28px;
    letter-spacing: -0.02em;
    color: var(--text-strong);
    font-variant-numeric: tabular-nums;
  }

  .value.word {
    font-family: var(--font-ui);
    font-size: 16px;
    font-weight: 600;
    letter-spacing: -0.01em;
  }

  .before,
  .unit {
    font-family: var(--font-editor);
    font-size: 11px;
    color: var(--text-muted);
  }

  .before {
    font-family: var(--font-ui);
  }

  .dot {
    align-self: center;
    width: 7px;
    height: 7px;
    margin-right: 2px;
    border-radius: 50%;
    background: var(--text-muted);
    flex-shrink: 0;
  }

  .dot.success {
    background: var(--success);
  }

  .dot.warning {
    background: var(--warning);
  }

  .dot.error {
    background: var(--error);
  }

  .placeholder {
    align-self: center;
    width: 2.4em;
    height: 2px;
    background: var(--border);
    border-radius: 1px;
  }

  .caption {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 16px;
    min-width: 0;
    font-size: 10.5px;
    color: var(--text-muted);
    white-space: nowrap;
  }

  .note {
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }

  .tag {
    flex-shrink: 0;
    padding: 0 4px;
    font-family: var(--font-editor);
    font-size: 9.5px;
    line-height: 14px;
    color: var(--text-secondary);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
  }
</style>

<script lang="ts">
  // one key number of the side column. a label, the figure with its
  // unit, and one quiet line under it that says where the number comes from.
  // every line keeps its height while a value is missing, so the grid never moves.
  // the longer explanation sits behind the label: a tap, a click or the keyboard
  // opens it as a small note, a mouse that rests on the tile shows it too
  import Icon from '$lib/ui/Icon.svelte';

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
    end = false,
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
    // a word instead of a number, set smaller than a figure
    word?: boolean;
    // a state colour for a small dot in front of the value
    dot?: 'neutral' | 'success' | 'warning' | 'error' | null;
    wide?: boolean;
    // a tile in the right column, its note opens towards the left
    end?: boolean;
    // the explanation behind the label
    title?: string;
  } = $props();

  const id = $props.id();
  let tile = $state<HTMLElement | null>(null);
  let open = $state(false);
  let resting = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const shown = $derived(Boolean(title) && (open || resting));

  // a mouse that stays a moment, like the title of a page used to
  function enter(event: PointerEvent) {
    if (event.pointerType !== 'mouse' || !title) return;
    clearTimeout(timer);
    timer = setTimeout(() => (resting = true), 450);
  }

  function leave() {
    clearTimeout(timer);
    resting = false;
  }

  // a tap anywhere else, the escape key or focus moving on closes the note
  $effect(() => {
    if (!open) return;
    const down = (event: PointerEvent) => {
      if (tile && !tile.contains(event.target as Node)) open = false;
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') open = false;
    };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('keydown', key);
    };
  });

  // the whole tile listens for a resting mouse, it is no control of its own
  $effect(() => {
    const el = tile;
    if (!el || !title) return;
    el.addEventListener('pointerenter', enter);
    el.addEventListener('pointerleave', leave);
    return () => {
      el.removeEventListener('pointerenter', enter);
      el.removeEventListener('pointerleave', leave);
      clearTimeout(timer);
    };
  });
</script>

<div
  class="tile"
  class:wide
  bind:this={tile}
  onfocusout={(event) => {
    if (!tile?.contains(event.relatedTarget as Node | null)) open = false;
  }}>
  {#if title}
    <button type="button" class="label more" class:on={shown} aria-expanded={open} aria-controls="{id}-note" onclick={() => (open = !open)}>
      <span class="text">{label}</span>
      <Icon name="info" size={12} />
    </button>
    <!-- the live region stays in place, a screen reader reads the note when it appears -->
    <span id="{id}-note" class="live" role="status">
      {#if shown}<span class="note-pop" class:end>{title}</span>{/if}
    </span>
  {:else}
    <span class="label">{label}</span>
  {/if}
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
    position: relative;
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

  /* the label opens the note, a small mark says there is more to read */
  .more {
    position: relative;
    display: flex;
    align-items: center;
    gap: 4px;
    align-self: flex-start;
    max-width: 100%;
    padding: 0;
    text-align: left;
    border-radius: var(--radius-sm);
  }

  .more .text {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .more :global(svg) {
    opacity: 0.55;
    transition: opacity 120ms ease;
  }

  .more:hover,
  .more.on {
    color: var(--text-secondary);
  }

  .more:hover :global(svg),
  .more.on :global(svg),
  .more:focus-visible :global(svg) {
    opacity: 1;
  }

  /* a finger needs more than the line of text to hit, the grid stays as it is */
  @media (pointer: coarse) {
    .more::after {
      content: '';
      position: absolute;
      inset: -8px -6px;
    }
  }

  /* out of the flow, so the grid never moves when a note opens */
  .live {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .note-pop {
    position: absolute;
    top: calc(100% + 2px);
    left: 0;
    z-index: 5;
    width: max-content;
    max-width: min(250px, calc(200% + 16px));
    padding: 7px 10px;
    font-size: 11.5px;
    line-height: 1.45;
    color: var(--text-secondary);
    white-space: normal;
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    box-shadow: 0 4px 16px var(--shadow);
    pointer-events: none;
  }

  .note-pop.end {
    left: auto;
    right: 0;
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
    font-size: 21px;
    font-weight: 500;
    line-height: 28px;
    letter-spacing: -0.02em;
    color: var(--text-strong);
    font-variant-numeric: tabular-nums;
  }

  .value.word {
    font-size: 16px;
    font-weight: 600;
    letter-spacing: -0.01em;
  }

  .before,
  .unit {
    font-size: 12px;
    color: var(--text-muted);
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
    font-size: 9.5px;
    line-height: 14px;
    color: var(--text-secondary);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
  }
</style>

<script lang="ts">
  import type { Snippet } from 'svelte';

  // a block of the side column or the dock: a 32 px head with a title and room
  // on the right, then the body. no box around it, a hairline above the head
  let {
    title,
    right,
    children,
    flush = false
  }: {
    title: string;
    right?: Snippet;
    children: Snippet;
    // the body brings its own padding, a chart that runs to the edges
    flush?: boolean;
  } = $props();
</script>

<section class="panel">
  <header class="head">
    <h2>{title}</h2>
    {#if right}<div class="right">{@render right()}</div>{/if}
  </header>
  <div class="body" class:flush>{@render children()}</div>
</section>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    min-width: 0;
    background: var(--bg-surface);
    border-top: 1px solid var(--border);
  }

  .panel:first-child {
    border-top: none;
  }

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    height: var(--panel-head-h);
    padding: 0 12px;
    flex-shrink: 0;
  }

  h2 {
    font-size: 13px;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .right {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }

  .body {
    padding: 2px 12px 14px;
    min-width: 0;
  }

  .body.flush {
    padding: 0;
  }
</style>

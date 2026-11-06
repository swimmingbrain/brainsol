<script lang="ts">
  import type { Snippet } from 'svelte';

  // one block of a dock tab: a small heading, an optional plain sentence and the
  // controls. a hairline below separates it from the next
  let {
    title,
    hint,
    right,
    children
  }: {
    title: string;
    hint?: string;
    right?: Snippet;
    children: Snippet;
  } = $props();
</script>

<section class="group">
  <header class="head">
    <h3>{title}</h3>
    {#if right}<div class="right">{@render right()}</div>{/if}
  </header>
  {#if hint}<p class="hint">{hint}</p>{/if}
  <div class="body">{@render children()}</div>
</section>

<style>
  .group {
    padding: 10px 12px 14px;
    border-bottom: 1px solid var(--border);
    break-inside: avoid;
    min-width: 0;
  }

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-height: 22px;
  }

  h3 {
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

  .hint {
    margin-top: 2px;
    font-size: 12px;
    line-height: 1.45;
    color: var(--text-muted);
  }

  .body {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 8px;
    min-width: 0;
  }
</style>

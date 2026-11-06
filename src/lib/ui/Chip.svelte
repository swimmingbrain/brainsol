<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon, { type IconName } from './Icon.svelte';

  // a small label for a state or a fact. the dot carries the state colour,
  // the text stays neutral
  let {
    tone = 'neutral',
    dot = false,
    pulse = false,
    icon,
    title,
    onclick,
    children
  }: {
    tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'error';
    dot?: boolean;
    pulse?: boolean;
    icon?: IconName;
    title?: string;
    onclick?: () => void;
    children: Snippet;
  } = $props();
</script>

{#if onclick}
  <button class="chip {tone}" {title} {onclick}>
    {#if dot}<span class="dot" class:pulse></span>{/if}
    {#if icon}<Icon name={icon} size={11} />{/if}
    <span class="text">{@render children()}</span>
  </button>
{:else}
  <span class="chip {tone}" {title}>
    {#if dot}<span class="dot" class:pulse></span>{/if}
    {#if icon}<Icon name={icon} size={11} />{/if}
    <span class="text">{@render children()}</span>
  </span>
{/if}

<style>
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 20px;
    padding: 0 7px;
    font-size: 10.5px;
    font-weight: 500;
    color: var(--text-secondary);
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    white-space: nowrap;
    flex-shrink: 0;
    min-width: 0;
  }

  .text {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  button.chip:hover {
    color: var(--text-primary);
    border-color: var(--text-muted);
  }

  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--text-muted);
    flex-shrink: 0;
  }

  .accent {
    color: var(--accent-ink);
    background: var(--accent-dim);
    border-color: transparent;
  }

  .accent .dot {
    background: var(--accent);
  }

  .success .dot {
    background: var(--success);
  }

  .warning .dot {
    background: var(--warning);
  }

  .error .dot {
    background: var(--error);
  }

  .pulse {
    animation: pulse 1.5s infinite;
  }
</style>

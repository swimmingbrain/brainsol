<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from '$lib/ui/Icon.svelte';

  // a short line under a control: why it is off, what just happened, what to do
  let {
    tone = 'info',
    children
  }: {
    tone?: 'info' | 'warn' | 'error' | 'ok';
    children: Snippet;
  } = $props();

  const icon = $derived(tone === 'ok' ? 'check' : tone === 'info' ? 'info' : 'warning');
</script>

<p class="note {tone}">
  <span class="icon"><Icon name={icon} size={12} /></span>
  <span class="text">{@render children()}</span>
</p>

<style>
  .note {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    font-size: 12px;
    line-height: 1.45;
    color: var(--text-muted);
  }

  .icon {
    display: flex;
    padding-top: 2px;
    flex-shrink: 0;
  }

  .text {
    min-width: 0;
  }

  .warn .icon {
    color: var(--warning);
  }

  .error .icon {
    color: var(--error);
  }

  .ok .icon {
    color: var(--success);
  }

  .warn .text,
  .error .text {
    color: var(--text-secondary);
  }
</style>

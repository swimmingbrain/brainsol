<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon, { type IconName } from './Icon.svelte';

  // primary is the one action of a panel, secondary the others, ghost sits in
  // bars and lists, danger is for what cannot be taken back
  let {
    variant = 'secondary',
    size = 'md',
    icon,
    href,
    type = 'button',
    disabled = false,
    active = false,
    full = false,
    title,
    label,
    onclick,
    children
  }: {
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
    size?: 'sm' | 'md' | 'lg';
    icon?: IconName;
    href?: string;
    type?: 'button' | 'submit';
    disabled?: boolean;
    // a toggle that is on
    active?: boolean;
    full?: boolean;
    title?: string;
    // the accessible name of a button that only shows an icon
    label?: string;
    onclick?: (e: MouseEvent) => void;
    children?: Snippet;
  } = $props();

  const iconSize = $derived(size === 'lg' ? 15 : size === 'sm' ? 12 : 14);
</script>

{#if href}
  <a
    class="btn {variant} {size}"
    class:full
    class:only={!children}
    class:active
    {href}
    {title}
    aria-label={label}
    target={href.startsWith('http') ? '_blank' : undefined}
    rel={href.startsWith('http') ? 'noopener' : undefined}>
    {#if icon}<Icon name={icon} size={iconSize} />{/if}
    {#if children}<span>{@render children()}</span>{/if}
  </a>
{:else}
  <button
    class="btn {variant} {size}"
    class:full
    class:only={!children}
    class:active
    {type}
    {disabled}
    {title}
    aria-label={label}
    aria-pressed={active || undefined}
    {onclick}>
    {#if icon}<Icon name={icon} size={iconSize} />{/if}
    {#if children}<span>{@render children()}</span>{/if}
  </button>
{/if}

<style>
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    flex-shrink: 0;
    line-height: 1;
    white-space: nowrap;
    color: var(--text-secondary);
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    text-decoration: none;
    cursor: pointer;
    transition: background 0.1s ease, color 0.1s ease, border-color 0.1s ease;
  }

  .sm {
    height: 22px;
    padding: 0 8px;
    font-size: 11.5px;
  }

  .md {
    height: 28px;
    padding: 0 10px;
    font-size: 12px;
  }

  .lg {
    height: 34px;
    padding: 0 16px;
    font-size: 13.5px;
  }

  .only.sm {
    width: 22px;
    padding: 0;
  }

  .only.md {
    width: 28px;
    padding: 0;
  }

  .only.lg {
    width: 34px;
    padding: 0;
  }

  .full {
    width: 100%;
  }

  .primary {
    background: var(--accent);
    color: var(--on-accent);
  }

  .primary:hover:not(:disabled) {
    background: var(--accent-hover);
    color: var(--on-accent);
  }

  .secondary {
    background: var(--bg-elevated);
    border-color: var(--border);
    color: var(--text-primary);
  }

  .secondary:hover:not(:disabled) {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .ghost:hover:not(:disabled) {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .danger {
    border-color: var(--error);
    color: var(--error);
  }

  .danger:hover:not(:disabled) {
    background: var(--error);
    color: var(--on-error);
  }

  .active,
  .active:hover:not(:disabled) {
    background: var(--accent-dim);
    color: var(--accent-ink);
  }

  .btn:disabled {
    opacity: 0.4;
    cursor: default;
  }

  /* the focus line of the page is the accent, on these two it would vanish. it
     sits inside, so a dialog or a scrolling panel never clips it */
  .primary:focus-visible {
    outline: 2px solid var(--on-accent);
    outline-offset: -4px;
  }

  .danger:focus-visible {
    outline: 2px solid var(--text-strong);
    outline-offset: -4px;
  }

  /* a finger needs more room than a mouse pointer */
  @media (pointer: coarse) {
    .sm {
      height: 40px;
      padding: 0 12px;
      font-size: 12.5px;
    }

    .md {
      height: 44px;
      padding: 0 14px;
      font-size: 13.5px;
    }

    .lg {
      height: 48px;
    }

    .only.sm {
      width: 40px;
    }

    .only.md {
      width: 44px;
    }

    .only.lg {
      width: 48px;
    }
  }
</style>

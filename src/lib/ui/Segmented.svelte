<script lang="ts" generics="T extends string">
  import Icon, { type IconName } from './Icon.svelte';

  // two to four views of the same thing, side by side, one of them on
  let {
    value,
    options,
    onchange,
    disabled = false,
    size = 'md',
    label
  }: {
    value: T;
    options: { value: T; label: string; icon?: IconName; title?: string }[];
    onchange: (value: T) => void;
    disabled?: boolean;
    size?: 'sm' | 'md';
    label?: string;
  } = $props();
</script>

<div class="segmented {size}" role="radiogroup" aria-label={label} class:disabled>
  {#each options as option (option.value)}
    <button
      class="segment"
      class:on={option.value === value}
      role="radio"
      aria-checked={option.value === value}
      title={option.title ?? option.label}
      {disabled}
      onclick={() => option.value !== value && onchange(option.value)}>
      {#if option.icon}<Icon name={option.icon} size={size === 'sm' ? 11 : 12} />{/if}
      <span>{option.label}</span>
    </button>
  {/each}
</div>

<style>
  .segmented {
    display: flex;
    align-items: stretch;
    gap: 1px;
    padding: 1px;
    background: var(--bg-deep);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    min-width: 0;
  }

  .segment {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    padding: 0 8px;
    font-size: 11px;
    font-weight: 500;
    color: var(--text-muted);
    white-space: nowrap;
    transition: background 0.1s ease, color 0.1s ease;
  }

  .segment span {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .md .segment {
    height: 24px;
  }

  .sm .segment {
    height: 18px;
    padding: 0 6px;
    font-size: 10.5px;
  }

  .segment:hover:not(:disabled):not(.on) {
    color: var(--text-primary);
    background: var(--bg-hover);
  }

  .segment.on {
    color: var(--accent);
    background: var(--accent-dim);
  }

  .disabled {
    opacity: 0.4;
  }

  .segment:disabled {
    cursor: default;
  }

  @media (pointer: coarse) {
    .md .segment {
      height: 40px;
      font-size: 12.5px;
    }

    .sm .segment {
      height: 34px;
      font-size: 12px;
    }
  }
</style>

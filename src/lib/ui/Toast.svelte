<script lang="ts">
  import Icon from './Icon.svelte';
  import { toasts } from '$lib/stores/toasts.svelte';
  import { t } from '$lib/i18n';

  const typeColors: Record<string, string> = {
    info: 'var(--accent-ink)',
    success: 'var(--success)',
    warning: 'var(--warning)',
    error: 'var(--error)'
  };
</script>

{#if toasts.items.length > 0}
  <div class="toast-container" role="status" aria-live="polite">
    {#each toasts.items as toast (toast.id)}
      <div class="toast" style="border-left-color: {typeColors[toast.type]}">
        <span>{toast.message}</span>
        <button class="close-btn" onclick={() => toasts.dismiss(toast.id)} aria-label={t('common.close')}>
          <Icon name="close" size={10} />
        </button>
      </div>
    {/each}
  </div>
{/if}

<style>
  /* above the status bar, clear of the top bar and the dock tabs that stick under it */
  .toast-container {
    position: fixed;
    bottom: calc(var(--statusbar-h) + 10px + env(safe-area-inset-bottom));
    right: 12px;
    z-index: 1100;
    display: flex;
    flex-direction: column;
    gap: 4px;
    pointer-events: none;
  }

  .toast {
    pointer-events: auto;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-left: 2px solid var(--accent-ink);
    color: var(--text-primary);
    font-size: 12px;
    line-height: 1.45;
    box-shadow: 0 4px 16px var(--shadow);
    animation: slide-in-right 150ms ease;
    min-width: 180px;
    max-width: 340px;
  }

  .toast span {
    flex: 1;
  }

  .close-btn {
    flex-shrink: 0;
    width: 18px;
    height: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
  }

  .close-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  /* a phone has controls all the way down to the status bar, so the note
     takes the place of the status bar for its few seconds and covers nothing
     that can be pressed */
  @media (max-width: 480px) {
    .toast-container {
      left: 0;
      right: 0;
      bottom: env(safe-area-inset-bottom);
      gap: 0;
    }

    .toast {
      min-width: 0;
      max-width: none;
      min-height: var(--statusbar-h);
      padding: 3px 6px 3px 10px;
      font-size: 11.5px;
      line-height: 1.4;
      border-width: 1px 0 0 2px;
      box-shadow: none;
      animation: none;
    }
  }
</style>

<script lang="ts">
  import { MODES, type Mode } from '$lib/link/protocol';
  import { modeName, t, type Key } from '$lib/i18n';

  // six modes as a grid of large buttons. the lit one is always the mode the
  // tracker reports, never the one asked for. the asked one pulses until the
  // telemetry agrees or the ack says no
  let {
    current,
    wanted,
    unsupported,
    disabled = false,
    onpick
  }: {
    current: Mode | null;
    wanted: Mode | null;
    unsupported: (mode: Mode) => boolean;
    disabled?: boolean;
    onpick: (mode: Mode) => void;
  } = $props();
</script>

<div class="modes" role="group" aria-label={t('admin.mode.label')}>
  {#each MODES as mode (mode)}
    {@const off = unsupported(mode)}
    <button
      class="mode"
      class:on={mode === current}
      class:asked={mode === wanted && mode !== current}
      aria-pressed={mode === current}
      disabled={disabled || off}
      title={off ? t('admin.mode.unsupported') : t(`admin.mode.about.${mode}` as Key)}
      onclick={() => onpick(mode)}>
      {modeName(mode)}
    </button>
  {/each}
</div>

<style>
  .modes {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 1px;
    padding: 1px;
    background: var(--bg-deep);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
  }

  .mode {
    height: 30px;
    min-width: 0;
    padding: 0 6px;
    font-size: 12px;
    color: var(--text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    transition: background 0.1s ease, color 0.1s ease;
  }

  .mode:hover:not(:disabled):not(.on) {
    color: var(--text-primary);
    background: var(--bg-hover);
  }

  .mode.on {
    color: var(--accent-ink);
    background: var(--accent-dim);
  }

  .mode.asked {
    color: var(--text-primary);
    background: var(--bg-hover);
    animation: pulse 1.2s infinite;
  }

  .mode:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  @container dock (min-width: 640px) {
    .modes {
      grid-template-columns: repeat(6, minmax(0, 1fr));
    }
  }

  @media (pointer: coarse) {
    .mode {
      height: 44px;
      font-size: 13.5px;
    }
  }
</style>

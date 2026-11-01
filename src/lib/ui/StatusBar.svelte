<script lang="ts">
  import { connection } from '$lib/stores/connection.svelte';
  import { telemetry } from '$lib/stores/telemetry.svelte';
  import { fmt, t } from '$lib/i18n';

  const live = $derived(connection.source === 'live');
  const waiting = $derived(connection.status === 'connecting' || connection.status === 'reconnecting');
  const host = $derived(connection.host ?? '');

  const dotColor = $derived(
    live
      ? waiting
        ? 'var(--warning)'
        : 'var(--success)'
      : connection.problem
        ? 'var(--warning)'
        : connection.status === 'open'
          ? 'var(--accent)'
          : 'var(--text-muted)'
  );

  const text = $derived.by(() => {
    // config.json is still on its way, nothing is decided yet
    if (!live && connection.status === 'idle') return t('status.starting');
    if (live) {
      if (connection.status === 'reconnecting') return t('status.reconnecting', { host });
      if (connection.status === 'connecting' || connection.status === 'idle') return t('status.connecting', { host });
      return t('status.live', { host });
    }
    if (connection.problem === 'unreachable') return t('status.unreachable', { host });
    if (connection.problem === 'mixed') return t('status.mixed', { host });
    if (connection.problem === 'invalid') return t('status.invalid', { host });
    return t('status.sim');
  });

  const hz = $derived(telemetry.sys ? fmt(telemetry.sys.hz, 0) : null);
  const latency = $derived(live && connection.latency !== null ? fmt(connection.latency, 0) : null);
  const event = $derived(telemetry.lastEvent);
</script>

<footer class="status-bar">
  <div class="left">
    <span class="status-item" title={text}>
      <span class="dot" class:pulse={waiting} style="background: {dotColor}"></span>
      <span class="ellipsis">{text}</span>
    </span>
    {#if hz !== null}
      <span class="sep"></span>
      <span class="status-item" title={t('status.loopTitle')}>{t('status.loop', { hz })}</span>
    {/if}
    {#if latency !== null}
      <span class="sep"></span>
      <span class="status-item" title={t('status.latencyTitle')}>{t('status.latency', { ms: latency })}</span>
    {/if}
    {#if event}
      <span class="sep wide"></span>
      <span class="status-item event wide" class:warn={event.lvl === 'warn'} class:error={event.lvl === 'error'} title="{t('status.lastEvent')}: {event.msg}">
        <span class="ellipsis">{event.msg}</span>
      </span>
    {/if}
  </div>

  <div class="right">
    <span class="status-item credit">
      made with <span class="heart">&hearts;</span> by
      <a href="https://swimmingbrain.dev" target="_blank" rel="noopener">Braian Plaku</a>
    </span>
  </div>
</footer>

<style>
  .status-bar {
    height: var(--statusbar-h);
    background: var(--bg-surface);
    border-top: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 0 10px;
    font-size: 10.5px;
    color: var(--text-muted);
    flex-shrink: 0;
    user-select: none;
    font-family: var(--font-editor);
    min-width: 0;
  }

  .left,
  .right {
    display: flex;
    align-items: center;
    gap: 3px;
    min-width: 0;
  }

  .left {
    flex: 1;
  }

  .status-item {
    display: flex;
    align-items: center;
    gap: 5px;
    white-space: nowrap;
    min-width: 0;
  }

  .ellipsis {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .sep {
    width: 1px;
    height: 10px;
    background: var(--border);
    margin: 0 4px;
    flex-shrink: 0;
  }

  .dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    display: inline-block;
    flex-shrink: 0;
  }

  .pulse {
    animation: pulse 1.5s infinite;
  }

  .event {
    color: var(--text-secondary);
    max-width: 360px;
  }

  .event.warn {
    color: var(--warning);
  }

  .event.error {
    color: var(--error);
  }

  .credit a {
    color: var(--accent);
    text-decoration: none;
  }

  .credit a:hover {
    color: var(--accent-hover);
  }

  .heart {
    color: var(--error);
    font-size: 11px;
  }

  @media (max-width: 900px) {
    .credit {
      display: none;
    }
  }

  @media (max-width: 640px) {
    .wide {
      display: none;
    }
  }
</style>

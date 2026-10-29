<script lang="ts">
  // a scan, an experiment or a calibration step borrows the head. this strip
  // under the tabs says so from every tab and stops it with one press
  import Button from '$lib/ui/Button.svelte';
  import { telemetry } from '$lib/stores/telemetry.svelte';
  import { fmt, t, type Key } from '$lib/i18n';
  import { STOP } from '../commands';
  import { progress } from '../scanmap';
  import { runner } from '../session.svelte';

  const act = $derived(telemetry.sys?.act ?? null);

  const detail = $derived.by(() => {
    if (act === 'scan') {
      const done = progress(telemetry.scan);
      return done.total > 0 ? t('admin.scan.points', { n: done.visited, total: done.total }) : '';
    }
    if (act === 'exp' && telemetry.exp) return `${t(`admin.exp.${telemetry.exp.kind}` as Key)}, ${fmt(telemetry.exp.progress * 100, 0)}%`;
    return '';
  });
</script>

{#if act}
  <div class="activity" role="status">
    <span class="dot" aria-hidden="true"></span>
    <span class="what">{t(`admin.activity.${act}` as Key)}</span>
    {#if detail}<span class="detail">{detail}</span>{/if}
    <Button size="sm" variant="secondary" icon="stop" disabled={runner.pending('stop')} onclick={() => runner.run(STOP, { key: 'stop' })}>
      {t('admin.activity.stop')}
    </Button>
  </div>
{/if}

<style>
  .activity {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 36px;
    padding: 4px 12px;
    background: var(--bg-elevated);
    border-bottom: 1px solid var(--border);
  }

  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--accent);
    animation: pulse 1.2s infinite;
    flex-shrink: 0;
  }

  .what {
    font-size: 12px;
    color: var(--text-primary);
    white-space: nowrap;
  }

  .detail {
    flex: 1;
    min-width: 0;
    font-family: var(--font-editor);
    font-size: 10.5px;
    color: var(--text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .activity :global(.btn) {
    margin-left: auto;
  }

  @media (pointer: coarse) {
    .activity :global(.btn) {
      height: 40px;
    }
  }
</style>

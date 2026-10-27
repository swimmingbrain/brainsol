<script lang="ts">
  // the sky scan: the head visits a grid of directions, measures the light at
  // each and the map fills in as it goes. the brightest cell is one click away
  import Group from '../parts/Group.svelte';
  import Note from '../parts/Note.svelte';
  import HeatMap from '../parts/HeatMap.svelte';
  import Progress from '../parts/Progress.svelte';
  import Segmented from '$lib/ui/Segmented.svelte';
  import Button from '$lib/ui/Button.svelte';
  import { connection } from '$lib/stores/connection.svelte';
  import { telemetry } from '$lib/stores/telemetry.svelte';
  import { fmt, t } from '$lib/i18n';
  import { FALLBACK_LIMITS, SCAN_STEPS, scanCommand, STOP, targetCommand } from '../commands';
  import { brightest, progress, scanRunning } from '../scanmap';
  import { runner, session } from '../session.svelte';

  const scan = $derived(telemetry.scan);
  const running = $derived(scanRunning(scan, telemetry.sys ? telemetry.sys.act : undefined));
  // another activity holds the head, a scan would only get busy back
  const other = $derived(telemetry.sys?.act && telemetry.sys.act !== 'scan' ? telemetry.sys.act : null);
  const done = $derived(progress(scan));
  const best = $derived(brightest(scan));
  const noScan = $derived(runner.unsupported('scan'));
  const limits = $derived(connection.config?.limits ?? FALLBACK_LIMITS);

  // the map holds lux when the tracker has a light sensor, the mean level otherwise
  const lux = $derived(connection.caps?.lux ?? true);
  const unit = $derived(lux ? ' lx' : '');
  const digits = $derived(lux ? 0 : 3);

  const steps = $derived(SCAN_STEPS.map((step) => ({ value: String(step), label: `${step}°`, title: t('admin.scan.stepTitle', { step }) })));

  function start() {
    void runner.run(scanCommand(session.scanStep), { key: 'scan' });
  }

  function stop() {
    void runner.run(STOP, { key: 'stop' });
  }

  function point() {
    if (!best) return;
    void runner.run(targetCommand({ pan: best.pan, tilt: best.tilt }, limits), { key: 'scan.point', feature: 'target' });
  }
</script>

<Group title={t('admin.scan.title')} hint={t('admin.scan.hint')}>
  <div class="row">
    <span class="label">{t('admin.scan.step')}</span>
    <Segmented
      value={String(session.scanStep)}
      options={steps}
      label={t('admin.scan.step')}
      disabled={running}
      onchange={(value) => (session.scanStep = Number(value))} />
  </div>
  <div class="actions">
    {#if running}
      <Button variant="secondary" icon="stop" disabled={runner.pending('stop')} onclick={stop}>{t('admin.scan.stop')}</Button>
    {:else}
      <Button variant="primary" icon="scan" disabled={noScan || other !== null || runner.pending('scan')} onclick={start}>{t('admin.scan.start')}</Button>
    {/if}
    {#if scan}
      <div class="bar">
        <Progress share={done.share} label={t('admin.scan.progress')} text={t('admin.scan.points', { n: done.visited, total: done.total })} />
      </div>
    {/if}
  </div>
  {#if noScan}
    <Note tone="warn">{t('admin.scan.unsupported')}</Note>
  {:else if other}
    <Note>{t('admin.scan.other')}</Note>
  {/if}
</Group>

<Group title={t('admin.scan.map')}>
  {#if scan}
    <HeatMap {scan} {unit} {digits} head={running && telemetry.pan !== null && telemetry.tilt !== null ? { pan: telemetry.pan, tilt: telemetry.tilt } : null} />
    {#if best}
      <div class="best">
        <p>
          {t('admin.scan.best', { pan: fmt(best.pan, 0) ?? '', tilt: fmt(best.tilt, 0) ?? '', value: `${fmt(best.v, digits)}${unit}` })}
        </p>
        <!-- a target ends the scan, it waits until the map is done -->
        <Button size="sm" icon="target" disabled={running || runner.unsupported('target') || runner.pending('scan.point')} onclick={point}>
          {t('admin.scan.point')}
        </Button>
      </div>
    {/if}
    {#if scan.done && done.visited < done.total}
      <Note>{t('admin.scan.early')}</Note>
    {/if}
  {:else}
    <Note>{t('admin.scan.empty')}</Note>
  {/if}
</Group>

<style>
  .row {
    display: grid;
    grid-template-columns: 110px minmax(0, 1fr);
    align-items: center;
    gap: 6px;
  }

  .label {
    font-size: 11.5px;
    color: var(--text-secondary);
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .bar {
    flex: 1;
    min-width: 0;
  }

  .best {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .best p {
    font-size: 12px;
    color: var(--text-secondary);
  }

  @media (pointer: coarse) {
    .actions :global(.btn),
    .best :global(.btn) {
      height: 44px;
    }
  }
</style>

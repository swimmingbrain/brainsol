<script lang="ts">
  // the step response: the head was turned off the light and let go. the
  // curves show how far each axis was from where it came to rest, the mark
  // where it settled
  import Plot, { type PlotSeries } from '../chart/Plot.svelte';
  import Figure from './Figure.svelte';
  import { fmt, t } from '$lib/i18n';
  import { stepTable } from './experiments';
  import type { StepResult } from '$lib/link/protocol';

  let { result }: { result: StepResult } = $props();

  const table = $derived(stepTable(result));
  const series = $derived<PlotSeries[]>([
    { label: t('q.pan'), color: 'series1', unit: '°', digits: 1 },
    { label: t('q.tilt'), color: 'series2', unit: '°', digits: 1 }
  ]);
  const offset = $derived(table.pan.length ? Math.abs(table.pan[0]) : null);
  const marks = $derived(result.settle !== null ? [{ x: result.settle, label: t('panels.results.settledAt', { s: fmt(result.settle, 2) ?? '' }) }] : []);
</script>

<div class="figures">
  <Figure
    label={t('panels.results.settle')}
    value={result.settle !== null ? fmt(result.settle, 2) : t('panels.results.noLock')}
    unit={result.settle !== null ? 's' : ''}
    note={t('panels.results.settleNote')} />
  <Figure label={t('panels.results.overshoot')} value={fmt(result.overshoot, 1)} unit="°" note={t('panels.results.overshootNote')} />
  <Figure label={t('panels.results.offset')} value={fmt(offset, 0)} unit="°" note={t('panels.results.offsetNote')} />
</div>
<Plot
  {series}
  view={{ data: [table.t, table.pan, table.tilt], min: 0, max: Math.max(1, table.t.at(-1) ?? 1) }}
  x="number"
  xFormat={(v) => `${fmt(v, v % 1 === 0 ? 0 : 1)} s`}
  y={{ include: [0], minSpan: 4 }}
  lines={[0]}
  {marks}
  height={240}
  hint={t('panels.results.stepAxis')}
  label={t('panels.results.stepAria')} />
<p class="caption">{t('panels.results.stepCaption')}</p>

<style>
  .figures {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 16px 24px;
    margin-bottom: 18px;
  }

  .caption {
    margin-top: 10px;
    max-width: 640px;
    font-size: 12.5px;
    line-height: 1.55;
    color: var(--text-secondary);
  }

  /* three figures still fit side by side on a phone */
  @media (max-width: 600px) {
    .figures {
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
    }
  }
</style>

<script lang="ts">
  // the cosine law: the light measured at each tilt away from the lock as
  // dots, the fitted cosine as a line through them
  import Plot, { type PlotSeries } from '../chart/Plot.svelte';
  import Figure from './Figure.svelte';
  import { fmt, t } from '$lib/i18n';
  import { cosineTable } from './experiments';
  import { lux } from '../format';
  import type { CosineResult } from '$lib/link/protocol';

  let { result }: { result: CosineResult } = $props();

  const table = $derived(cosineTable(result));
  // the fit goes first so the measured dots are drawn on top of it
  const series = $derived<PlotSeries[]>([
    { label: t('panels.results.fit'), color: 'series2', unit: 'lx', format: (v) => lux(v) },
    { label: t('panels.results.measured'), color: 'series1', unit: 'lx', format: (v) => lux(v), points: true }
  ]);
  // how much of the direct light the panel still got 60 degrees off, measured.
  // the cosine says half, this is the number people remember
  const at60 = $derived.by(() => {
    const near = result.points.filter((p) => Math.abs(Math.abs(p[0]) - 60) <= 2.5);
    if (!near.length || !(result.peak > 0)) return null;
    const mean = near.reduce((sum, p) => sum + p[1], 0) / near.length;
    return ((mean - result.amb) / result.peak) * 100;
  });
</script>

<div class="figures">
  <Figure label={t('panels.results.peak')} value={lux(result.peak)} unit="lx" note={t('panels.results.peakNote')} />
  <Figure label={t('panels.results.ambient')} value={lux(result.amb)} unit="lx" note={t('panels.results.ambientNote')} />
  <Figure label={t('panels.results.r2')} value={fmt(result.r2, 3)} note={t('panels.results.r2Note')} />
  <Figure label={t('panels.results.at60')} value={fmt(at60, 0)} unit="%" note={t('panels.results.at60Note')} />
</div>
<Plot
  {series}
  view={{ data: [table.delta, table.fit, table.measured], min: table.delta[0], max: table.delta.at(-1) }}
  x="number"
  xFormat={(v) => `${fmt(v, 0)}°`}
  y={{ min: 0, include: [0] }}
  height={240}
  hint={t('panels.results.angleAxis')}
  label={t('panels.results.cosineAria')} />
<p class="caption">{t('panels.results.cosineCaption')}</p>

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

  @media (max-width: 600px) {
    .figures {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>

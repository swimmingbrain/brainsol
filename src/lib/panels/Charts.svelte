<script lang="ts">
  // a stand in for the live charts until the viewer stream replaces this file.
  // it shows the way in: redraw when history.version changes, read the
  // samples straight from the ring
  import Panel from '$lib/ui/Panel.svelte';
  import { history } from '$lib/stores/history.svelte';
  import { t } from '$lib/i18n';

  const W = 300;
  const H = 64;
  const SPAN = 120;

  const scratch = new Float64Array(SPAN * 20);
  const times = new Float64Array(SPAN * 20);

  // the light of the last two minutes as one line
  const path = $derived.by(() => {
    void history.version;
    const ring = history.ring;
    const newest = ring.latest('time');
    if (newest === null) return '';
    const start = ring.since(newest - SPAN);
    // until two minutes are there the line uses the width it has
    const span = Math.max(10, Math.min(SPAN, newest - (ring.get('time', start) ?? newest)));
    const values = ring.copy('lux', start, scratch);
    const stamps = ring.copy('time', start, times);
    let top = 1;
    for (const value of values) if (value > top) top = value;
    let d = '';
    for (let i = 0; i < values.length; i++) {
      if (Number.isNaN(values[i])) continue;
      const x = W - ((newest - stamps[i]) / span) * W;
      const y = H - 2 - (values[i] / top) * (H - 4);
      d += `${d ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
    }
    return d;
  });
</script>

<Panel title={t('section.charts')}>
  <svg class="chart" viewBox="0 0 {W} {H}" preserveAspectRatio="none" aria-label={t('q.light')} role="img">
    <line class="grid" x1="0" y1={H - 0.5} x2={W} y2={H - 0.5} />
    <path class="line" d={path} />
  </svg>
  <p class="legend"><span class="swatch"></span>{t('q.light')}</p>
</Panel>

<style>
  .chart {
    display: block;
    width: 100%;
    height: 64px;
  }

  .grid {
    stroke: var(--chart-grid);
    stroke-width: 1;
    vector-effect: non-scaling-stroke;
  }

  .line {
    fill: none;
    stroke: var(--chart-1);
    stroke-width: 2;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
  }

  .legend {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 6px;
    font-size: 11px;
    color: var(--text-muted);
  }

  .swatch {
    width: 8px;
    height: 8px;
    border-radius: 1px;
    background: var(--chart-1);
  }
</style>

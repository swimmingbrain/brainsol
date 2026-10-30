<script lang="ts">
  // the sky map of a scan: tilt rows, pan columns, one cell per measured
  // direction on the copper heat ramp. tilt grows upwards like a y axis, so
  // the bottom row looks to the front and the top row back over the top
  import { fmt, t } from '$lib/i18n';
  import type { ScanMessage } from '$lib/link/protocol';
  import { heatStep, labelEvery, nearest, valueRange } from '../scanmap';

  let {
    scan,
    unit,
    digits,
    head = null
  }: {
    scan: ScanMessage;
    unit: string;
    digits: number;
    // where the head is now, marked while the scan runs
    head?: { pan: number; tilt: number } | null;
  } = $props();

  const range = $derived(valueRange(scan.v));
  const rows = $derived(scan.tilt.map((tilt, i) => ({ tilt, i })).reverse());
  const panEvery = $derived(labelEvery(scan.pan.length));
  const tiltEvery = $derived(labelEvery(scan.tilt.length));
  const headRow = $derived(head ? nearest(scan.tilt, head.tilt) : null);
  const headCol = $derived(head ? nearest(scan.pan, head.pan) : null);
  const best = $derived(scan.best);

  const value = (v: number | null) => (v === null ? t('admin.scan.notYet') : `${fmt(v, digits)}${unit}`);
</script>

<figure class="map" aria-label={t('admin.scan.mapLabel')}>
  <div class="grid" style="grid-template-columns: 30px repeat({scan.pan.length}, minmax(0, 1fr))">
    {#each rows as row (row.i)}
      <span class="tick tilt">{row.i % tiltEvery === 0 ? `${fmt(row.tilt, 0)}°` : ''}</span>
      {#each scan.pan as pan, j (j)}
        {@const v = scan.v[row.i]?.[j] ?? null}
        {@const step = heatStep(v, range)}
        <span
          class="cell"
          class:empty={step === null}
          class:best={best !== null && best.pan === pan && best.tilt === row.tilt}
          style={step === null ? undefined : `background: var(--heat-${step + 1})`}
          title="{t('q.pan')} {fmt(pan, 0)}°, {t('q.tilt')} {fmt(row.tilt, 0)}°: {value(v)}">
          {#if headRow === row.i && headCol === j}<i class="head"></i>{/if}
        </span>
      {/each}
    {/each}
    <span></span>
    {#each scan.pan as pan, j (j)}
      <span class="tick pan">{j % panEvery === 0 ? `${fmt(pan, 0)}°` : ''}</span>
    {/each}
  </div>
  <figcaption class="legend">
    <span class="axis">{t('admin.scan.axes')}</span>
    <span class="ramp" aria-hidden="true">
      {#each [1, 2, 3, 4, 5] as k (k)}<i style="background: var(--heat-{k})"></i>{/each}
    </span>
    {#if range}
      <span class="scale">{fmt(range.min, digits)} {t('admin.scan.to')} {fmt(range.max, digits)}{unit}</span>
    {/if}
  </figcaption>
</figure>

<style>
  .map {
    margin: 0;
    min-width: 0;
  }

  .grid {
    display: grid;
    gap: 1px;
    align-items: stretch;
  }

  .cell {
    position: relative;
    aspect-ratio: 1;
    min-width: 0;
    border-radius: 1px;
  }

  .cell.empty {
    background: transparent;
    outline: 1px solid var(--chart-track);
    outline-offset: -1px;
  }

  .cell.best {
    outline: 2px solid var(--text-strong);
    outline-offset: -2px;
  }

  .head {
    position: absolute;
    inset: 30%;
    border-radius: 50%;
    background: var(--text-strong);
  }

  .tick {
    font-family: var(--font-editor);
    font-size: 9.5px;
    color: var(--text-muted);
    white-space: nowrap;
  }

  .tick.tilt {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    padding-right: 4px;
  }

  .tick.pan {
    padding-top: 3px;
    text-align: center;
    overflow: visible;
  }

  .legend {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 8px;
    margin-top: 8px;
    font-size: 10.5px;
    color: var(--text-muted);
  }

  .axis {
    margin-right: auto;
  }

  .ramp {
    display: flex;
    gap: 1px;
  }

  .ramp i {
    display: block;
    width: 10px;
    height: 8px;
  }

  .scale {
    font-family: var(--font-editor);
    white-space: nowrap;
  }
</style>

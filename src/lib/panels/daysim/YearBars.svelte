<script lang="ts">
  // the twelve months as groups of three bars, the energy of a mean clear day
  // for each panel kind. hovering a month lifts it and the readout row names
  // the values, the other months step back
  import { fmt, t } from '$lib/i18n';
  import { niceStep } from '../chart/range';
  import { themeColors } from '../theme';
  import type { Month } from '../solar/day';

  let {
    months,
    names,
    full,
    labels
  }: {
    months: Month[];
    // short month names for the axis and whole ones for the readout
    names: string[];
    full: string[];
    // fixed, single axis, dual axis
    labels: [string, string, string];
  } = $props();

  const colors = $derived(themeColors());
  const kinds = ['fixed', 'single', 'dual'] as const;

  const HEIGHT = 200;
  const AXIS = 34;
  const BOTTOM = 20;
  const TOP = 8;

  let width = $state(0);
  let hover = $state<number | null>(null);

  const top = $derived(Math.max(0.5, ...months.map((m) => Math.max(m.daily.fixed, m.daily.single, m.daily.dual))));
  const step = $derived(niceStep(top / 4));
  const ceiling = $derived(Math.ceil(top / step - 1e-9) * step);
  const ticks = $derived(Array.from({ length: Math.round(ceiling / step) + 1 }, (_, i) => i * step));

  const plotW = $derived(Math.max(0, width - AXIS));
  const slot = $derived(plotW / 12);
  // three bars and two gaps of 2 px, a third of the slot stays air, no bar above 14 px
  const bar = $derived(Math.max(2, Math.min(14, (slot * 0.66 - 4) / 3)));
  const y = (value: number) => TOP + (HEIGHT - TOP - BOTTOM) * (1 - value / ceiling);

  // a bar with a rounded top and a square foot
  function column(x: number, value: number): string {
    const y0 = HEIGHT - BOTTOM;
    const y1 = y(value);
    const r = Math.min(2, bar / 2, Math.max(0, y0 - y1));
    return `M${x} ${y0}V${y1 + r}Q${x} ${y1} ${x + r} ${y1}H${x + bar - r}Q${x + bar} ${y1} ${x + bar} ${y1 + r}V${y0}Z`;
  }

  const seriesColor = (i: number) => colors.series[i];
  const shownMonth = $derived(hover !== null ? months[hover] : null);
</script>

<div class="bars">
  <div class="readout">
    {#each labels as name, i (name)}
      <span class="item">
        <span class="swatch" style="background: {seriesColor(i)}"></span>
        <span class="name">{name}</span>
        {#if shownMonth}<span class="value">{fmt(shownMonth.daily[kinds[i]], 1)}</span>{/if}
      </span>
    {/each}
    <span class="at">{shownMonth ? full[shownMonth.month] : t('panels.day.perDay')}</span>
  </div>
  <div class="box" bind:clientWidth={width}>
    {#if width > 0}
      <svg {width} height={HEIGHT} role="img" aria-label={t('panels.day.yearAria')}>
        {#each ticks as tick (tick)}
          <line class="grid" x1={AXIS} x2={width} y1={Math.round(y(tick)) + 0.5} y2={Math.round(y(tick)) + 0.5} />
          <text class="tick" x={AXIS - 6} y={y(tick)}>{fmt(tick, step < 1 ? 1 : 0)}</text>
        {/each}
        {#each months as month (month.month)}
          {@const left = AXIS + month.month * slot + (slot - 3 * bar - 4) / 2}
          <g class="month" class:dim={hover !== null && hover !== month.month}>
            {#each kinds as kind, i (kind)}
              <path d={column(left + i * (bar + 2), month.daily[kind])} fill={seriesColor(i)} />
            {/each}
            <text class="label" x={AXIS + month.month * slot + slot / 2} y={HEIGHT - 5}>{names[month.month]}</text>
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <rect
              class="hit"
              x={AXIS + month.month * slot}
              y={0}
              width={slot}
              height={HEIGHT}
              onpointerenter={() => (hover = month.month)}
              onpointerleave={() => (hover = null)} />
          </g>
        {/each}
      </svg>
    {/if}
  </div>
</div>

<style>
  .bars {
    min-width: 0;
  }

  .readout {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 2px 14px;
    min-height: 20px;
    margin-bottom: 4px;
    font-size: 11px;
    color: var(--text-secondary);
  }

  .item {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    white-space: nowrap;
  }

  .swatch {
    width: 8px;
    height: 8px;
    border-radius: 2px;
  }

  .value {
    font-family: var(--font-editor);
    font-weight: 500;
    color: var(--text-strong);
  }

  .at {
    margin-left: auto;
    font-family: var(--font-editor);
    font-size: 10px;
    color: var(--text-muted);
  }

  .box {
    min-width: 0;
  }

  svg {
    display: block;
  }

  .grid {
    stroke: var(--chart-grid);
    stroke-width: 1;
  }

  .tick,
  .label {
    font-family: var(--font-editor);
    font-size: 10px;
    fill: var(--text-muted);
  }

  .tick {
    text-anchor: end;
    dominant-baseline: middle;
  }

  .label {
    text-anchor: middle;
  }

  .month {
    transition: opacity 120ms ease;
  }

  .month.dim {
    opacity: 0.45;
  }

  .hit {
    fill: transparent;
  }
</style>

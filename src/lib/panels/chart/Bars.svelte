<script lang="ts" module>
  export interface BarGroup {
    // under the group on the axis
    label: string;
    // in the readout while the group is hovered
    full?: string;
    values: (number | null)[];
  }
</script>

<script lang="ts">
  // grouped bars from one baseline: a group per category, a bar per series
  // side by side with a 2 px gap. hovering a group lifts it and the readout
  // row names its values, the other groups step back
  import { fmt } from '$lib/i18n';
  import { niceStep, stepDecimals } from './range';
  import { themeColors, type PanelColors } from '../theme';
  import type { ColorRole } from './Plot.svelte';

  let {
    groups,
    series,
    height = 200,
    digits = 1,
    unit = '',
    idle = '',
    maxBar = 14,
    label
  }: {
    groups: BarGroup[];
    series: { label: string; color: ColorRole }[];
    height?: number;
    digits?: number;
    unit?: string;
    // on the right of the readout while nothing is hovered
    idle?: string;
    maxBar?: number;
    label: string;
  } = $props();

  const colors = $derived(themeColors());

  function color(c: PanelColors, role: ColorRole): string {
    if (role === 'series1') return c.series[0];
    if (role === 'series2') return c.series[1];
    if (role === 'series3') return c.series[2];
    if (role === 'accent') return c.accent;
    return c.neutral;
  }

  const AXIS = 34;
  const BOTTOM = 20;
  const TOP = 8;
  const GAP = 2;

  let width = $state(0);
  let hover = $state<number | null>(null);

  const top = $derived(Math.max(1e-9, ...groups.flatMap((g) => g.values.map((v) => v ?? 0))));
  const step = $derived(niceStep(top / 4));
  const ceiling = $derived(Math.ceil(top / step - 1e-9) * step);
  const ticks = $derived(Array.from({ length: Math.round(ceiling / step) + 1 }, (_, i) => i * step));

  const n = $derived(series.length);
  const slot = $derived(Math.max(0, width - AXIS) / Math.max(1, groups.length));
  // a third of the slot stays air, no bar above maxBar
  const bar = $derived(Math.max(2, Math.min(maxBar, (slot * 0.66 - (n - 1) * GAP) / Math.max(1, n))));
  const y = (value: number) => TOP + (height - TOP - BOTTOM) * (1 - value / ceiling);

  // a bar with a rounded top and a square foot
  function column(x: number, value: number): string {
    const y0 = height - BOTTOM;
    const y1 = y(value);
    const r = Math.min(2, bar / 2, Math.max(0, y0 - y1));
    return `M${x} ${y0}V${y1 + r}Q${x} ${y1} ${x + r} ${y1}H${x + bar - r}Q${x + bar} ${y1} ${x + bar} ${y1 + r}V${y0}Z`;
  }

  const shown = $derived(hover !== null ? groups[hover] : null);
</script>

<div class="bars">
  <div class="readout">
    {#each series as s, i (s.label)}
      <span class="item">
        <span class="swatch" style="background: {color(colors, s.color)}"></span>
        <span class="name">{s.label}</span>
        {#if shown && shown.values[i] !== null}
          <span class="value">{fmt(shown.values[i], digits)}{#if unit}<span class="unit">{unit}</span>{/if}</span>
        {/if}
      </span>
    {/each}
    <span class="at">{shown ? (shown.full ?? shown.label) : idle}</span>
  </div>
  <div class="box" bind:clientWidth={width}>
    {#if width > 0}
      <svg {width} {height} role="img" aria-label={label}>
        {#each ticks as tick (tick)}
          <line class="grid" x1={AXIS} x2={width} y1={Math.round(y(tick)) + 0.5} y2={Math.round(y(tick)) + 0.5} />
          <text class="tick" x={AXIS - 6} y={y(tick)}>{fmt(tick, stepDecimals(step))}</text>
        {/each}
        {#each groups as group, g (g)}
          {@const left = AXIS + g * slot + (slot - n * bar - (n - 1) * GAP) / 2}
          <g class="group" class:dim={hover !== null && hover !== g}>
            {#each group.values as value, i (i)}
              {#if value !== null && value > 0}
                <path d={column(left + i * (bar + GAP), value)} fill={color(colors, series[i]?.color ?? 'neutral')} />
              {/if}
            {/each}
            <text class="label" x={AXIS + g * slot + slot / 2} y={height - 5}>{group.label}</text>
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <rect class="hit" x={AXIS + g * slot} y={0} width={slot} {height} onpointerenter={() => (hover = g)} onpointerleave={() => (hover = null)} />
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
    font-variant-numeric: tabular-nums;
  }

  .unit {
    margin-left: 2px;
    font-weight: 400;
    color: var(--text-muted);
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

  .group {
    transition: opacity 120ms ease;
  }

  .group.dim {
    opacity: 0.45;
  }

  .hit {
    fill: transparent;
  }
</style>

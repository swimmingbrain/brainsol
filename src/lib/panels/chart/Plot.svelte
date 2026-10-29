<script lang="ts" module>
  import type { RangeSpec } from './range';

  import type { ColorRole } from '../theme';
  export type { ColorRole };

  export interface PlotSeries {
    label: string;
    color: ColorRole;
    unit?: string;
    digits?: number;
    // how a value reads in the readout, fmt with digits when left out
    format?: (value: number) => string | null;
    // dots instead of a line, for measured points
    points?: boolean;
  }

  export interface PlotView {
    // x first, then one array per series, null is a gap
    data: (number | null)[][];
    // the x range, the data decides when left out
    min?: number;
    max?: number;
  }

  export interface Mark {
    x: number;
    label?: string;
  }

  export type { RangeSpec };
</script>

<script lang="ts">
  // one uplot chart in the house style: hairline grid, mono labels, thin
  // lines in the chart colours, a readout row above it in place of the
  // legend. it is built once, fed with setData, resized with its box and
  // repainted on a theme switch. hovering pauses a live chart
  import { onMount, untrack } from 'svelte';
  import uPlot from 'uplot';
  import 'uplot/dist/uPlot.min.css';
  import { fmt } from '$lib/i18n';
  import { roleColor, themeColors } from '../theme';
  import { niceRange, stepDecimals } from './range';
  import { lastValue } from './window';

  let {
    series,
    view,
    height = 140,
    y = {},
    x = 'time',
    xFormat,
    yFormat,
    sync,
    live = false,
    active = true,
    paused = false,
    onhover,
    marks = [],
    lines = [],
    label,
    hint = ''
  }: {
    series: PlotSeries[];
    view: PlotView | null;
    // the drawing with its axes, the readout comes on top
    height?: number;
    y?: RangeSpec;
    x?: 'time' | 'number';
    xFormat?: (value: number, step: number) => string;
    yFormat?: (value: number, decimals: number) => string;
    // plots with the same key share the cursor
    sync?: string;
    // the readout shows the newest values while nobody hovers
    live?: boolean;
    // a hidden plot takes no data
    active?: boolean;
    // the data stays as it is, the parent pauses while someone reads a value
    paused?: boolean;
    onhover?: (on: boolean) => void;
    // vertical hairlines with a small label, like a settle time
    marks?: Mark[];
    // horizontal hairlines, like zero on an error chart
    lines?: number[];
    label: string;
    // a word on the right of the readout while nobody hovers
    hint?: string;
  } = $props();

  const colors = $derived(themeColors());
  const FONT = '10px "JetBrains Mono", monospace';

  const clock = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const clockShort = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });

  function xText(value: number, step: number): string {
    if (xFormat) return xFormat(value, step);
    if (x === 'time') return (step >= 60 ? clockShort : clock).format(new Date(value * 1000));
    return fmt(value, stepDecimals(step)) ?? '';
  }

  function yText(value: number, decimals: number): string {
    return yFormat ? yFormat(value, decimals) : (fmt(value, decimals) ?? '');
  }

  function valueText(s: PlotSeries, value: number | null | undefined): string | null {
    if (value === null || value === undefined || !Number.isFinite(value)) return null;
    return s.format ? s.format(value) : fmt(value, s.digits ?? 0);
  }

  let box = $state<HTMLDivElement | null>(null);
  let plot: uPlot | null = null;
  let range: { min?: number; max?: number } = {};
  // what the readout shows: the values at the cursor, or the newest ones
  let shown = $state<(string | null)[]>([]);
  // false while the plot is scrolled out of sight, it takes no data then
  let inView = $state(true);
  let at = $state<string | null>(null);

  function readout(u: uPlot) {
    const idx = u.cursor.idx;
    if (idx !== null && idx !== undefined && u.data[0].length > 0) {
      shown = series.map((s, i) => valueText(s, u.data[i + 1][idx] as number | null));
      const xv = u.data[0][idx];
      at = xv === null || xv === undefined ? null : xText(xv, x === 'time' ? 1 : 0.1);
      return;
    }
    at = null;
    shown = live ? series.map((s, i) => valueText(s, lastValue((u.data[i + 1] ?? []) as (number | null)[]))) : series.map(() => null);
  }

  function options(width: number): uPlot.Options {
    const axisStroke = () => colors.text;
    const grid = { stroke: () => colors.grid, width: 1 };
    return {
      width,
      height,
      pxAlign: true,
      legend: { show: false },
      padding: [8, 8, 0, 0],
      cursor: {
        y: false,
        drag: { x: false, y: false, setScale: false },
        points: {
          size: 8,
          width: 2,
          stroke: () => colors.surface,
          fill: (u: uPlot, i: number) => roleColor(colors, series[i - 1]?.color ?? 'neutral')
        },
        sync: sync ? { key: sync } : undefined
      },
      scales: {
        x: {
          time: x === 'time',
          range: (_u, lo, hi) => [range.min ?? lo, range.max ?? hi]
        },
        y: {
          range: (_u, lo, hi) => niceRange(lo, hi, y)
        }
      },
      axes: [
        {
          stroke: axisStroke,
          font: FONT,
          size: 22,
          space: 56,
          gap: 4,
          grid,
          ticks: { show: false },
          // a label that would stick out past the right edge stays away
          values: (u, splits, _a, _s, step) =>
            splits.map((v) => {
              const text = xText(v, step);
              const centre = u.bbox.left / uPlot.pxRatio + u.valToPos(v, 'x');
              return centre + text.length * 3.1 > u.width ? '' : text;
            })
        },
        {
          stroke: axisStroke,
          font: FONT,
          size: 42,
          space: 22,
          gap: 6,
          grid,
          ticks: { show: false },
          values: (_u, splits, _a, _s, step) => splits.map((v) => yText(v, stepDecimals(step)))
        }
      ],
      series: [
        {},
        ...series.map((s) => ({
          label: s.label,
          stroke: () => roleColor(colors, s.color),
          width: 2,
          spanGaps: false,
          paths: s.points ? () => null : undefined,
          points: s.points
            ? { show: true, size: 7, width: 1.5, stroke: () => colors.surface, fill: () => roleColor(colors, s.color) }
            : { show: false }
        }))
      ],
      hooks: {
        setCursor: [(u) => readout(u)],
        drawAxes: [(u) => decorate(u)]
      }
    };
  }

  // the zero line and the marks, drawn on the grid and under the series
  function decorate(u: uPlot) {
    if (!lines.length && !marks.length) return;
    const ctx = u.ctx;
    const ratio = uPlot.pxRatio;
    const { left, top, width, height: h } = u.bbox;
    ctx.save();
    ctx.lineWidth = Math.max(1, Math.round(ratio));
    ctx.strokeStyle = colors.neutral;
    for (const value of lines) {
      const py = Math.round(u.valToPos(value, 'y', true)) + 0.5;
      if (py < top || py > top + h) continue;
      ctx.beginPath();
      ctx.moveTo(left, py);
      ctx.lineTo(left + width, py);
      ctx.stroke();
    }
    ctx.font = `${10 * ratio}px "JetBrains Mono", monospace`;
    ctx.fillStyle = colors.text;
    ctx.textBaseline = 'top';
    for (const mark of marks) {
      const px = Math.round(u.valToPos(mark.x, 'x', true)) + 0.5;
      if (px < left || px > left + width) continue;
      ctx.beginPath();
      ctx.moveTo(px, top);
      ctx.lineTo(px, top + h);
      ctx.stroke();
      if (mark.label) {
        const text = mark.label;
        const w = ctx.measureText(text).width;
        const tx = px + 4 * ratio + w > left + width ? px - 4 * ratio - w : px + 4 * ratio;
        ctx.fillText(text, tx, top + 2 * ratio);
      }
    }
    ctx.restore();
  }

  function feed(u: uPlot, v: PlotView | null) {
    range = { min: v?.min, max: v?.max };
    const data = v?.data ?? [[], ...series.map(() => [])];
    u.setData(data as uPlot.AlignedData);
    readout(u);
  }

  onMount(() => {
    if (!box) return;
    const target = box;
    let width = Math.floor(target.clientWidth);
    const create = () => {
      plot = new uPlot(options(width), [[], ...series.map(() => [])] as uPlot.AlignedData, target);
      plot.over.addEventListener('pointerenter', () => onhover?.(true));
      plot.over.addEventListener('pointerleave', () => onhover?.(false));
      untrack(() => feed(plot!, view));
    };
    if (width > 0) create();
    const observer = new ResizeObserver(() => {
      const next = Math.floor(target.clientWidth);
      if (next <= 0 || next === width) return;
      width = next;
      if (!plot) create();
      else plot.setSize({ width, height });
    });
    observer.observe(target);
    const sight = new IntersectionObserver(([entry]) => (inView = entry.isIntersecting));
    sight.observe(target);
    // the canvas draws text with the font it has, once the mono face is in it draws again
    document.fonts?.load(FONT).then(() => plot?.redraw(false, true));
    return () => {
      observer.disconnect();
      sight.disconnect();
      plot?.destroy();
      plot = null;
    };
  });

  // new data while the plot is in sight and nobody reads a value
  $effect(() => {
    if (!active || paused || !inView) return;
    const v = view;
    if (plot) untrack(() => feed(plot!, v));
  });

  // a theme switch repaints with the new colours, the strokes are read on every draw
  $effect(() => {
    void colors;
    untrack(() => plot?.redraw(false, false));
  });

  $effect(() => {
    void marks;
    void lines;
    untrack(() => plot?.redraw(false, false));
  });

  $effect(() => {
    const h = height;
    untrack(() => {
      if (plot && box) plot.setSize({ width: Math.floor(box.clientWidth), height: h });
    });
  });
</script>

<div class="plot">
  <div class="readout">
    {#each series as s, i (s.label)}
      <span class="item">
        <span class="swatch" class:dot={s.points} style="background: {roleColor(colors, s.color)}"></span>
        <span class="name">{s.label}</span>
        {#if shown[i] !== null && shown[i] !== undefined}
          <span class="value">{shown[i]}{#if s.unit}<span class="unit">{s.unit}</span>{/if}</span>
        {/if}
      </span>
    {/each}
    <span class="at">{at ?? hint}</span>
  </div>
  <div class="canvas" bind:this={box} style="height: {height}px" role="img" aria-label={label}></div>
</div>

<style>
  .plot {
    min-width: 0;
  }

  .readout {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 2px 12px;
    min-height: 20px;
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
    width: 10px;
    height: 2px;
    border-radius: 1px;
    flex-shrink: 0;
  }

  .swatch.dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }

  .value {
    font-family: var(--font-editor);
    font-weight: 500;
    color: var(--text-strong);
    font-variant-numeric: tabular-nums;
  }

  .unit {
    margin-left: 2px;
    color: var(--text-muted);
    font-weight: 400;
  }

  .at {
    margin-left: auto;
    font-family: var(--font-editor);
    font-size: 10px;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
  }

  .canvas {
    position: relative;
    min-width: 0;
    margin-left: -4px;
  }

  /* uplot draws on a canvas, the cursor line is a div it brings along */
  .canvas :global(.u-cursor-x) {
    border-right: 1px solid var(--text-muted);
  }

  .canvas :global(.uplot) {
    font-family: var(--font-editor);
  }
</style>

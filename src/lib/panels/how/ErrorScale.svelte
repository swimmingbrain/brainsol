<script lang="ts">
  // step two: the light on L and R as two columns, their difference over
  // their sum as the error, and where that error sits between -1 and +1
  import { telemetry } from '$lib/stores/telemetry.svelte';
  import { signed } from '../format';
  import { heatColor, spread } from '../balance';
  import { themeColors } from '../theme';

  const colors = $derived(themeColors());

  const FOOT = 82;
  const TALL = 62;
  const l = $derived(telemetry.ldr?.[0] ?? 0);
  const r = $derived(telemetry.ldr?.[1] ?? 0);
  const ex = $derived(telemetry.ex ?? 0);

  // the scale opens up the middle like the bubble level does
  const x = $derived(110 + Math.sign(ex) * spread(ex) * 80);
  const value = $derived(signed(ex, 3) ?? '');
</script>

<svg viewBox="0 0 220 130" aria-hidden="true">
  {#each [{ name: 'L', v: l, x: 34 }, { name: 'R', v: r, x: 66 }] as column (column.name)}
    <rect class="slot" x={column.x} y={FOOT - TALL} width="22" height={TALL} rx="1.5" />
    <rect class="level" x={column.x} y={FOOT - TALL * column.v} width="22" height={TALL * column.v} rx="1.5" style="fill: {heatColor(column.v, colors.heat)}" />
    <text class="name" x={column.x + 11} y={FOOT + 12}>{column.name}</text>
  {/each}
  <path class="arrow" d="M98 52H110M105 47l5 5-5 5" />
  <text class="formula" x="116" y="56">ex =</text>
  <text class="formula" x="148" y="44">R − L</text>
  <line class="bar" x1="146" y1="52" x2="190" y2="52" />
  <text class="formula" x="148" y="66">R + L</text>
  <text class="value" x="146" y="86">= {value}</text>

  <line class="axis" x1="30" y1="112" x2="190" y2="112" />
  <path class="ticks" d="M30 108V116M110 106V118M190 108V116" />
  <text class="tick" x="30" y="127">−1</text>
  <text class="tick" x="110" y="127">0</text>
  <text class="tick" x="190" y="127">+1</text>
  <circle class="dot" cx={x} cy="112" r="5" />
</svg>

<style>
  svg {
    display: block;
    width: 100%;
    height: auto;
  }

  .slot {
    fill: none;
    stroke: var(--border);
    stroke-width: 1;
    vector-effect: non-scaling-stroke;
  }

  .level {
    transition: y 150ms linear, height 150ms linear, fill 150ms linear;
  }

  .name,
  .tick {
    font-family: var(--font-editor);
    font-size: 10px;
    fill: var(--text-muted);
    text-anchor: middle;
  }

  .arrow,
  .ticks,
  .axis,
  .bar {
    fill: none;
    stroke: var(--text-secondary);
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
  }

  .axis {
    stroke: var(--text-muted);
  }

  .formula {
    font-family: var(--font-editor);
    font-size: 10.5px;
    fill: var(--text-primary);
  }

  .value {
    font-family: var(--font-editor);
    font-size: 11px;
    font-weight: 500;
    fill: var(--text-strong);
    dominant-baseline: middle;
  }

  .dot {
    fill: var(--accent);
    stroke: var(--bg-surface);
    stroke-width: 2;
    transition: cx 150ms linear;
  }
</style>

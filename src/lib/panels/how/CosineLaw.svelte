<script lang="ts">
  // step four: why facing the light pays. on the left a bundle of light falls
  // on a panel at a slant and spreads over more area, on the right the share
  // that is left as the cosine of the angle, with the panel's angle right now
  import { telemetry } from '$lib/stores/telemetry.svelte';

  // the slanted panel of the sketch, an example and not live
  const SLANT = 50;
  const s = (SLANT * Math.PI) / 180;
  const C = { x: 52, y: 92 };
  const HALF = 34;
  const ends = { x1: C.x - Math.cos(s) * HALF, y1: C.y + Math.sin(s) * HALF, x2: C.x + Math.cos(s) * HALF, y2: C.y - Math.sin(s) * HALF };
  // vertical rays that land on the panel, from its left end to its right end
  const rays = [0.12, 0.37, 0.63, 0.88].map((f) => {
    const x = ends.x1 + (ends.x2 - ends.x1) * f;
    const y = ends.y1 + (ends.y2 - ends.y1) * f;
    return { x, y };
  });

  // the cosine plot, 0 to 90 degrees across, 0 to 100 percent up
  const P = { x: 126, y: 18, w: 80, h: 80 };
  const px = (deg: number) => P.x + (deg / 90) * P.w;
  const py = (share: number) => P.y + (1 - share) * P.h;
  const curve = Array.from({ length: 31 }, (_, i) => i * 3)
    .map((d) => `${d ? 'L' : 'M'}${px(d).toFixed(1)} ${py(Math.cos((d * Math.PI) / 180)).toFixed(1)}`)
    .join('');

  // whole degrees like the tile, sensor noise then leaves the dot alone
  const off = $derived(telemetry.off === null ? null : Math.min(90, Math.round(Math.abs(telemetry.off))));
  const dot = $derived(off === null ? null : { x: px(off), y: py(Math.cos((off * Math.PI) / 180)) });
</script>

<svg viewBox="0 0 220 130" aria-hidden="true">
  {#each rays as ray, i (i)}
    <path class="ray" d="M{ray.x} 10V{ray.y}" />
  {/each}
  <line class="panel" x1={ends.x1} y1={ends.y1} x2={ends.x2} y2={ends.y2} />
  <path class="angle" d="M{C.x + 16} {C.y}A16 16 0 0 0 {C.x + Math.cos(s) * 16} {C.y - Math.sin(s) * 16}" />
  <path class="guide" d="M{C.x} {C.y}H{C.x + 30}" />
  <text x={C.x + 22} y={C.y - 4}>θ</text>

  <path class="axis" d="M{P.x} {P.y}V{P.y + P.h}H{P.x + P.w}" />
  <path class="grid" d="M{P.x} {py(0.5)}H{P.x + P.w}M{px(60)} {P.y}V{P.y + P.h}" />
  <path class="curve" d={curve} />
  {#if dot}<circle class="dot" cx={dot.x} cy={dot.y} r="4.5" />{/if}
  <text class="tick end" x={P.x - 4} y={P.y + 4}>100 %</text>
  <text class="tick end" x={P.x - 4} y={py(0.5) + 3}>50</text>
  <text class="tick" x={P.x} y={P.y + P.h + 12}>0°</text>
  <text class="tick" x={px(60)} y={P.y + P.h + 12}>60°</text>
  <text class="tick" x={P.x + P.w} y={P.y + P.h + 12}>90°</text>
  <text class="tick" x={px(30)} y={P.y + P.h + 12}>θ</text>
</svg>

<style>
  svg {
    display: block;
    width: 100%;
    height: auto;
  }

  .ray {
    stroke: var(--accent);
    stroke-width: 1.5;
    stroke-linecap: round;
    vector-effect: non-scaling-stroke;
  }

  .panel {
    stroke: var(--text-primary);
    stroke-width: 5;
    stroke-linecap: round;
  }

  .angle,
  .guide,
  .axis {
    fill: none;
    stroke: var(--text-muted);
    stroke-width: 1.5;
    stroke-linecap: round;
    vector-effect: non-scaling-stroke;
  }

  .grid {
    fill: none;
    stroke: var(--chart-grid);
    stroke-width: 1;
    vector-effect: non-scaling-stroke;
  }

  .curve {
    fill: none;
    stroke: var(--chart-1);
    stroke-width: 2;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
  }

  .dot {
    fill: var(--accent);
    stroke: var(--bg-surface);
    stroke-width: 2;
  }

  text {
    font-size: 10px;
    fill: var(--text-muted);
    text-anchor: middle;
  }

  .end {
    text-anchor: end;
  }
</style>

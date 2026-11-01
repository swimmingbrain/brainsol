<script lang="ts">
  // step one, seen from the side: two of the four sensors left and right of a
  // shade wall. the light comes in at the angle the sensors measure right now,
  // the wall shades the sensor on the far side
  import { telemetry } from '$lib/stores/telemetry.svelte';
  import { connection } from '$lib/stores/connection.svelte';
  import { errorTangents } from '$lib/sim/controller';
  import { heatColor } from '../balance';
  import { themeColors } from '../theme';

  const colors = $derived(themeColors());
  const k = $derived(connection.config?.baffle ?? 1.2);

  const BASE = 104;
  const WALL = 110;
  const SENSOR = 28;
  // the wall is k times the sensor width tall, like on the head
  const height = $derived(SENSOR * k);
  const top = $derived(BASE - height);

  // the light angle from the vertical, positive from the right, out of ex
  const angle = $derived.by(() => {
    if (telemetry.ex === null || telemetry.st === 'lowlight') return 0;
    const { tx } = errorTangents(telemetry.ex, 0, k);
    // half degrees are plenty for a sketch, sensor noise then leaves it alone
    return Math.round(Math.max(-60, Math.min(60, (Math.atan(tx) * 180) / Math.PI)) * 2) / 2;
  });
  const rad = $derived((angle * Math.PI) / 180);
  // a unit step along the light, from the sun down to the panel
  const d = $derived({ x: -Math.sin(rad), y: Math.cos(rad) });

  // a ray that ends at a spot on the panel, or at the wall when the wall is in the way
  function ray(target: number): { x1: number; y1: number; x2: number; y2: number; blocked: boolean } {
    const length = 92;
    const x1 = target - d.x * length;
    const y1 = BASE - d.y * length;
    // where the ray crosses the line of the wall
    if ((x1 - WALL) * (target - WALL) < 0 && d.x !== 0) {
      const s = (WALL - x1) / d.x;
      const y = y1 + d.y * s;
      if (y >= top && y <= BASE) return { x1, y1, x2: WALL, y2: y, blocked: true };
    }
    return { x1, y1, x2: target, y2: BASE, blocked: false };
  }

  const rays = $derived([62, 90, 130, 158].map(ray));
  const shadow = $derived.by(() => {
    const reach = height * Math.tan(Math.abs(rad));
    const far = angle > 0 ? WALL - reach : WALL + reach;
    return `M${WALL} ${top}L${WALL} ${BASE}L${Math.max(28, Math.min(192, far))} ${BASE}Z`;
  });
  const sun = $derived({ x: WALL - d.x * 96, y: BASE - d.y * 96 });

  const left = $derived(heatColor(Math.round((telemetry.ldr?.[0] ?? 0) * 100) / 100, colors.heat));
  const right = $derived(heatColor(Math.round((telemetry.ldr?.[1] ?? 0) * 100) / 100, colors.heat));
</script>

<svg viewBox="0 0 220 130" aria-hidden="true">
  <path class="shadow" d={shadow} />
  {#each rays as r, i (i)}
    <line class="ray" class:blocked={r.blocked} x1={r.x1} y1={r.y1} x2={r.x2} y2={r.y2} />
  {/each}
  <circle class="sun" cx={sun.x} cy={sun.y} r="6" />
  <rect class="sensor" x={WALL - 3 - SENSOR} y={BASE - 7} width={SENSOR} height="7" rx="1.5" style="fill: {left}" />
  <rect class="sensor" x={WALL + 3} y={BASE - 7} width={SENSOR} height="7" rx="1.5" style="fill: {right}" />
  <line class="wall" x1={WALL} y1={top} x2={WALL} y2={BASE} />
  <path class="panel" d="M28 {BASE}H192V{BASE + 6}H28Z" />
  <text x={WALL - 3 - SENSOR / 2} y="124">L</text>
  <text x={WALL + 3 + SENSOR / 2} y="124">R</text>
</svg>

<style>
  svg {
    display: block;
    width: 100%;
    height: auto;
  }

  .shadow {
    fill: var(--chart-track);
    transition: d 150ms linear;
  }

  .ray {
    stroke: var(--accent);
    stroke-width: 1.5;
    stroke-linecap: round;
    vector-effect: non-scaling-stroke;
  }

  .ray.blocked {
    opacity: 0.5;
  }

  .sun {
    fill: var(--accent);
  }

  .sensor {
    stroke: var(--text-secondary);
    stroke-width: 1;
    vector-effect: non-scaling-stroke;
  }

  .wall {
    stroke: var(--text-primary);
    stroke-width: 3;
    stroke-linecap: round;
  }

  .panel {
    fill: var(--bg-elevated);
    stroke: var(--text-secondary);
    stroke-width: 1.5;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
  }

  text {
    font-family: var(--font-editor);
    font-size: 10px;
    fill: var(--text-muted);
    text-anchor: middle;
  }
</style>

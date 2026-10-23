<script lang="ts">
  // the light balance. the four sensors sit around the panel like eyes, each
  // area shows how much light its sensor gets on the heat ramp. in the middle
  // a bubble level: the dot sits where the two errors point, the ring is the
  // dead band where the tracker rests
  import { onMount } from 'svelte';
  import Panel from '$lib/ui/Panel.svelte';
  import { telemetry } from '$lib/stores/telemetry.svelte';
  import { connection } from '$lib/stores/connection.svelte';
  import { fmt, t } from '$lib/i18n';
  import { bubble, follow, heatColor, inkOn, spread } from './balance';
  import { INK, themeColors } from './theme';
  import { percent } from './format';

  const C = 110;
  const OUTER = 106;
  const INNER = 73;
  const BUBBLE = 65;
  // how far the dot may travel, it stays inside the bubble with its ring
  const TRAVEL = BUBBLE - 9;
  const DOT = 5.5;
  // how quickly the dot follows the errors, seconds
  const TAU = 0.18;

  const colors = $derived(themeColors());

  // L R U D around the centre, the angle points into the middle of each area
  const areas = [
    { name: 'L', index: 0, angle: 180 },
    { name: 'R', index: 1, angle: 0 },
    { name: 'U', index: 2, angle: 270 },
    { name: 'D', index: 3, angle: 90 }
  ];

  const rad = (deg: number) => (deg * Math.PI) / 180;
  const at = (r: number, deg: number) => `${(C + r * Math.cos(rad(deg))).toFixed(2)} ${(C + r * Math.sin(rad(deg))).toFixed(2)}`;

  // a quarter of the ring
  function wedge(angle: number): string {
    const a0 = angle - 45;
    const a1 = angle + 45;
    return `M${at(OUTER, a0)}A${OUTER} ${OUTER} 0 0 1 ${at(OUTER, a1)}L${at(INNER, a1)}A${INNER} ${INNER} 0 0 0 ${at(INNER, a0)}Z`;
  }

  function label(angle: number): { x: number; y: number } {
    const r = (OUTER + INNER) / 2;
    return { x: C + r * Math.cos(rad(angle)), y: C + r * Math.sin(rad(angle)) };
  }

  const levels = $derived(telemetry.ldr);
  const fills = $derived(areas.map((area) => heatColor(levels ? levels[area.index] : 0, colors.heat)));

  // the dead band of the tracker, from its settings or the defaults of section 6
  const deadIn = $derived(connection.config?.params.dead_in.v ?? 0.025);
  const deadOut = $derived(connection.config?.params.dead_out.v ?? 0.05);
  const bandInner = $derived(spread(deadIn) * TRAVEL);
  const bandOuter = $derived(spread(deadOut) * TRAVEL);
  const band = $derived(
    `M${C - bandOuter} ${C}a${bandOuter} ${bandOuter} 0 1 0 ${2 * bandOuter} 0a${bandOuter} ${bandOuter} 0 1 0 ${-2 * bandOuter} 0Z` +
      `M${C - bandInner} ${C}a${bandInner} ${bandInner} 0 1 0 ${2 * bandInner} 0a${bandInner} ${bandInner} 0 1 0 ${-2 * bandInner} 0Z`
  );

  const signed = (value: number | null) => {
    const text = fmt(value, 3);
    if (text === null || value === null) return null;
    return value > 0 && !/^0[.,]0+$/.test(text) ? `+${text}` : text;
  };

  let root = $state<HTMLElement | null>(null);
  let dot = $state<SVGCircleElement | null>(null);

  // the dot is drawn on every animation frame from the newest frame, outside
  // svelte, and eased so a 20 Hz stream with noise still glides
  onMount(() => {
    let raf = 0;
    let last = 0;
    let x = 0;
    let y = 0;
    let seen = false;
    let visible = true;
    const still = matchMedia('(prefers-reduced-motion: reduce)');

    const draw = (now: number) => {
      raf = 0;
      const frame = telemetry.frame;
      if (frame && dot) {
        const target = bubble(frame.ex, frame.ey);
        const dt = last ? (now - last) / 1000 : 1;
        const tau = still.matches ? 0 : TAU;
        x = seen ? follow(x, target.x, dt, tau) : target.x;
        y = seen ? follow(y, target.y, dt, tau) : target.y;
        seen = true;
        dot.setAttribute('cx', (C + x * TRAVEL).toFixed(2));
        dot.setAttribute('cy', (C - y * TRAVEL).toFixed(2));
      }
      last = now;
      schedule();
    };
    const schedule = () => {
      if (!raf && visible && document.visibilityState === 'visible') raf = requestAnimationFrame(draw);
    };
    const stop = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      last = 0;
    };

    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) schedule();
      else stop();
    });
    if (root) observer.observe(root);
    const onvisibility = () => (document.visibilityState === 'visible' ? schedule() : stop());
    document.addEventListener('visibilitychange', onvisibility);
    schedule();
    return () => {
      stop();
      observer.disconnect();
      document.removeEventListener('visibilitychange', onvisibility);
    };
  });
</script>

<Panel title={t('section.balance')}>
  <div class="balance" bind:this={root}>
    <div class="widget">
      <svg viewBox="0 0 220 220" role="img" aria-label={t('panels.balance.aria')}>
        {#each areas as area, i (area.name)}
          {@const spot = label(area.angle)}
          {@const ink = INK[inkOn(fills[i])]}
          <path class="area" d={wedge(area.angle)} style="fill: {fills[i]}" />
          <text class="name" x={spot.x} y={spot.y - 7} fill={ink}>{area.name}</text>
          <text class="level" x={spot.x} y={spot.y + 8} fill={ink}>
            {#if levels}{percent(levels[area.index])} %{:else}&nbsp;{/if}
          </text>
        {/each}
        <!-- the surface gaps between the four areas -->
        <path class="gap" d="M{C - OUTER} {C - OUTER}L{C + OUTER} {C + OUTER}M{C + OUTER} {C - OUTER}L{C - OUTER} {C + OUTER}" />
        <circle class="bubble" cx={C} cy={C} r={BUBBLE} />
        <path class="cross" d="M{C - BUBBLE} {C}H{C + BUBBLE}M{C} {C - BUBBLE}V{C + BUBBLE}" />
        <path class="band" d={band} />
        <circle class="band-edge" cx={C} cy={C} r={bandOuter} />
        <circle class="dot" class:idle={!levels} bind:this={dot} cx={C} cy={C} r={DOT} />
      </svg>
    </div>
    <dl class="errors">
      <div>
        <dt>{t('panels.balance.ex')}</dt>
        <dd>{#if telemetry.ex !== null}{signed(telemetry.ex)}{:else}<span class="placeholder"></span>{/if}</dd>
      </div>
      <div>
        <dt>{t('panels.balance.ey')}</dt>
        <dd>{#if telemetry.ey !== null}{signed(telemetry.ey)}{:else}<span class="placeholder"></span>{/if}</dd>
      </div>
      <div>
        <dt>{t('panels.balance.band')}</dt>
        <dd class="quiet">{t('panels.balance.range', { a: fmt(deadIn, 3) ?? '', b: fmt(deadOut, 3) ?? '' })}</dd>
      </div>
    </dl>
  </div>
  <p class="caption">{t('panels.balance.caption')}</p>
</Panel>

<style>
  .balance {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .widget {
    flex: 0 1 200px;
    min-width: 150px;
  }

  svg {
    display: block;
    width: 100%;
    height: auto;
    overflow: visible;
  }

  .area {
    transition: fill 150ms linear;
  }

  .name {
    font-family: var(--font-ui);
    font-size: 9px;
    font-weight: 600;
    text-anchor: middle;
    dominant-baseline: middle;
    opacity: 0.75;
  }

  .level {
    font-family: var(--font-editor);
    font-size: 11px;
    font-weight: 500;
    text-anchor: middle;
    dominant-baseline: middle;
    font-variant-numeric: tabular-nums;
  }

  .gap {
    stroke: var(--bg-surface);
    stroke-width: 5;
  }

  .bubble {
    fill: var(--bg-deep);
    stroke: var(--chart-grid);
    stroke-width: 1;
  }

  .cross {
    stroke: var(--chart-grid);
    stroke-width: 1;
  }

  .band {
    fill: var(--chart-track);
    fill-rule: evenodd;
  }

  .band-edge {
    fill: none;
    stroke: var(--chart-neutral);
    stroke-width: 1;
  }

  .dot {
    fill: var(--accent);
    stroke: var(--bg-deep);
    stroke-width: 2;
  }

  .dot.idle {
    fill: var(--chart-neutral);
  }

  .errors {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
  }

  .errors div {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  dt {
    font-size: 11px;
    color: var(--text-muted);
    white-space: nowrap;
  }

  dd {
    height: 18px;
    font-family: var(--font-editor);
    font-size: 13px;
    font-weight: 500;
    color: var(--text-strong);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  dd.quiet {
    font-size: 11px;
    color: var(--text-secondary);
  }

  .placeholder {
    display: inline-block;
    width: 2.4em;
    height: 2px;
    margin-bottom: 4px;
    background: var(--border);
    vertical-align: middle;
  }

  .caption {
    margin-top: 10px;
    font-size: 11px;
    line-height: 1.5;
    color: var(--text-secondary);
  }
</style>

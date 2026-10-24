<script lang="ts">
  // the pose as two flat drawings, side and top, for a browser without webgl 2.
  // it reads telemetry.frame on every animation frame and never wakes svelte up
  import { onMount } from 'svelte';
  import { telemetry } from '$lib/stores/telemetry.svelte';
  import { DEG } from '$lib/sim/kinematics';
  import { Glide } from './glide';

  let sidePanel = $state<SVGGElement | null>(null);
  let topPanel = $state<SVGGElement | null>(null);
  let sideLight = $state<SVGCircleElement | null>(null);
  let topLight = $state<SVGCircleElement | null>(null);

  onMount(() => {
    const pan = new Glide();
    const tilt = new Glide();
    let seen: unknown = null;
    let raf = 0;
    const draw = () => {
      raf = 0;
      const now = performance.now();
      const frame = telemetry.frame;
      if (frame && frame !== seen) {
        seen = frame;
        if (Number.isFinite(frame.pan)) pan.push(frame.pan, telemetry.at);
        if (Number.isFinite(frame.tilt)) tilt.push(frame.tilt, telemetry.at);
      }
      if (pan.has && tilt.has) {
        // seen from the side the panel turns with tilt, seen from above with pan
        sidePanel?.setAttribute('transform', `rotate(${-tilt.sample(now)})`);
        topPanel?.setAttribute('transform', `rotate(${pan.sample(now)})`);
      }
      const light = frame?.sim ?? frame?.sun ?? null;
      if (light && Number.isFinite(light.az) && Number.isFinite(light.el)) {
        const r = 70;
        const back = Math.abs(light.az) > 90;
        sideLight?.setAttribute('cx', String((back ? -1 : 1) * Math.cos(light.el * DEG) * r));
        sideLight?.setAttribute('cy', String(-Math.sin(light.el * DEG) * r));
        topLight?.setAttribute('cx', String(Math.sin(light.az * DEG) * r));
        topLight?.setAttribute('cy', String(-Math.cos(light.az * DEG) * r));
      }
      if (pan.moving(now) || tilt.moving(now)) raf = requestAnimationFrame(draw);
    };
    const wake = () => {
      if (!raf) raf = requestAnimationFrame(draw);
    };
    const stop = telemetry.onFrame(wake);
    wake();
    return () => {
      stop();
      cancelAnimationFrame(raf);
    };
  });
</script>

<div class="views" aria-hidden="true">
  <svg viewBox="-100 -100 200 200" class="view">
    <line class="ground" x1="-90" y1="0" x2="90" y2="0" />
    <circle class="light" bind:this={sideLight} cx="54" cy="-45" r="6" />
    <g bind:this={sidePanel} transform="rotate(-90)">
      <line class="normal" x1="0" y1="0" x2="46" y2="0" />
      <line class="panel" x1="0" y1="-30" x2="0" y2="30" />
    </g>
    <circle class="pivot" cx="0" cy="0" r="3" />
  </svg>
  <svg viewBox="-100 -100 200 200" class="view">
    <circle class="ring" cx="0" cy="0" r="70" />
    <circle class="light" bind:this={topLight} cx="30" cy="-63" r="6" />
    <g bind:this={topPanel}>
      <line class="normal" x1="0" y1="0" x2="0" y2="-46" />
      <line class="panel" x1="-30" y1="0" x2="30" y2="0" />
    </g>
    <circle class="pivot" cx="0" cy="0" r="3" />
  </svg>
</div>

<style>
  .views {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4%;
    padding: 96px 24px 48px;
  }

  .view {
    height: 100%;
    max-height: 340px;
    max-width: 45%;
    aspect-ratio: 1;
  }

  .ground,
  .ring {
    stroke: var(--border);
    stroke-width: 1;
    fill: none;
  }

  .panel {
    stroke: var(--text-secondary);
    stroke-width: 6;
    stroke-linecap: round;
  }

  .normal {
    stroke: var(--text-muted);
    stroke-width: 1;
  }

  .pivot {
    fill: var(--bg-deep);
    stroke: var(--text-muted);
    stroke-width: 1.5;
  }

  .light {
    fill: var(--accent);
  }

  @media (max-width: 600px) {
    .views {
      padding: 120px 12px 36px;
    }
  }
</style>

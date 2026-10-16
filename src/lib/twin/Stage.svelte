<script lang="ts">
  // a stand in for the 3d twin until the twin stream replaces this file. it
  // shows the way in: the drawing reads telemetry.frame on every animation
  // frame and never wakes svelte up, only the numbers on top are runes
  import { onMount } from 'svelte';
  import Stat from '$lib/ui/Stat.svelte';
  import { telemetry } from '$lib/stores/telemetry.svelte';
  import { stateSentence, t } from '$lib/i18n';
  import type { StateFrame } from '$lib/link/protocol';

  let { present = false }: { present?: boolean } = $props();

  let sidePanel = $state<SVGGElement | null>(null);
  let topPanel = $state<SVGGElement | null>(null);
  let sideLight = $state<SVGCircleElement | null>(null);
  let topLight = $state<SVGCircleElement | null>(null);

  const DEG = Math.PI / 180;

  // between two frames the pose is eased from the older to the newer one,
  // so 20 frames a second still move at the speed of the screen
  function eased(now: number): { pan: number; tilt: number; frame: StateFrame } | null {
    const frame = telemetry.frame;
    if (!frame) return null;
    const prev = telemetry.prev;
    if (!prev) return { pan: frame.pan, tilt: frame.tilt, frame };
    const span = Math.max(1, telemetry.at - telemetry.prevAt);
    const k = Math.min(1, (now - telemetry.at) / span);
    return { pan: prev.pan + (frame.pan - prev.pan) * k, tilt: prev.tilt + (frame.tilt - prev.tilt) * k, frame };
  }

  onMount(() => {
    let raf = 0;
    const draw = (now: number) => {
      const pose = eased(now);
      if (pose) {
        // seen from the side the panel turns with tilt, seen from above with pan
        sidePanel?.setAttribute('transform', `rotate(${-pose.tilt})`);
        topPanel?.setAttribute('transform', `rotate(${pose.pan})`);
        const light = pose.frame.sim ?? (pose.frame.sun ? { az: pose.frame.sun.az, el: pose.frame.sun.el } : null);
        if (light) {
          const r = 70;
          const back = Math.abs(light.az) > 90;
          sideLight?.setAttribute('cx', String((back ? -1 : 1) * Math.cos(light.el * DEG) * r));
          sideLight?.setAttribute('cy', String(-Math.sin(light.el * DEG) * r));
          topLight?.setAttribute('cx', String(Math.sin(light.az * DEG) * r));
          topLight?.setAttribute('cy', String(-Math.cos(light.az * DEG) * r));
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  });

  const size = $derived(present ? 'xl' : 'lg');
</script>

<div class="stage" class:present>
  <div class="views" aria-hidden="true">
    <svg viewBox="-100 -100 200 200" class="view">
      <line class="ground" x1="-90" y1="0" x2="90" y2="0" />
      <circle class="light" bind:this={sideLight} cx="54" cy="-45" r="6" />
      <g bind:this={sidePanel}>
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

  <div class="overlay">
    <p class="say">{stateSentence(telemetry.st)}</p>
    <div class="numbers">
      <Stat {size} label={t('q.pan')} value={telemetry.pan} digits={1} unit="°" />
      <Stat {size} label={t('q.tilt')} value={telemetry.tilt} digits={1} unit="°" />
      <Stat {size} label={t('q.light')} value={telemetry.lux} unit="lx" />
      <Stat {size} label={t('q.off')} value={telemetry.off} digits={1} unit="°" />
    </div>
  </div>

</div>

<style>
  .stage {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    background: var(--bg-deep);
  }

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

  .overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px 20px;
    pointer-events: none;
  }

  .say {
    font-size: 15px;
    font-weight: 500;
    color: var(--text-primary);
  }

  .numbers {
    display: flex;
    flex-wrap: wrap;
    gap: 12px 28px;
  }

  .present .overlay {
    padding: 32px 40px;
    gap: 24px;
  }

  .present .say {
    font-size: 26px;
  }

  .present .numbers {
    gap: 20px 56px;
  }

  @media (max-width: 600px) {
    .overlay {
      padding: 12px 16px;
    }

    .say {
      font-size: 13px;
    }

    .numbers {
      gap: 8px 20px;
    }

    .views {
      padding: 120px 12px 36px;
    }
  }
</style>

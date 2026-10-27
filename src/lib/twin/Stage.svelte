<script lang="ts">
  // the stage: the live 3D twin with a few words and numbers on top. three.js
  // loads with this component, a browser without webgl 2 gets the flat drawing
  import { onMount } from 'svelte';
  import Stat from '$lib/ui/Stat.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { telemetry } from '$lib/stores/telemetry.svelte';
  import { preferences } from '$lib/stores/preferences.svelte';
  import { connection } from '$lib/stores/connection.svelte';
  import { fmt, stateSentence, t } from '$lib/i18n';
  import Flat from './Flat.svelte';
  import type { Twin } from './twin';

  let { present = false }: { present?: boolean } = $props();

  let canvas = $state<HTMLCanvasElement | null>(null);
  let lampGlyph = $state<HTMLElement | null>(null);
  let sunGlyph = $state<HTMLElement | null>(null);
  let twin = $state.raw<Twin | null>(null);
  // 3d until we know better, so a capable browser never flashes the drawing
  let flat = $state(false);
  // the lamp under the hand while it is dragged
  let dragLight = $state.raw<{ az: number; el: number } | null>(null);

  // anyone may move the lamp of the simulation in this browser, on a tracker
  // only an admin, and only when it runs its simulated light
  const draggable = $derived(Boolean(telemetry.sim) && (connection.source === 'sim' || connection.admin) && (connection.caps?.simlight ?? connection.source === 'sim'));
  const lamp = $derived(dragLight ?? telemetry.sim);

  onMount(() => {
    let gone = false;
    let made: Twin | null = null;
    void (async () => {
      try {
        const module = await import('./twin');
        if (gone || !canvas) return;
        if (!module.webglSupported()) {
          flat = true;
          return;
        }
        made = new module.Twin(canvas, {
          onLamp: (az, el) => {
            const sent = made;
            void connection.send({ op: 'simlight', az, el }).then((ack) => {
              if (!ack.ok) sent?.lampRefused();
            });
          },
          onLampDrag: (sky) => {
            dragLight = sky;
          }
        });
        made.bindGlyphs(lampGlyph, sunGlyph);
        twin = made;
      } catch (error) {
        console.error('brainsol: the 3D view could not start', error);
        flat = true;
      }
    })();
    return () => {
      gone = true;
      made?.dispose();
      twin = null;
    };
  });

  // colours come from the css tokens, so they are read again on a theme switch
  $effect(() => {
    void preferences.theme;
    twin?.setPalette();
  });

  $effect(() => {
    twin?.setDraggable(draggable);
  });

  $effect(() => {
    twin?.setPresenting(present);
  });

  const size = $derived(present ? 'xl' : 'lg');
</script>

<div class="stage" class:present>
  {#if flat}
    <Flat />
  {:else}
    <canvas bind:this={canvas} class="scene"></canvas>
    <!-- the scene moves these onto the lights, style stays with it -->
    <button
      type="button"
      class="glyph lamp"
      class:draggable
      class:dragging={dragLight !== null}
      bind:this={lampGlyph}
      style="visibility: hidden"
      disabled={!draggable}
      aria-hidden={draggable ? undefined : 'true'}
      aria-label={lamp ? t('twin.lampLabel', { az: fmt(lamp.az, 0) ?? '', el: fmt(lamp.el, 0) ?? '' }) : undefined}
    >
      <span class="core"></span>
    </button>
    <div class="glyph sun" bind:this={sunGlyph} style="visibility: hidden" aria-hidden="true">
      <Icon name="sun" size={22} />
    </div>
  {/if}

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

  .scene {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
  }

  .glyph {
    position: absolute;
    left: 0;
    top: 0;
    width: 36px;
    height: 36px;
    margin: -18px 0 0 -18px;
    display: grid;
    place-items: center;
    pointer-events: none;
    will-change: transform;
  }

  /* the scene sets these flags, svelte cannot see them in the markup */
  .glyph:global([data-behind]) {
    opacity: 0.4;
  }

  .lamp.draggable {
    pointer-events: auto;
    cursor: grab;
  }

  .lamp.dragging {
    cursor: grabbing;
  }

  .lamp.draggable:focus-visible {
    outline: 1px solid var(--accent);
    outline-offset: -4px;
    border-radius: 50%;
  }

  /* a finger needs a bigger target than a mouse */
  @media (pointer: coarse) {
    .lamp.draggable {
      width: 48px;
      height: 48px;
      margin: -24px 0 0 -24px;
    }
  }

  .lamp .core {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--accent);
    box-shadow: 0 0 0 4px var(--accent-dim);
  }

  .lamp:global([data-off]) .core {
    background: var(--bg-deep);
    border: 1.5px solid var(--text-muted);
    box-shadow: none;
  }

  .sun {
    color: var(--accent);
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
  }
</style>

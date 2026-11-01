<script lang="ts">
  // the stage: the live 3D twin with a few words and numbers on top. three.js
  // loads with this component, a browser without webgl 2 gets the flat drawing
  import { onMount } from 'svelte';
  import Stat from '$lib/ui/Stat.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { telemetry } from '$lib/stores/telemetry.svelte';
  import { preferences } from '$lib/stores/preferences.svelte';
  import { connection } from '$lib/stores/connection.svelte';
  import { fmt, modeName, stateSentence, t, type Key } from '$lib/i18n';
  import { azEl, normal, wrap180 } from '$lib/sim/kinematics';
  import { gainPercent, power } from '$lib/panels/format';
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
  // the 3d context went away for a moment
  let lost = $state(false);

  // the light the numbers speak of: the lamp under the hand, the sun or the
  // lamp of the simulation. where the panel faces is in the tiles, so the stage
  // only says it in presentation mode, when the tiles are hidden
  const shown = $derived.by(() => {
    const sun = telemetry.sun;
    const sim = telemetry.sim;
    let what: 'lamp' | 'sun' | 'panel' = 'panel';
    let az: number | null = null;
    let el: number | null = null;
    if (dragLight) [what, az, el] = ['lamp', dragLight.az, dragLight.el];
    // in sun mode the numbers stay with the sun, also below the horizon while the head parks
    else if (sun) [what, az, el] = ['sun', sun.az, sun.el];
    else if (sim) [what, az, el] = ['lamp', sim.az, sim.el];
    else if (!present) return null;
    else if (telemetry.pan !== null && telemetry.tilt !== null) {
      const d = azEl(normal(telemetry.pan, telemetry.tilt));
      [az, el] = [d.az, d.el];
    }
    return { az: az === null ? null : wrap180(az), el, azLabel: `twin.${what}Az` as Key, elLabel: `twin.${what}El` as Key };
  });
  const watts = $derived(power(telemetry.pmw));

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
          },
          onContext: (gone) => {
            lost = gone;
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

  // a scan message is rare, the rune is fine here
  $effect(() => {
    twin?.setScan(telemetry.scan);
  });

  $effect(() => {
    twin?.setPresenting(present);
  });

  const size = $derived(present ? 'xl' : 'lg');
</script>

<div class="stage" class:present class:lost>
  {#if flat}
    <Flat />
  {:else}
    <canvas bind:this={canvas} class="scene" aria-label={t('twin.label')}></canvas>
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
    <p class="say" aria-live="polite">{stateSentence(telemetry.st)}</p>
    {#if shown || present}
      <div class="numbers">
        {#if shown}
          <Stat {size} label={t(shown.azLabel)} value={shown.az} digits={1} unit="°" />
          <Stat {size} label={t(shown.elLabel)} value={shown.el} digits={1} unit="°" />
        {/if}
        {#if present}
          <!-- the tiles are hidden while presenting, the key numbers come here, large -->
          <Stat {size} label={t('q.gain')} value={null} figure={gainPercent(telemetry.gain)} unit="%" />
          <Stat {size} label={t('q.power')} value={null} figure={watts?.value ?? null} unit={watts?.unit ?? ''} />
          <Stat {size} label={t('q.mode')} value={null} text={telemetry.mode ? modeName(telemetry.mode) : null} />
        {/if}
      </div>
    {/if}
  </div>

  {#if lost}
    <p class="note">{t('twin.lost')}</p>
  {/if}

  {#if !present}
    <div class="hints">
      {#if flat}
        <p class="hint">{t('twin.flat')}</p>
      {:else if draggable}
        <p class="hint"><Icon name="lamp" size={14} />{t('twin.hint')}</p>
      {/if}
      {#if !flat}
        <p class="hint view mouse">{t('twin.hintView')}</p>
        <p class="hint view touch">{t('twin.hintViewTouch')}</p>
      {/if}
    </div>
  {/if}
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

  /* while the 3d view is paused the glyphs would point at nothing */
  .lost .glyph {
    display: none;
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

  /* a rim in the page colour keeps the lamp apart from a copper sky map */
  .lamp .core {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--accent);
    border: 2px solid var(--bg-deep);
    box-shadow: 0 0 0 1px var(--accent);
  }

  .lamp:global([data-off]) .core {
    background: var(--bg-deep);
    border-color: var(--bg-deep);
    box-shadow: 0 0 0 1.5px var(--text-muted);
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

  .hints {
    position: absolute;
    left: 20px;
    right: 20px;
    bottom: 14px;
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 6px 24px;
    flex-wrap: wrap;
    pointer-events: none;
  }

  .hint {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--text-muted);
  }

  .hint :global(svg) {
    color: var(--accent);
  }

  .hint.view {
    margin-left: auto;
    font-size: 11px;
  }

  .hint.touch {
    display: none;
  }

  @media (pointer: coarse) {
    .hint.mouse {
      display: none;
    }

    .hint.touch {
      display: flex;
    }
  }

  .note {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    max-width: min(440px, calc(100% - 32px));
    padding: 10px 14px;
    font-size: 12px;
    color: var(--text-secondary);
    background: var(--bg-surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    text-align: center;
  }

  /* presentation: words and numbers that read from the back of a room */
  .present .overlay {
    padding: 36px 44px;
    gap: 22px;
  }

  .present .say {
    font-size: 30px;
    font-weight: 500;
    color: var(--text-strong);
  }

  .present .numbers {
    gap: 20px 64px;
  }

  @media (max-width: 600px) {
    .overlay {
      padding: 12px 16px;
      gap: 8px;
    }

    .say {
      font-size: 13px;
    }

    .numbers {
      gap: 8px 20px;
    }

    .hints {
      left: 16px;
      right: 16px;
      bottom: 10px;
    }

    .hint.view {
      display: none;
    }
  }
</style>

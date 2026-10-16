<script lang="ts">
  import { onMount } from 'svelte';
  import TopBar from '$lib/ui/TopBar.svelte';
  import StatusBar from '$lib/ui/StatusBar.svelte';
  import Logo from '$lib/ui/Logo.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Stage from '$lib/twin/Stage.svelte';
  import Tiles from '$lib/panels/Tiles.svelte';
  import Balance from '$lib/panels/Balance.svelte';
  import Charts from '$lib/panels/Charts.svelte';
  import HowItWorks from '$lib/panels/HowItWorks.svelte';
  import DaySim from '$lib/panels/DaySim.svelte';
  import Results from '$lib/panels/Results.svelte';
  import Unlock from '$lib/admin/Unlock.svelte';
  import Dock from '$lib/admin/Dock.svelte';
  import { connection } from '$lib/stores/connection.svelte';
  import { ui } from '$lib/stores/ui.svelte';
  import { t } from '$lib/i18n';

  const docked = $derived(connection.admin && !ui.presenting);

  onMount(() => {
    void connection.init();
    const stopWatching = ui.watchFullscreen();
    // escape leaves presentation mode even when the browser gave no full screen
    const onkeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && ui.presenting && !document.fullscreenElement) void ui.setPresenting(false);
    };
    window.addEventListener('keydown', onkeydown);
    return () => {
      window.removeEventListener('keydown', onkeydown);
      stopWatching();
      connection.stop();
    };
  });
</script>

<div class="app" class:presenting={ui.presenting}>
  {#if !ui.presenting}
    <TopBar />
  {/if}

  <main class="main">
    <div class="page" class:docked>
      <!-- the stage stays mounted through every layout change, the 3d scene is costly to set up -->
      <div class="stage">
        <Stage present={ui.presenting} />
        {#if ui.presenting}
          <button class="exit" onclick={() => ui.setPresenting(false)} title={t('present.exit')} aria-label={t('present.exit')}>
            <Icon name="contract" size={16} />
          </button>
        {/if}
      </div>

      {#if !ui.presenting}
        <aside class="side">
          <Tiles />
          <Balance />
          <Charts />
        </aside>

        {#if docked}
          <aside class="dock">
            <Dock />
          </aside>
        {/if}

        <div class="below">
          <div class="band"><div class="inner"><HowItWorks /></div></div>
          <div class="band"><div class="inner"><DaySim /></div></div>
          <div class="band"><div class="inner"><Results /></div></div>

          <footer class="footer">
            <div class="footer-inner">
              <div class="footer-brand">
                <span class="logo-mark"><Logo size={16} /></span>
                <span class="footer-name">brainSOL</span>
              </div>
              <nav class="footer-links">
                <a href="/privacy">{t('footer.privacy')}</a>
                <a href="/terms">{t('footer.terms')}</a>
                <a href="/imprint">{t('footer.imprint')}</a>
                <a href="https://github.com/swimmingbrain/brainsol" target="_blank" rel="noopener">{t('footer.github')}</a>
              </nav>
              <p class="footer-credit">
                made with <span class="heart">&hearts;</span> by
                <a href="https://swimmingbrain.dev" target="_blank" rel="noopener">Braian Plaku</a>
              </p>
            </div>
          </footer>
        </div>
      {/if}
    </div>
  </main>

  {#if !ui.presenting}
    <StatusBar />
  {/if}
</div>

<Unlock />

<style>
  .app {
    height: 100vh;
    height: 100dvh;
    display: flex;
    flex-direction: column;
    background: var(--bg-deep);
    overflow: hidden;
    /* the notch and the rounded corners of a phone keep their space */
    padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
  }

  .main {
    flex: 1;
    min-height: 0;
    overflow-x: hidden;
    overflow-y: auto;
  }

  /* the first screen is the cockpit: stage and side column fill it, the
     sections scroll in below. the dock sits on the right and stays in view */
  .page {
    --first: calc(100dvh - var(--topbar-h) - var(--statusbar-h) - env(safe-area-inset-top) - env(safe-area-inset-bottom));
    display: grid;
    grid-template-columns: minmax(0, 1fr) var(--side-w);
    grid-template-areas:
      'stage side'
      'below below';
  }

  .page.docked {
    grid-template-columns: minmax(0, 1fr) var(--side-w) var(--dock-w);
    grid-template-areas:
      'stage side dock'
      'below below dock';
  }

  .stage {
    grid-area: stage;
    position: relative;
    height: var(--first);
    min-height: 420px;
    min-width: 0;
  }

  .side {
    grid-area: side;
    height: var(--first);
    min-height: 420px;
    overflow-y: auto;
    background: var(--bg-surface);
    border-left: 1px solid var(--border);
  }

  .dock {
    grid-area: dock;
    position: sticky;
    top: 0;
    align-self: start;
    height: var(--first);
    min-height: 420px;
    overflow-y: auto;
    background: var(--bg-surface);
    border-left: 1px solid var(--border);
  }

  .below {
    grid-area: below;
    min-width: 0;
  }

  .band {
    border-top: 1px solid var(--border);
    padding: 56px 32px;
  }

  .inner {
    max-width: 1200px;
    margin: 0 auto;
  }

  .footer {
    border-top: 1px solid var(--border);
    padding: 12px 32px;
  }

  .footer-inner {
    max-width: 1200px;
    margin: 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }

  .footer-brand {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .logo-mark {
    display: flex;
    align-items: center;
    color: var(--accent);
  }

  .footer-name {
    font-family: var(--font-brand);
    font-style: italic;
    font-size: 14px;
    color: var(--text-primary);
  }

  .footer-links {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    font-size: 11px;
    font-family: var(--font-editor);
  }

  .footer-links a {
    color: var(--text-muted);
  }

  .footer-links a:hover {
    color: var(--accent);
  }

  .footer-credit {
    font-size: 11px;
    color: var(--text-muted);
    font-family: var(--font-editor);
  }

  .footer-credit a {
    color: var(--accent);
  }

  .footer-credit a:hover {
    color: var(--accent-hover);
  }

  .heart {
    color: var(--error);
    font-size: 12px;
  }

  /* the status bar carries the credit, the footer only once that one hides it */
  .footer-credit {
    display: none;
  }

  /* presentation mode: the stage alone, edge to edge */
  .presenting .main {
    overflow: hidden;
  }

  .presenting .page {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas: 'stage';
  }

  .presenting .stage {
    height: 100vh;
    height: 100dvh;
  }

  .exit {
    position: absolute;
    top: 14px;
    right: 14px;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
    background: var(--bg-surface);
    border: 1px solid var(--border);
  }

  .exit:hover {
    color: var(--text-primary);
    background: var(--bg-hover);
  }

  /* no room for three columns: the dock moves under the cockpit */
  @media (max-width: 1279px) {
    .page.docked {
      grid-template-columns: minmax(0, 1fr) var(--side-w);
      grid-template-areas:
        'stage side'
        'dock dock'
        'below below';
    }

    .page.docked .dock {
      position: static;
      height: auto;
      min-height: 0;
      border-left: none;
      border-top: 1px solid var(--border);
    }
  }

  /* phones and narrow windows: everything stacks, the stage first */
  @media (max-width: 899px) {
    .page,
    .page.docked {
      grid-template-columns: minmax(0, 1fr);
      grid-template-areas:
        'stage'
        'dock'
        'side'
        'below';
    }

    .stage {
      height: min(64dvh, 560px);
      min-height: 320px;
    }

    .side,
    .page.docked .dock {
      height: auto;
      min-height: 0;
      overflow: visible;
      border-left: none;
      border-top: 1px solid var(--border);
    }

    .band {
      padding: 40px 16px;
    }

    .footer {
      padding: 16px;
    }

    .footer-inner {
      flex-direction: column;
      align-items: flex-start;
      gap: 10px;
    }

    .footer-credit {
      display: block;
    }
  }
</style>

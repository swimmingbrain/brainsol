<script lang="ts">
  // the admin dock. it only exists while the tools are unlocked: beside the
  // stage on a wide screen, under it on a phone. every tab talks to the tracker
  // through the runner, which goes through connection.send
  import { untrack } from 'svelte';
  import DockTabs, { type DockTab } from './parts/DockTabs.svelte';
  import ActivityBar from './parts/ActivityBar.svelte';
  import ControlTab from './tabs/ControlTab.svelte';
  import TuningTab from './tabs/TuningTab.svelte';
  import CalibrateTab from './tabs/CalibrateTab.svelte';
  import ScanTab from './tabs/ScanTab.svelte';
  import ExperimentsTab from './tabs/ExperimentsTab.svelte';
  import SystemTab from './tabs/SystemTab.svelte';
  import ConnectionTab from './tabs/ConnectionTab.svelte';
  import { connection } from '$lib/stores/connection.svelte';
  import { t } from '$lib/i18n';
  import { runner, session, type TabId } from './session.svelte';

  const tabs = $derived<DockTab<TabId>[]>([
    { id: 'control', label: t('admin.tab.control'), icon: 'move' },
    { id: 'tuning', label: t('admin.tab.tuning'), icon: 'sliders' },
    { id: 'calib', label: t('admin.tab.calib'), icon: 'target' },
    { id: 'scan', label: t('admin.tab.scan'), icon: 'scan' },
    { id: 'exp', label: t('admin.tab.exp'), icon: 'flask' },
    { id: 'system', label: t('admin.tab.system'), icon: 'chip' },
    { id: 'link', label: t('admin.tab.link'), icon: 'link' }
  ]);

  // a fresh hello is a new tracker or a restarted one, what it cannot do is found out again
  $effect(() => {
    void connection.hello;
    untrack(() => runner.reset());
  });
</script>

<div class="dock-root">
  <div class="head">
    <DockTabs {tabs} active={session.tab} label={t('admin.dock.label')} onchange={(id) => (session.tab = id)} />
    <ActivityBar />
  </div>
  <div class="panel" id="admin-panel-{session.tab}" role="tabpanel" aria-labelledby="admin-tab-{session.tab}">
    {#if session.tab === 'control'}
      <ControlTab />
    {:else if session.tab === 'tuning'}
      <TuningTab />
    {:else if session.tab === 'calib'}
      <CalibrateTab />
    {:else if session.tab === 'scan'}
      <ScanTab />
    {:else if session.tab === 'exp'}
      <ExperimentsTab />
    {:else if session.tab === 'system'}
      <SystemTab />
    {:else}
      <ConnectionTab />
    {/if}
  </div>
</div>

<style>
  .dock-root {
    container: dock / inline-size;
    min-height: 100%;
    background: var(--bg-surface);
  }

  /* the tabs stay in reach while a long tab scrolls */
  .head {
    position: sticky;
    top: 0;
    z-index: 2;
  }

  /* a dock that spans the page flows its groups into columns */
  .panel {
    column-width: 320px;
    column-gap: 0;
    column-rule: 1px solid var(--border);
  }

  /* the focus line of the kit is the accent, on an accent button it would vanish */
  .panel :global(.btn.primary:focus-visible),
  .panel :global(.btn.danger:focus-visible) {
    outline: 2px solid var(--text-strong);
    outline-offset: 1px;
  }

  /* on a touch screen every control of the shared kit gets room for a thumb */
  @media (pointer: coarse) {
    .panel :global(.btn) {
      height: 44px;
    }

    .panel :global(.btn.only) {
      width: 44px;
    }

    .panel :global(.segment) {
      height: 40px;
    }

    .panel :global(input[type='range']) {
      height: 36px;
    }

    .panel :global(input[type='range']::-webkit-slider-thumb) {
      width: 20px;
      height: 28px;
      margin-top: -12px;
    }

    .panel :global(input[type='range']::-moz-range-thumb) {
      width: 20px;
      height: 28px;
    }

    .panel :global([role='spinbutton']),
    .panel :global(.number-input) {
      padding-top: 10px;
      padding-bottom: 10px;
    }

    .panel :global([role='switch']) {
      zoom: 1.6;
    }
  }
</style>

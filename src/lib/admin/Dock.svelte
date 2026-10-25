<script lang="ts">
  // the admin dock. it only exists while the tools are unlocked: beside the
  // stage on a wide screen, under it on a phone. every tab talks to the tracker
  // through the runner, which goes through connection.send
  import { untrack } from 'svelte';
  import DockTabs, { type DockTab } from './parts/DockTabs.svelte';
  import ControlTab from './tabs/ControlTab.svelte';
  import TuningTab from './tabs/TuningTab.svelte';
  import { connection } from '$lib/stores/connection.svelte';
  import { t } from '$lib/i18n';
  import { runner, session, type TabId } from './session.svelte';

  const tabs = $derived<DockTab<TabId>[]>([
    { id: 'control', label: t('admin.tab.control'), icon: 'move' },
    { id: 'tuning', label: t('admin.tab.tuning'), icon: 'sliders' }
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
  </div>
  <div class="panel" id="admin-panel-{session.tab}" role="tabpanel" aria-labelledby="admin-tab-{session.tab}">
    {#if session.tab === 'control'}
      <ControlTab />
    {:else if session.tab === 'tuning'}
      <TuningTab />
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
</style>

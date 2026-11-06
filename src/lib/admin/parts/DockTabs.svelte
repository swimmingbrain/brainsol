<script lang="ts" module>
  import type { IconName } from '$lib/ui/Icon.svelte';

  export interface DockTab<T extends string = string> {
    id: T;
    label: string;
    icon: IconName;
  }
</script>

<script lang="ts" generics="T extends string">
  import Icon from '$lib/ui/Icon.svelte';

  // the tab strip of the dock. seven names do not fit 340 px, so a narrow dock
  // shows icons and only the open tab with its name, a wide one shows all names.
  // arrow keys move along the strip like in any tab list
  let {
    tabs,
    active,
    onchange,
    label
  }: {
    tabs: DockTab<T>[];
    active: T;
    onchange: (id: T) => void;
    label: string;
  } = $props();

  let strip = $state<HTMLDivElement | null>(null);

  function onkeydown(e: KeyboardEvent) {
    const index = tabs.findIndex((tab) => tab.id === active);
    let next = -1;
    if (e.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    if (next < 0) return;
    e.preventDefault();
    onchange(tabs[next].id);
    queueMicrotask(() => strip?.querySelector<HTMLElement>(`#admin-tab-${tabs[next].id}`)?.focus());
  }
</script>

<div class="dock-tabs" role="tablist" aria-label={label} bind:this={strip} tabindex="-1" {onkeydown}>
  {#each tabs as tab (tab.id)}
    <button
      id="admin-tab-{tab.id}"
      class="tab"
      class:active={tab.id === active}
      role="tab"
      aria-selected={tab.id === active}
      aria-controls="admin-panel-{tab.id}"
      tabindex={tab.id === active ? 0 : -1}
      title={tab.label}
      onclick={() => onchange(tab.id)}>
      <Icon name={tab.icon} size={13} />
      <span class="label">{tab.label}</span>
    </button>
  {/each}
</div>

<style>
  .dock-tabs {
    display: flex;
    align-items: stretch;
    height: var(--panel-head-h);
    padding: 0 3px;
    border-bottom: 1px solid var(--border);
    background: var(--bg-surface);
    overflow-x: auto;
    outline: none;
  }

  .dock-tabs::-webkit-scrollbar {
    height: 0;
  }

  .tab {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    flex: 1 1 0;
    min-width: 30px;
    padding: 0 6px;
    font-size: 11.5px;
    color: var(--text-muted);
    white-space: nowrap;
    transition: color 0.1s ease, background 0.1s ease;
  }

  .tab:hover {
    color: var(--text-secondary);
  }

  .tab.active {
    flex: 0 0 auto;
    padding: 0 10px;
    color: var(--text-primary);
    background: var(--bg-hover);
  }

  .tab.active :global(svg) {
    color: var(--accent-ink);
  }

  .label {
    display: none;
  }

  .tab.active .label {
    display: inline;
  }

  /* a dock that spans the page has room for every name */
  @container dock (min-width: 640px) {
    .tab {
      flex: 0 0 auto;
      padding: 0 12px;
    }

    .label {
      display: inline;
    }
  }

  /* thumbs need taller tabs */
  @media (pointer: coarse) {
    .dock-tabs {
      height: 44px;
    }
  }
</style>

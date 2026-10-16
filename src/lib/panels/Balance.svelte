<script lang="ts">
  // a stand in for the light balance widget until the viewer stream replaces
  // this file. the four filtered levels as bars, the two errors as numbers
  import Panel from '$lib/ui/Panel.svelte';
  import Stat from '$lib/ui/Stat.svelte';
  import { telemetry } from '$lib/stores/telemetry.svelte';
  import { t } from '$lib/i18n';

  const names = ['L', 'R', 'U', 'D'];
  const levels = $derived(telemetry.ldr ?? [0, 0, 0, 0]);
</script>

<Panel title={t('section.balance')}>
  <div class="balance">
    <div class="bars">
      {#each names as name, i (name)}
        <div class="row">
          <span class="name">{name}</span>
          <span class="track"><span class="fill" style="width: {Math.round(levels[i] * 100)}%"></span></span>
        </div>
      {/each}
    </div>
    <div class="errors">
      <Stat size="sm" label="ex" value={telemetry.ex} digits={3} />
      <Stat size="sm" label="ey" value={telemetry.ey} digits={3} />
    </div>
  </div>
</Panel>

<style>
  .balance {
    display: flex;
    gap: 16px;
    align-items: center;
  }

  .bars {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .name {
    width: 10px;
    font-family: var(--font-editor);
    font-size: 10.5px;
    color: var(--text-muted);
  }

  .track {
    flex: 1;
    height: 6px;
    background: var(--chart-track);
    border-radius: 1px;
    overflow: hidden;
  }

  .fill {
    display: block;
    height: 100%;
    background: var(--chart-1);
    transition: width 100ms linear;
  }

  .errors {
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 64px;
  }
</style>

<script lang="ts">
  // a stand in for the stat tiles until the viewer stream replaces this file
  import Panel from '$lib/ui/Panel.svelte';
  import Stat from '$lib/ui/Stat.svelte';
  import { telemetry } from '$lib/stores/telemetry.svelte';
  import { modeName, stateWord, t } from '$lib/i18n';
</script>

<Panel title={t('section.tiles')}>
  <div class="tiles">
    <Stat label={t('q.light')} value={telemetry.lux} unit="lx" />
    <Stat label={t('q.power')} value={telemetry.pmw} digits={1} unit="mW" />
    <Stat label={t('q.gain')} value={telemetry.gain} digits={2} unit="×" />
    <Stat label={t('q.off')} value={telemetry.off} digits={1} unit="°" />
    <Stat label={t('q.mode')} value={null} text={telemetry.mode ? modeName(telemetry.mode) : null} />
    <Stat label={t('q.state')} value={null} text={telemetry.st ? stateWord(telemetry.st) : null} />
  </div>
</Panel>

<style>
  .tiles {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px 16px;
  }
</style>

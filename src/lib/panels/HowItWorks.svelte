<script lang="ts">
  // a stand in for the how it works section until the viewer stream replaces this file
  import Section from '$lib/ui/Section.svelte';
  import Stat from '$lib/ui/Stat.svelte';
  import { telemetry } from '$lib/stores/telemetry.svelte';
  import { t } from '$lib/i18n';
</script>

<Section id="how" title={t('section.how')} lead={t('stub.soon')}>
  <div class="row">
    <Stat label="ex" value={telemetry.ex} digits={3} />
    <Stat label="ey" value={telemetry.ey} digits={3} />
    <Stat label={t('q.level')} value={telemetry.lvl} digits={3} />
  </div>
</Section>

<style>
  .row {
    display: flex;
    gap: 32px;
  }
</style>

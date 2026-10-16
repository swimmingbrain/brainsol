<script lang="ts">
  // a stand in for the experiment results until the viewer stream replaces this file
  import Section from '$lib/ui/Section.svelte';
  import Stat from '$lib/ui/Stat.svelte';
  import { telemetry } from '$lib/stores/telemetry.svelte';
  import { t } from '$lib/i18n';

  const exp = $derived(telemetry.exp);
</script>

<Section id="results" title={t('section.results')} lead={t('stub.soon')}>
  <div class="row">
    <Stat label={t('q.experiment')} value={null} text={exp?.kind ?? t('common.none')} />
    <Stat label={t('q.progress')} value={exp ? exp.progress * 100 : null} unit="%" />
  </div>
</Section>

<style>
  .row {
    display: flex;
    gap: 32px;
  }
</style>

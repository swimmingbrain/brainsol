<script lang="ts">
  // a stand in for the day simulator until the viewer stream replaces this file
  import Section from '$lib/ui/Section.svelte';
  import Stat from '$lib/ui/Stat.svelte';
  import { connection } from '$lib/stores/connection.svelte';
  import { t } from '$lib/i18n';

  const site = $derived(connection.config?.site ?? null);
</script>

<Section id="day" title={t('section.day')} lead={t('stub.soon')}>
  <div class="row">
    <Stat label={t('q.lat')} value={site?.lat} digits={2} unit="°" />
    <Stat label={t('q.lon')} value={site?.lon} digits={2} unit="°" />
    <Stat label={t('q.heading')} value={site?.heading} unit="°" />
  </div>
</Section>

<style>
  .row {
    display: flex;
    gap: 32px;
  }
</style>

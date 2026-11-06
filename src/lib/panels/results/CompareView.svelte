<script lang="ts">
  // fixed against tracking: the light at the fixed reference pose and on the
  // light, round by round, and the mean gain of the rounds
  import Bars from '../chart/Bars.svelte';
  import Figure from './Figure.svelte';
  import { fmt, t } from '$lib/i18n';
  import { roundGains } from './experiments';
  import { gainPercent } from '../format';
  import type { CompareResult } from '$lib/link/protocol';

  let { result }: { result: CompareResult } = $props();

  const gains = $derived(roundGains(result));
  const groups = $derived(
    result.rounds.map((round, i) => ({
      label: String(i + 1),
      full: t('panels.results.round', { n: i + 1, g: gainPercent(gains[i]) ?? '' }),
      values: [round.fixed, round.tracked]
    }))
  );
  const series = $derived([
    { label: t('panels.results.fixedPose'), color: 'series3' as const },
    { label: t('panels.results.tracked'), color: 'series1' as const }
  ]);
</script>

<div class="figures">
  <Figure label={t('panels.results.meanGain')} value={gainPercent(result.gain)} unit="%" note={t('panels.results.meanGainNote')} />
  <Figure label={t('panels.results.spread')} value={fmt(result.spread * 100, 1)} unit={t('panels.results.points')} note={t('panels.results.spreadNote')} />
  <Figure label={t('panels.results.rounds')} value={String(result.rounds.length)} note={t('panels.results.roundsNote')} />
</div>
<Bars {groups} {series} unit="lx" digits={0} maxBar={28} height={180} idle={t('panels.results.roundAxis')} label={t('panels.results.compareAria')} />
<p class="caption">{t('panels.results.compareCaption')}</p>

<style>
  /* two figures a row, the dock column is narrow */
  .figures {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px 16px;
    margin-bottom: 14px;
  }

  .caption {
    margin-top: 8px;
    font-size: 12px;
    line-height: 1.5;
    color: var(--text-secondary);
  }
</style>

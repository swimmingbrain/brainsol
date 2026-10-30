<script lang="ts">
  // the experiment results. a running experiment shows its phase and
  // progress, finished ones are listed on the left and the chosen one is drawn
  // on the right. a live tracker keeps every result and serves a csv of each,
  // the simulation keeps what this page saw and writes the csv itself
  import { onMount } from 'svelte';
  import Section from '$lib/ui/Section.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import CosineView from './results/CosineView.svelte';
  import CompareView from './results/CompareView.svelte';
  import StepView from './results/StepView.svelte';
  import { telemetry } from '$lib/stores/telemetry.svelte';
  import { connection } from '$lib/stores/connection.svelte';
  import { preferences } from '$lib/stores/preferences.svelte';
  import { fmt, t, type Key } from '$lib/i18n';
  import { session } from './results/session.svelte';
  import { csvUrl, isCompare, isCosine, isStep, mergeRecords, parseList, toCsv, EXP_KINDS } from './results/experiments';
  import { gainPercent } from './format';
  import { saveText } from './download';
  import type { ExpKind, ExperimentRecord, ExperimentSummary } from '$lib/link/protocol';

  onMount(() => session.watch());

  const live = $derived(connection.source === 'live' && connection.status === 'open');

  // the list the tracker keeps, and the results fetched from it so far
  let stored = $state.raw<ExperimentSummary[]>([]);
  let fetched = $state.raw<Record<string, ExperimentRecord>>({});
  let selected = $state<string | null>(null);
  let loading = $state(false);

  async function refresh() {
    const list = await connection.fetchApi<unknown>('/api/experiments');
    stored = parseList(list);
  }

  // a fresh list when the tracker comes in and after each experiment it finishes
  $effect(() => {
    if (!live) {
      stored = [];
      return;
    }
    void session.records.length;
    void refresh();
  });

  const known = $derived(new Map(session.records.map((r) => [r.id, r] as const)));
  const rows = $derived(mergeRecords(session.records, stored));
  const current = $derived(rows.find((r) => r.id === selected) ?? rows[0] ?? null);
  const record = $derived(current ? (known.get(current.id) ?? fetched[current.id] ?? null) : null);

  // a stored result is fetched the first time someone picks it
  $effect(() => {
    const row = current;
    if (!row || known.has(row.id) || fetched[row.id] || !live) return;
    loading = true;
    void connection.fetchApi<ExperimentRecord>(`/api/experiments/${encodeURIComponent(row.id)}`).then((value) => {
      loading = false;
      if (value && value.result) fetched = { ...fetched, [row.id]: { ...row, ...value } };
    });
  });

  const running = $derived(telemetry.exp && telemetry.exp.result === null ? telemetry.exp : null);

  const PHASES = ['lock', 'sweep', 'fixed', 'tracked', 'offset', 'release', 'settle', 'done'];
  const phaseText = (phase: string) => (PHASES.includes(phase) ? t(`panels.results.phase.${phase}` as Key) : phase);
  const kindName = (kind: ExpKind) => t(`panels.results.kind.${kind}` as Key);

  const locale = $derived(preferences.lang === 'de' ? 'de-DE' : 'en-GB');
  function when(ts: number): string {
    const date = new Date(ts * 1000);
    const today = new Date().toDateString() === date.toDateString();
    const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
    if (today) return time;
    return `${new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(date)}, ${time}`;
  }

  // the one number a row shows
  function headline(id: string): string {
    const r = known.get(id) ?? fetched[id];
    if (!r) return '';
    if (isCosine(r.kind, r.result)) return `R² ${fmt(r.result.r2, 3)}`;
    if (isCompare(r.kind, r.result)) return `${gainPercent(r.result.gain)} %`;
    if (isStep(r.kind, r.result)) return r.result.settle !== null ? `${fmt(r.result.settle, 2)} s` : t('panels.results.noLock');
    return '';
  }

  // the simulation has no server, the page writes the csv
  function download(r: ExperimentRecord) {
    saveText(`brainsol-${r.kind}-${r.id}.csv`, toCsv(r));
  }
</script>

<Section id="results" title={t('section.results')} lead={t('panels.results.lead')}>
  {#if running}
    <div class="running" aria-live="polite">
      <div class="running-head">
        <span class="running-kind">{kindName(running.kind)}</span>
        <span class="running-phase">{phaseText(running.phase)}</span>
        <span class="running-pct">{fmt(Math.round(running.progress * 100), 0)} %</span>
      </div>
      <div class="track"><span class="fill" style="width: {Math.max(0, Math.min(1, running.progress)) * 100}%"></span></div>
    </div>
  {/if}

  {#if rows.length === 0}
    <div class="empty">
      <div class="empty-box">
        <span class="empty-icon"><Icon name="flask" size={18} /></span>
        <div>
          <p class="empty-title">{t('panels.results.emptyTitle')}</p>
          <p class="empty-text">{t('panels.results.emptyText')}</p>
        </div>
      </div>
      <ul class="kinds">
        {#each EXP_KINDS as kind (kind)}
          <li><span class="kind-name">{kindName(kind)}</span> {t(`panels.results.about.${kind}` as Key)}</li>
        {/each}
      </ul>
    </div>
  {:else}
    <div class="layout">
      <div class="list">
        <p class="list-head">{live ? t('panels.results.stored') : t('panels.results.sessionOnly')}</p>
        <ul role="listbox" aria-label={t('section.results')}>
          {#each rows as row (row.id)}
            {@const on = current?.id === row.id}
            <li class="row" class:on>
              <button class="pick" role="option" aria-selected={on} onclick={() => (selected = row.id)}>
                <span class="row-kind">{kindName(row.kind)}</span>
                <span class="row-when">{when(row.ts)}</span>
                <span class="row-value">{headline(row.id)}</span>
              </button>
              {#if live && connection.api}
                <a class="csv" href={csvUrl(connection.api, row.id)} download title={t('panels.results.csv')} aria-label={t('panels.results.csv')}>
                  <Icon name="download" size={13} />
                </a>
              {:else if known.has(row.id)}
                <button class="csv" title={t('panels.results.csv')} aria-label={t('panels.results.csv')} onclick={() => download(known.get(row.id)!)}>
                  <Icon name="download" size={13} />
                </button>
              {/if}
            </li>
          {/each}
        </ul>
      </div>

      <div class="detail">
        {#if current}
          <div class="detail-head">
            <h3>{kindName(current.kind)}</h3>
            <span class="detail-when">{when(current.ts)}</span>
          </div>
          {#if record && isCosine(record.kind, record.result)}
            <CosineView result={record.result} />
          {:else if record && isCompare(record.kind, record.result)}
            <CompareView result={record.result} />
          {:else if record && isStep(record.kind, record.result)}
            <StepView result={record.result} />
          {:else}
            <p class="quiet">{loading ? t('panels.results.loading') : t('panels.results.missing')}</p>
          {/if}
        {/if}
      </div>

      <ul class="kinds small">
        {#each EXP_KINDS as kind (kind)}
          <li><span class="kind-name">{kindName(kind)}</span> {t(`panels.results.about.${kind}` as Key)}</li>
        {/each}
      </ul>
    </div>
  {/if}
</Section>

<style>
  .running {
    max-width: 520px;
    margin-bottom: 28px;
    padding: 12px 14px;
    background: var(--bg-surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
  }

  .running-head {
    display: flex;
    align-items: baseline;
    gap: 10px;
    margin-bottom: 8px;
    font-size: 12px;
  }

  .running-kind {
    font-weight: 600;
    color: var(--text-primary);
  }

  .running-phase {
    color: var(--text-secondary);
  }

  .running-pct {
    margin-left: auto;
    font-family: var(--font-editor);
    color: var(--text-strong);
    font-variant-numeric: tabular-nums;
  }

  .track {
    height: 4px;
    background: var(--chart-track);
    border-radius: 2px;
    overflow: hidden;
  }

  .fill {
    display: block;
    height: 100%;
    background: var(--accent);
    transition: width 150ms linear;
  }

  .empty {
    max-width: 640px;
  }

  .empty-box {
    display: flex;
    align-items: flex-start;
    gap: 14px;
    padding: 18px 20px;
    background: var(--bg-surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
  }

  .empty-icon {
    display: flex;
    padding-top: 1px;
    color: var(--text-muted);
  }

  .empty-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
  }

  .empty-text {
    margin-top: 6px;
    font-size: 13px;
    line-height: 1.6;
    color: var(--text-secondary);
  }

  .kinds {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 20px;
    font-size: 12.5px;
    line-height: 1.55;
    color: var(--text-secondary);
  }

  .kinds.small {
    margin-top: 24px;
    font-size: 11.5px;
    color: var(--text-muted);
  }

  .kind-name {
    font-weight: 600;
    color: var(--text-primary);
  }

  /* the explanation of the kinds sits under the list, on a phone after the chart */
  .layout {
    display: grid;
    grid-template-columns: 280px minmax(0, 1fr);
    grid-template-rows: auto 1fr;
    grid-template-areas:
      'list detail'
      'kinds detail';
    column-gap: 40px;
    align-items: start;
  }

  .list {
    grid-area: list;
  }

  .layout > .kinds {
    grid-area: kinds;
  }

  .list-head {
    margin-bottom: 8px;
    font-size: 11.5px;
    color: var(--text-muted);
  }

  .list ul[role='listbox'] {
    list-style: none;
    border-top: 1px solid var(--border);
  }

  .row {
    display: flex;
    align-items: stretch;
    border-bottom: 1px solid var(--border);
  }

  .row.on {
    background: var(--bg-hover);
    box-shadow: inset 2px 0 0 var(--accent);
  }

  .pick {
    flex: 1;
    min-width: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 2px 10px;
    padding: 8px 10px;
    text-align: left;
  }

  .pick:hover {
    background: var(--bg-hover);
  }

  .row-kind {
    font-size: 12.5px;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .row-value {
    grid-row: 1 / 3;
    grid-column: 2;
    align-self: center;
    font-family: var(--font-editor);
    font-size: 12px;
    color: var(--text-strong);
    font-variant-numeric: tabular-nums;
  }

  .row-when {
    font-family: var(--font-editor);
    font-size: 10.5px;
    color: var(--text-muted);
  }

  .csv {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    color: var(--text-muted);
    flex-shrink: 0;
  }

  .csv:hover {
    color: var(--accent);
    background: var(--bg-hover);
  }

  .detail {
    grid-area: detail;
    min-width: 0;
  }

  .detail-head {
    display: flex;
    align-items: baseline;
    gap: 12px;
    margin-bottom: 14px;
  }

  h3 {
    font-size: 15px;
    font-weight: 600;
    color: var(--text-primary);
  }

  .detail-when {
    font-family: var(--font-editor);
    font-size: 11px;
    color: var(--text-muted);
  }

  .quiet {
    font-size: 12.5px;
    color: var(--text-muted);
  }

  @media (max-width: 900px) {
    .layout {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: auto;
      grid-template-areas:
        'list'
        'detail'
        'kinds';
      row-gap: 28px;
    }

    .layout > .kinds {
      margin-top: 0;
    }
  }
</style>

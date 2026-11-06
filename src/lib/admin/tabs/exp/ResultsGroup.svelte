<script lang="ts">
  // the finished experiments in a short list and the chosen one drawn below it:
  // its figures, its curve and the caption. a live tracker keeps every result
  // and serves a csv of each, the simulation keeps what this page saw and the
  // page writes the csv itself
  import Group from '../../parts/Group.svelte';
  import Note from '../../parts/Note.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import CosineView from '$lib/panels/results/CosineView.svelte';
  import CompareView from '$lib/panels/results/CompareView.svelte';
  import StepView from '$lib/panels/results/StepView.svelte';
  import { connection } from '$lib/stores/connection.svelte';
  import { preferences } from '$lib/stores/preferences.svelte';
  import { expName, fmt, t } from '$lib/i18n';
  import { session } from '$lib/panels/results/session.svelte';
  import { csvUrl, isCompare, isCosine, isStep, mergeRecords, parseList, toCsv } from '$lib/panels/results/experiments';
  import { gainPercent } from '$lib/panels/format';
  import { saveText } from '$lib/panels/download';
  import type { ExperimentRecord, ExperimentSummary } from '$lib/link/protocol';

  // the result that is drawn, the newest one while nobody picked one
  let { selected = $bindable(null) }: { selected?: string | null } = $props();

  const live = $derived(connection.source === 'live' && connection.status === 'open');

  // the list the tracker keeps, and the results fetched from it so far
  let stored = $state.raw<ExperimentSummary[]>([]);
  let fetched = $state.raw<Record<string, ExperimentRecord>>({});
  let loading = $state(false);

  async function refresh() {
    stored = parseList(await connection.fetchApi<unknown>('/api/experiments'));
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

  const locale = $derived(preferences.lang === 'de' ? 'de-DE' : 'en-GB');
  function when(ts: number): string {
    const date = new Date(ts * 1000);
    const today = new Date().toDateString() === date.toDateString();
    const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
    if (today) return time;
    return `${new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(date)}, ${time}`;
  }

  // the one number a row shows, a stored row that was not fetched yet uses the
  // summary the list carries
  function headline(row: ExperimentSummary): string {
    const r = known.get(row.id) ?? fetched[row.id];
    const s = row.summary ?? {};
    const kind = row.kind;
    const r2 = r && isCosine(r.kind, r.result) ? r.result.r2 : kind === 'cosine' ? s.r2 : undefined;
    const gain = r && isCompare(r.kind, r.result) ? r.result.gain : kind === 'compare' ? s.gain : undefined;
    const settle = r && isStep(r.kind, r.result) ? r.result.settle : kind === 'step' ? s.settle : undefined;
    if (kind === 'cosine' && r2 !== undefined) return r2 === null ? '' : `R² ${fmt(r2, 3)}`;
    if (kind === 'compare' && gain !== undefined) return gain === null ? '' : `${gainPercent(gain)} %`;
    if (kind === 'step' && settle !== undefined) return settle === null ? t('panels.results.noLock') : `${fmt(settle, 2)} s`;
    return '';
  }

  // the simulation has no server, the page writes the csv
  function download(r: ExperimentRecord) {
    saveText(`brainsol-${r.kind}-${r.id}.csv`, toCsv(r));
  }
</script>

<Group title={t('admin.exp.results')} hint={rows.length === 0 ? undefined : live ? t('admin.exp.stored') : t('admin.exp.sessionOnly')}>
  {#if rows.length === 0}
    <Note>{t('admin.exp.none')}</Note>
  {:else}
    <ul class="rows" role="listbox" aria-label={t('admin.exp.list')}>
      {#each rows as row (row.id)}
        {@const on = current?.id === row.id}
        <li class="row" class:on>
          <button class="pick" role="option" aria-selected={on} onclick={() => (selected = row.id)}>
            <span class="kind">{expName(row.kind)}</span>
            <span class="when">{when(row.ts)}</span>
            <span class="value">{headline(row)}</span>
          </button>
          {#if live && connection.api}
            <a class="csv" href={csvUrl(connection.api, row.id)} download title={t('admin.exp.csv')} aria-label={t('admin.exp.csv')}>
              <Icon name="download" size={13} />
            </a>
          {:else if known.has(row.id)}
            <button class="csv" title={t('admin.exp.csv')} aria-label={t('admin.exp.csv')} onclick={() => download(known.get(row.id)!)}>
              <Icon name="download" size={13} />
            </button>
          {/if}
        </li>
      {/each}
    </ul>

    {#if current}
      <div class="detail">
        <div class="head">
          <span class="name">{expName(current.kind)}</span>
          <span class="when">{when(current.ts)}</span>
        </div>
        {#if record && isCosine(record.kind, record.result)}
          <CosineView result={record.result} />
        {:else if record && isCompare(record.kind, record.result)}
          <CompareView result={record.result} />
        {:else if record && isStep(record.kind, record.result)}
          <StepView result={record.result} />
        {:else}
          <p class="quiet">{loading ? t('admin.exp.loading') : t('admin.exp.missing')}</p>
        {/if}
      </div>
    {/if}
  {/if}
</Group>

<style>
  /* a long list from the tracker scrolls on its own, the chosen result stays close */
  .rows {
    max-height: 196px;
    margin: 0;
    padding: 0;
    overflow-y: auto;
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
    box-shadow: inset 2px 0 0 var(--accent-ink);
  }

  .pick {
    flex: 1;
    min-width: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 1px 10px;
    padding: 6px 8px;
    text-align: left;
  }

  .pick:hover {
    background: var(--bg-hover);
  }

  .kind {
    font-size: 12.5px;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .value {
    grid-row: 1 / 3;
    grid-column: 2;
    align-self: center;
    font-size: 12.5px;
    color: var(--text-strong);
    font-variant-numeric: tabular-nums;
  }

  .when {
    font-size: 11px;
    color: var(--text-muted);
  }

  .csv {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    flex-shrink: 0;
    color: var(--text-muted);
  }

  .csv:hover {
    color: var(--accent-ink);
    background: var(--bg-hover);
  }

  .detail {
    min-width: 0;
    margin-top: 6px;
  }

  .head {
    display: flex;
    align-items: baseline;
    gap: 10px;
    margin-bottom: 10px;
  }

  .name {
    font-size: 13.5px;
    color: var(--text-strong);
  }

  .quiet {
    font-size: 12px;
    color: var(--text-muted);
  }
</style>

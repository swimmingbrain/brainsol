<script lang="ts">
  // starts the experiments of the seminar paper and follows the running one.
  // the curves and tables of a result are drawn in the results section below
  // the cockpit, this tab points there
  import Group from '../parts/Group.svelte';
  import Note from '../parts/Note.svelte';
  import Progress from '../parts/Progress.svelte';
  import Button from '$lib/ui/Button.svelte';
  import { connection } from '$lib/stores/connection.svelte';
  import { telemetry } from '$lib/stores/telemetry.svelte';
  import { expName, fmt, phaseText, t, type Key } from '$lib/i18n';
  import type { ExpKind } from '$lib/link/protocol';
  import { expCommand, STOP } from '../commands';
  import { expRunning, headline, isOver, KINDS, needsLux } from '../experiments';
  import { runner } from '../session.svelte';

  const exp = $derived(telemetry.exp);
  const act = $derived(telemetry.sys ? telemetry.sys.act : undefined);
  const running = $derived(expRunning(exp, act));
  const other = $derived(act && act !== 'exp' ? act : null);
  const noExp = $derived(runner.unsupported('exp'));
  const hasLux = $derived(connection.caps?.lux ?? false);
  const result = $derived(exp && isOver(exp) ? headline(exp) : null);

  const phase = $derived(exp ? phaseText(exp.phase) : '');

  function start(kind: ExpKind) {
    void runner.run(expCommand(kind), { key: `exp.${kind}`, feature: 'exp' });
  }

  function stop() {
    void runner.run(STOP, { key: 'stop' });
  }

  // the results section lives on the page, outside the dock
  function showResults() {
    document.getElementById('results')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function why(kind: ExpKind): string | null {
    if (noExp) return null;
    if (needsLux(kind) && !hasLux) return t('admin.exp.needsLux');
    return null;
  }
</script>

{#if exp && (running || isOver(exp))}
  <Group title={running ? t('admin.exp.running') : t('admin.exp.last')}>
    <div class="now">
      <div class="what">
        <span class="name">{expName(exp.kind)}</span>
        <span class="phase" class:error={exp.phase === 'error'}>{phase}</span>
      </div>
      {#if running}
        <Button size="sm" icon="stop" disabled={runner.pending('stop')} onclick={stop}>{t('admin.exp.stop')}</Button>
      {/if}
    </div>
    <Progress share={exp.progress} label={t('q.progress')} text="{fmt(exp.progress * 100, 0)}%" />
    {#if result}
      <p class="result">
        {t(`admin.exp.result.${result.name}` as Key)}
        <b>{result.value === null ? t('admin.exp.noSettle') : `${fmt(result.value, result.digits)}${result.unit}`}</b>
      </p>
    {/if}
    {#if exp.result}
      <button class="link" onclick={showResults}>{t('admin.exp.see')}</button>
    {:else if exp.phase === 'error'}
      <Note>{exp.err ? t('admin.exp.earlyWhy', { why: exp.err }) : t('admin.exp.early')}</Note>
    {/if}
  </Group>
{/if}

<Group title={t('admin.exp.title')} hint={t('admin.exp.hint')}>
  <ul class="kinds">
    {#each KINDS as kind (kind)}
      {@const reason = why(kind)}
      <li class="kind">
        <div class="text">
          <span class="name">{expName(kind)}</span>
          <p>{t(`exp.about.${kind}` as Key)}</p>
          {#if reason}<Note tone="warn">{reason}</Note>{/if}
        </div>
        <Button
          size="sm"
          variant="secondary"
          icon="play"
          disabled={noExp || running || other !== null || reason !== null || runner.pending(`exp.${kind}`)}
          onclick={() => start(kind)}>
          {t('admin.exp.start')}
        </Button>
      </li>
    {/each}
  </ul>
  {#if noExp}
    <Note tone="warn">{t('admin.exp.unsupported')}</Note>
  {:else if other}
    <Note>{t('admin.exp.other')}</Note>
  {/if}
</Group>

<style>
  .now {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .what {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .name {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-primary);
  }

  .phase {
    font-size: 11.5px;
    color: var(--text-secondary);
  }

  .phase.error {
    color: var(--warning);
  }

  .result {
    font-size: 12px;
    color: var(--text-secondary);
  }

  .result b {
    font-weight: 500;
    color: var(--text-strong);
  }

  .link {
    align-self: flex-start;
    font-size: 11.5px;
    color: var(--accent-ink);
  }

  .link:hover {
    color: var(--accent-ink-hover);
  }

  .kinds {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .kind {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: start;
    gap: 10px;
    padding: 8px 0;
    border-top: 1px solid var(--border);
  }

  .kind:first-child {
    border-top: none;
    padding-top: 0;
  }

  .text {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }

  .text p {
    font-size: 11.5px;
    line-height: 1.45;
    color: var(--text-muted);
  }
</style>

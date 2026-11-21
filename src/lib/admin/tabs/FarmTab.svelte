<script lang="ts">
  // the farmer's words become a recipe: a language model on the recipe server
  // reads the plant's name and the hours where the plant or the power comes
  // first, the plant table adds light target and highest temperature. a plant
  // the table does not know is asked back with the known ones as chips. the
  // planner next to it answers with its plan for the rest of the day. nothing
  // here moves the tracker, the plan mode in the control tab does
  import { onMount } from 'svelte';
  import Group from '../parts/Group.svelte';
  import Note from '../parts/Note.svelte';
  import Stat from '$lib/ui/Stat.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Chip from '$lib/ui/Chip.svelte';
  import { farm } from '$lib/farm/farm.svelte';
  import { PROMPT_MAX } from '$lib/farm/client';
  import { inBlock, reasonText } from '$lib/farm/plan';
  import { minutes, type Window } from '$lib/farm/recipe';
  import { preferences } from '$lib/stores/preferences.svelte';
  import { toast } from '$lib/stores/toasts.svelte';
  import { fmt, t, type Key } from '$lib/i18n';

  onMount(() => void farm.init());

  // a pi that goes live later may bring the recipe server along
  $effect(() => {
    if (farm.base) void farm.refresh();
  });

  const recipe = $derived(farm.recipe);
  const plan = $derived(farm.plan);
  // the plant's light as a share of the revenue, in percent
  const share = $derived(plan && plan.revenue.share !== null ? plan.revenue.share * 100 : null);
  const band = $derived(plan?.light.end ?? null);
  const ready = $derived(!!farm.base && farm.prompt.trim() !== '' && !farm.pending);

  const question = $derived(farm.question);

  function report(ok: boolean) {
    if (ok) toast(t('admin.farm.done'), 'success', 2500);
    else if (farm.error) toast(t(`admin.farm.err.${farm.error}` as Key), 'warning', 5000);
  }

  async function make() {
    if (!ready) return;
    report(await farm.ask(preferences.lang));
  }

  async function choose(name: string) {
    if (farm.pending) return;
    report(await farm.choose(name, preferences.lang));
  }

  function keydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void make();
    }
  }

  // a window as a share of the day, for the bar
  const span = (w: Window) => ({ left: (minutes(w.from) / 1440) * 100, width: ((minutes(w.to) - minutes(w.from)) / 1440) * 100 });

  const list = (windows: Window[]) =>
    windows.length ? windows.map((w) => t('admin.farm.window', { from: w.from, to: w.to })).join(', ') : t('admin.farm.never');
</script>

<Group title={t('admin.farm.ask')} hint={t('admin.farm.askHint')}>
  {#if farm.base === ''}
    <Note tone="warn">{t('admin.farm.noServer')}</Note>
  {/if}
  <textarea
    bind:value={farm.prompt}
    onkeydown={keydown}
    rows="4"
    maxlength={PROMPT_MAX}
    placeholder={t('admin.farm.placeholder')}
    aria-label={t('admin.farm.words')}
    disabled={farm.base === '' || farm.pending}></textarea>
  <div class="send">
    <span class="keys">{t('admin.farm.keys')}</span>
    <Button variant="primary" icon="leaf" disabled={!ready} onclick={make}>
      {farm.pending ? t('admin.farm.thinking') : t('admin.farm.make')}
    </Button>
  </div>
  {#if question}
    <div class="question" role="status">
      <Note tone="warn">
        {question.plant ? t('admin.farm.unknown', { plant: question.plant }) : t('admin.farm.which')}
      </Note>
      <div class="chips" role="group" aria-label={t('admin.farm.pick')}>
        {#each question.known as plant (plant.name)}
          <Chip tone="accent" onclick={() => choose(plant.name)}>{plant.names[preferences.lang]}</Chip>
        {/each}
      </div>
    </div>
  {/if}
  {#if farm.error && farm.detail}
    <Note tone="error">{t(`admin.farm.err.${farm.error}` as Key)} <span class="detail">{farm.detail}</span></Note>
  {/if}
</Group>

<Group title={t('admin.farm.recipe')} hint={recipe ? undefined : t('admin.farm.none')}>
  {#if recipe}
    <div class="stats">
      <Stat size="sm" label={t('admin.farm.plant')} value={null} text={recipe.names[preferences.lang]} />
      <Stat size="sm" label={t('admin.farm.light')} value={recipe.light_target} digits={0} unit="mol/m²" title={t('admin.farm.lightHint')} />
      <Stat
        size="sm"
        label={t('admin.farm.temp')}
        value={recipe.max_temp}
        digits={0}
        unit="°C"
        text={recipe.max_temp === null ? t('admin.farm.tempNone') : undefined} />
    </div>
    <p class="table" title={recipe.source}>{t('admin.farm.fromTable')}</p>

    <div class="day">
      <span class="label">{t('admin.farm.day')}</span>
      <div class="bar" role="img" aria-label={t('admin.farm.dayLabel')}>
        {#each recipe.avoid_sun as w (w.from)}
          <span class="seg avoid" style:left="{span(w).left}%" style:width="{span(w).width}%"></span>
        {/each}
        {#each recipe.power_first as w (w.from)}
          <span class="seg power" style:left="{span(w).left}%" style:width="{span(w).width}%"></span>
        {/each}
      </div>
      <div class="ticks" aria-hidden="true">
        {#each [0, 6, 12, 18, 24] as hour (hour)}<span>{hour}</span>{/each}
      </div>
      <dl class="windows">
        <dt><span class="swatch avoid"></span>{t('admin.farm.avoid')}</dt>
        <dd>{list(recipe.avoid_sun)}</dd>
        <dt><span class="swatch power"></span>{t('admin.farm.power')}</dt>
        <dd>{list(recipe.power_first)}</dd>
      </dl>
    </div>

  {/if}
</Group>

{#if recipe}
  <Group title={t('admin.farm.plan')} hint={plan?.date && plan.now ? t('admin.farm.plan.when', { date: plan.date, time: plan.now }) : undefined}>
    {#if plan}
      {#if plan.reachable !== null}
        <Note tone={plan.reachable ? 'ok' : 'warn'}>{plan.reachable ? t('admin.farm.plan.reach') : t('admin.farm.plan.short')}</Note>
      {/if}
      <div class="stats">
        <Stat size="sm" label={t('admin.farm.plan.dli')} value={plan.light.dli} digits={1} unit="mol/m²" title={t('admin.farm.plan.dliHint')} />
        <Stat size="sm" label={t('admin.farm.plan.cost')} value={plan.revenue.cost} digits={0} unit="€/ha" title={t('admin.farm.plan.costHint')} />
        <Stat size="sm" label={t('admin.farm.plan.share')} value={share} digits={1} unit="%" />
      </div>
      {#if band}
        <p class="table">
          {t('admin.farm.plan.band', { lo: fmt(band[0], 1) ?? '', hi: fmt(band[2], 1) ?? '', target: fmt(plan.light.target ?? recipe.light_target, 1) ?? '' })}
        </p>
      {/if}
      {#if plan.hours.length > 0}
        <table class="hours">
          <thead>
            <tr>
              <th scope="col">{t('admin.farm.plan.hour')}</th>
              <th scope="col">{t('admin.farm.plan.offset')}</th>
              <th scope="col">{t('admin.farm.plan.why')}</th>
            </tr>
          </thead>
          <tbody>
            {#each plan.hours as hour (hour.from)}
              <tr class:bound={inBlock(hour, plan.block)}>
                <td>{t('admin.farm.window', { from: hour.from, to: hour.to })}</td>
                <td class="num">{hour.offset === null ? '' : `${fmt(hour.offset, 0)}°`}</td>
                <td>{reasonText(hour.why, t)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
      {#if plan.block}
        <p class="table"><span class="swatch bound"></span>{t('admin.farm.plan.block', { from: plan.block.from, to: plan.block.to })}</p>
      {/if}
    {:else}
      <Note>{t('admin.farm.plan.none')}</Note>
    {/if}
    {#if farm.planPage}
      <div class="send">
        <Button size="sm" icon="external" href={farm.planPage}>{t('admin.farm.plan.open')}</Button>
      </div>
    {/if}
  </Group>
{/if}

<style>
  textarea {
    width: 100%;
    min-height: 76px;
    padding: 6px 8px;
    font: inherit;
    font-size: 12.5px;
    line-height: 1.45;
    color: var(--text-primary);
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    outline: none;
    resize: vertical;
  }

  textarea:focus {
    border-color: var(--accent-ink);
  }

  textarea::placeholder {
    color: var(--text-muted);
  }

  textarea:disabled {
    opacity: 0.6;
  }

  .send {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
  }

  .keys,
  .label {
    font-size: 11px;
    color: var(--text-muted);
  }

  .detail {
    color: var(--text-muted);
    overflow-wrap: anywhere;
  }

  .table {
    font-size: 11px;
    color: var(--text-muted);
  }

  .question {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .stats {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px 10px;
  }

  .day {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .bar {
    position: relative;
    height: 14px;
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    overflow: hidden;
  }

  .seg {
    position: absolute;
    top: 0;
    bottom: 0;
  }

  /* the plant's hours sit on the lower half, power on the upper, so overlaps stay readable */
  .seg.avoid {
    top: 50%;
  }

  .seg.power {
    bottom: 50%;
  }

  .avoid {
    background: var(--success);
  }

  .power {
    background: var(--accent);
  }

  .ticks {
    display: flex;
    justify-content: space-between;
    font-size: 10px;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
  }

  .windows {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 2px 10px;
    margin-top: 4px;
    font-size: 12px;
  }

  dt {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--text-muted);
  }

  dd {
    color: var(--text-primary);
    font-variant-numeric: tabular-nums;
  }

  .swatch {
    width: 8px;
    height: 8px;
    border-radius: 2px;
    flex-shrink: 0;
  }

  .hours {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }

  .hours th {
    font-size: 11px;
    font-weight: normal;
    text-align: left;
    color: var(--text-muted);
    padding: 0 6px 4px;
  }

  .hours td {
    padding: 3px 6px;
    color: var(--text-primary);
    border-top: 1px solid var(--border);
  }

  .hours .num {
    text-align: right;
    white-space: nowrap;
  }

  .hours th:nth-child(2) {
    text-align: right;
  }

  /* the binding block keeps an accent bar on its left */
  .hours tr.bound td {
    background: var(--accent-dim);
  }

  .hours tr.bound td:first-child {
    box-shadow: inset 2px 0 0 var(--accent);
  }

  .swatch.bound {
    display: inline-block;
    margin-right: 6px;
    background: var(--accent);
  }
</style>

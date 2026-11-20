<script lang="ts">
  // the farmer's words become a recipe: a language model on the recipe server
  // reads the plant's name and the hours where the plant or the power comes
  // first, the plant table adds light target and highest temperature. a plant
  // the table does not know is asked back with the known ones as chips. nothing
  // here moves the tracker, the plan that follows the recipe comes later
  import { onMount } from 'svelte';
  import Group from '../parts/Group.svelte';
  import Note from '../parts/Note.svelte';
  import Stat from '$lib/ui/Stat.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Chip from '$lib/ui/Chip.svelte';
  import { farm } from '$lib/farm/farm.svelte';
  import { PROMPT_MAX } from '$lib/farm/client';
  import { minutes, type Window } from '$lib/farm/recipe';
  import { preferences } from '$lib/stores/preferences.svelte';
  import { toast } from '$lib/stores/toasts.svelte';
  import { t, type Key } from '$lib/i18n';

  onMount(() => void farm.init());

  const recipe = $derived(farm.recipe);
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
</style>

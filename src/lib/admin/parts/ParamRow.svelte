<script lang="ts">
  // one tunable: name, slider with number field, a plain sentence and a way
  // back to the default. a change goes out a quarter second after the hand
  // stops and counts as done once the cfg push of the tracker shows it
  import Slider from '$lib/ui/Slider.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Note from './Note.svelte';
  import { fmt, t, type Key } from '$lib/i18n';
  import type { Param, ParamKey } from '$lib/link/protocol';
  import { setCommand } from '../commands';
  import { check, decimals, defaultValue, isKnown, sameValue, UNITS } from '../params';
  import { debounce } from '../timing';
  import { runner } from '../session.svelte';

  let {
    key,
    param,
    params,
    disabled = false
  }: {
    key: string;
    param: Param;
    params: Record<string, Param>;
    disabled?: boolean;
  } = $props();

  // shown while a change is on its way, the config value otherwise
  let draft = $state<number | null>(null);
  // sent and not yet seen in a cfg push
  let sent = $state<number | null>(null);
  let queued = $state(false);
  let clash = $state<ParamKey | null>(null);
  let confirmed = $state(false);
  let flash: ReturnType<typeof setTimeout> | null = null;
  let giveUp: ReturnType<typeof setTimeout> | null = null;

  const known = $derived(isKnown(key));
  const shown = $derived(draft ?? param.v);
  const places = $derived(decimals(param.step));
  const unit = $derived(known ? UNITS[key as ParamKey] : '');
  const fallback = $derived(defaultValue(key, param));
  const changed = $derived(fallback !== null && !sameValue(shown, fallback, param));
  const busy = $derived(queued || sent !== null);
  const name = $derived(known ? t(`admin.param.${key}` as Key) : key);
  const hint = $derived(known ? t(`admin.param.${key}.hint` as Key) : '');

  const push = debounce(async (value: number) => {
    queued = false;
    sent = value;
    const ack = await runner.run(setCommand(key as ParamKey, value), { key: `set.${key}`, feature: 'set' });
    if (!ack.ok) {
      sent = null;
      draft = null;
      return;
    }
    // a tracker that never pushes cfg must not leave the slider hanging
    if (giveUp) clearTimeout(giveUp);
    giveUp = setTimeout(() => {
      if (sent === value) {
        sent = null;
        if (!queued) draft = null;
      }
    }, 3000);
  }, 250);

  $effect(() => {
    if (sent === null || !sameValue(param.v, sent, param)) return;
    sent = null;
    if (!queued) draft = null;
    confirmed = true;
    if (flash) clearTimeout(flash);
    flash = setTimeout(() => (confirmed = false), 1500);
  });

  $effect(() => () => {
    push.flush();
    if (flash) clearTimeout(flash);
    if (giveUp) clearTimeout(giveUp);
  });

  function change(value: number, done: boolean) {
    const result = check(key, value, params);
    draft = result.value;
    if (!result.ok) {
      clash = result.other;
      queued = false;
      push.cancel();
      return;
    }
    clash = null;
    queued = true;
    push.call(result.value);
    if (done) push.flush();
  }

  function reset() {
    if (fallback !== null) change(fallback, true);
  }
</script>

<div class="param" class:disabled>
  <div class="top">
    <span class="name">{name}</span>
    <code class="key">{key}</code>
    <span class="state" aria-live="polite">
      {#if busy}
        <span class="dot" title={t('admin.tune.sending')}></span>
        <span class="sr">{t('admin.tune.sending')}</span>
      {:else if confirmed}
        <span class="ok" title={t('admin.tune.saved')}><Icon name="check" size={12} /></span>
        <span class="sr">{t('admin.tune.saved')}</span>
      {/if}
    </span>
    {#if changed}
      <button
        class="reset"
        {disabled}
        title={t('admin.tune.reset', { value: `${fmt(fallback, places)}${unit}` })}
        aria-label="{t('admin.tune.reset', { value: `${fmt(fallback, places)}${unit}` })}, {name}"
        onclick={reset}>
        <Icon name="undo" size={12} />
      </button>
    {/if}
  </div>
  <Slider
    value={shown}
    min={param.min}
    max={param.max}
    step={param.step}
    precision={places}
    {unit}
    label={name}
    {disabled}
    oninput={(value) => change(value, false)}
    onchange={(value) => change(value, true)} />
  {#if hint}<p class="hint">{hint}</p>{/if}
  {#if clash}
    <Note tone="warn">
      {t(key === 'dead_in' ? 'admin.tune.below' : 'admin.tune.above', {
        other: t(`admin.param.${clash}` as Key),
        value: fmt(params[clash]?.v, decimals(params[clash]?.step ?? 0.001)) ?? ''
      })}
    </Note>
  {/if}
</div>

<style>
  .param {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .top {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 20px;
  }

  .name {
    font-size: 12px;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .key {
    font-size: 10px;
    color: var(--text-muted);
  }

  .state {
    display: flex;
    align-items: center;
    flex: 1;
  }

  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--accent);
    animation: pulse 1s infinite;
  }

  .ok {
    display: flex;
    color: var(--success);
  }

  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .reset {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    color: var(--text-muted);
    flex-shrink: 0;
  }

  .reset:hover:not(:disabled) {
    color: var(--text-primary);
    background: var(--bg-hover);
  }

  .hint {
    font-size: 11px;
    line-height: 1.45;
    color: var(--text-muted);
  }

  .disabled {
    opacity: 0.6;
  }

  @media (pointer: coarse) {
    .reset {
      width: 40px;
      height: 40px;
    }
  }
</style>

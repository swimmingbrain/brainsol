<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Note from './Note.svelte';
  import { t } from '$lib/i18n';
  import type { IconName } from '$lib/ui/Icon.svelte';
  import type { StepResult } from '../session.svelte';

  // one step of the guided calibration: what to do, the button that does it
  // and what came out
  let {
    n,
    title,
    text,
    action,
    icon,
    result,
    next = false,
    disabled = false,
    onrun,
    extra
  }: {
    n: number;
    title: string;
    text: string;
    action: string;
    icon: IconName;
    result?: StepResult;
    next?: boolean;
    disabled?: boolean;
    onrun: () => void;
    extra?: Snippet;
  } = $props();

  const running = $derived(result?.state === 'running');
</script>

<li class="step" class:next class:done={result?.state === 'done'}>
  <span class="badge {result?.state ?? ''}" aria-hidden="true">
    {#if result?.state === 'done'}
      <Icon name="check" size={12} />
    {:else if result?.state === 'failed'}
      <Icon name="warning" size={12} />
    {:else}
      {n}
    {/if}
  </span>
  <div class="content">
    <h4>{title}</h4>
    <p class="text">{text}</p>
    {#if extra}{@render extra()}{/if}
    <div class="row">
      <Button size="sm" variant={next ? 'primary' : 'secondary'} {icon} disabled={disabled || running} onclick={onrun}>
        {running ? t('admin.calib.running') : action}
      </Button>
    </div>
    {#if result && result.state !== 'running' && result.note}
      <Note tone={result.tone ?? (result.state === 'failed' ? 'warn' : 'ok')}>{result.note}</Note>
    {/if}
    {#if result?.detail}
      <p class="detail">{t('admin.calib.says', { text: result.detail })}</p>
    {/if}
  </div>
</li>

<style>
  .step {
    display: grid;
    grid-template-columns: 20px minmax(0, 1fr);
    gap: 10px;
    padding: 10px 0;
    border-top: 1px solid var(--border);
    list-style: none;
  }

  .step:first-child {
    border-top: none;
    padding-top: 2px;
  }

  .badge {
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    color: var(--text-muted);
    border: 1px solid var(--border);
    border-radius: 50%;
  }

  .next .badge {
    color: var(--accent-ink);
    border-color: var(--accent-ink);
  }

  .badge.done {
    color: var(--success);
    border-color: var(--success);
  }

  .badge.failed {
    color: var(--warning);
    border-color: var(--warning);
  }

  .badge.running {
    animation: pulse 1s infinite;
  }

  .content {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }

  h4 {
    font-size: 13.5px;
    color: var(--text-strong);
    line-height: 20px;
  }

  .text {
    font-size: 12px;
    line-height: 1.45;
    color: var(--text-secondary);
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .detail {
    font-size: 11px;
    line-height: 1.4;
    color: var(--text-muted);
    overflow-wrap: anywhere;
  }
</style>

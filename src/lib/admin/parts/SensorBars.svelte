<script lang="ts">
  // the four raw light readings as bars, live. a thin mark shows where the
  // dark and the bright capture landed, so the span between them is visible
  import { fmt, t, type Key } from '$lib/i18n';
  import { barLevel, SENSORS } from '../calib';

  let {
    raw,
    dark = null,
    bright = null
  }: {
    raw: (number | null)[] | null;
    dark?: number[] | null;
    bright?: number[] | null;
  } = $props();

  const pct = (n: number | null | undefined) => {
    const level = barLevel(n);
    return level === null ? null : `${level * 100}%`;
  };
</script>

<div class="bars" role="group" aria-label={t('admin.calib.bars')}>
  {#each SENSORS as name, i (name)}
    {@const value = raw?.[i] ?? null}
    {@const fill = pct(value)}
    <div class="row">
      <span class="name" title={t(`admin.calib.sensor.${name}` as Key)}>{name}</span>
      <div class="track">
        {#if fill !== null}<span class="fill" style="width: {fill}"></span>{/if}
        {#if pct(dark?.[i]) !== null}<span class="mark dark" style="left: {pct(dark?.[i])}" title={t('admin.calib.darkMark')}></span>{/if}
        {#if pct(bright?.[i]) !== null}<span class="mark bright" style="left: {pct(bright?.[i])}" title={t('admin.calib.brightMark')}></span>{/if}
      </div>
      <span class="value">{fmt(value, 0) ?? '...'}</span>
    </div>
  {/each}
  <div class="legend">
    <span><i class="key dark"></i>{t('admin.calib.darkMark')}</span>
    <span><i class="key bright"></i>{t('admin.calib.brightMark')}</span>
    <span class="max">{t('admin.calib.range')}</span>
  </div>
</div>

<style>
  .bars {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .row {
    display: grid;
    grid-template-columns: 14px minmax(0, 1fr) 44px;
    align-items: center;
    gap: 8px;
  }

  .name {
    font-family: var(--font-editor);
    font-size: 11px;
    color: var(--text-muted);
  }

  .track {
    position: relative;
    height: 10px;
    background: var(--chart-track);
    border-radius: 1px;
  }

  .fill {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    background: var(--chart-1);
    border-radius: 1px;
    transition: width 0.1s linear;
  }

  .mark {
    position: absolute;
    top: -3px;
    bottom: -3px;
    width: 2px;
    margin-left: -1px;
  }

  .mark.dark,
  .key.dark {
    background: var(--text-muted);
  }

  .mark.bright,
  .key.bright {
    background: var(--accent);
  }

  .value {
    font-family: var(--font-editor);
    font-size: 11px;
    text-align: right;
    color: var(--text-secondary);
    font-variant-numeric: tabular-nums;
  }

  .legend {
    display: flex;
    gap: 12px;
    padding-left: 22px;
    font-size: 10.5px;
    color: var(--text-muted);
  }

  .legend span {
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .key {
    display: inline-block;
    width: 2px;
    height: 10px;
  }

  .max {
    margin-left: auto;
    font-family: var(--font-editor);
  }
</style>

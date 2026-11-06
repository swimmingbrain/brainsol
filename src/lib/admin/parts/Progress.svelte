<script lang="ts">
  // a thin bar for how far an activity got, with a short text beside it
  let {
    share,
    label,
    text = ''
  }: {
    // 0 to 1
    share: number;
    label: string;
    text?: string;
  } = $props();

  const pct = $derived(Math.round(Math.min(1, Math.max(0, Number.isFinite(share) ? share : 0)) * 100));
</script>

<div class="progress">
  <div class="track" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
    <span class="fill" style="width: {pct}%"></span>
  </div>
  {#if text}<span class="text">{text}</span>{/if}
</div>

<style>
  .progress {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .track {
    flex: 1;
    height: 4px;
    background: var(--chart-track);
    border-radius: 2px;
    overflow: hidden;
  }

  .fill {
    display: block;
    height: 100%;
    background: var(--accent);
    transition: width 0.15s linear;
  }

  .text {
    font-size: 11px;
    color: var(--text-muted);
    white-space: nowrap;
  }
</style>

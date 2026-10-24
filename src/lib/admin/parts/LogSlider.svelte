<script lang="ts">
  // the shared slider on a log scale, for light that spans four decades. the
  // number field next to it takes an exact value in lux
  import NumberField from '$lib/ui/NumberField.svelte';
  import { fromLogPos, toLogPos } from '../scale';

  let {
    value,
    min,
    max,
    unit = '',
    disabled = false,
    label,
    oninput,
    onchange
  }: {
    value: number;
    // the smallest value above zero and the largest
    min: number;
    max: number;
    unit?: string;
    disabled?: boolean;
    label: string;
    oninput: (value: number) => void;
    onchange: (value: number) => void;
  } = $props();

  const STEPS = 1000;
  const pos = $derived(Math.round(toLogPos(value, min, max) * STEPS));
</script>

<div class="slider-row" class:disabled>
  <input
    class="slider"
    type="range"
    min="0"
    max={STEPS}
    step="1"
    value={pos}
    {disabled}
    aria-label={label}
    aria-valuetext="{value}{unit}"
    style="--fill: {(pos / STEPS) * 100}%"
    oninput={(e) => oninput(fromLogPos(Number(e.currentTarget.value) / STEPS, min, max))}
    onchange={(e) => onchange(fromLogPos(Number(e.currentTarget.value) / STEPS, min, max))} />
  <div class="number">
    <NumberField {value} min={0} {max} step={1} precision={0} {unit} {disabled} {label} {onchange} {oninput} />
  </div>
</div>

<style>
  /* the same look as the shared slider */
  .slider-row {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
  }

  .number {
    width: 72px;
    flex-shrink: 0;
  }

  .slider {
    flex: 1;
    min-width: 0;
    height: 14px;
    appearance: none;
    background: none;
    outline: none;
    cursor: pointer;
  }

  .slider::-webkit-slider-runnable-track {
    height: 3px;
    background: linear-gradient(to right, var(--accent) var(--fill), var(--border) var(--fill));
  }

  .slider::-moz-range-track {
    height: 3px;
    background: linear-gradient(to right, var(--accent) var(--fill), var(--border) var(--fill));
  }

  .slider::-webkit-slider-thumb {
    appearance: none;
    width: 9px;
    height: 13px;
    margin-top: -5px;
    background: var(--text-secondary);
    border: none;
  }

  .slider::-moz-range-thumb {
    width: 9px;
    height: 13px;
    background: var(--text-secondary);
    border: none;
    border-radius: 0;
  }

  .slider:hover::-webkit-slider-thumb {
    background: var(--accent);
  }

  .slider:hover::-moz-range-thumb {
    background: var(--accent);
  }

  .slider:focus-visible::-webkit-slider-thumb {
    background: var(--accent);
  }

  .slider-row.disabled {
    opacity: 0.4;
  }
</style>

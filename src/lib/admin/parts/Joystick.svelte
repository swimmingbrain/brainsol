<script lang="ts">
  // a round pad with a knob. dragging the knob or holding the arrow keys sends
  // pan and tilt rates about ten times a second, letting go, losing the pointer,
  // leaving the tab or a blur sends one zero. the tracker also stops by itself
  // when the rates stop coming
  import { clampOffset, isStickKey, keyVector, padVector, RateStream, ZERO, type Vec } from '../stick';
  import { fmt, t } from '$lib/i18n';

  let {
    onrate,
    disabled = false,
    label
  }: {
    onrate: (v: Vec) => void;
    disabled?: boolean;
    label: string;
  } = $props();

  let pad = $state<HTMLDivElement | null>(null);
  let knobEl = $state<HTMLSpanElement | null>(null);
  let knob = $state<Vec>(ZERO);
  let rate = $state<Vec>(ZERO);
  let dragging = $state(false);
  let pointer: number | null = null;
  const keys = new Set<string>();

  const stream = new RateStream((v) => onrate(v));

  function radius(): number {
    // the centre of the knob may travel up to the ring, a phone has a bigger knob
    return pad ? pad.clientWidth / 2 - (knobEl?.offsetWidth ?? 30) / 2 : 1;
  }

  function aim(dx: number, dy: number) {
    const r = radius();
    knob = clampOffset(dx, dy, r);
    rate = padVector(dx, dy, r);
    stream.set(rate);
  }

  function release() {
    pointer = null;
    dragging = false;
    keys.clear();
    knob = ZERO;
    rate = ZERO;
    stream.release();
  }

  function onpointerdown(e: PointerEvent) {
    if (disabled || !pad || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    pad.setPointerCapture(e.pointerId);
    pad.focus({ preventScroll: true });
    pointer = e.pointerId;
    dragging = true;
    move(e);
  }

  function move(e: PointerEvent) {
    if (e.pointerId !== pointer || !pad) return;
    const box = pad.getBoundingClientRect();
    aim(e.clientX - (box.left + box.width / 2), e.clientY - (box.top + box.height / 2));
  }

  function end(e: PointerEvent) {
    if (e.pointerId === pointer) release();
  }

  function fromKeys(slow: boolean) {
    const v = keyVector(keys, slow);
    const r = radius();
    knob = { x: v.x * r, y: -v.y * r };
    rate = v;
    stream.set(v);
  }

  function onkeydown(e: KeyboardEvent) {
    if (disabled) return;
    if (e.key === 'Escape' && (keys.size > 0 || dragging)) {
      e.preventDefault();
      release();
      return;
    }
    if (!isStickKey(e.key)) return;
    e.preventDefault();
    if (e.repeat && keys.has(e.key)) return;
    keys.add(e.key);
    fromKeys(e.shiftKey);
  }

  function onkeyup(e: KeyboardEvent) {
    if (!isStickKey(e.key) && e.key !== 'Shift') return;
    keys.delete(e.key);
    if (keys.size === 0 && !dragging) release();
    else if (!dragging) fromKeys(e.shiftKey);
  }

  $effect(() => {
    // a phone that locks or a tab that hides must not leave the head running
    const hide = () => release();
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('blur', hide);
    return () => {
      document.removeEventListener('visibilitychange', hide);
      window.removeEventListener('blur', hide);
      stream.release();
    };
  });

  $effect(() => {
    if (disabled) release();
  });

  const speed = (n: number) => fmt(n * 100, 0) ?? '0';
</script>

<div class="stick">
  <!-- no aria role is a two axis control, application hands the keys to the pad -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    bind:this={pad}
    class="pad"
    class:dragging
    class:disabled
    role="application"
    aria-roledescription={t('admin.stick.role')}
    aria-label={label}
    aria-describedby="admin-stick-help"
    aria-disabled={disabled}
    tabindex={disabled ? -1 : 0}
    {onpointerdown}
    onpointermove={move}
    onpointerup={end}
    onpointercancel={end}
    onlostpointercapture={end}
    {onkeydown}
    {onkeyup}
    onblur={() => !dragging && release()}>
    <svg class="marks" viewBox="-50 -50 100 100" aria-hidden="true">
      <circle r="49" class="ring" />
      <circle r="24" class="ring inner" />
      <path d="M -49 0 H 49 M 0 -49 V 49" class="cross" />
    </svg>
    <span class="arrow up" aria-hidden="true"></span>
    <span class="arrow down" aria-hidden="true"></span>
    <span class="arrow left" aria-hidden="true"></span>
    <span class="arrow right" aria-hidden="true"></span>
    <span class="knob" bind:this={knobEl} style="transform: translate({knob.x}px, {knob.y}px)"></span>
  </div>
  <p class="readout" aria-live="off">
    <span>{t('admin.stick.pan')} <b>{speed(rate.x)}%</b></span>
    <span>{t('admin.stick.tilt')} <b>{speed(rate.y)}%</b></span>
  </p>
  <p id="admin-stick-help" class="help">{t('admin.stick.help')}</p>
</div>

<style>
  .stick {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  .pad {
    position: relative;
    width: 100%;
    max-width: 156px;
    aspect-ratio: 1;
    border-radius: 50%;
    background: var(--bg-deep);
    border: 1px solid var(--border);
    /* the page must not scroll while a thumb steers */
    touch-action: none;
    user-select: none;
    cursor: grab;
    outline: none;
  }

  .pad:focus-visible {
    border-color: var(--accent);
  }

  .pad.dragging {
    cursor: grabbing;
    border-color: var(--accent);
  }

  .pad.disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .marks {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }

  .ring {
    fill: none;
    stroke: var(--border);
    stroke-width: 0.6;
  }

  .ring.inner {
    stroke-dasharray: 1.5 2.5;
  }

  .cross {
    stroke: var(--border);
    stroke-width: 0.6;
  }

  .arrow {
    position: absolute;
    width: 0;
    height: 0;
    border: 4px solid transparent;
  }

  .arrow.up {
    top: 7px;
    left: calc(50% - 4px);
    border-bottom-color: var(--text-muted);
    border-top-width: 0;
  }

  .arrow.down {
    bottom: 7px;
    left: calc(50% - 4px);
    border-top-color: var(--text-muted);
    border-bottom-width: 0;
  }

  .arrow.left {
    left: 7px;
    top: calc(50% - 4px);
    border-right-color: var(--text-muted);
    border-left-width: 0;
  }

  .arrow.right {
    right: 7px;
    top: calc(50% - 4px);
    border-left-color: var(--text-muted);
    border-right-width: 0;
  }

  .knob {
    position: absolute;
    left: calc(50% - 15px);
    top: calc(50% - 15px);
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: var(--bg-hover);
    border: 1px solid var(--text-muted);
    pointer-events: none;
  }

  /* the knob springs back on release, it never lags behind a drag */
  .pad:not(.dragging) .knob {
    transition: transform 0.12s ease-out;
  }

  .pad.dragging .knob,
  .pad:focus-visible .knob {
    background: var(--accent-dim);
    border-color: var(--accent);
  }

  .readout {
    display: flex;
    gap: 12px;
    font-family: var(--font-editor);
    font-size: 10.5px;
    color: var(--text-muted);
  }

  .readout b {
    font-weight: 500;
    color: var(--text-secondary);
    font-variant-numeric: tabular-nums;
  }

  .help {
    font-size: 11px;
    line-height: 1.4;
    color: var(--text-muted);
    text-align: center;
  }

  @media (pointer: coarse) {
    .pad {
      max-width: 220px;
    }

    .knob {
      left: calc(50% - 22px);
      top: calc(50% - 22px);
      width: 44px;
      height: 44px;
    }
  }
</style>

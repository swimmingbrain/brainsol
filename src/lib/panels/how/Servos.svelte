<script lang="ts">
  // step three: the tracker from the side with its two servos. the panel
  // takes the tilt it has right now, the small dial seen from above the pan
  import { telemetry } from '$lib/stores/telemetry.svelte';
  import { t as say } from '$lib/i18n';

  const PIVOT = { x: 96, y: 62 };
  const HALF = 34;

  const tilt = $derived(telemetry.tilt ?? 90);
  const pan = $derived(telemetry.pan ?? 0);
  const t = $derived((tilt * Math.PI) / 180);
  // seen from the right side, forward is to the right and up is up
  const panel = $derived({
    x1: PIVOT.x + Math.sin(t) * HALF,
    y1: PIVOT.y + Math.cos(t) * HALF,
    x2: PIVOT.x - Math.sin(t) * HALF,
    y2: PIVOT.y - Math.cos(t) * HALF
  });
  const normal = $derived({ x: PIVOT.x + Math.cos(t) * 26, y: PIVOT.y - Math.sin(t) * 26 });
  const p = $derived((pan * Math.PI) / 180);
  const DIAL = { x: 182, y: 34, r: 16 };
  const needle = $derived({ x: DIAL.x + Math.sin(p) * (DIAL.r - 3), y: DIAL.y - Math.cos(p) * (DIAL.r - 3) });
</script>

<svg viewBox="0 0 220 130" aria-hidden="true">
  <!-- base, post and the pan servo with its turn -->
  <rect class="line" x="62" y="106" width="68" height="12" rx="2" />
  <path class="line" d="M96 106V78" />
  <rect class="servo" x="86" y="88" width="20" height="12" rx="2" />
  <path class="turn" d="M74 96a22 6 0 0 0 44 0" />
  <path class="turn" d="M113 99.6l5-3.6-1.4 5.6" />
  <text class="end" x="68" y="100">{say('q.pan')}</text>

  <!-- the tilt servo at the pivot and its turn -->
  <path class="turn" d="M74 50a24 24 0 0 1 10-12" />
  <path class="turn" d="M79 37l5 1-1.6 4.8" />
  <!-- left of every place the upper end of the panel can reach -->
  <text class="end" x="58" y="44">{say('q.tilt')}</text>
  <line class="panel" x1={panel.x1} y1={panel.y1} x2={panel.x2} y2={panel.y2} />
  <line class="normal" x1={PIVOT.x} y1={PIVOT.y} x2={normal.x} y2={normal.y} />
  <circle class="pivot" cx={PIVOT.x} cy={PIVOT.y} r="4" />

  <!-- seen from above: where pan points -->
  <circle class="line" cx={DIAL.x} cy={DIAL.y} r={DIAL.r} />
  <path class="tick" d="M{DIAL.x} {DIAL.y - DIAL.r}v4" />
  <line class="normal" x1={DIAL.x} y1={DIAL.y} x2={needle.x} y2={needle.y} />
  <circle class="pivot" cx={DIAL.x} cy={DIAL.y} r="2" />
  <text x={DIAL.x} y={DIAL.y + DIAL.r + 13} class="mid">{say('panels.how.fromAbove')}</text>
</svg>

<style>
  svg {
    display: block;
    width: 100%;
    height: auto;
  }

  .line,
  .turn,
  .tick {
    fill: none;
    stroke: var(--text-secondary);
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
  }

  .turn {
    stroke: var(--text-muted);
  }

  .servo {
    fill: var(--bg-elevated);
    stroke: var(--text-secondary);
    stroke-width: 1.5;
    vector-effect: non-scaling-stroke;
  }

  .panel {
    stroke: var(--text-primary);
    stroke-width: 5;
    stroke-linecap: round;
  }

  .normal {
    stroke: var(--accent);
    stroke-width: 1.5;
    stroke-linecap: round;
    vector-effect: non-scaling-stroke;
  }

  .pivot {
    fill: var(--bg-surface);
    stroke: var(--text-secondary);
    stroke-width: 1.5;
    vector-effect: non-scaling-stroke;
  }

  text {
    font-size: 11px;
    fill: var(--text-muted);
  }

  .mid {
    text-anchor: middle;
  }

  .end {
    text-anchor: end;
  }
</style>

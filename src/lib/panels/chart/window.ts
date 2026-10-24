// what a live chart draws, cut out of the history ring: the last span seconds,
// thinned to about as many points as the plot has pixels, with a break where
// the stream stopped. uplot draws a null as a gap and never bridges it

import type { HistoryColumn, Ring } from '$lib/stores/ring';

export interface Column {
  col: HistoryColumn;
  // a unit change for the plot, level 0 to 1 into percent for example
  map?: (value: number) => number;
}

export interface Window {
  // times first, then one array per column
  data: (number | null)[][];
  // the x range of the plot, the newest sample sits at the right edge
  min: number;
  max: number;
}

// a pause longer than this between two samples is a gap. the 1 Hz history of
// the tracker must still draw as a line, so it stays above one second
export const GAP = 2.5;

// scratch buffers, reused across ticks so a 10 Hz redraw allocates little
let times = new Float64Array(0);
const scratch = new Map<HistoryColumn, Float64Array>();

function buffer(col: HistoryColumn, n: number): Float64Array {
  let b = scratch.get(col);
  if (!b || b.length < n) {
    b = new Float64Array(Math.max(n, 256));
    scratch.set(col, b);
  }
  return b;
}

export function windowData(ring: Ring, columns: Column[], span: number, maxPoints = 600, gap = GAP): Window {
  const newest = ring.latest('time');
  const out: (number | null)[][] = [[], ...columns.map(() => [])];
  if (newest === null) {
    const now = Date.now() / 1000;
    return { data: out, min: now - span, max: now };
  }
  const min = newest - span;
  const start = ring.since(min);
  const n = ring.length - start;
  if (times.length < n) times = new Float64Array(Math.max(n, 256));
  const t = ring.copy('time', start, times);
  const values = columns.map((c) => {
    const raw = ring.copy(c.col, start, buffer(c.col, n));
    if (c.map) for (let i = 0; i < raw.length; i++) raw[i] = c.map(raw[i]);
    return raw;
  });

  const push = (time: number, row: (i: number) => number | null) => {
    out[0].push(time);
    for (let c = 0; c < columns.length; c++) out[c + 1].push(row(c));
  };
  const gapRow = () => null;

  if (n <= maxPoints) {
    for (let i = 0; i < n; i++) {
      if (i > 0 && t[i] - t[i - 1] > gap) push((t[i] + t[i - 1]) / 2, gapRow);
      push(t[i], (c) => (Number.isNaN(values[c][i]) ? null : values[c][i]));
    }
    return { data: out, min, max: newest };
  }

  // too many samples for the pixels: the mean of each time bucket. a bucket
  // that only holds missing values stays missing, a pause stays a gap
  const width = span / maxPoints;
  const sums = new Float64Array(columns.length);
  const counts = new Uint32Array(columns.length);
  let bucket = -1;
  let timeSum = 0;
  let timeCount = 0;
  const flush = () => {
    if (timeCount === 0) return;
    push(timeSum / timeCount, (c) => (counts[c] > 0 ? sums[c] / counts[c] : null));
    sums.fill(0);
    counts.fill(0);
    timeSum = 0;
    timeCount = 0;
  };
  for (let i = 0; i < n; i++) {
    const b = Math.floor((t[i] - min) / width);
    const paused = i > 0 && t[i] - t[i - 1] > gap;
    if (b !== bucket || paused) {
      flush();
      if (paused) push((t[i] + t[i - 1]) / 2, gapRow);
      bucket = b;
    }
    timeSum += t[i];
    timeCount++;
    for (let c = 0; c < columns.length; c++) {
      const v = values[c][i];
      if (!Number.isNaN(v)) {
        sums[c] += v;
        counts[c]++;
      }
    }
  }
  flush();
  return { data: out, min, max: newest };
}

// the newest value of a column in a window that is not missing
export function lastValue(series: (number | null)[]): number | null {
  for (let i = series.length - 1; i >= 0; i--) if (series[i] !== null) return series[i];
  return null;
}

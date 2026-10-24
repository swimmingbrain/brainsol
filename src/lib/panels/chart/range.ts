// the y range of a chart: round numbers around the data, a few fixed walls
// where a quantity has them, and a smallest span so noise never fills the plot

export interface RangeSpec {
  // hard walls, the range never goes past them
  min?: number;
  max?: number;
  // values the range always includes, 0 for a quantity that starts there
  include?: number[];
  // the smallest span shown, so a flat line stays flat
  minSpan?: number;
  // the same distance above and below zero, for errors
  symmetric?: boolean;
}

const STEPS = [1, 2, 2.5, 5, 10];

// a round step close to raw, 1, 2, 2.5 or 5 times a power of ten
export function niceStep(raw: number): number {
  if (!(raw > 0) || !Number.isFinite(raw)) return 1;
  const power = 10 ** Math.floor(Math.log10(raw));
  const m = raw / power;
  for (const step of STEPS) if (m <= step + 1e-9) return step * power;
  return 10 * power;
}

// how many decimals the labels of a tick step need, 0.25 needs two
export function stepDecimals(step: number): number {
  if (!(step > 0) || !Number.isFinite(step)) return 0;
  for (let d = 0; d < 6; d++) {
    const scaled = step * 10 ** d;
    if (Math.abs(scaled - Math.round(scaled)) < 1e-6) return d;
  }
  return 6;
}

export function niceRange(dataMin: number | null, dataMax: number | null, spec: RangeSpec = {}, ticks = 4): [number, number] {
  let lo = dataMin !== null && Number.isFinite(dataMin) ? dataMin : NaN;
  let hi = dataMax !== null && Number.isFinite(dataMax) ? dataMax : NaN;
  for (const value of spec.include ?? []) {
    lo = Number.isNaN(lo) ? value : Math.min(lo, value);
    hi = Number.isNaN(hi) ? value : Math.max(hi, value);
  }
  if (Number.isNaN(lo) || Number.isNaN(hi)) {
    lo = spec.min ?? 0;
    hi = spec.max ?? lo + (spec.minSpan ?? 1);
  }
  if (spec.symmetric) {
    const m = Math.max(Math.abs(lo), Math.abs(hi));
    lo = -m;
    hi = m;
  }
  const span = spec.minSpan ?? 0;
  if (hi - lo < span) {
    const mid = (hi + lo) / 2;
    lo = mid - span / 2;
    hi = mid + span / 2;
    // a quantity with a wall keeps its span inside it
    if (spec.min !== undefined && lo < spec.min) {
      hi += spec.min - lo;
      lo = spec.min;
    }
    if (spec.max !== undefined && hi > spec.max) {
      lo -= hi - spec.max;
      hi = spec.max;
    }
  }
  if (hi === lo) {
    hi += 0.5;
    lo -= 0.5;
  }
  // a little air above and below, then out to the next round tick
  const pad = (hi - lo) * 0.06;
  const step = niceStep((hi - lo + 2 * pad) / Math.max(1, ticks - 1));
  let a = Math.floor((lo - pad) / step) * step;
  let b = Math.ceil((hi + pad) / step) * step;
  if (lo >= 0 && a < 0) a = 0;
  if (hi <= 0 && b > 0) b = 0;
  if (spec.symmetric) {
    const m = Math.max(Math.abs(a), Math.abs(b));
    a = -m;
    b = m;
  }
  if (spec.min !== undefined) a = Math.max(a, spec.min);
  if (spec.max !== undefined) b = Math.min(b, spec.max);
  return [a + 0, b + 0];
}

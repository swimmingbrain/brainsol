// the sky map of a scan as a heat map: which step of the ramp each cell gets,
// how far the scan got and where the light is brightest

import type { ScanMessage } from '$lib/link/protocol';

// the ramp has five steps, --heat-1 to --heat-5
export const HEAT_STEPS = 5;

export interface Range {
  min: number;
  max: number;
}

export function valueRange(v: (number | null)[][]): Range | null {
  let min = Infinity;
  let max = -Infinity;
  for (const row of v) {
    for (const value of row) {
      if (value === null || !Number.isFinite(value)) continue;
      if (value < min) min = value;
      if (value > max) max = value;
    }
  }
  return Number.isFinite(min) ? { min, max } : null;
}

// 0 for the darkest step, 4 for the brightest, null for a cell not visited yet.
// a map where every cell reads the same is all bright, there is nothing to rank
export function heatStep(value: number | null, range: Range | null): number | null {
  if (value === null || !Number.isFinite(value) || !range) return null;
  if (range.max - range.min <= 1e-9) return HEAT_STEPS - 1;
  const share = (value - range.min) / (range.max - range.min);
  return Math.min(HEAT_STEPS - 1, Math.max(0, Math.floor(share * HEAT_STEPS)));
}

export interface Progress {
  visited: number;
  total: number;
  share: number;
}

export function progress(scan: ScanMessage | null): Progress {
  if (!scan) return { visited: 0, total: 0, share: 0 };
  const total = scan.pan.length * scan.tilt.length;
  let visited = 0;
  for (const row of scan.v) for (const value of row) if (value !== null) visited++;
  return { visited, total, share: total > 0 ? visited / total : 0 };
}

// the best cell the tracker named, or the brightest one found here
export function brightest(scan: ScanMessage | null): { pan: number; tilt: number; v: number } | null {
  if (!scan) return null;
  if (scan.best) return scan.best;
  let best: { pan: number; tilt: number; v: number } | null = null;
  scan.v.forEach((row, i) =>
    row.forEach((value, j) => {
      if (value !== null && (!best || value > best.v)) best = { pan: scan.pan[j], tilt: scan.tilt[i], v: value };
    })
  );
  return best;
}

// the index of the grid line closest to an angle, to mark where the head is
export function nearest(axis: number[], angle: number | null): number | null {
  if (angle === null || axis.length === 0) return null;
  let index = 0;
  for (let i = 1; i < axis.length; i++) if (Math.abs(axis[i] - angle) < Math.abs(axis[index] - angle)) index = i;
  return index;
}

// a scan runs while the tracker reports it as its activity. before the first
// sys frame the scan message itself is all there is
export function scanRunning(scan: ScanMessage | null, act: string | null | undefined): boolean {
  if (act !== undefined) return act === 'scan';
  return scan !== null && !scan.done;
}

// every second axis label when the grid is dense, so they do not run together
export function labelEvery(count: number): number {
  return count > 9 ? 2 : 1;
}

// the sky map of a scan as patches on the sky sphere. cell (tilt[i], pan[j])
// is where the panel looked at that pose, the direction n(pan, tilt) of
// section 3, so the rear half of the sky comes from the poses over the top.
// a patch spans half the way to its neighbours and leaves a small gap, like the
// marks of a chart. two poses whose patches lie on top of each other, pan 90
// and pan -90 over the top, share one. the poses at tilt 90 all look up but
// each covers its own slice around the zenith, so they stay apart

import type { ScanMessage } from '$lib/link/protocol';
import { normal, type Vec3 } from '$lib/sim/kinematics';

export interface SkyCell {
  key: string;
  // the light measured there, the mean of all poses that look the same way
  value: number;
  // 0 for the darkest cell of this scan, 1 for the brightest
  level: number;
  // (sub + 1) by (sub + 1) unit directions, row by row from low tilt, low pan
  corners: Vec3[];
  centre: Vec3;
}

export interface SkyMap {
  cells: SkyCell[];
  best: Vec3 | null;
  sub: number;
}

function halves(axis: number[], k: number): [number, number] {
  const left = k > 0 ? (axis[k] - axis[k - 1]) / 2 : NaN;
  const right = k < axis.length - 1 ? (axis[k + 1] - axis[k]) / 2 : NaN;
  const l = Number.isFinite(left) ? left : Number.isFinite(right) ? right : 7.5;
  const r = Number.isFinite(right) ? right : l;
  return [Math.abs(l), Math.abs(r)];
}

function keyOf(d: Vec3): string {
  return d.map((c) => (Math.round(c * 1000) / 1000 + 0).toFixed(3)).join(',');
}

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

// sub is how many steps each patch side is bent in, inset the share of the cell it fills
export function skyMap(scan: ScanMessage | null, sub = 3, inset = 0.8): SkyMap {
  const empty: SkyMap = { cells: [], best: null, sub };
  if (!scan || !Array.isArray(scan.pan) || !Array.isArray(scan.tilt) || !Array.isArray(scan.v)) return empty;
  const pan = scan.pan;
  const tilt = scan.tilt;
  const found = new Map<string, { sum: number; count: number; corners: Vec3[]; centre: Vec3 }>();

  for (let i = 0; i < tilt.length; i++) {
    const row = scan.v[i];
    if (!Array.isArray(row) || !finite(tilt[i])) continue;
    const [tl, tr] = halves(tilt, i);
    for (let j = 0; j < pan.length; j++) {
      const value = row[j];
      if (!finite(value) || !finite(pan[j])) continue;
      const centre = normal(pan[j], tilt[i]);
      const [pl, pr] = halves(pan, j);
      const p0 = pan[j] - pl * inset;
      const p1 = pan[j] + pr * inset;
      const t0 = tilt[i] - tl * inset;
      const t1 = tilt[i] + tr * inset;
      const key = [normal(p0, t0), normal(p1, t0), normal(p0, t1), normal(p1, t1)].map(keyOf).sort().join(' ');
      const known = found.get(key);
      if (known) {
        known.sum += value;
        known.count++;
        continue;
      }
      const corners: Vec3[] = [];
      for (let a = 0; a <= sub; a++) {
        for (let b = 0; b <= sub; b++) corners.push(normal(p0 + ((p1 - p0) * b) / sub, t0 + ((t1 - t0) * a) / sub));
      }
      found.set(key, { sum: value, count: 1, corners, centre });
    }
  }

  const cells: SkyCell[] = [...found.entries()].map(([key, c]) => ({ key, value: c.sum / c.count, level: 0, corners: c.corners, centre: c.centre }));
  if (cells.length === 0) return empty;
  let min = Infinity;
  let max = -Infinity;
  for (const cell of cells) {
    min = Math.min(min, cell.value);
    max = Math.max(max, cell.value);
  }
  const span = max - min;
  for (const cell of cells) cell.level = span > 1e-9 ? (cell.value - min) / span : 1;

  let best: Vec3 | null = null;
  if (scan.best && finite(scan.best.pan) && finite(scan.best.tilt)) best = normal(scan.best.pan, scan.best.tilt);
  else best = cells.reduce((a, b) => (b.value > a.value ? b : a)).centre;
  return { cells, best, sub };
}

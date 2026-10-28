// a safety net for the cad export. the contract says millimetres, z up and no
// node transforms, but gltf itself means metres and y up, and an exporter may
// quietly follow gltf instead. the bounds in assembly.json tell which reading
// of the files is the right one

import type { Vec3 } from '$lib/sim/kinematics';

export interface Box {
  min: Vec3;
  max: Vec3;
}

export interface Fix {
  // multiply every coordinate by this, 1000 for files in metres
  scale: number;
  // turn y up into z up, a quarter turn about x: (x, y, z) to (x, -z, y)
  yUp: boolean;
}

export const NO_FIX: Fix = { scale: 1, yUp: false };

export function applyFix(p: Vec3, fix: Fix): Vec3 {
  const q: Vec3 = fix.yUp ? [p[0], -p[2], p[1]] : [p[0], p[1], p[2]];
  return [q[0] * fix.scale, q[1] * fix.scale, q[2] * fix.scale];
}

export function fixBox(box: Box, fix: Fix): Box {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const x of [box.min[0], box.max[0]]) {
    for (const y of [box.min[1], box.max[1]]) {
      for (const z of [box.min[2], box.max[2]]) {
        const p = applyFix([x, y, z], fix);
        for (let i = 0; i < 3; i++) {
          min[i] = Math.min(min[i], p[i]);
          max[i] = Math.max(max[i], p[i]);
        }
      }
    }
  }
  return { min, max };
}

// how far a box is from the one expected, as a share of the expected size
export function misfit(box: Box, expected: Box): number {
  let error = 0;
  let size = 0;
  for (let i = 0; i < 3; i++) {
    error += Math.abs(box.min[i] - expected.min[i]) + Math.abs(box.max[i] - expected.max[i]);
    size += expected.max[i] - expected.min[i];
  }
  return size > 0 ? error / size : Infinity;
}

// the reading of the files that matches the bounds best. without bounds only
// a model far too small to be millimetres gets scaled
export function chooseFix(measured: Box, expected: Box | null): { fix: Fix; misfit: number } {
  const extent = Math.max(measured.max[0] - measured.min[0], measured.max[1] - measured.min[1], measured.max[2] - measured.min[2]);
  if (!Number.isFinite(extent) || extent <= 0) return { fix: NO_FIX, misfit: Infinity };
  if (!expected) return { fix: { scale: extent < 2 ? 1000 : 1, yUp: false }, misfit: NaN };
  let best = { fix: NO_FIX, misfit: misfit(measured, expected) };
  for (const scale of [1, 1000]) {
    for (const yUp of [false, true]) {
      const fix = { scale, yUp };
      const m = misfit(fixBox(measured, fix), expected);
      // the contract reading wins a tie
      if (m < best.misfit - 1e-6) best = { fix, misfit: m };
    }
  }
  return best;
}

import { describe, expect, it } from 'vitest';
import type { ScanMessage } from '$lib/link/protocol';
import { angleBetween, normal } from '$lib/sim/kinematics';
import { skyMap } from './cells';

// the default grid of the sky scan: pan -90 to 90, tilt 15 to 165, step 15
const PAN = Array.from({ length: 13 }, (_, j) => -90 + 15 * j);
const TILT = Array.from({ length: 11 }, (_, i) => 15 + 15 * i);

function scan(v: (i: number, j: number) => number | null, best: ScanMessage['best'] = null): ScanMessage {
  return { t: 'scan', id: 's1', pan: PAN, tilt: TILT, v: TILT.map((_, i) => PAN.map((_, j) => v(i, j))), done: true, best };
}

describe('the sky map', () => {
  it('is empty without a scan or with broken arrays', () => {
    expect(skyMap(null).cells).toEqual([]);
    expect(skyMap({ t: 'scan', id: 'x', pan: null, tilt: [], v: [], done: false, best: null } as unknown as ScanMessage).cells).toEqual([]);
  });

  it('puts each cell where the panel looked at that pose', () => {
    const map = skyMap(scan((i, j) => i * 100 + j));
    const cell = map.cells.find((c) => angleBetween(c.centre, normal(30, 45)) < 1e-6);
    expect(cell).toBeDefined();
    expect(cell!.value).toBe(TILT.indexOf(45) * 100 + PAN.indexOf(30));
  });

  it('leaves cells that are not measured yet empty', () => {
    const map = skyMap(scan((i, j) => (i === 2 && j === 4 ? 7 : null)));
    expect(map.cells).toHaveLength(1);
    expect(map.cells[0].level).toBe(1);
  });

  it('shares one patch between poses whose patches lie on top of each other', () => {
    // pan 90 tilt t and pan -90 tilt 180 - t cover the same patch, eleven pairs
    const map = skyMap(scan(() => 1));
    const keys = new Set(map.cells.map((c) => c.key));
    expect(keys.size).toBe(map.cells.length);
    expect(map.cells.length).toBe(PAN.length * TILT.length - TILT.length);
    const twins = skyMap(scan((i, j) => (j === 12 && i === 1 ? 10 : j === 0 && i === 9 ? 20 : null)));
    expect(twins.cells).toHaveLength(1);
    expect(twins.cells[0].value).toBe(15);
  });

  it('keeps the slices around the zenith apart, each pan covers its own', () => {
    const map = skyMap(scan((i) => (TILT[i] === 90 ? 1 : null)));
    expect(map.cells).toHaveLength(PAN.length - 1);
  });

  it('scales the levels from the darkest to the brightest cell', () => {
    const map = skyMap(scan((i) => 100 + i * 10));
    const levels = map.cells.map((c) => c.level);
    expect(Math.min(...levels)).toBe(0);
    expect(Math.max(...levels)).toBe(1);
  });

  it('bends each patch around the sphere and keeps a gap to its neighbour', () => {
    const map = skyMap(scan(() => 1), 3, 0.86);
    const cell = map.cells.find((c) => angleBetween(c.centre, normal(0, 30)) < 1e-6)!;
    expect(cell.corners).toHaveLength(16);
    for (const corner of cell.corners) expect(Math.hypot(...corner)).toBeCloseTo(1, 9);
    // the patch reaches 0.86 of the half step of 7.5 degrees on each side
    expect(angleBetween(cell.corners[0], normal(-6.45, 23.55))).toBeLessThan(1e-6);
  });

  it('marks the best pose the scan names, or the brightest cell', () => {
    const named = skyMap(scan(() => 1, { pan: -45, tilt: 60, v: 900 }));
    expect(angleBetween(named.best!, normal(-45, 60))).toBeLessThan(1e-9);
    const found = skyMap(scan((i, j) => (i === 3 && j === 8 ? 50 : 1)));
    expect(angleBetween(found.best!, normal(PAN[8], TILT[3]))).toBeLessThan(1e-9);
  });

  it('skips values that are not numbers', () => {
    const map = skyMap(scan((i, j) => (j === 0 ? (NaN as number) : i === 0 ? 5 : null)));
    expect(map.cells.every((c) => Number.isFinite(c.value))).toBe(true);
    expect(map.cells).toHaveLength(PAN.length - 1);
  });
});

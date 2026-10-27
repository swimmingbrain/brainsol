import { describe, expect, it } from 'vitest';
import { brightest, heatStep, labelEvery, nearest, progress, scanRunning, valueRange } from './scanmap';
import type { ScanMessage } from '$lib/link/protocol';

const scan = (v: (number | null)[][], extra: Partial<ScanMessage> = {}): ScanMessage => ({
  t: 'scan',
  id: 'scan-1',
  pan: [-90, -45, 0, 45, 90],
  tilt: [15, 60, 105, 150],
  v,
  done: false,
  best: null,
  ...extra
});

const half = [
  [10, 20, 30, 40, 50],
  [60, 900, 70, 80, 90],
  [null, null, null, null, null],
  [null, null, null, null, null]
];

describe('valueRange and heatStep', () => {
  it('spans the visited cells only', () => {
    expect(valueRange(half)).toEqual({ min: 10, max: 900 });
    expect(valueRange([[null, null]])).toBeNull();
  });

  it('puts the darkest cell on the first step and the brightest on the last', () => {
    const range = { min: 10, max: 900 };
    expect(heatStep(10, range)).toBe(0);
    expect(heatStep(900, range)).toBe(4);
    expect(heatStep(455, range)).toBe(2);
    expect(heatStep(null, range)).toBeNull();
  });

  it('shows a flat map as all bright instead of dividing by zero', () => {
    expect(heatStep(5, { min: 5, max: 5 })).toBe(4);
    expect(heatStep(5, null)).toBeNull();
  });
});

describe('progress', () => {
  it('counts the visited cells of the grid', () => {
    expect(progress(scan(half))).toEqual({ visited: 10, total: 20, share: 0.5 });
    expect(progress(null)).toEqual({ visited: 0, total: 0, share: 0 });
  });
});

describe('brightest', () => {
  it('takes the best cell the tracker names', () => {
    expect(brightest(scan(half, { best: { pan: 0, tilt: 60, v: 1 } }))).toEqual({ pan: 0, tilt: 60, v: 1 });
  });

  it('finds it itself while the tracker has not named one', () => {
    expect(brightest(scan(half))).toEqual({ pan: -45, tilt: 60, v: 900 });
    expect(brightest(scan([[null]]))).toBeNull();
  });
});

describe('nearest', () => {
  it('finds the grid line closest to the head', () => {
    expect(nearest([-90, -45, 0, 45, 90], 30)).toBe(3);
    expect(nearest([-90, -45, 0, 45, 90], -100)).toBe(0);
    expect(nearest([15, 60], null)).toBeNull();
  });
});

describe('scanRunning', () => {
  it('trusts the activity of the tracker and falls back to the message', () => {
    expect(scanRunning(scan(half), 'scan')).toBe(true);
    expect(scanRunning(scan(half), null)).toBe(false);
    expect(scanRunning(scan(half), 'exp')).toBe(false);
    expect(scanRunning(scan(half), undefined)).toBe(true);
    expect(scanRunning(scan(half, { done: true }), undefined)).toBe(false);
    expect(scanRunning(null, undefined)).toBe(false);
  });
});

describe('labelEvery', () => {
  it('thins out the labels of a dense grid', () => {
    expect(labelEvery(5)).toBe(1);
    expect(labelEvery(13)).toBe(2);
  });
});

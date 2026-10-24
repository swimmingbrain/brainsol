import { describe, expect, it } from 'vitest';
import { niceRange, niceStep, stepDecimals } from './range';

describe('the chart range', () => {
  it('picks round steps', () => {
    expect(niceStep(0.7)).toBe(1);
    expect(niceStep(23)).toBe(25);
    expect(niceStep(180)).toBe(200);
    expect(niceStep(0.0031)).toBeCloseTo(0.005, 10);
  });

  it('knows how many decimals a step needs', () => {
    expect(stepDecimals(25)).toBe(0);
    expect(stepDecimals(0.5)).toBe(1);
    expect(stepDecimals(0.25)).toBe(2);
    expect(stepDecimals(0.005)).toBe(3);
  });

  it('wraps the data in round numbers with some air', () => {
    const [lo, hi] = niceRange(912, 968);
    expect(lo).toBeLessThanOrEqual(912);
    expect(hi).toBeGreaterThanOrEqual(968);
    expect(hi - lo).toBeLessThan(200);
  });

  it('keeps zero in view for quantities that start there and never goes below', () => {
    const [lo, hi] = niceRange(900, 960, { include: [0] });
    expect(lo).toBe(0);
    expect(hi).toBeGreaterThanOrEqual(960);
  });

  it('stays inside hard walls', () => {
    expect(niceRange(40, 99, { min: 0, max: 100, include: [0, 100] })).toEqual([0, 100]);
    expect(niceRange(-5, 120, { min: 0, max: 100 })).toEqual([0, 100]);
    const [lo, hi] = niceRange(0.2, 0.4, { min: 0, minSpan: 5 });
    expect(lo).toBe(0);
    expect(hi).toBeGreaterThanOrEqual(5);
  });

  it('is symmetric for errors and keeps a smallest span', () => {
    const [lo, hi] = niceRange(-0.01, 0.02, { symmetric: true, minSpan: 0.2 });
    expect(lo).toBe(-hi);
    expect(hi).toBeGreaterThanOrEqual(0.1);
  });

  it('shows something sensible without data', () => {
    expect(niceRange(null, null, { min: 0, max: 100 })).toEqual([0, 100]);
    const [lo, hi] = niceRange(null, null);
    expect(hi).toBeGreaterThan(lo);
  });
});

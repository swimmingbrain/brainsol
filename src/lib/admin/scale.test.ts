import { describe, expect, it } from 'vitest';
import { fromLogPos, niceRound, toLogPos } from './scale';

describe('the log scale of the light sliders', () => {
  it('puts darkness at the left end and the maximum at the right end', () => {
    expect(toLogPos(0, 10, 200000)).toBe(0);
    expect(toLogPos(200000, 10, 200000)).toBe(1);
    expect(toLogPos(10, 10, 200000)).toBe(0);
    expect(fromLogPos(0, 10, 200000)).toBe(0);
    expect(fromLogPos(1, 10, 200000)).toBe(200000);
  });

  it('gives the phone light and the sun room on the same slider', () => {
    const phone = toLogPos(900, 10, 200000);
    const sun = toLogPos(80000, 10, 200000);
    expect(phone).toBeGreaterThan(0.4);
    expect(phone).toBeLessThan(0.5);
    expect(sun).toBeGreaterThan(0.9);
  });

  it('goes there and back without drifting more than the rounding', () => {
    for (const lux of [60, 900, 9000, 80000]) {
      expect(fromLogPos(toLogPos(lux, 10, 200000), 10, 200000)).toBe(lux);
    }
  });

  it('clamps what is out of range and survives broken input', () => {
    expect(toLogPos(1e9, 10, 200000)).toBe(1);
    expect(toLogPos(NaN, 10, 200000)).toBe(0);
    expect(toLogPos(5, 0, 100)).toBe(0);
    expect(fromLogPos(3, 10, 1000)).toBe(1000);
  });
});

describe('niceRound', () => {
  it('keeps two significant figures', () => {
    expect(niceRound(873.4)).toBe(870);
    expect(niceRound(81234)).toBe(81000);
    expect(niceRound(64)).toBe(64);
    expect(niceRound(4.4)).toBe(4);
    expect(niceRound(0.3)).toBe(0);
  });
});

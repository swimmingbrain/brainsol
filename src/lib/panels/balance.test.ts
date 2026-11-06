import { describe, expect, it } from 'vitest';
import { bubble, follow, heatColor, inkOn, parseColor, spread } from './balance';

const RAMP = ['#31231c', '#5d3c2b', '#8f5537', '#c57042', '#ff8b4b'];

describe('the heat ramp', () => {
  it('reads the colours css hands out', () => {
    expect(parseColor('#ff8b4b')).toEqual([255, 139, 75]);
    expect(parseColor('#fff')).toEqual([255, 255, 255]);
    expect(parseColor('rgba(255, 139, 75, 0.10)')).toEqual([255, 139, 75]);
    expect(parseColor('amber')).toBeNull();
  });

  it('puts the ends of a level on the first and last step and runs straight between', () => {
    expect(heatColor(0, RAMP)).toBe('#31231c');
    expect(heatColor(1, RAMP)).toBe('#ff8b4b');
    expect(heatColor(0.5, RAMP)).toBe('#8f5537');
    expect(heatColor(0.125, RAMP)).toBe('#473024');
    expect(heatColor(-3, RAMP)).toBe('#31231c');
    expect(heatColor(7, RAMP)).toBe('#ff8b4b');
  });

  it('keeps the ink readable on every step in both themes', () => {
    expect(inkOn('#31231c')).toBe('light');
    expect(inkOn('#ff8b4b')).toBe('dark');
    expect(inkOn('#fdece4')).toBe('dark');
    expect(inkOn('#de6b22')).toBe('dark');
    expect(inkOn('#5d3c2b')).toBe('light');
  });
});

describe('the bubble level', () => {
  it('opens up the middle so the dead band is visible and still reaches the rim', () => {
    expect(spread(0)).toBe(0);
    expect(spread(1)).toBeCloseTo(1, 10);
    expect(spread(0.05)).toBeGreaterThan(0.25);
    expect(spread(0.5)).toBeLessThan(1);
    for (let e = 0; e < 1; e += 0.05) expect(spread(e + 0.05)).toBeGreaterThan(spread(e));
  });

  it('moves the dot towards the brighter side', () => {
    const right = bubble(0.3, 0);
    expect(right.x).toBeGreaterThan(0);
    expect(right.y).toBe(0);
    const up = bubble(0, 0.2);
    expect(up.y).toBeGreaterThan(0);
    const corner = bubble(-1, -1);
    expect(Math.hypot(corner.x, corner.y)).toBeLessThanOrEqual(1 + 1e-9);
    expect(corner.x).toBeLessThan(0);
    expect(bubble(NaN, 0)).toEqual({ x: 0, y: 0 });
  });

  it('follows a target smoothly and lands on it after a long gap', () => {
    const step = follow(0, 1, 0.016, 0.12);
    expect(step).toBeGreaterThan(0);
    expect(step).toBeLessThan(0.2);
    expect(follow(0, 1, 10, 0.12)).toBeCloseTo(1, 6);
    expect(follow(0.4, 1, 0.02, 0)).toBe(1);
  });
});

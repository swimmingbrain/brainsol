import { describe, expect, it } from 'vitest';
import { bubble, follow, heatColor, inkOn, parseColor, spread } from './balance';

const RAMP = ['#26221f', '#4a3a2b', '#7a5c3d', '#a87c52', '#d19a66'];

describe('the heat ramp', () => {
  it('reads the colours css hands out', () => {
    expect(parseColor('#d19a66')).toEqual([209, 154, 102]);
    expect(parseColor('#fff')).toEqual([255, 255, 255]);
    expect(parseColor('rgba(209, 154, 102, 0.10)')).toEqual([209, 154, 102]);
    expect(parseColor('copper')).toBeNull();
  });

  it('puts the ends of a level on the first and last step and runs straight between', () => {
    expect(heatColor(0, RAMP)).toBe('#26221f');
    expect(heatColor(1, RAMP)).toBe('#d19a66');
    expect(heatColor(0.5, RAMP)).toBe('#7a5c3d');
    expect(heatColor(0.125, RAMP)).toBe('#382e25');
    expect(heatColor(-3, RAMP)).toBe('#26221f');
    expect(heatColor(7, RAMP)).toBe('#d19a66');
  });

  it('keeps the ink readable on every step in both themes', () => {
    expect(inkOn('#26221f')).toBe('light');
    expect(inkOn('#d19a66')).toBe('dark');
    expect(inkOn('#f3ebe2')).toBe('dark');
    expect(inkOn('#a8692a')).toBe('light');
    expect(inkOn('#4a3a2b')).toBe('light');
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

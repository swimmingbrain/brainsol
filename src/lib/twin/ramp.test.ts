import { describe, expect, it } from 'vitest';
import { color, mix, parseColor, ramp, steps, toHex, type Rgb } from './ramp';

const HEAT: Rgb[] = ['#31231c', '#5d3c2b', '#8f5537', '#c57042', '#ff8b4b'].map((c) => parseColor(c)!);

describe('colours', () => {
  it('read the token formats', () => {
    expect(parseColor('#ffffff')).toEqual([1, 1, 1]);
    expect(parseColor(' #000 ')).toEqual([0, 0, 0]);
    expect(toHex(parseColor('#ff8b4b')!)).toBe('#ff8b4b');
    expect(toHex(parseColor('#abc')!)).toBe('#aabbcc');
    expect(toHex(parseColor('rgba(255, 139, 75, 0.10)')!)).toBe('#ff8b4b');
    expect(toHex(parseColor('rgb(17 17 19)')!)).toBe('#111113');
  });

  it('give null for anything else and the fallback through color', () => {
    expect(parseColor('')).toBeNull();
    expect(parseColor('amber')).toBeNull();
    expect(parseColor(undefined)).toBeNull();
    expect(parseColor('#12345')).toBeNull();
    expect(toHex(color('', '#2e2e33'))).toBe('#2e2e33');
  });

  it('mix and hold the ends', () => {
    expect(mix([0, 0, 0], [1, 1, 1], 0.25)).toEqual([0.25, 0.25, 0.25]);
    expect(mix([0, 0, 0], [1, 1, 1], -1)).toEqual([0, 0, 0]);
    expect(mix([0, 0, 0], [1, 1, 1], 4)).toEqual([1, 1, 1]);
  });
});

describe('the heat ramp', () => {
  it('lands on each of the five steps', () => {
    for (let i = 0; i < 5; i++) expect(toHex(ramp(HEAT, i / 4))).toBe(toHex(HEAT[i]));
  });

  it('blends between two steps', () => {
    expect(toHex(ramp(HEAT, 1 / 8))).toBe(toHex(mix(HEAT[0], HEAT[1], 0.5)));
  });

  it('holds the ends outside 0 to 1 and for NaN', () => {
    expect(ramp(HEAT, -2)).toEqual(HEAT[0]);
    expect(ramp(HEAT, 7)).toEqual(HEAT[4]);
    expect(ramp(HEAT, NaN)).toEqual(HEAT[0]);
  });

  it('copes with one stop or none', () => {
    expect(ramp([[0.5, 0.5, 0.5]], 0.7)).toEqual([0.5, 0.5, 0.5]);
    expect(ramp([], 0.7)).toEqual([0, 0, 0]);
  });

  it('gets brighter all the way along in the dark theme', () => {
    let last = -1;
    for (let t = 0; t <= 1; t += 0.05) {
      const c = ramp(HEAT, t);
      const luma = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
      expect(luma).toBeGreaterThan(last);
      last = luma;
    }
  });

  it('counts differences in 8 bit steps', () => {
    expect(steps([0, 0, 0], [2 / 255, 1 / 255, 0])).toBeCloseTo(2, 9);
  });
});

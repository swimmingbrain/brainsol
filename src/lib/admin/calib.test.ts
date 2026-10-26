import { describe, expect, it } from 'vitest';
import { barLevel, FLOW, nearFlat, nextStep, polarityTilt, rawNow, readPolarity, readSpan, readZero, sensorsWhere, spanOf } from './calib';

describe('barLevel', () => {
  it('maps the raw sums onto 0 to 1 and keeps null', () => {
    expect(barLevel(0)).toBe(0);
    expect(barLevel(8184)).toBe(1);
    expect(barLevel(4092)).toBe(0.5);
    expect(barLevel(9000)).toBe(1);
    expect(barLevel(null)).toBeNull();
    expect(barLevel(NaN)).toBeNull();
  });
});

describe('reading the answers', () => {
  it('reads the span report of the python tracker', () => {
    const data = { dark: [196, 196, 196, 196], bright: [7862, 7862, 7862, 7862], span: [7666, 7666, 7666, 7666], inverted: [false, false, false, false], weak: [false, false, false, false] };
    expect(readSpan(data)).toEqual(data);
  });

  it('works the span out when only dark and bright come back', () => {
    const report = readSpan({ dark: [100, 4000, 300, 300], bright: [6000, 3990, 330, 7000] });
    expect(report?.span).toEqual([5900, -10, 30, 6700]);
    expect(sensorsWhere(report!.weak)).toEqual(['R', 'U']);
    expect(sensorsWhere(report!.inverted)).toEqual(['R']);
  });

  it('notices a sensor that reads lower in light', () => {
    const report = spanOf([7000, 200, 200, 200], [500, 7000, 7000, 7000]);
    expect(sensorsWhere(report.inverted)).toEqual(['L']);
    expect(sensorsWhere(report.weak)).toEqual([]);
  });

  it('says nothing about an answer it cannot read', () => {
    expect(readSpan(undefined)).toBeNull();
    expect(readSpan({ dark: [1, 2, 3], bright: [1, 2, 3, 4] })).toBeNull();
    expect(readSpan({ dark: [1, 2, 3, 'x'], bright: [1, 2, 3, 4] })).toBeNull();
  });

  it('reads the polarity and the zero answers', () => {
    expect(readPolarity({ sx: -1, sy: 1, dx: 0.02, dy: -0.03 })).toEqual({ sx: -1, sy: 1 });
    expect(readPolarity({ sx: 0, sy: 1 })).toBeNull();
    expect(readZero({ pan_us: 1742.4, tilt_us: 982, pan: 0, tilt: 90 })).toEqual({ pan_us: 1742, tilt_us: 982 });
    expect(readZero({})).toBeNull();
  });
});

describe('rawNow', () => {
  it('needs all four readings', () => {
    expect(rawNow([1, 2, 3, 4])).toEqual([1, 2, 3, 4]);
    // the python tracker sends nulls before its first sample
    expect(rawNow([null, null, null, null])).toBeNull();
    expect(rawNow(null)).toBeNull();
  });
});

describe('the polarity step', () => {
  it('knows when the head is too close to flat', () => {
    expect(nearFlat(90, 6)).toBe(true);
    expect(nearFlat(100, 6)).toBe(true);
    expect(nearFlat(79, 6)).toBe(false);
    expect(nearFlat(null, 6)).toBe(false);
  });

  it('picks a tilt well outside the band on the side the head leans to', () => {
    expect(polarityTilt(88, 6, [4, 176])).toBe(64);
    expect(polarityTilt(95, 6, [4, 176])).toBe(116);
    expect(nearFlat(polarityTilt(95, 6, [4, 176]), 6)).toBe(false);
    expect(polarityTilt(80, 20, [70, 110])).toBe(70);
  });
});

describe('nextStep', () => {
  it('walks the steps in order', () => {
    expect(nextStep([])).toBe('dark');
    expect(nextStep(['dark'])).toBe('bright');
    expect(nextStep(['dark', 'bright', 'polarity'])).toBe('zero');
    expect(nextStep(FLOW)).toBeNull();
  });
});

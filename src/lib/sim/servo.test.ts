import { describe, expect, it } from 'vitest';
import { defaultPanMap, defaultTiltMap, sameMap, toAngle, toUs, US_MAX, US_MIN } from './servo';

describe('the servo maps', () => {
  it('put pan 0 and tilt 90 on the centre pulse', () => {
    expect(toUs(defaultPanMap(), 0)).toBe(1500);
    expect(toUs(defaultTiltMap(), 90)).toBe(1500);
  });

  it('turn 90 degrees into 1000 us and whole microseconds only', () => {
    expect(toUs(defaultPanMap(), 90)).toBe(2500);
    expect(toUs(defaultPanMap(), -90)).toBe(500);
    expect(Number.isInteger(toUs(defaultPanMap(), 12.345))).toBe(true);
  });

  it('stay inside the pulse range of the firmware', () => {
    expect(toUs(defaultPanMap(), 200)).toBe(US_MAX);
    expect(toUs(defaultTiltMap(), -50)).toBe(US_MIN);
  });

  it('give the angle back from the pulse, also with the direction reversed', () => {
    const map = { centreUs: 1460, angle0: 90, usPerDeg: 10.5, dir: -1 };
    for (const angle of [4, 37.5, 90, 151, 176]) {
      expect(toAngle(map, toUs(map, angle))).toBeCloseTo(angle, 1);
    }
  });

  it('tell two maps apart', () => {
    expect(sameMap(defaultPanMap(), defaultPanMap())).toBe(true);
    expect(sameMap(defaultPanMap(), { ...defaultPanMap(), centreUs: 1510 })).toBe(false);
  });
});

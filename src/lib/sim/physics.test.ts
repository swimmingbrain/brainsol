import { describe, expect, it } from 'vitest';
import { PHONE_LIGHT, RAW_MAX, gauss, mulberry32, rawFor, sense, servoStep, shading } from './physics';
import { poseFor } from './kinematics';

describe('the sensor model', () => {
  it('reads 10 k at 10 lux, so the divider sits in the middle', () => {
    expect(rawFor(10)).toBeCloseTo(RAW_MAX / 2, 6);
  });

  it('gives a higher reading for more light and never leaves 0 to 8184', () => {
    let last = -1;
    for (const lux of [0.05, 1, 10, 60, 300, 960, 10000, 89000]) {
      const raw = rawFor(lux);
      expect(raw).toBeGreaterThan(last);
      expect(raw).toBeGreaterThanOrEqual(0);
      expect(raw).toBeLessThanOrEqual(RAW_MAX);
      last = raw;
    }
  });

  it('treats darkness as 0.05 lux', () => {
    expect(rawFor(0)).toBe(rawFor(0.05));
    expect(rawFor(-5)).toBe(rawFor(0.05));
  });

  it('lets light from the right shade the left sensor, and light from above the lower one', () => {
    const [l, r, u, d] = shading(0.9, 0.3, 0, 1.2);
    expect(r).toBe(1);
    expect(l).toBeCloseTo(1 - 1.2 * (0.3 / 0.9), 9);
    expect(u).toBe(1);
    expect(d).toBe(1);
    const [l2, r2, u2, d2] = shading(0.9, 0, 0.3, 1.2);
    expect(l2).toBe(1);
    expect(r2).toBe(1);
    expect(u2).toBe(1);
    expect(d2).toBeCloseTo(0.6, 9);
  });

  it('gives no direct light to any sensor when the light grazes the panel or is behind it', () => {
    expect(shading(0.02, 0.5, 0.5)).toEqual([0, 0, 0, 0]);
    expect(shading(-0.4, 0, 0)).toEqual([0, 0, 0, 0]);
  });

  it('sees the full light on all four sensors when the panel faces it', () => {
    const pose = poseFor(PHONE_LIGHT.az, PHONE_LIGHT.el);
    const reading = sense(pose.pan, pose.tilt, PHONE_LIGHT);
    expect(reading.E).toBeCloseTo(900, 6);
    expect(reading.lux).toBeCloseTo(960, 6);
    expect(reading.f).toEqual([1, 1, 1, 1]);
    const expected = Math.round(rawFor(960));
    expect(reading.raw).toEqual([expected, expected, expected, expected]);
  });

  it('reads the right sensor brighter when the light is to the right of the panel', () => {
    const reading = sense(0, 40, { ...PHONE_LIGHT, az: 20, el: 40 });
    const [l, r, u, d] = reading.raw;
    expect(r).toBeGreaterThan(l);
    expect(Math.abs(u - d)).toBeLessThan(Math.abs(r - l));
  });

  it('keeps the left and right roles when the panel looks backwards over the top', () => {
    // pan 0, tilt 150 looks back and up. right() is still +x, so a light at
    // azimuth 170 (back and a little to the right) shows up on the R sensor
    const reading = sense(0, 150, { ...PHONE_LIGHT, az: 170, el: 30 });
    const [l, r] = reading.raw;
    expect(r).toBeGreaterThan(l);
  });

  it('only sees the ambient light with the lamp off', () => {
    const reading = sense(0, 40, { ...PHONE_LIGHT, on: false });
    expect(reading.E).toBe(0);
    expect(reading.lux).toBeCloseTo(60, 9);
  });

  it('adds noise of about 6 counts to the sensors and 1 % to the lux reading', () => {
    const random = mulberry32(7);
    const clean = Math.round(rawFor(960));
    const pose = poseFor(PHONE_LIGHT.az, PHONE_LIGHT.el);
    let sum = 0;
    let squares = 0;
    let luxSum = 0;
    const n = 4000;
    for (let i = 0; i < n; i++) {
      const reading = sense(pose.pan, pose.tilt, PHONE_LIGHT, random);
      const delta = reading.raw[0] - clean;
      sum += delta;
      squares += delta * delta;
      luxSum += reading.lux;
    }
    const mean = sum / n;
    const sd = Math.sqrt(squares / n - mean * mean);
    expect(Math.abs(mean)).toBeLessThan(0.5);
    expect(sd).toBeGreaterThan(5);
    expect(sd).toBeLessThan(7);
    expect(luxSum / n).toBeCloseTo(960, -1);
  });

  it('draws the same noise from the same seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 10; i++) expect(gauss(a, 1)).toBe(gauss(b, 1));
  });
});

describe('the servo model', () => {
  it('turns at most 400 degrees per second towards the command', () => {
    expect(servoStep(0, 90, 0.02)).toBeCloseTo(8, 9);
    expect(servoStep(0, -90, 0.02)).toBeCloseTo(-8, 9);
  });

  it('stops on the command instead of passing it', () => {
    expect(servoStep(10, 13, 0.02)).toBe(13);
    let angle = 0;
    for (let i = 0; i < 50; i++) angle = servoStep(angle, 45, 0.02);
    expect(angle).toBe(45);
  });
});

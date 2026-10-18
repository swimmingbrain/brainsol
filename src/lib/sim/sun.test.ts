import { describe, expect, it } from 'vitest';
import { parseWhen, relativeAz, sunLight, SunClock, sunPosition } from './sun';
import { SUN_LIGHT } from './physics';

// vienna, the default site
const LAT = 48.21;
const LON = 16.37;
const iso = (text: string) => Date.parse(text) / 1000;

describe('the sun position', () => {
  it('stands about south and 65 degrees high at noon on the summer solstice in vienna', () => {
    const { caz, el } = sunPosition(LAT, LON, iso('2026-06-21T10:55:00Z'));
    expect(caz).toBeGreaterThan(175);
    expect(caz).toBeLessThan(185);
    expect(el).toBeGreaterThan(64);
    expect(el).toBeLessThan(66);
  });

  it('rises in the north east in june and in the south east in december', () => {
    const june = sunPosition(LAT, LON, iso('2026-06-21T03:00:00Z'));
    const december = sunPosition(LAT, LON, iso('2026-12-21T06:50:00Z'));
    expect(june.caz).toBeGreaterThan(40);
    expect(june.caz).toBeLessThan(70);
    expect(december.caz).toBeGreaterThan(115);
    expect(december.caz).toBeLessThan(135);
  });

  it('is below the horizon at midnight', () => {
    expect(sunPosition(LAT, LON, iso('2026-06-21T23:00:00Z')).el).toBeLessThan(0);
  });

  it('is seen from the device relative to the way its front faces', () => {
    // the front faces south: south is straight ahead, east is to the left
    expect(relativeAz(180, 180)).toBe(0);
    expect(relativeAz(90, 180)).toBe(-90);
    expect(relativeAz(270, 180)).toBe(90);
    // north is behind
    expect(Math.abs(relativeAz(0, 180))).toBe(180);
    expect(relativeAz(10, 350)).toBe(20);
  });
});

describe('the light of the sun', () => {
  it('gives the sun scene high up and less through more air near the horizon', () => {
    const high = sunLight(90);
    expect(high.lux).toBeCloseTo(SUN_LIGHT.lux0, -2);
    expect(high.amb).toBe(SUN_LIGHT.amb);
    const low = sunLight(5);
    expect(low.lux).toBeLessThan(high.lux / 2);
    expect(low.amb).toBeLessThan(high.amb);
    expect(sunLight(30).lux).toBeGreaterThan(low.lux);
  });

  it('has no direct light at night and a sky that fades but never goes below 5 lux', () => {
    expect(sunLight(0).lux).toBe(0);
    expect(sunLight(-3).amb).toBeLessThan(SUN_LIGHT.amb);
    expect(sunLight(-30).amb).toBe(5);
  });
});

describe('the sun clock', () => {
  it('follows the real clock at speed 1', () => {
    const clock = new SunClock();
    expect(clock.live).toBe(true);
    clock.advance(100);
    expect(clock.now(1000)).toBe(1000);
  });

  it('runs a time lapse on the loop seconds and keeps its time when the speed changes', () => {
    const clock = new SunClock();
    clock.set(3600, null, 1000);
    expect(clock.live).toBe(false);
    clock.advance(2);
    expect(clock.now(5000)).toBe(1000 + 7200);
    clock.set(60, null, 9999);
    expect(clock.now(9999)).toBe(8200);
    clock.advance(1);
    expect(clock.now(0)).toBe(8260);
  });

  it('jumps to a start time and goes back to real time at speed 1 without one', () => {
    const clock = new SunClock();
    clock.set(1, 500, 1000);
    expect(clock.live).toBe(false);
    clock.advance(3);
    expect(clock.now(1000)).toBe(503);
    clock.set(1, null, 2000);
    expect(clock.live).toBe(true);
    expect(clock.now(2000)).toBe(2000);
  });
});

describe('the start date', () => {
  const now = new Date(2026, 10, 14, 15, 30, 0).getTime() / 1000;

  it('keeps the time of day for a date alone', () => {
    const t = parseWhen('2026-06-21', now)!;
    const date = new Date(t * 1000);
    expect([date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([2026, 5, 21]);
    expect([date.getHours(), date.getMinutes()]).toEqual([15, 30]);
  });

  it('reads a time without a zone as local time and one with a zone as given', () => {
    expect(parseWhen('2026-06-21T06:00', now)).toBe(new Date(2026, 5, 21, 6, 0).getTime() / 1000);
    expect(parseWhen('2026-06-21T06:00Z', now)).toBe(iso('2026-06-21T06:00:00Z'));
    expect(parseWhen('2026-06-21 06:00:30+02:00', now)).toBe(iso('2026-06-21T04:00:30Z'));
    expect(parseWhen('2026-06-21T06:00+0200', now)).toBe(iso('2026-06-21T04:00:00Z'));
  });

  it('refuses what is not an iso date', () => {
    for (const text of ['', 'tomorrow', '21.06.2026', '2026-02-30', '2026-13-01', '2026-02-30T10:00', '2026-06-21T25:00', '2026-6-1', '2026-06-21T06']) {
      expect(parseWhen(text, now), text).toBeNull();
    }
  });
});

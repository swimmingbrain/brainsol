import { describe, expect, it } from 'vitest';
import { dateOf, dayOfYear, fixedPanelFor, gain, integrate, simulateDay, simulateYear } from './day';
import { declination } from './model';

const VIENNA = { lat: 48.21, lon: 16.37 };
const SOUTH = { tilt: 35, azimuth: 180 };

describe('a day in the sun', () => {
  it('puts the noon sun at 90 minus the latitude plus the declination', () => {
    for (const day of [172, 80, 355, 30]) {
      const sim = simulateDay(VIENNA, day, SOUTH);
      expect(sim.noon).toBeCloseTo(90 - VIENNA.lat + declination(day), 0);
    }
    const quito = simulateDay({ lat: -0.18, lon: -78.47 }, 80, SOUTH);
    expect(quito.noon).toBeGreaterThan(88);
  });

  it('has about 12 hours of daylight at the equinox anywhere outside the poles', () => {
    for (const site of [VIENNA, { lat: 0, lon: 0 }, { lat: -33.87, lon: 151.21 }]) {
      const sim = simulateDay(site, 80, SOUTH);
      const length = sim.sunset! - sim.sunrise!;
      expect(length).toBeGreaterThan(11.8);
      expect(length).toBeLessThan(12.5);
    }
  });

  it('keeps solar noon close to 12:00 on the clock of the site', () => {
    const sim = simulateDay(VIENNA, 172, SOUTH);
    const noon = sim.hours[sim.elevation.indexOf(sim.noon)];
    expect(Math.abs(noon - 12)).toBeLessThan(0.3);
  });

  it('has long summer days and short winter days in vienna', () => {
    const summer = simulateDay(VIENNA, 172, SOUTH);
    const winter = simulateDay(VIENNA, 355, SOUTH);
    expect(summer.sunset! - summer.sunrise!).toBeGreaterThan(15.5);
    expect(winter.sunset! - winter.sunrise!).toBeLessThan(8.8);
  });

  it('integrates power over hours into sensible energies', () => {
    expect(integrate([0, 12, 24], [1000, 1000, 1000])).toBeCloseTo(24, 6);
    expect(integrate([0, 1, 2], [0, 500, 0])).toBeCloseTo(0.5, 6);
    const summer = simulateDay(VIENNA, 172, SOUTH);
    expect(summer.energy.dual).toBeGreaterThan(8);
    expect(summer.energy.dual).toBeLessThan(13);
    expect(summer.energy.fixed).toBeGreaterThan(5);
    const winter = simulateDay(VIENNA, 355, SOUTH);
    expect(winter.energy.fixed).toBeGreaterThan(1);
    expect(winter.energy.fixed).toBeLessThan(summer.energy.fixed);
  });

  it('never collects less with two axes than with a fixed panel or one axis over a day', () => {
    const panels = [SOUTH, { tilt: 0, azimuth: 180 }, { tilt: 60, azimuth: 200 }, { tilt: 20, azimuth: 0 }];
    for (const site of [VIENNA, { lat: 0, lon: 0 }, { lat: 64.1, lon: -21.9 }, { lat: -33.87, lon: 151.21 }]) {
      for (const day of [15, 80, 172, 266, 355]) {
        for (const panel of panels) {
          const { energy } = simulateDay(site, day, panel, 2026, 15);
          expect(energy.dual).toBeGreaterThanOrEqual(energy.fixed);
          expect(energy.dual).toBeGreaterThanOrEqual(energy.single);
        }
      }
    }
  });

  it('gives nothing in the polar night', () => {
    const sim = simulateDay({ lat: 80, lon: 15 }, 355, SOUTH);
    expect(sim.sunrise).toBeNull();
    expect(sim.energy).toEqual({ fixed: 0, single: 0, dual: 0 });
  });

  it('counts the days of the year without a leap day', () => {
    expect(dateOf(1)).toEqual({ month: 0, date: 1 });
    expect(dateOf(172)).toEqual({ month: 5, date: 21 });
    expect(dateOf(365)).toEqual({ month: 11, date: 31 });
    for (let day = 1; day <= 365; day += 17) {
      const { month, date } = dateOf(day);
      expect(dayOfYear(month, date)).toBe(day);
    }
  });
});

describe('a year in the sun', () => {
  it('adds the months up to a plausible clear sky year with a real gain for tracking', () => {
    const year = simulateYear(VIENNA, SOUTH);
    expect(year.months).toHaveLength(12);
    expect(year.total.fixed).toBeGreaterThan(1500);
    expect(year.total.fixed).toBeLessThan(2800);
    const dual = gain(year.total.dual, year.total.fixed)!;
    expect(dual).toBeGreaterThan(0.2);
    expect(dual).toBeLessThan(0.7);
    expect(year.total.single).toBeGreaterThan(year.total.fixed);
    // june beats december for every kind
    expect(year.months[5].daily.fixed).toBeGreaterThan(year.months[11].daily.fixed);
  });

  it('turns the fixed panel to the equator south of it', () => {
    const sydney = { lat: -33.87, lon: 151.21 };
    const north = simulateYear(sydney, { tilt: 30, azimuth: 0 });
    const south = simulateYear(sydney, { tilt: 30, azimuth: 180 });
    expect(north.total.fixed).toBeGreaterThan(south.total.fixed);
  });

  it('sets the usual fixed panel towards the equator', () => {
    expect(fixedPanelFor(48.21)).toEqual({ tilt: 40, azimuth: 180 });
    expect(fixedPanelFor(-33.87)).toEqual({ tilt: 29, azimuth: 0 });
    expect(fixedPanelFor(89).tilt).toBe(60);
  });

  it('has no gain without a fixed reference', () => {
    expect(gain(5, 0)).toBeNull();
    expect(gain(6, 4)).toBeCloseTo(0.5, 10);
  });
});

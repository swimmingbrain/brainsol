import { describe, expect, it } from 'vitest';
import { dayCsv, yearCsv } from './csv';
import { simulateDay, simulateYear } from './day';

const VIENNA = { lat: 48.21, lon: 16.37 };
const SOUTH = { tilt: 40, azimuth: 180 };

describe('the simulator csv', () => {
  it('writes one line per step of the day under a header', () => {
    const day = simulateDay(VIENNA, 172, SOUTH);
    const lines = dayCsv(day).trim().split('\n');
    expect(lines[0]).toBe('solar_time_h,sun_elevation_deg,fixed_w_m2,single_axis_w_m2,dual_axis_w_m2');
    expect(lines).toHaveLength(day.hours.length + 1);
    const noon = lines[1 + day.hours.indexOf(12)].split(',').map(Number);
    expect(noon[0]).toBe(12);
    expect(noon[1]).toBeGreaterThan(60);
    expect(noon[4]).toBeGreaterThanOrEqual(noon[2]);
  });

  it('writes the twelve months and the year total', () => {
    const lines = yearCsv(simulateYear(VIENNA, SOUTH)).trim().split('\n');
    expect(lines).toHaveLength(14);
    expect(lines[1].startsWith('1,')).toBe(true);
    expect(lines[13].startsWith('year,')).toBe(true);
    expect(lines.every((line) => line.split(',').length === 4)).toBe(true);
  });
});

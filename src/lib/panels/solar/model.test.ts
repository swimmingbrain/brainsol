import { describe, expect, it } from 'vitest';
import { airMass, declination, directNormal, irradiance, panelNormal, sunVector } from './model';

describe('the clear sky model', () => {
  it('has an air mass of one overhead, two at 60 degrees and a finite one at the horizon', () => {
    expect(airMass(0)).toBeCloseTo(1, 2);
    expect(airMass(60)).toBeCloseTo(2, 1);
    expect(airMass(90)).toBeGreaterThan(30);
    expect(airMass(90)).toBeLessThan(45);
  });

  it('gives the meinel beam, about 950 w overhead, weaker towards the horizon, nothing below it', () => {
    expect(directNormal(90)).toBeCloseTo(1353 * 0.7, 0);
    expect(directNormal(30)).toBeGreaterThan(700);
    expect(directNormal(30)).toBeLessThan(directNormal(60));
    expect(directNormal(2)).toBeLessThan(200);
    expect(directNormal(0)).toBe(0);
    expect(directNormal(-5)).toBe(0);
  });

  it('points the vectors the way a compass does', () => {
    const east = sunVector(90, 0);
    expect(east[0]).toBeCloseTo(1, 10);
    expect(east[2]).toBeCloseTo(0, 10);
    const southFace = panelNormal(90, 180);
    expect(southFace[1]).toBeCloseTo(-1, 10);
    panelNormal(0, 123).forEach((c, i) => expect(c).toBeCloseTo([0, 0, 1][i], 10));
  });

  it('lets a panel that faces the sun catch the whole beam and the cosine of it when turned away', () => {
    const facing = irradiance(180, 40, { tilt: 50, azimuth: 180 });
    expect(facing.fixed).toBeCloseTo(facing.dual, 6);
    const flat = irradiance(180, 30, { tilt: 0, azimuth: 180 });
    const beam = directNormal(30);
    expect(flat.fixed).toBeCloseTo(beam * 0.5 + beam * 0.1, 6);
  });

  it('never has the dual axis tracker below the others beyond the sky a flatter panel sees', () => {
    const panels = [
      { tilt: 0, azimuth: 180 },
      { tilt: 35, azimuth: 180 },
      { tilt: 60, azimuth: 150 },
      { tilt: 90, azimuth: 270 }
    ];
    for (let az = 0; az < 360; az += 15) {
      for (let el = 1; el <= 89; el += 4) {
        for (const panel of panels) {
          const p = irradiance(az, el, panel);
          // a panel a hair flatter than the sun sees a bit more sky, at most an eighth of a percent of the beam
          const slack = 0.00125 * directNormal(el) + 1e-9;
          expect(p.dual).toBeGreaterThanOrEqual(p.fixed - slack);
          expect(p.dual).toBeGreaterThanOrEqual(p.single - slack);
        }
      }
    }
  });

  it('gets nothing at night', () => {
    expect(irradiance(0, -10, { tilt: 30, azimuth: 180 })).toEqual({ fixed: 0, single: 0, dual: 0 });
  });

  it('knows the declination at the solstices and the equinoxes', () => {
    expect(declination(172)).toBeCloseTo(23.45, 0);
    expect(declination(355)).toBeCloseTo(-23.45, 0);
    expect(Math.abs(declination(81))).toBeLessThan(1);
  });
});

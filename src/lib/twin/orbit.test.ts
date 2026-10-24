import { describe, expect, it } from 'vitest';
import { cameraPosition, LIMITS, Orbit } from './orbit';

const HOME = { az: 35, el: 20, dist: 1000 };

function settleAll(orbit: Orbit) {
  let frames = 0;
  while (orbit.step(1 / 60) && frames < 2000) frames++;
  return frames;
}

describe('the camera orbit', () => {
  it('starts at home and rests there', () => {
    const orbit = new Orbit(HOME);
    expect(orbit.view).toEqual(HOME);
    expect(orbit.step(1 / 60)).toBe(false);
  });

  it('puts the camera in front for azimuth 0 and above for elevation 90', () => {
    const front = cameraPosition([0, 0, 0], { az: 0, el: 0, dist: 10 });
    expect(front[1]).toBeCloseTo(10, 9);
    const right = cameraPosition([0, 0, 0], { az: 90, el: 0, dist: 10 });
    expect(right[0]).toBeCloseTo(10, 9);
    const top = cameraPosition([1, 2, 3], { az: 0, el: 90, dist: 10 });
    expect(top[2]).toBeCloseTo(13, 9);
  });

  it('glides to where input asks and comes to rest', () => {
    const orbit = new Orbit(HOME);
    orbit.rotate(40, 10);
    expect(orbit.step(1 / 60)).toBe(true);
    const frames = settleAll(orbit);
    expect(frames).toBeLessThan(120);
    expect(orbit.view.az).toBeCloseTo(75, 6);
    expect(orbit.view.el).toBeCloseTo(30, 6);
  });

  it('keeps the camera above the table and below the zenith', () => {
    const orbit = new Orbit(HOME);
    orbit.rotate(0, -500);
    expect(orbit.goal.el).toBe(LIMITS.minEl);
    orbit.rotate(0, 500);
    expect(orbit.goal.el).toBe(LIMITS.maxEl);
  });

  it('zooms inside its limits and says when a limit holds', () => {
    const orbit = new Orbit(HOME);
    expect(orbit.zoom(0.9)).toBe(true);
    for (let i = 0; i < 100; i++) orbit.zoom(0.9);
    expect(orbit.goal.dist).toBeCloseTo(HOME.dist * LIMITS.minZoom, 9);
    expect(orbit.zoom(0.9)).toBe(false);
    expect(orbit.zoom(1.1)).toBe(true);
    expect(orbit.zoom(NaN)).toBe(false);
    expect(orbit.zoom(-1)).toBe(false);
  });

  it('resets the short way round after many turns', () => {
    const orbit = new Orbit(HOME);
    orbit.rotate(725, 30);
    orbit.zoom(1.5);
    settleAll(orbit);
    orbit.reset();
    expect(orbit.goal.az).toBe(HOME.az + 720);
    expect(orbit.goal.el).toBe(HOME.el);
    expect(orbit.goal.dist).toBe(HOME.dist);
  });

  it('keeps the chosen zoom when the home view changes', () => {
    const orbit = new Orbit(HOME);
    orbit.zoom(1.5);
    orbit.setHome({ ...HOME, dist: 2000 });
    expect(orbit.goal.dist).toBeCloseTo(3000, 9);
    orbit.setHome({ ...HOME, dist: 500 }, true);
    expect(orbit.view.dist).toBe(500);
  });

  it('ignores input that is not a number', () => {
    const orbit = new Orbit(HOME);
    orbit.rotate(NaN, 5);
    expect(orbit.goal).toEqual(HOME);
  });
});

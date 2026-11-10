import { describe, expect, it } from 'vitest';
import type { StateFrame } from '$lib/link/protocol';
import { Lights } from './light';
import { LineKit } from './lines';

function frame(over: Partial<StateFrame> = {}): StateFrame {
  return {
    t: 's', ts: 0, mode: 'auto', st: 'locked', pan: 25, tilt: 40, vp: 0, vt: 0,
    ldr: [0.5, 0.5, 0.5, 0.5], raw: [4000, 4000, 4000, 4000], ex: 0, ey: 0, lvl: 0.5,
    lux: 900, pmw: 12, pv: null, gain: 1.2, off: 2, tgt: null, sun: null,
    sim: { az: 25, el: 40, on: true, lux: 900, amb: 60 },
    ...over
  };
}

function settled(lights: Lights) {
  for (let i = 0; i < 200; i++) lights.step(performance.now() + 1000, 1 / 60);
}

describe('the lights on the sky', () => {
  it('shows the lamp of the simulation where the frame puts it', () => {
    const lights = new Lights(new LineKit(), [0, -30, 106], 190);
    lights.intake(frame(), performance.now());
    settled(lights);
    expect(lights.showsLamp).toBe(true);
    expect(lights.lampSky!.az).toBeCloseTo(25, 3);
    expect(lights.lampSky!.el).toBeCloseTo(40, 3);
    lights.dispose();
  });

  it('shows no lamp for a real tracker and survives nulls and broken numbers', () => {
    const lights = new Lights(new LineKit(), [0, -30, 106], 190);
    expect(() => {
      lights.intake(frame({ sim: null, sun: null }), 0);
      lights.intake(frame({ sim: { az: NaN, el: 40, on: true, lux: 0, amb: 0 } }), 50);
      lights.intake(frame({ sun: { az: 10, el: NaN, caz: 190, t: 0 }, sim: null }), 100);
      lights.intake({ ...frame(), sim: undefined, sun: undefined } as unknown as StateFrame, 150);
      settled(lights);
    }).not.toThrow();
    expect(lights.showsLamp).toBe(false);
    lights.dispose();
  });

  it('keeps a lamp a hand put down until the stream has caught up', () => {
    const lights = new Lights(new LineKit(), [0, -30, 106], 190);
    lights.intake(frame(), performance.now());
    lights.hold({ az: -60, el: 20 }, true);
    // the next frame still has the old light, it must not pull the lamp back
    lights.intake(frame(), performance.now());
    settled(lights);
    expect(lights.lampSky!.az).toBeCloseTo(-60, 3);
    // the stream arrives at the new place, from there it follows again
    lights.intake(frame({ sim: { az: -60, el: 20, on: true, lux: 900, amb: 60 } }), performance.now());
    lights.intake(frame({ sim: { az: -58, el: 21, on: true, lux: 900, amb: 60 } }), performance.now());
    settled(lights);
    expect(lights.lampSky!.az).toBeCloseTo(-58, 3);
    lights.dispose();
  });

  it('lets go of a refused lamp at once', () => {
    const lights = new Lights(new LineKit(), [0, -30, 106], 190);
    lights.intake(frame(), performance.now());
    lights.hold({ az: -60, el: 20 }, true);
    lights.release();
    lights.intake(frame(), performance.now());
    settled(lights);
    expect(lights.lampSky!.az).toBeCloseTo(25, 3);
    lights.dispose();
  });

  it('takes the shorter way round when the lamp crosses behind', () => {
    const lights = new Lights(new LineKit(), [0, -30, 106], 190);
    lights.intake(frame({ sim: { az: 170, el: 30, on: true, lux: 900, amb: 60 } }), 0);
    lights.intake(frame({ sim: { az: -170, el: 30, on: true, lux: 900, amb: 60 } }), 50);
    lights.step(75, 1 / 60);
    const az = lights.lampSky!.az;
    // on the way from 170 to 190, never back through the front
    expect(az).toBeGreaterThan(169);
    expect(az).toBeLessThan(191);
    lights.dispose();
  });

  it('names the light the panel follows for the key light of the scene', () => {
    const lights = new Lights(new LineKit(), [0, -30, 106], 190);
    expect(lights.source).toBeNull();
    lights.intake(frame(), performance.now());
    settled(lights);
    expect(lights.source?.kind).toBe('lamp');
    expect(lights.source?.sky.el).toBeCloseTo(40, 3);
    expect(lights.lampOff).toBe(false);
    lights.intake(frame({ sim: { az: 25, el: 40, on: false, lux: 0, amb: 60 } }), performance.now());
    expect(lights.source).toBeNull();
    expect(lights.lampOff).toBe(true);
    // the sun comes before the lamp
    lights.intake(frame({ sun: { az: 150, el: 20, caz: 150, t: 0 } }), performance.now());
    settled(lights);
    expect(lights.source?.kind).toBe('sun');
    expect(lights.source?.sky.az).toBeCloseTo(150, 3);
    lights.dispose();
  });
});

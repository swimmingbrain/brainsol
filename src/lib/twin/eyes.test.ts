import { describe, expect, it } from 'vitest';
import { EYE_RAMP, glow, LUX_RAMP, luxLevel, stepGlow } from './eyes';
import { steps } from './ramp';

describe('the sensor windows', () => {
  it('reads lux on a log scale and treats missing values as dark', () => {
    expect(luxLevel(null)).toBe(0);
    expect(luxLevel(Number.NaN)).toBe(0);
    expect(luxLevel(5)).toBe(0);
    expect(luxLevel(60)).toBeGreaterThan(0.2);
    expect(luxLevel(60)).toBeLessThan(0.4);
    expect(luxLevel(900)).toBeGreaterThan(luxLevel(60));
    expect(luxLevel(80000)).toBe(1);
  });

  it('keeps the teal lux window apart from the orange eyes', () => {
    const lit = LUX_RAMP[LUX_RAMP.length - 1];
    const orange = EYE_RAMP[EYE_RAMP.length - 1];
    // blue over red for the window, red over blue for the eyes
    expect(lit[2]).toBeGreaterThan(lit[0]);
    expect(orange[0]).toBeGreaterThan(orange[2]);
    expect(steps(lit, orange)).toBeGreaterThan(60);
  });

  it('eases to the level and then rests without asking for frames', () => {
    const state = glow(EYE_RAMP);
    let draws = 0;
    let busy = true;
    for (let i = 0; i < 200 && busy; i++) {
      const step = stepGlow(state, 0.8, EYE_RAMP, 1 / 60);
      busy = step.busy;
      if (step.draw) draws++;
    }
    expect(busy).toBe(false);
    expect(draws).toBeGreaterThan(1);
    // sensor noise inside the dead band changes nothing
    for (const level of [0.79, 0.82, 0.78, 0.81]) {
      const step = stepGlow(state, level, EYE_RAMP, 1 / 60);
      expect(step.busy).toBe(false);
      expect(step.draw).toBeNull();
    }
  });
});

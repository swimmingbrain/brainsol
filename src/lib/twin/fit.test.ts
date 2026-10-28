import { describe, expect, it } from 'vitest';
import { applyFix, chooseFix, fixBox, misfit, NO_FIX, type Box } from './fit';

// the stand in at pan 0 and tilt 0, millimetres, z up
const BOUNDS: Box = { min: [-78, -78, 0], max: [78, 78, 161.5] };

describe('the fit of the cad files', () => {
  it('keeps files that follow the contract as they are', () => {
    const { fix, misfit: m } = chooseFix({ min: [-77, -78, 0], max: [78, 76, 160] }, BOUNDS);
    expect(fix).toEqual(NO_FIX);
    expect(m).toBeLessThan(0.02);
  });

  it('scales files written in metres', () => {
    const { fix } = chooseFix({ min: [-0.078, -0.078, 0], max: [0.078, 0.078, 0.1615] }, BOUNDS);
    expect(fix).toEqual({ scale: 1000, yUp: false });
  });

  it('turns files that came out y up', () => {
    // (x, y, z) of the device written as (x, z, -y)
    const { fix } = chooseFix({ min: [-78, 0, -78], max: [78, 161.5, 78] }, BOUNDS);
    expect(fix).toEqual({ scale: 1, yUp: true });
    expect(misfit(fixBox({ min: [-78, 0, -78], max: [78, 161.5, 78] }, fix), BOUNDS)).toBeLessThan(1e-9);
  });

  it('handles metres and y up together', () => {
    const { fix } = chooseFix({ min: [-0.078, 0, -0.078], max: [0.078, 0.1615, 0.078] }, BOUNDS);
    expect(fix).toEqual({ scale: 1000, yUp: true });
  });

  it('turns y up into z up with a true quarter turn', () => {
    expect(applyFix([1, 2, 3], { scale: 1, yUp: true })).toEqual([1, -3, 2]);
    expect(applyFix([1, 2, 3], { scale: 10, yUp: false })).toEqual([10, 20, 30]);
  });

  it('guesses only the unit without bounds', () => {
    expect(chooseFix({ min: [0, 0, 0], max: [0.15, 0.15, 0.16] }, null).fix).toEqual({ scale: 1000, yUp: false });
    expect(chooseFix({ min: [0, 0, 0], max: [150, 150, 160] }, null).fix).toEqual(NO_FIX);
  });

  it('leaves an empty box alone', () => {
    expect(chooseFix({ min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }, BOUNDS).fix).toEqual(NO_FIX);
  });
});

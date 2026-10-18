import { describe, expect, it } from 'vitest';
import { ARRIVE_DEG, LIMIT_PAN, LIMIT_TILT, arrived, brake, seekAxes, seekSpeed, stepAxes, still, stopNow, type Axes } from './motion';

const DT = 0.02;
const AMAX = 240;
const VMAX = 60;
const LIMITS = { pan: [-88, 88] as [number, number], tilt: [4, 176] as [number, number] };

function axes(pan = 0, tilt = 90, vp = 0, vt = 0): Axes {
  return { pan, tilt, vp, vt };
}

// the biggest change of speed between two ticks over a run, per second
function worstAccel(run: (m: Axes) => void, m: Axes, ticks: number): number {
  let worst = 0;
  for (let i = 0; i < ticks; i++) {
    const vp = m.vp;
    const vt = m.vt;
    run(m);
    worst = Math.max(worst, Math.abs(m.vp - vp) / DT, Math.abs(m.vt - vt) / DT);
  }
  return worst;
}

describe('the seek speed', () => {
  it('is zero on the target and keeps the sign of the error', () => {
    expect(seekSpeed(0, VMAX, AMAX)).toBe(0);
    expect(seekSpeed(30, VMAX, AMAX)).toBe(VMAX);
    expect(seekSpeed(-30, VMAX, AMAX)).toBe(-VMAX);
  });

  it('allows only a speed the deceleration can still stop, with a soft tail near the end', () => {
    // 2 degrees: sqrt(2 * 0.8 * 240 * 2) is about 27.7, 2 / 0.1 is 20
    expect(seekSpeed(2, VMAX, AMAX)).toBeCloseTo(20, 9);
    expect(seekSpeed(5, VMAX, AMAX)).toBeCloseTo(Math.sqrt(2 * 0.8 * 240 * 5), 9);
  });
});

describe('the brake before a soft limit', () => {
  it('leaves a speed away from the limit alone', () => {
    expect(brake(-40, 80, -88, 88, AMAX)).toBe(-40);
  });

  it('caps a speed towards a close limit and stops on it', () => {
    expect(brake(60, 87, -88, 88, AMAX)).toBeLessThan(20);
    expect(brake(60, 88, -88, 88, AMAX)).toBe(0);
    expect(brake(-60, -88, -88, 88, AMAX)).toBe(0);
  });
});

describe('a tick of the limiter', () => {
  it('ramps the speed with the acceleration limit', () => {
    const m = axes();
    stepAxes(m, 60, -60, AMAX, LIMITS, DT);
    expect(m.vp).toBeCloseTo(AMAX * DT, 9);
    expect(m.vt).toBeCloseTo(-AMAX * DT, 9);
    expect(m.pan).toBeCloseTo(AMAX * DT * DT, 9);
  });

  it('comes to rest on a soft limit at full speed without a jump in speed', () => {
    const m = axes(0, 90, 60, 0);
    let pushing = 0;
    const worst = worstAccel(
      (a) => {
        pushing = stepAxes(a, 60, 0, AMAX, LIMITS, DT);
      },
      m,
      150
    );
    expect(m.pan).toBe(88);
    expect(m.vp).toBe(0);
    expect(pushing).toBe(LIMIT_PAN);
    expect(worst).toBeLessThanOrEqual(AMAX + 1e-6);
  });

  it('says which axis presses on a limit, only while it wants to go further', () => {
    const m = axes(-88, 4);
    expect(stepAxes(m, -10, -10, AMAX, LIMITS, DT)).toBe(LIMIT_PAN | LIMIT_TILT);
    expect(stepAxes(axes(-88, 4), 10, 0, AMAX, LIMITS, DT)).toBe(0);
    expect(stepAxes(axes(0, 176), 0, 5, AMAX, LIMITS, DT)).toBe(LIMIT_TILT);
  });

  it('works in place and only on the object it is given', () => {
    const m = axes(10, 20);
    const result = stepAxes(m, 30, 30, AMAX, LIMITS, DT);
    expect(typeof result).toBe('number');
    expect(m.vp).toBeGreaterThan(0);
  });
});

describe('a seek', () => {
  it('reaches a far target without passing it and without a jump in speed', () => {
    const m = axes(-60, 20);
    let passed = false;
    let done = false;
    let ticks = 0;
    const worst = worstAccel(
      (a) => {
        done = seekAxes(a, 70, 150, VMAX, AMAX, LIMITS, DT) || done;
        if (a.pan > 70 + 0.01 || a.tilt > 150 + 0.01) passed = true;
        if (!done) ticks++;
      },
      m,
      300
    );
    expect(done).toBe(true);
    expect(passed).toBe(false);
    expect(m.pan).toBe(70);
    expect(m.tilt).toBe(150);
    expect(worst).toBeLessThanOrEqual(AMAX + 1e-6);
    // 130 degrees at 60 per second with the ramps takes a little over two seconds
    expect(ticks * DT).toBeGreaterThan(2);
    expect(ticks * DT).toBeLessThan(3.5);
  });

  it('keeps the target inside the soft limits', () => {
    const m = axes();
    for (let i = 0; i < 300; i++) seekAxes(m, 120, -30, VMAX, AMAX, LIMITS, DT);
    expect(m.pan).toBe(88);
    expect(m.tilt).toBe(4);
  });

  it('obeys a lower speed cap', () => {
    const m = axes(0, 90);
    let top = 0;
    for (let i = 0; i < 200; i++) {
      seekAxes(m, 80, 90, 25, AMAX, LIMITS, DT);
      top = Math.max(top, Math.abs(m.vp));
    }
    expect(top).toBeLessThanOrEqual(25 + 1e-9);
  });

  it('turns round smoothly when the target flips while the head is fast', () => {
    const m = axes(0, 90);
    for (let i = 0; i < 40; i++) seekAxes(m, 80, 90, VMAX, AMAX, LIMITS, DT);
    expect(m.vp).toBeGreaterThan(40);
    const worst = worstAccel((a) => seekAxes(a, -80, 90, VMAX, AMAX, LIMITS, DT), m, 300);
    expect(worst).toBeLessThanOrEqual(AMAX + 1e-6);
    expect(m.pan).toBe(-80);
  });
});

describe('the small helpers', () => {
  it('knows when the head is there, still, or stopped', () => {
    expect(arrived(axes(10, 20), 10 + ARRIVE_DEG / 2, 20)).toBe(true);
    expect(arrived(axes(10, 20, 1), 10, 20)).toBe(false);
    expect(still(axes(0, 0, 0.4, -0.4))).toBe(true);
    expect(still(axes(0, 0, 0.6, 0))).toBe(false);
    const m = axes(0, 0, 30, -20);
    stopNow(m);
    expect(m.vp).toBe(0);
    expect(m.vt).toBe(0);
  });
});

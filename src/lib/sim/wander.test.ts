import { describe, expect, it } from 'vitest';
import { harness } from './harness';
import { normal, offAxis } from './kinematics';
import { PHONE_LIGHT } from './physics';
import { Wander, WANDER_RAMP, WANDER_WAIT, wanderPace, wanderPose } from './wander';

describe('the lamp path', () => {
  it('starts at the phone light and waits before it eases in', () => {
    expect(wanderPose(0)).toEqual({ pan: 25, tilt: 40 });
    expect(wanderPace(WANDER_WAIT - 0.1)).toBe(0);
    expect(wanderPace(WANDER_WAIT + WANDER_RAMP / 2)).toBeCloseTo(0.5, 9);
    expect(wanderPace(WANDER_WAIT + WANDER_RAMP + 1)).toBe(1);
  });

  it('stays in the reachable sky, crosses the zenith now and then and goes behind half the time', () => {
    let crossings = 0;
    let behind = 0;
    let fastest = 0;
    const steps = 20 * 60 * 20;
    let prev = wanderPose(0, { pan: 0, tilt: 0 });
    let prevN = normal(prev.pan, prev.tilt);
    for (let i = 1; i <= steps; i++) {
      const p = wanderPose(i * 0.05);
      expect(Math.abs(p.pan)).toBeLessThanOrEqual(71);
      expect(p.tilt).toBeGreaterThanOrEqual(14);
      expect(p.tilt).toBeLessThanOrEqual(166);
      if ((p.tilt - 90) * (prev.tilt - 90) < 0) crossings++;
      if (p.tilt > 90) behind++;
      const n = normal(p.pan, p.tilt);
      const step = Math.acos(Math.min(1, n[0] * prevN[0] + n[1] * prevN[1] + n[2] * prevN[2])) * (180 / Math.PI);
      fastest = Math.max(fastest, step / 0.05);
      prev = p;
      prevN = n;
    }
    // twenty minutes of path
    expect(crossings).toBeGreaterThan(16);
    expect(crossings).toBeLessThan(40);
    expect(behind / steps).toBeGreaterThan(0.4);
    expect(behind / steps).toBeLessThan(0.6);
    expect(fastest).toBeLessThan(6);
  });

  it('moves the lamp to where a panel at the path pose looks', () => {
    const wander = new Wander();
    const light = { ...PHONE_LIGHT };
    for (let i = 0; i < 50 * 40; i++) {
      wander.step(0.02, light);
      const p = wanderPose(wander.tau);
      expect(offAxis(p.pan, p.tilt, light.az, light.el)).toBeLessThan(1e-4);
      expect(light.az).toBeGreaterThanOrEqual(-180);
      expect(light.az).toBeLessThanOrEqual(180);
    }
  });
});

describe('the idle visit', () => {
  it('lets the tracker follow the wandering lamp over the top and past the zenith', () => {
    const h = harness({ wander: true });
    h.advance(3);
    expect(h.last().sim).toMatchObject({ az: 25, el: 40 });
    h.advance(117);
    const frames = h.frames().filter((f) => f.ts - 1_700_000_000 > 8);
    const offs = frames.map((f) => offAxis(f.pan, f.tilt, f.sim!.az, f.sim!.el));
    const sorted = [...offs].sort((a, b) => a - b);
    expect(sorted[Math.floor(0.5 * sorted.length)]).toBeLessThan(7);
    expect(sorted[Math.floor(0.99 * sorted.length)]).toBeLessThan(10);
    expect(frames.some((f) => f.tilt > 105)).toBe(true);
    expect(frames.some((f) => f.tilt < 60)).toBe(true);
    expect(frames.some((f) => f.sim!.el > 80)).toBe(true);
    expect(frames.every((f) => f.mode === 'auto')).toBe(true);
  });

  it('stops for good on the first command that moves the lamp and says so to an admin', () => {
    const h = harness({ wander: true });
    h.unlock();
    h.advance(20);
    const moved = h.last().sim!;
    expect(moved.az).not.toBe(25);
    h.cmd({ op: 'set', key: 'kp', value: 100 });
    h.cmd({ op: 'ping' });
    h.advance(1);
    expect(h.engine.wandering).toBe(true);
    h.cmd({ op: 'simlight', lux: 1000 });
    expect(h.engine.wandering).toBe(false);
    expect(h.of('evt').pop()!.msg).toBe('the lamp stops wandering and stays where it is');
    const still = h.last().sim!;
    h.advance(30);
    expect(h.last().sim).toEqual({ ...still, lux: 1000 });
    h.engine.stop();
    h.engine.start(() => undefined);
    expect(h.engine.wandering).toBe(false);
  });

  it('also stops on a mode change, a target, the joystick, the sun or an activity', () => {
    for (const body of [
      { op: 'mode', mode: 'auto' },
      { op: 'target', pan: 0, tilt: 50 },
      { op: 'rate', pan: 0.2, tilt: 0 },
      { op: 'sun', speed: 60 },
      { op: 'scan', step: 45 },
      { op: 'exp', kind: 'step' },
      { op: 'calib', step: 'bright' }
    ]) {
      const h = harness({ wander: true });
      h.unlock();
      h.advance(12);
      h.cmd(body);
      expect(h.engine.wandering, JSON.stringify(body)).toBe(false);
    }
  });

  it('runs the same for the same seed', () => {
    const a = harness({ wander: true, seed: 5 });
    const b = harness({ wander: true, seed: 5 });
    a.advance(30);
    b.advance(30);
    expect(a.frames()).toEqual(b.frames());
  });
});

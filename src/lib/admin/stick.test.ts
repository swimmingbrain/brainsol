import { describe, expect, it } from 'vitest';
import { clampOffset, DEAD_ZONE, isStickKey, keyVector, padVector, RateStream, ZERO, type Interval, type Vec } from './stick';

describe('padVector', () => {
  it('is zero in the middle and inside the dead zone', () => {
    expect(padVector(0, 0, 80)).toEqual(ZERO);
    expect(padVector(80 * DEAD_ZONE * 0.9, 0, 80)).toEqual(ZERO);
  });

  it('turns right into plus pan and up on the screen into plus tilt', () => {
    expect(padVector(80, 0, 80)).toEqual({ x: 1, y: 0 });
    expect(padVector(0, -80, 80)).toEqual({ x: 0, y: 1 });
    expect(padVector(-80, 80, 80).x).toBeLessThan(0);
    expect(padVector(-80, 80, 80).y).toBeLessThan(0);
  });

  it('never goes past one, even far outside the ring', () => {
    const v = padVector(400, -300, 80);
    expect(Math.hypot(v.x, v.y)).toBeLessThanOrEqual(1.001);
  });

  it('grows smoothly from zero at the edge of the dead zone', () => {
    const just = padVector(80 * (DEAD_ZONE + 0.02), 0, 80);
    const half = padVector(40, 0, 80);
    expect(just.x).toBeGreaterThanOrEqual(0);
    expect(just.x).toBeLessThan(0.05);
    expect(half.x).toBeGreaterThan(just.x);
    expect(half.x).toBeLessThan(0.5);
  });

  it('stays calm with a broken size or position', () => {
    expect(padVector(10, 10, 0)).toEqual(ZERO);
    expect(padVector(NaN, 10, 80)).toEqual(ZERO);
  });
});

describe('clampOffset', () => {
  it('keeps the knob inside the ring', () => {
    expect(clampOffset(10, 0, 50)).toEqual({ x: 10, y: 0 });
    const out = clampOffset(300, 400, 50);
    expect(Math.hypot(out.x, out.y)).toBeCloseTo(50);
  });
});

describe('keyVector', () => {
  it('maps the arrow keys and ignores the rest', () => {
    expect(keyVector(['ArrowRight'])).toEqual({ x: 1, y: 0 });
    expect(keyVector(['ArrowUp', 'a'])).toEqual({ x: 0, y: 1 });
    expect(keyVector(['ArrowLeft', 'ArrowRight'])).toEqual(ZERO);
    expect(isStickKey('ArrowDown')).toBe(true);
    expect(isStickKey('Enter')).toBe(false);
  });

  it('goes diagonal at full speed, not faster', () => {
    const v = keyVector(['ArrowUp', 'ArrowRight']);
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(1, 1);
  });

  it('moves at a third with shift', () => {
    expect(keyVector(['ArrowDown'], true)).toEqual({ x: 0, y: -0.33 });
  });
});

describe('RateStream', () => {
  function fakeInterval() {
    let fn: (() => void) | null = null;
    const interval: Interval = {
      start: (f) => {
        fn = f;
        return 1;
      },
      stop: () => {
        fn = null;
      }
    };
    return { interval, tick: () => fn?.(), running: () => fn !== null };
  }

  it('sends at once, repeats the newest value and sends one zero on release', () => {
    const sent: Vec[] = [];
    const fake = fakeInterval();
    const stream = new RateStream((v) => sent.push(v), 100, fake.interval);
    stream.set({ x: 0.5, y: 0 });
    expect(sent).toEqual([{ x: 0.5, y: 0 }]);
    // pointer moves between ticks only change what the next tick sends
    stream.set({ x: 0.6, y: 0 });
    stream.set({ x: 0.7, y: 0.1 });
    expect(sent).toHaveLength(1);
    fake.tick();
    fake.tick();
    expect(sent.slice(1)).toEqual([
      { x: 0.7, y: 0.1 },
      { x: 0.7, y: 0.1 }
    ]);
    stream.set(ZERO);
    expect(sent[sent.length - 1]).toEqual(ZERO);
    expect(fake.running()).toBe(false);
    expect(stream.active).toBe(false);
  });

  it('sends nothing for a release that never started', () => {
    const sent: Vec[] = [];
    const fake = fakeInterval();
    const stream = new RateStream((v) => sent.push(v), 100, fake.interval);
    stream.release();
    stream.set(ZERO);
    expect(sent).toEqual([]);
  });

  it('keeps the head alive with the real timers at about ten a second', async () => {
    const sent: Vec[] = [];
    const stream = new RateStream((v) => sent.push(v), 20);
    stream.set({ x: 1, y: 0 });
    // a busy machine fires timers late, so wait for the beats instead of a fixed time
    const start = Date.now();
    while (sent.length < 4 && Date.now() - start < 3000) await new Promise((resolve) => setTimeout(resolve, 20));
    stream.release();
    expect(sent.length).toBeGreaterThanOrEqual(4);
    expect(sent[sent.length - 1]).toEqual(ZERO);
  });
});

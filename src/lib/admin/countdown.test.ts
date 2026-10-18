import { describe, expect, it } from 'vitest';
import { secondsLeft, tick, waitText } from './countdown';

describe('secondsLeft', () => {
  it('is zero when nothing is locked or the lock ran out', () => {
    expect(secondsLeft(0, 1000)).toBe(0);
    expect(secondsLeft(900, 1000)).toBe(0);
    expect(secondsLeft(1000, 1000)).toBe(0);
    expect(secondsLeft(NaN, 1000)).toBe(0);
  });

  it('rounds a part of a second up so the field never opens early', () => {
    expect(secondsLeft(31_000, 1000)).toBe(30);
    expect(secondsLeft(30_001, 1000)).toBe(30);
    expect(secondsLeft(1001, 1000)).toBe(1);
  });
});

describe('waitText', () => {
  it('writes short waits in seconds and long ones in minutes', () => {
    expect(waitText(30)).toBe('30 s');
    expect(waitText(58.2)).toBe('59 s');
    expect(waitText(59.2)).toBe('1:00 min');
    expect(waitText(60)).toBe('1:00 min');
    expect(waitText(125)).toBe('2:05 min');
    expect(waitText(-3)).toBe('0 s');
  });
});

describe('tick', () => {
  function fakeClock(start: number) {
    let now = start;
    let fn: (() => void) | null = null;
    return {
      clock: {
        now: () => now,
        every: (f: () => void) => {
          fn = f;
          return () => {
            fn = null;
          };
        }
      },
      advance(ms: number) {
        for (let i = 0; i < ms / 250; i++) {
          now += 250;
          fn?.();
        }
      },
      running: () => fn !== null
    };
  }

  it('reports each new second once and stops at zero', () => {
    const fake = fakeClock(0);
    const seen: number[] = [];
    tick(3000, (s) => seen.push(s), fake.clock);
    expect(seen).toEqual([3]);
    fake.advance(3000);
    expect(seen).toEqual([3, 2, 1, 0]);
    expect(fake.running()).toBe(false);
  });

  it('does not start a timer when nothing is locked', () => {
    const fake = fakeClock(5000);
    const seen: number[] = [];
    tick(0, (s) => seen.push(s), fake.clock);
    expect(seen).toEqual([0]);
    expect(fake.running()).toBe(false);
  });

  it('can be stopped early', () => {
    const fake = fakeClock(0);
    const seen: number[] = [];
    const stop = tick(10_000, (s) => seen.push(s), fake.clock);
    fake.advance(1000);
    stop();
    fake.advance(5000);
    expect(seen).toEqual([10, 9]);
  });
});

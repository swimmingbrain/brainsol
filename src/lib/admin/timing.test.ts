import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { debounce, throttle } from './timing';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('debounce', () => {
  it('waits until the calls stop and then sends the newest value once', () => {
    const seen: number[] = [];
    const d = debounce((v: number) => seen.push(v), 250);
    d.call(1);
    vi.advanceTimersByTime(200);
    d.call(2);
    vi.advanceTimersByTime(200);
    d.call(3);
    expect(seen).toEqual([]);
    expect(d.waiting).toBe(true);
    vi.advanceTimersByTime(250);
    expect(seen).toEqual([3]);
    expect(d.waiting).toBe(false);
  });

  it('can be flushed or cancelled', () => {
    const seen: number[] = [];
    const d = debounce((v: number) => seen.push(v), 250);
    d.call(1);
    d.flush();
    expect(seen).toEqual([1]);
    d.call(2);
    d.cancel();
    vi.advanceTimersByTime(1000);
    expect(seen).toEqual([1]);
    d.flush();
    expect(seen).toEqual([1]);
  });
});

describe('throttle', () => {
  it('passes the first call at once and then one per interval with the newest value', () => {
    const seen: number[] = [];
    const th = throttle((v: number) => seen.push(v), 100);
    th.call(1);
    expect(seen).toEqual([1]);
    th.call(2);
    th.call(3);
    vi.advanceTimersByTime(99);
    expect(seen).toEqual([1]);
    vi.advanceTimersByTime(1);
    expect(seen).toEqual([1, 3]);
    vi.advanceTimersByTime(100);
    // nothing new came in, the interval closes
    expect(seen).toEqual([1, 3]);
    th.call(4);
    expect(seen).toEqual([1, 3, 4]);
  });

  it('never sends more than ten a second however fast the calls come', () => {
    const seen: number[] = [];
    const th = throttle((v: number) => seen.push(v), 100);
    for (let i = 0; i < 1000; i++) {
      th.call(i);
      vi.advanceTimersByTime(1);
    }
    expect(seen.length).toBeLessThanOrEqual(11);
    vi.advanceTimersByTime(100);
    expect(seen[seen.length - 1]).toBe(999);
  });

  it('sends what is left on flush and drops it on cancel', () => {
    const seen: number[] = [];
    const th = throttle((v: number) => seen.push(v), 100);
    th.call(1);
    th.call(2);
    th.flush();
    expect(seen).toEqual([1, 2]);
    th.call(3);
    th.call(4);
    th.cancel();
    vi.advanceTimersByTime(500);
    expect(seen).toEqual([1, 2, 3]);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { History, sampleOf } from './history.svelte';
import type { StateFrame } from '$lib/link/protocol';

function frame(ts: number, pan = ts): StateFrame {
  return {
    t: 's',
    ts,
    mode: 'auto',
    st: 'tracking',
    pan,
    tilt: 40,
    vp: 0,
    vt: 0,
    ldr: [1, 1, 1, 1],
    raw: [7000, 7000, 7000, 7000],
    ex: 0.01,
    ey: -0.02,
    lvl: 0.9,
    lux: 950,
    pmw: 13.8,
    pv: null,
    gain: null,
    off: 1.2,
    tgt: null,
    sun: null,
    sim: null
  };
}

describe('the history store', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('takes the chart values out of a frame, null stays null', () => {
    expect(sampleOf(frame(5))).toEqual({ time: 5, pan: 5, tilt: 40, lvl: 0.9, lux: 950, pmw: 13.8, off: 1.2, gain: null, ex: 0.01, ey: -0.02 });
  });

  it('ticks its version at most 10 times a second however fast frames come', () => {
    const history = new History(1000, () => Date.now());
    for (let i = 0; i < 100; i++) {
      history.push(frame(i / 50));
      vi.advanceTimersByTime(20);
    }
    // 2 seconds of frames at 50 Hz
    expect(history.length).toBe(100);
    expect(history.version).toBeGreaterThanOrEqual(19);
    expect(history.version).toBeLessThanOrEqual(21);
  });

  it('ticks once more after the last frame, so the newest sample is drawn', () => {
    const history = new History(1000, () => Date.now());
    history.push(frame(1));
    expect(history.version).toBe(0);
    vi.advanceTimersByTime(0);
    expect(history.version).toBe(1);
    history.push(frame(2));
    vi.advanceTimersByTime(99);
    expect(history.version).toBe(1);
    vi.advanceTimersByTime(1);
    expect(history.version).toBe(2);
  });

  it('puts the tracker history in front of the live samples', () => {
    const history = new History(1000, () => Date.now());
    history.push(frame(1000, 7));
    history.push(frame(1000.05, 8));
    history.prefill({
      t0: 997,
      dt: 1,
      cols: ['pan', 'tilt', 'lvl', 'lux', 'pmw', 'off', 'gain'],
      rows: [
        [1, 10, 0.5, 400, 5, null, 1.1],
        [2, 11, 0.6, 500, 6, 2, 1.2],
        [3, 12, 0.7, 600, 7, 3, 1.3],
        // this one is already covered by the stream
        [4, 13, 0.8, 700, 8, 4, 1.4]
      ]
    });
    expect(history.ring.toArray('time')).toEqual([997, 998, 999, 1000, 1000.05]);
    expect(history.ring.toArray('pan')).toEqual([1, 2, 3, 7, 8]);
    const off = history.ring.toArray('off');
    expect(off.slice(0, 3)).toEqual([null, 2, 3]);
    expect(off[3]).toBeCloseTo(1.2, 5);
    // the history has no ex and ey, those stay gaps
    expect(history.ring.get('ex', 0)).toBeNull();
  });

  it('keeps the newest rows when the history is longer than the ring', () => {
    const history = new History(3, () => Date.now());
    history.prefill({ t0: 0, dt: 1, cols: ['pan'], rows: [[1], [2], [3], [4], [5]] });
    expect(history.ring.toArray('pan')).toEqual([3, 4, 5]);
    expect(history.ring.toArray('time')).toEqual([2, 3, 4]);
  });

  it('ignores a history answer that is not one', () => {
    const history = new History(10, () => Date.now());
    history.push(frame(1));
    history.prefill({} as never);
    expect(history.length).toBe(1);
  });
});

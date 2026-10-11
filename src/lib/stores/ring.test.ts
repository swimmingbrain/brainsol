import { describe, expect, it } from 'vitest';
import { HISTORY_COLUMNS, Ring } from './ring';

function filled(capacity: number, n: number) {
  const ring = new Ring(capacity);
  for (let i = 0; i < n; i++) ring.push({ time: 1000 + i, pan: i, tilt: -i, lux: i % 3 === 0 ? null : i * 10 });
  return ring;
}

describe('the history ring', () => {
  it('has a column for every chart value', () => {
    const ring = new Ring(4);
    expect(Object.keys(ring.columns)).toEqual([...HISTORY_COLUMNS]);
    expect(ring.columns.time).toBeInstanceOf(Float64Array);
    expect(ring.columns.pan).toBeInstanceOf(Float32Array);
  });

  it('keeps samples in order until it is full', () => {
    const ring = filled(5, 3);
    expect(ring.length).toBe(3);
    expect([0, 1, 2].map((i) => ring.get('pan', i))).toEqual([0, 1, 2]);
    expect(ring.latest('time')).toBe(1002);
  });

  it('overwrites the oldest sample once it is full', () => {
    const ring = filled(5, 12);
    expect(ring.length).toBe(5);
    expect(Array.from(ring.copy('pan'))).toEqual([7, 8, 9, 10, 11]);
    expect(ring.get('time', 0)).toBe(1007);
    expect(ring.latest('pan')).toBe(11);
  });

  it('gives null for a missing value and for an index out of range', () => {
    const ring = filled(10, 4);
    expect(ring.get('lux', 0)).toBeNull();
    expect(ring.get('lux', 1)).toBe(10);
    expect(ring.get('gain', 1)).toBeNull();
    expect(ring.get('pan', 4)).toBeNull();
    expect(ring.get('pan', -1)).toBeNull();
    expect(ring.toArray('lux')).toEqual([null, 10, 20, null]);
  });

  it('stores NaN and infinity as missing', () => {
    const ring = new Ring(3);
    ring.push({ time: 1, pan: NaN, tilt: Infinity });
    expect(ring.get('pan', 0)).toBeNull();
    expect(ring.get('tilt', 0)).toBeNull();
  });

  it('finds the first sample at or after a time', () => {
    const ring = filled(6, 10);
    expect(ring.since(0)).toBe(0);
    expect(ring.since(1006)).toBe(2);
    expect(ring.since(1006.5)).toBe(3);
    expect(ring.since(5000)).toBe(6);
  });

  it('copies a window into a buffer it is given and reuses it', () => {
    const ring = filled(8, 20);
    const out = new Float64Array(8);
    const view = ring.copy('pan', 5, out);
    expect(Array.from(view)).toEqual([17, 18, 19]);
    expect(view.buffer).toBe(out.buffer);
    expect(ring.copy('pan', 0, new Float64Array(2))).toHaveLength(8);
  });

  it('starts over after clear', () => {
    const ring = filled(4, 9);
    ring.clear();
    expect(ring.length).toBe(0);
    expect(ring.latest('pan')).toBeNull();
    ring.push({ time: 1, pan: 42 });
    expect(Array.from(ring.copy('pan'))).toEqual([42]);
  });

  it('holds ten minutes at 20 Hz without a hitch', () => {
    const ring = new Ring(12000);
    for (let i = 0; i < 30000; i++) ring.push({ time: i / 20, pan: i });
    expect(ring.length).toBe(12000);
    expect(ring.get('pan', 0)).toBe(18000);
    expect(ring.latest('time')).toBeCloseTo(29999 / 20, 6);
  });
});

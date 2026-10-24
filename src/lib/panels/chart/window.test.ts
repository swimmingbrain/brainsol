import { describe, expect, it } from 'vitest';
import { Ring } from '$lib/stores/ring';
import { lastValue, windowData } from './window';

function filled(times: number[], lux: (number | null)[] = times.map((t) => t * 10)): Ring {
  const ring = new Ring(20000);
  times.forEach((time, i) => ring.push({ time, lux: lux[i], lvl: 0.5 }));
  return ring;
}

describe('the chart window', () => {
  it('keeps only the last span seconds and ends at the newest sample', () => {
    const ring = filled([0, 10, 20, 30, 40, 50, 60]);
    const w = windowData(ring, [{ col: 'lux' }], 25, 600, 100);
    expect(w.data[0]).toEqual([40, 50, 60]);
    expect(w.data[1]).toEqual([400, 500, 600]);
    expect(w.min).toBe(35);
    expect(w.max).toBe(60);
  });

  it('turns missing values into nulls and maps the unit', () => {
    const ring = filled([1, 2, 3], [5, null, 7]);
    const w = windowData(ring, [{ col: 'lux' }, { col: 'lvl', map: (v) => v * 100 }], 10, 600, 100);
    expect(w.data[1]).toEqual([5, null, 7]);
    expect(w.data[2]).toEqual([50, 50, 50]);
  });

  it('breaks the line where the stream paused', () => {
    const ring = filled([1, 1.05, 1.1, 9, 9.05]);
    const w = windowData(ring, [{ col: 'lux' }], 60);
    expect(w.data[0]).toHaveLength(6);
    expect(w.data[1][3]).toBeNull();
    expect(w.data[0][3]).toBeGreaterThan(1.1);
    expect(w.data[0][3]).toBeLessThan(9);
  });

  it('draws the 1 Hz history of the tracker as one line', () => {
    const ring = filled([0, 1, 2, 3, 4]);
    expect(windowData(ring, [{ col: 'lux' }], 60).data[1]).not.toContain(null);
  });

  it('thins ten minutes at 20 Hz to the points the plot can show and keeps a pause', () => {
    const times: number[] = [];
    for (let i = 0; i < 12000; i++) {
      const t = i / 20;
      if (t > 200 && t < 230) continue;
      times.push(t);
    }
    const ring = filled(times);
    const w = windowData(ring, [{ col: 'lux' }], 600, 300);
    expect(w.data[0].length).toBeLessThanOrEqual(302);
    expect(w.data[0].length).toBeGreaterThan(250);
    expect(w.data[1].filter((v) => v === null)).toHaveLength(1);
    // the means stay on the line lux = 10 t
    w.data[0].forEach((t, i) => {
      const v = w.data[1][i];
      if (v !== null && t !== null) expect(v).toBeCloseTo(t * 10, 0);
    });
    for (let i = 1; i < w.data[0].length; i++) expect(w.data[0][i]!).toBeGreaterThan(w.data[0][i - 1]!);
  });

  it('gives an empty window before the first sample', () => {
    const w = windowData(new Ring(10), [{ col: 'lux' }], 60);
    expect(w.data).toEqual([[], []]);
    expect(w.max - w.min).toBe(60);
  });

  it('finds the newest value that is there', () => {
    expect(lastValue([1, 2, null])).toBe(2);
    expect(lastValue([null])).toBeNull();
  });
});

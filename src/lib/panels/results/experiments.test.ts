import { describe, expect, it } from 'vitest';
import { cosineFit, cosineTable, csvUrl, mergeRecords, parseList, roundGains, stepTable, toCsv } from './experiments';
import type { CompareResult, CosineResult, StepResult } from '$lib/link/protocol';

const cosine: CosineResult = {
  peak: 840,
  amb: 60,
  r2: 0.996,
  points: [
    [-10, 887],
    [0, 902],
    [10, 886],
    [-60, 482]
  ]
};

const compare: CompareResult = {
  gain: 1.36,
  spread: 0.04,
  rounds: [
    { fixed: 650, tracked: 890 },
    { fixed: 660, tracked: 905 },
    { fixed: 0, tracked: 880 }
  ]
};

const step: StepResult = {
  settle: 1.2,
  overshoot: 2.1,
  samples: [
    [0, 0.4, 0, 20, 45],
    [0.5, 0.1, 0, 4, 45],
    [1, -0.02, 0, -1.5, 45.2],
    [1.5, 0, 0, 0, 45]
  ]
};

describe('the experiment results', () => {
  it('evaluates the fitted cosine and cuts it at 90 degrees', () => {
    expect(cosineFit(cosine, 0)).toBe(900);
    expect(cosineFit(cosine, 60)).toBeCloseTo(480, 6);
    expect(cosineFit(cosine, 120)).toBe(60);
  });

  it('shifts the fitted cosine by the offset the fit took out', () => {
    const off = { ...cosine, offset: 4 };
    expect(cosineFit(off, 4)).toBe(900);
    expect(cosineFit(off, 64)).toBeCloseTo(480, 6);
    expect(cosineFit(off, -56)).toBeCloseTo(480, 6);
    expect(cosineFit(off, -60)).toBeLessThan(cosineFit(cosine, -60));
    // a result without an offset, or with a broken one, is drawn as if it were zero
    expect(cosineFit({ ...cosine, offset: NaN }, 60)).toBeCloseTo(480, 6);
    // the csv has the same curve
    const row = toCsv({ id: 'c', kind: 'cosine', ts: 0, result: off }).split('\n')[2];
    expect(row).toBe(`0,902,${Math.round(cosineFit(off, 0) * 1e4) / 1e4}`);
  });

  it('lays the measured points on a whole degree grid with the fit', () => {
    const table = cosineTable(cosine);
    expect(table.delta[0]).toBe(-60);
    expect(table.delta.at(-1)).toBe(60);
    expect(table.measured[table.delta.indexOf(0)]).toBe(902);
    expect(table.measured[table.delta.indexOf(5)]).toBeNull();
    expect(table.measured.filter((v) => v !== null)).toHaveLength(4);
    expect(table.fit[table.delta.indexOf(0)]).toBe(900);
  });

  it('turns the step samples into distance from the rest pose', () => {
    const table = stepTable(step);
    expect(table.pan).toEqual([20, 4, -1.5, 0]);
    expect(table.tilt[2]).toBeCloseTo(0.2, 6);
    expect(table.t).toEqual([0, 0.5, 1, 1.5]);
  });

  it('gives the gain of each round and none without a fixed reading', () => {
    const gains = roundGains(compare);
    expect(gains[0]).toBeCloseTo(890 / 650, 6);
    expect(gains[2]).toBeNull();
  });

  it('merges the stored list and this session, newest first, one row per id', () => {
    const merged = mergeRecords(
      [{ id: 'b', kind: 'step', ts: 20 }],
      [
        { id: 'a', kind: 'cosine', ts: 10 },
        { id: 'b', kind: 'step', ts: 20 },
        { id: 'c', kind: 'compare', ts: 30 }
      ]
    );
    expect(merged.map((m) => m.id)).toEqual(['c', 'b', 'a']);
  });

  it('reads the list from the tracker and drops what it does not know', () => {
    const items = [{ id: 'x', kind: 'cosine', ts: 1 }, { id: 'y', kind: 'dance', ts: 2 }, { kind: 'step' }];
    expect(parseList(items)).toEqual([{ id: 'x', kind: 'cosine', ts: 1 }]);
    expect(parseList({ experiments: items })).toHaveLength(1);
    expect(parseList(null)).toEqual([]);
    expect(parseList('nope')).toEqual([]);
  });

  it('links the csv of the tracker', () => {
    expect(csvUrl('http://pi.local:8080', 'cos 1')).toBe('http://pi.local:8080/api/experiments/cos%201.csv');
  });

  it('writes a csv for each kind', () => {
    const cos = toCsv({ id: 'a', kind: 'cosine', ts: 1, result: cosine }).split('\n');
    expect(cos[0]).toBe('delta_deg,lux,fit_lux');
    expect(cos[2]).toBe('0,902,900');
    const cmp = toCsv({ id: 'b', kind: 'compare', ts: 1, result: compare }).split('\n');
    expect(cmp[1]).toBe('1,650,890,1.3692');
    expect(cmp[3]).toBe('3,0,880,');
    const stp = toCsv({ id: 'c', kind: 'step', ts: 1, result: step }).split('\n');
    expect(stp[0]).toBe('t_s,ex,ey,pan_deg,tilt_deg');
    expect(stp).toHaveLength(6);
  });
});

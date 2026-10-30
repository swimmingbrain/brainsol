import { describe, expect, it } from 'vitest';
import { fitCosine } from './experiments';
import { harness } from './harness';
import type { CompareResult, CosineResult, ExpMessage, StepResult } from '$lib/link/protocol';

function run(kind: string, lamp: { az: number; el: number }, seconds = 60) {
  const h = harness();
  h.unlock();
  h.cmd({ op: 'simlight', ...lamp });
  const ack = h.cmd({ op: 'exp', kind });
  h.advance(seconds);
  const exps = h.of('exp');
  return { ...h, ack, exps, end: exps.at(-1)! };
}

function phases(exps: ExpMessage[]): string[] {
  return exps.map((m) => m.phase).filter((p, i, all) => p !== all[i - 1]);
}

describe('the cosine fit', () => {
  const cos = (d: number) => Math.max(0, Math.cos((d * Math.PI) / 180));

  it('gives amb and peak back from clean points with r squared 1', () => {
    const points: [number, number][] = [];
    for (let d = -60; d <= 60; d += 5) points.push([d, 55 + 900 * cos(d)]);
    const fit = fitCosine(points);
    expect(fit.amb).toBeCloseTo(55, 6);
    expect(fit.peak).toBeCloseTo(900, 6);
    expect(fit.offset).toBe(0);
    expect(fit.r2).toBeCloseTo(1, 9);
  });

  it('takes out a lock that sits a few degrees off the light', () => {
    const points: [number, number][] = [];
    for (let d = -60; d <= 60; d += 5) points.push([d, 60 + 900 * cos(d - 3)]);
    const fit = fitCosine(points);
    expect(fit.offset).toBeCloseTo(3, 2);
    expect(fit.peak).toBeCloseTo(900, 1);
    expect(fit.r2).toBeGreaterThan(0.9999);
  });

  it('has a lower r squared for points that do not follow the law', () => {
    const points: [number, number][] = [];
    for (let d = -60; d <= 60; d += 5) points.push([d, 500 + (d % 10 === 0 ? 200 : -200)]);
    expect(fitCosine(points).r2).toBeLessThan(0.5);
    expect(fitCosine([]).r2).toBeNull();
  });
});

describe('the cosine experiment', () => {
  it('locks, sweeps tilt in steps of 5 and fits the cosine law with r squared above 0.98', () => {
    const { ack, exps, end, of } = run('cosine', { az: 0, el: 60 });
    expect(ack).toMatchObject({ ok: true, data: { kind: 'cosine', id: expect.stringMatching(/^cosine-\d{8}-\d{6}$/) } });
    expect(end).toMatchObject({ kind: 'cosine', phase: 'done', progress: 1 });
    const result = end.result as CosineResult;
    expect(Object.keys(result).sort()).toEqual(['amb', 'fit', 'lock', 'offset', 'peak', 'points', 'r2']);
    expect(result.r2).toBeGreaterThan(0.98);
    expect(result.peak).toBeGreaterThan(850);
    expect(result.peak).toBeLessThan(950);
    expect(result.amb).toBeGreaterThan(40);
    expect(result.amb).toBeLessThan(80);
    const deltas = result.points.map(([d]) => d);
    // the lock is near tilt 60, the sweep stops at the lower tilt limit
    expect(deltas.at(-1)).toBe(60);
    expect(deltas[0]).toBeLessThanOrEqual(-50);
    expect(deltas.every((d, i) => i === 0 || d - deltas[i - 1] === 5)).toBe(true);
    const top = result.points.reduce((a, b) => (b[1] > a[1] ? b : a));
    expect(Math.abs(top[0])).toBeLessThanOrEqual(5);
    expect(phases(exps)).toEqual(['lock', 'sweep', 'fit', 'done']);
    expect(exps.slice(0, -1).every((m) => m.result === null)).toBe(true);
    const progress = exps.map((m) => m.progress);
    expect(progress.every((p, i) => p >= 0 && p <= 1 && (i === 0 || p >= progress[i - 1]))).toBe(true);
    expect(of('evt').pop()!.msg).toMatch(/^cosine experiment done, peak \d+(\.\d)? lux over \d+(\.\d)? lux ambient, r squared 0\.9\d+|1$/);
  });

  it('gives up with an error phase when there is no light to lock on', () => {
    const h = harness();
    h.unlock();
    h.cmd({ op: 'simlight', on: false, amb: 1 });
    h.cmd({ op: 'exp', kind: 'cosine' });
    h.advance(6);
    expect(h.of('exp').pop()).toMatchObject({ phase: 'error', result: null, err: 'not enough light to lock on' });
    expect(h.of('evt').pop()).toMatchObject({ lvl: 'warn', msg: 'cosine experiment ended early, not enough light to lock on' });
    expect(h.last().st).not.toBe('measuring');
  });
});

describe('the compare experiment', () => {
  it('shows a gain well above 1 for a low lamp against the flat reference panel', () => {
    const { end } = run('compare', { az: -60, el: 15 });
    expect(end.phase).toBe('done');
    const result = end.result as CompareResult;
    expect(Object.keys(result).sort()).toEqual(['gain', 'ref', 'rounds', 'sd', 'spread']);
    expect(result.rounds).toHaveLength(3);
    for (const round of result.rounds) {
      expect(Object.keys(round).sort()).toEqual(['fixed', 'gain', 'tracked']);
      expect(round.tracked).toBeGreaterThan(round.fixed);
    }
    // a flat panel sees sin 15 of the direct light
    expect(result.gain).toBeGreaterThan(2.5);
    expect(result.spread).toBeGreaterThanOrEqual(0);
    expect(result.spread).toBeLessThan(0.1);
  });

  it('shows a gain near 1 for a lamp straight over the reference panel', () => {
    const { end } = run('compare', { az: 0, el: 88 });
    const result = end.result as CompareResult;
    expect(result.gain).toBeGreaterThan(0.97);
    expect(result.gain).toBeLessThan(1.05);
  });
});

describe('the step experiment', () => {
  it('reports how long the loop takes to lock again after a pan step of 20 degrees', () => {
    const { end, exps } = run('step', { az: 25, el: 40 });
    expect(end.phase).toBe('done');
    const result = end.result as StepResult;
    expect(Object.keys(result).sort()).toEqual(['final', 'lock', 'offset', 'overshoot', 'overshoot_pct', 'samples', 'settle']);
    expect(result.settle).toBeGreaterThan(0.2);
    expect(result.settle).toBeLessThan(8);
    expect(result.overshoot).toBeGreaterThanOrEqual(0);
    expect(result.samples.length).toBe(Math.round(result.settle! / 0.02));
    expect(result.samples.every((row) => row.length === 5)).toBe(true);
    expect(result.samples[0][0]).toBe(0.02);
    expect(result.samples[1][0]).toBe(0.04);
    // the step starts 20 degrees off the lock and ends inside the dead band
    // around the light, a few degrees of pan from where the lock was
    const pans = result.samples.map((row) => row[3]);
    expect(Math.abs(pans[0] - pans.at(-1)!)).toBeGreaterThan(10);
    expect(phases(exps)).toEqual(['lock', 'offset', 'release', 'done']);
  });

  it('steps the other way when the lock is near the right pan limit', () => {
    const { end } = run('step', { az: 80, el: 30 });
    const result = end.result as StepResult;
    expect(result.samples[0][3]).toBeLessThan(70);
  });
});

describe('running an experiment', () => {
  it('says measuring and act exp while it runs and gives the head back to the mode', () => {
    const h = harness();
    h.unlock();
    h.cmd({ op: 'mode', mode: 'hold' });
    h.cmd({ op: 'exp', kind: 'step' });
    h.advance(1);
    expect(h.last()).toMatchObject({ mode: 'hold', st: 'measuring' });
    expect(h.of('sys').pop()).toMatchObject({ act: 'exp' });
    h.advance(20);
    expect(h.of('exp').pop()!.phase).toBe('done');
    h.advance(1);
    expect(h.last()).toMatchObject({ mode: 'hold', st: 'idle' });
  });

  it('is busy while a scan or another experiment runs and stops on stop', () => {
    const h = harness();
    h.unlock();
    h.cmd({ op: 'exp', kind: 'cosine' });
    h.advance(1);
    expect(h.cmd({ op: 'exp', kind: 'step' })).toMatchObject({ ok: false, err: 'busy' });
    expect(h.cmd({ op: 'scan' })).toMatchObject({ ok: false, err: 'busy' });
    expect(h.cmd({ op: 'stop' })).toMatchObject({ ok: true, data: { stopped: true } });
    expect(h.of('exp').pop()).toMatchObject({ kind: 'cosine', phase: 'error', result: null });
    expect(h.of('evt').pop()!.msg).toBe('cosine experiment ended early, stopped');
    expect(h.cmd({ op: 'exp', kind: 'step' })).toMatchObject({ ok: true });
  });

  it('refuses a kind it does not know', () => {
    const h = harness();
    h.unlock();
    expect(h.cmd({ op: 'exp', kind: 'gravity' })).toMatchObject({ ok: false, err: 'bad' });
    expect(h.cmd({ op: 'exp' })).toMatchObject({ ok: false, err: 'bad' });
  });
});

// the three experiments of section 7 for the seminar paper, the same steps as
// experiments.py on the pi. each one reports its phase and progress with exp
// messages and ends with a result in the shape protocol.ts gives it

import { Activity, ActivityError, DT, type ActivityHost } from './activities';
import { askAuto } from './modes';
import type { CompareResult, CosineResult, ExpKind, ExpMessage, ExpPhase, ExpResult, StepResult } from '$lib/link/protocol';

export const EXP_KINDS: ExpKind[] = ['cosine', 'compare', 'step'];

const SETTLE_S = 0.4;
const AVG_S = 0.3;

const r1 = (n: number) => Math.round(n * 10) / 10 + 0;
const r2 = (n: number) => Math.round(n * 100) / 100 + 0;
const r3 = (n: number) => Math.round(n * 1000) / 1000 + 0;

// lux = amb + peak * max(0, cos(delta - offset)) by least squares. for a given
// offset amb and peak are a straight line fit, the offset is searched. it takes
// out the few degrees a lock sits off the light, the same as on the pi, so a
// lock that is a little off does not spoil the cosine law
// r2 is null when every point read the same, there is nothing to explain then
export function fitCosine(points: [number, number][]): { amb: number; peak: number; offset: number; r2: number | null } {
  const n = points.length;
  const solve = (offset: number) => {
    let mx = 0;
    let my = 0;
    for (const [d, y] of points) {
      mx += Math.max(0, Math.cos(((d - offset) * Math.PI) / 180));
      my += y;
    }
    mx /= n;
    my /= n;
    let sxx = 0;
    let sxy = 0;
    for (const [d, y] of points) {
      const x = Math.max(0, Math.cos(((d - offset) * Math.PI) / 180));
      sxx += (x - mx) ** 2;
      sxy += (x - mx) * (y - my);
    }
    const peak = sxx > 0 ? sxy / sxx : 0;
    const amb = my - peak * mx;
    let sse = 0;
    for (const [d, y] of points) sse += (y - amb - peak * Math.max(0, Math.cos(((d - offset) * Math.PI) / 180))) ** 2;
    return { sse, amb, peak, offset };
  };
  if (n === 0) return { amb: 0, peak: 0, offset: 0, r2: null };
  let best = solve(0);
  for (let k = -80; k <= 80; k++) {
    const next = solve(k * 0.25);
    if (next.sse < best.sse) best = next;
  }
  const coarse = best.offset;
  for (let k = -25; k <= 25; k++) {
    const next = solve(coarse + k * 0.01);
    if (next.sse < best.sse) best = next;
  }
  const my = points.reduce((sum, [, y]) => sum + y, 0) / n;
  const sst = points.reduce((sum, [, y]) => sum + (y - my) ** 2, 0);
  return { amb: best.amb, peak: best.peak, offset: best.offset, r2: sst > 0 ? 1 - best.sse / sst : null };
}

abstract class Experiment extends Activity {
  readonly kind = 'exp';
  readonly st = 'measuring';
  phase: ExpPhase = 'start';
  progress = 0;

  constructor(
    host: ActivityHost,
    readonly exp: ExpKind
  ) {
    super(host);
    this.id = host.newId(exp);
  }

  protected report(phase: ExpPhase, progress: number, result: ExpResult | null = null, err?: string): void {
    this.phase = phase;
    this.progress = progress;
    const message: ExpMessage = { t: 'exp', id: this.id, kind: this.exp, phase, progress: r3(Math.min(Math.max(progress, 0), 1)), result };
    if (err !== undefined) message.err = err;
    this.host.publish(message);
  }

  protected lux(): number | null {
    return this.host.lux;
  }

  protected needLux(): void {
    if (this.host.lux === null) throw new ActivityError('this experiment needs the BH1750 light sensor');
  }

  protected abstract summary(result: ExpResult): string;

  protected started(): void {
    this.host.event('info', `${this.exp} experiment started`);
  }

  protected finished(): void {
    if (this.ok && this.result) {
      const result = this.result as ExpResult;
      this.report('done', 1, result);
      this.host.event('info', this.summary(result));
    } else {
      this.report('error', this.progress, null, this.error ?? 'stopped');
      this.host.event('warn', `${this.exp} experiment ended early, ${this.error}`);
    }
  }
}

// lock on the light, sweep tilt 60 degrees each way in steps of 5, fit the cosine law
export class Cosine extends Experiment {
  static readonly SPAN = 60;
  static readonly STEP = 5;

  constructor(host: ActivityHost) {
    super(host, 'cosine');
  }

  protected *run() {
    this.needLux();
    this.report('lock', 0);
    const lock = yield* this.lock();
    const [lo, hi] = this.host.cfg.limits.tilt;
    const deltas: number[] = [];
    for (let d = -Cosine.SPAN; d <= Cosine.SPAN; d += Cosine.STEP) if (lock.tilt + d >= lo && lock.tilt + d <= hi) deltas.push(d);
    if (deltas.length < 8) throw new ActivityError('the lock sits too close to a tilt limit for a sweep');
    const points: [number, number][] = [];
    for (let k = 0; k < deltas.length; k++) {
      this.report('sweep', 0.1 + (0.85 * k) / deltas.length);
      yield* this.seek(lock.pan, lock.tilt + deltas[k]);
      yield* this.wait(SETTLE_S);
      points.push([deltas[k], yield* this.average(AVG_S, () => this.lux())]);
    }
    this.report('fit', 0.95);
    const fit = fitCosine(points);
    yield* this.seek(lock.pan, lock.tilt);
    const curve = (d: number) => fit.amb + fit.peak * Math.max(0, Math.cos(((d - fit.offset) * Math.PI) / 180));
    const result: CosineResult = {
      peak: r1(fit.peak),
      amb: r1(fit.amb),
      r2: fit.r2 === null ? null : r3(fit.r2),
      points: points.map(([d, y]) => [d, r1(y)]),
      // the fitted curve at the same angles and the pointing error the fit took out
      fit: points.map(([d]) => [d, r1(curve(d))]),
      offset: r2(fit.offset),
      lock: { pan: r1(lock.pan), tilt: r1(lock.tilt) }
    };
    return result;
  }

  protected summary(result: ExpResult): string {
    const r = result as CosineResult;
    return `cosine experiment done, peak ${r.peak} lux over ${r.amb} lux ambient, r squared ${r.r2}`;
  }
}

// lux at the fixed reference pose against lux while locked on the light, three rounds
export class Compare extends Experiment {
  static readonly ROUNDS = 3;

  constructor(host: ActivityHost) {
    super(host, 'compare');
  }

  protected *run() {
    this.needLux();
    const p = this.host.cfg.params;
    const rounds: CompareResult['rounds'] = [];
    const gains: number[] = [];
    let last: { pan: number; tilt: number } | null = null;
    for (let i = 0; i < Compare.ROUNDS; i++) {
      this.report('ref', i / Compare.ROUNDS);
      yield* this.seek(p.ref_pan.v, p.ref_tilt.v);
      yield* this.wait(SETTLE_S);
      const fixed = yield* this.average(0.5, () => this.lux());
      this.report('track', (i + 0.5) / Compare.ROUNDS);
      // straight back to the last lock, the loop then only has to fine tune
      if (last) yield* this.seek(last.pan, last.tilt);
      last = yield* this.lock();
      const tracked = yield* this.average(0.5, () => this.lux());
      const gain = r3(tracked / Math.max(fixed, 0.1));
      rounds.push({ fixed: r1(fixed), tracked: r1(tracked), gain });
      gains.push(gain);
    }
    const mean = gains.reduce((sum, g) => sum + g, 0) / gains.length;
    const result: CompareResult = {
      gain: r3(mean),
      spread: r3(Math.max(...gains) - Math.min(...gains)),
      rounds,
      // the population standard deviation, like statistics.pstdev on the pi
      sd: r3(Math.sqrt(gains.reduce((sum, g) => sum + (g - mean) ** 2, 0) / gains.length)),
      ref: { pan: p.ref_pan.v, tilt: p.ref_tilt.v }
    };
    return result;
  }

  protected summary(result: ExpResult): string {
    const r = result as CompareResult;
    return `compare experiment done, the tracked panel gets ${r.gain} times the light of the fixed one, spread ${r.spread}`;
  }
}

// from a lock, pan 20 degrees off, release to the loop and record until it locks or 8 s pass
export class Step extends Experiment {
  static readonly OFFSET = 20;
  static readonly MAX_S = 8;

  constructor(host: ActivityHost) {
    super(host, 'step');
  }

  protected *run() {
    this.report('lock', 0);
    const lock = yield* this.lock();
    const hi = this.host.cfg.limits.pan[1];
    const offset = lock.pan + Step.OFFSET <= hi ? Step.OFFSET : -Step.OFFSET;
    this.report('offset', 0.15);
    yield* this.seek(lock.pan + offset, lock.tilt);
    yield* this.wait(0.3);
    this.report('release', 0.2);
    const c = this.host.ctrl;
    const start = c.pan;
    askAuto(this.req);
    const samples: StepResult['samples'] = [];
    let settle: number | null = null;
    let elapsed = 0;
    while (elapsed < Step.MAX_S - 1e-9) {
      yield;
      elapsed += DT;
      samples.push([r2(elapsed), r3(c.ex), r3(c.ey), r2(c.pan), r2(c.tilt)]);
      if (this.host.cstate === 'locked') {
        settle = elapsed;
        break;
      }
      if (samples.length % 25 === 0) this.report('release', 0.2 + (0.8 * elapsed) / Step.MAX_S);
    }
    const final = c.pan;
    const travel = start - final;
    const sign = travel > 0 ? 1 : -1;
    let past = 0;
    for (const row of samples) past = Math.max(past, sign * (final - row[3]));
    const result: StepResult = {
      settle: settle === null ? null : r2(settle),
      overshoot: r2(past),
      samples,
      // the overshoot as a share of the way back, a way too short says nothing
      overshoot_pct: Math.abs(travel) > 0.5 ? r1((100 * past) / Math.abs(travel)) : null,
      offset,
      lock: { pan: r1(lock.pan), tilt: r1(lock.tilt) },
      final: { pan: r1(final), tilt: r1(c.tilt) }
    };
    return result;
  }

  protected summary(result: ExpResult): string {
    const r = result as StepResult;
    return r.settle === null
      ? `step experiment done, no lock within ${Step.MAX_S} s, ${r.overshoot} degrees overshoot`
      : `step experiment done, locked again after ${r.settle} s with ${r.overshoot} degrees overshoot`;
  }
}

export function makeExperiment(kind: ExpKind, host: ActivityHost): Experiment {
  if (kind === 'cosine') return new Cosine(host);
  if (kind === 'compare') return new Compare(host);
  return new Step(host);
}

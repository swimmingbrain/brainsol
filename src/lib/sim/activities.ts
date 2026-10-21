// what borrows the head for a while and gives it back to the mode: the scan,
// the experiments and the calibration steps. written as generators that yield
// once per tick, the same as activities.py on the pi, so the steps read top to
// bottom and run just as well in simulated time

import type { ControllerState } from './controller';
import { arrived } from './motion';
import { askAuto, askSeek, askStop, newRequest, type Request } from './modes';
import type { SimCalibration } from './engine';
import type { Activity as ActivityKind, Config, EventLevel, Mode, Pose, Quad, ServerMessage, St } from '$lib/link/protocol';

export const DT = 0.02;

// a reason an activity gave up, it goes into the event log
export class ActivityError extends Error {}

// what an activity may read and use on the engine
export interface ActivityHost {
  readonly t: number;
  readonly cfg: Config;
  // the filter, the errors and the commanded pose and speeds
  readonly ctrl: ControllerState;
  // what the loop or the motion says, locked, lowlight and so on
  readonly cstate: St;
  // the BH1750 on the panel plane, null on a tracker without one
  readonly lux: number | null;
  // the newest raw sums, L R U D
  readonly raw: Quad;
  readonly calib: SimCalibration;
  readonly mode: Mode;
  wall(): number;
  // a fresh id for a result, like scan-20261114-153000
  newId(kind: string): string;
  event(lvl: EventLevel, msg: string): void;
  publish(message: ServerMessage): void;
  setCalibration(calib: SimCalibration): void;
}

type Steps<T = unknown> = Generator<void, T, void>;

export abstract class Activity {
  abstract readonly kind: ActivityKind;
  abstract readonly st: St;
  id = '';
  // what the activity asks of the limiter this tick
  readonly req: Request = newRequest();
  done = false;
  ok = false;
  error: string | null = null;
  result: unknown = null;
  private steps: Steps | null = null;
  private callbacks: ((activity: Activity) => void)[] = [];

  constructor(protected readonly host: ActivityHost) {}

  protected abstract run(): Steps;

  start(): void {
    this.steps = this.run();
    this.started();
  }

  onDone(callback: (activity: Activity) => void): void {
    this.callbacks.push(callback);
  }

  // one tick, returns the request for the limiter
  step(): Request {
    if (this.done || !this.steps) return this.req;
    try {
      const next = this.steps.next();
      if (next.done) this.finish(true, next.value, null);
    } catch (error) {
      if (error instanceof ActivityError) this.finish(false, null, error.message);
      else {
        console.error(`brainsol: the ${this.kind} failed`, error);
        this.finish(false, null, 'internal error');
      }
    }
    return this.req;
  }

  cancel(why: string): void {
    if (this.done) return;
    try {
      this.steps?.return(undefined);
    } catch {}
    this.finish(false, null, why);
  }

  private finish(ok: boolean, result: unknown, error: string | null): void {
    this.done = true;
    this.ok = ok;
    this.result = result;
    this.error = error;
    askStop(this.req);
    try {
      this.finished();
    } catch (e) {
      console.error(`brainsol: the end of the ${this.kind} failed`, e);
    }
    for (const callback of this.callbacks) {
      try {
        callback(this);
      } catch (e) {
        console.error(`brainsol: a callback of the ${this.kind} failed`, e);
      }
    }
  }

  protected started(): void {}
  protected finished(): void {}

  // the building blocks

  protected *wait(seconds: number): Steps<void> {
    const ticks = Math.max(1, Math.round(seconds / DT));
    for (let i = 0; i < ticks; i++) yield;
  }

  // to a pose inside the soft limits, gives up after timeout seconds
  protected *seek(pan: number, tilt: number, vmax: number | null = null, timeout = 30): Steps<Pose> {
    const { pan: lp, tilt: lt } = this.host.cfg.limits;
    const p = Math.min(Math.max(pan, lp[0]), lp[1]);
    const t = Math.min(Math.max(tilt, lt[0]), lt[1]);
    askSeek(this.req, p, t, vmax);
    let waited = 0;
    for (;;) {
      yield;
      if (arrived(this.host.ctrl, p, t)) return { pan: p, tilt: t };
      waited += DT;
      if (waited > timeout) throw new ActivityError(`could not reach pan ${p.toFixed(0)} tilt ${t.toFixed(0)}`);
    }
  }

  // tracks with the closed loop until it has stayed locked for a moment
  protected *lock(timeout = 20, hold = 0.6): Steps<Pose> {
    askAuto(this.req);
    let held = 0;
    let dark = 0;
    let waited = 0;
    for (;;) {
      yield;
      waited += DT;
      const st = this.host.cstate;
      if (st === 'lowlight') {
        dark += DT;
        if (dark > 3) throw new ActivityError('not enough light to lock on');
      } else dark = 0;
      if (st === 'locked') {
        held += DT;
        if (held >= hold - 1e-9) return { pan: this.host.ctrl.pan, tilt: this.host.ctrl.tilt };
      } else held = 0;
      if (waited > timeout) throw new ActivityError(`no lock within ${timeout.toFixed(0)} s`);
    }
  }

  // the mean of a reading over some seconds, one value per tick
  protected *average(seconds: number, read: () => number | null): Steps<number> {
    const ticks = Math.max(1, Math.round(seconds / DT));
    let sum = 0;
    let n = 0;
    for (let i = 0; i < ticks; i++) {
      yield;
      const value = read();
      if (value !== null && Number.isFinite(value)) {
        sum += value;
        n++;
      }
    }
    if (n === 0) throw new ActivityError('no readings');
    return sum / n;
  }
}

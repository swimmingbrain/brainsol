// the sky map of section 7, the same as scan.py on the pi. the head visits a
// grid of poses in a serpentine, settles, averages the light at each one and
// the page gets the map after every cell. a cell (pan, tilt) looks along the
// panel normal of that pose, so the rear half of the sky sits at tilt over 90

import { Activity, type ActivityHost } from './activities';
import type { ScanMessage } from '$lib/link/protocol';

export const SCAN_PAN: [number, number] = [-90, 90];
export const SCAN_TILT: [number, number] = [15, 165];
export const SCAN_STEP = 15;
export const STEP_MIN = 5;
export const STEP_MAX = 45;
// the sensor filter needs about three time constants after a move, then a short average
const SETTLE_S = 0.35;
const AVG_S = 0.2;

export function axis(lo: number, hi: number, step: number): number[] {
  const n = Math.floor((hi - lo) / step + 1e-9);
  const out: number[] = [];
  for (let i = 0; i <= n; i++) out.push(+(lo + i * step).toFixed(6));
  return out;
}

export class Scan extends Activity {
  readonly kind = 'scan';
  readonly st = 'scanning';
  readonly pans: number[];
  readonly tilts: number[];
  readonly v: (number | null)[][];
  best: { pan: number; tilt: number; v: number } | null = null;
  // lux with one decimal, a plain level with three on a tracker without a BH1750
  private digits: number;

  constructor(host: ActivityHost, readonly stepDeg = SCAN_STEP) {
    super(host);
    this.pans = axis(SCAN_PAN[0], SCAN_PAN[1], stepDeg);
    this.tilts = axis(SCAN_TILT[0], SCAN_TILT[1], stepDeg);
    this.v = this.tilts.map(() => this.pans.map(() => null));
    this.id = host.newId('scan');
    this.digits = host.lux !== null ? 1 : 3;
  }

  get cells(): number {
    return this.pans.length * this.tilts.length;
  }

  // what a scan maps: lux on the panel plane when there is a sensor, else the mean level
  private value(): number | null {
    return this.host.lux ?? this.host.ctrl.lvl;
  }

  protected started(): void {
    this.host.event('info', `scan started, ${this.cells} cells in steps of ${this.stepDeg} degrees`);
  }

  protected *run() {
    this.publish(false);
    for (let i = 0; i < this.tilts.length; i++) {
      const tilt = this.tilts[i];
      const n = this.pans.length;
      for (let k = 0; k < n; k++) {
        const j = i % 2 === 0 ? k : n - 1 - k;
        yield* this.seek(this.pans[j], tilt);
        yield* this.wait(SETTLE_S);
        const value = yield* this.average(AVG_S, () => this.value());
        this.v[i][j] = value;
        if (!this.best || value > this.best.v) this.best = { pan: this.pans[j], tilt, v: value };
        this.publish(false);
      }
    }
    // hand the head back facing the brightest cell so tracking starts right there
    if (this.best && this.host.mode === 'auto') yield* this.seek(this.best.pan, this.best.tilt);
    return this.best;
  }

  message(done: boolean): ScanMessage {
    const round = (x: number) => +x.toFixed(this.digits);
    return {
      t: 'scan',
      id: this.id,
      pan: [...this.pans],
      tilt: [...this.tilts],
      v: this.v.map((row) => row.map((x) => (x === null ? null : round(x)))),
      done,
      best: this.best ? { pan: this.best.pan, tilt: this.best.tilt, v: round(this.best.v) } : null
    };
  }

  private publish(done: boolean): void {
    this.host.publish(this.message(done));
  }

  protected finished(): void {
    this.publish(true);
    if (this.ok && this.best) {
      const unit = this.digits === 1 ? ' lux' : '';
      this.host.event('info', `scan done, brightest at pan ${this.best.pan.toFixed(0)} tilt ${this.best.tilt.toFixed(0)} with ${round1(this.best.v)}${unit}`);
    } else if (this.ok) {
      this.host.event('info', 'scan done');
    } else {
      this.host.event('warn', `scan ended early, ${this.error}`);
    }
  }
}

function round1(x: number): string {
  return String(+x.toFixed(1));
}

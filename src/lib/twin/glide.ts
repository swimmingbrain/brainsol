// turns a stream of samples into a target that moves without jumps. every new
// sample starts a straight run from where the target is right now to the new
// value, as long as samples usually take to arrive. so a 20 Hz stream with an
// uneven beat still gives one smooth line, and a stream that stops simply ends
// at its last value. the springs in damp.ts round off the corners

import { wrap180 } from '$lib/sim/kinematics';

// the interval estimate stays inside these bounds, in milliseconds
const MIN_SPAN = 16;
const MAX_SPAN = 250;
// how strongly one interval moves the estimate
const LEARN = 0.2;

export class Glide {
  private from = 0;
  private to = 0;
  private start = 0;
  private last = 0;
  private span = 50;
  private known = false;

  // wrap turns on angles that run around at plus and minus 180, like an azimuth
  constructor(private wrap = false) {}

  get has(): boolean {
    return this.known;
  }

  // the newest sample, the value it carries and when it came in (ms)
  push(value: number, at: number): void {
    if (!Number.isFinite(value) || !Number.isFinite(at)) return;
    if (!this.known) {
      this.from = this.to = value;
      this.start = this.last = at;
      this.known = true;
      return;
    }
    // where the run is now, before the interval changes under it
    const here = this.sample(at);
    const gap = at - this.last;
    this.last = at;
    // a stall is no new beat, only regular gaps teach the interval
    if (gap > 0 && gap < Math.max(this.span * 4, MAX_SPAN)) this.span = clampSpan(this.span + (gap - this.span) * LEARN);
    this.from = here;
    this.to = this.wrap ? here + wrap180(value - here) : value;
    this.start = at;
  }

  // jumps straight to a value, for the first frame of a new source
  reset(value: number, at: number): void {
    this.known = false;
    this.push(value, at);
  }

  clear(): void {
    this.known = false;
  }

  sample(now: number): number {
    const k = this.progress(now);
    return this.from + (this.to - this.from) * k;
  }

  // the last value the stream gave, wrapped the way it came in
  get end(): number {
    return this.to;
  }

  moving(now: number): boolean {
    return this.known && this.progress(now) < 1 && this.from !== this.to;
  }

  private progress(now: number): number {
    if (!this.known) return 1;
    const k = (now - this.start) / this.span;
    return k <= 0 ? 0 : k >= 1 ? 1 : k;
  }
}

function clampSpan(span: number): number {
  return span < MIN_SPAN ? MIN_SPAN : span > MAX_SPAN ? MAX_SPAN : span;
}

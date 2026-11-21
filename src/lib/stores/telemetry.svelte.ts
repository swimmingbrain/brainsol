// what the tracker reports, held two ways. the newest frame sits in plain
// fields that never wake svelte up, the 3d scene reads them every animation
// frame. the values a template shows are runes, refreshed at most 10 times a
// second, and each one only changes when its value did, so a 20 Hz stream
// redraws a number here and there and never the page

import type { AnyMode, EvtMessage, ExpMessage, NoQuad, PlanFollow, Pose, Quad, ScanMessage, ServerMessage, SimLight, St, StateFrame, SunPosition, SysFrame } from '$lib/link/protocol';

// how often the runes may change, in milliseconds
export const PUBLISH_EVERY = 100;
// how many events are kept for the admin log
export const EVENT_LOG = 100;

type FrameListener = (frame: StateFrame) => void;

// a pi sends four nulls before its first sensor reading, the runes hold null then
function quadOf(value: Quad | NoQuad | null | undefined): Quad | null {
  if (!value || value.length !== 4) return null;
  for (const n of value) if (typeof n !== 'number') return null;
  return value as Quad;
}

function sameQuad(a: Quad | null, b: Quad | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
}

// flat objects of numbers and booleans, compared field by field
function sameFlat<T extends object>(a: T | null, b: T | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  for (const key of Object.keys(b) as (keyof T)[]) if (a[key] !== b[key]) return false;
  return true;
}

class Telemetry {
  // the newest state frame, the one before it and when each came in
  // (performance.now). plain fields, read them as often as you like
  frame: StateFrame | null = null;
  at = 0;
  prev: StateFrame | null = null;
  prevAt = 0;

  mode = $state<AnyMode | null>(null);
  st = $state<St | null>(null);
  pan = $state<number | null>(null);
  tilt = $state<number | null>(null);
  vp = $state<number | null>(null);
  vt = $state<number | null>(null);
  ex = $state<number | null>(null);
  ey = $state<number | null>(null);
  lvl = $state<number | null>(null);
  lux = $state<number | null>(null);
  pmw = $state<number | null>(null);
  gain = $state<number | null>(null);
  off = $state<number | null>(null);
  ldr = $state.raw<Quad | null>(null);
  raw = $state.raw<Quad | null>(null);
  pv = $state.raw<{ v: number; ma: number } | null>(null);
  tgt = $state.raw<Pose | null>(null);
  sun = $state.raw<SunPosition | null>(null);
  sim = $state.raw<SimLight | null>(null);
  // the plan a pi follows in plan mode, null otherwise
  plan = $state.raw<PlanFollow | null>(null);

  // the slower messages are rare enough to go straight into runes
  sys = $state.raw<SysFrame | null>(null);
  scan = $state.raw<ScanMessage | null>(null);
  exp = $state.raw<ExpMessage | null>(null);
  events = $state.raw<EvtMessage[]>([]);
  lastEvent = $state.raw<EvtMessage | null>(null);
  // state frames per second as they arrive here, refreshed once a second
  rate = $state(0);

  private listeners = new Set<FrameListener>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastPublish = -Infinity;
  private counted = 0;
  private countStart = 0;

  // called for every state frame, outside svelte. returns the unsubscribe
  onFrame(listener: FrameListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // seconds since the newest frame came in, Infinity before the first
  age(now = performance.now()): number {
    return this.frame ? (now - this.at) / 1000 : Infinity;
  }

  ingest(message: ServerMessage, now = performance.now()): void {
    switch (message.t) {
      case 's':
        this.takeFrame(message, now);
        break;
      case 'sys':
        this.sys = message;
        break;
      case 'scan':
        this.scan = message;
        break;
      case 'exp':
        this.exp = message;
        break;
      case 'evt':
        this.events = [...this.events.slice(-(EVENT_LOG - 1)), message];
        this.lastEvent = message;
        break;
    }
  }

  reset(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.frame = null;
    this.prev = null;
    this.at = 0;
    this.prevAt = 0;
    this.lastPublish = -Infinity;
    this.counted = 0;
    this.countStart = 0;
    this.mode = this.st = null;
    this.pan = this.tilt = this.vp = this.vt = this.ex = this.ey = this.lvl = null;
    this.lux = this.pmw = this.gain = this.off = null;
    this.ldr = this.raw = null;
    this.pv = this.tgt = this.sun = this.sim = null;
    this.plan = null;
    this.sys = null;
    this.scan = null;
    this.exp = null;
    this.events = [];
    this.lastEvent = null;
    this.rate = 0;
  }

  private takeFrame(frame: StateFrame, now: number): void {
    this.prev = this.frame;
    this.prevAt = this.at;
    this.frame = frame;
    this.at = now;
    for (const listener of this.listeners) {
      try {
        listener(frame);
      } catch (error) {
        console.error('brainsol: a frame listener failed', error);
      }
    }
    this.count(now);
    const wait = PUBLISH_EVERY - (now - this.lastPublish);
    if (wait <= 0) this.publish(now);
    else this.timer ??= setTimeout(() => this.publish(performance.now()), wait);
  }

  private count(now: number): void {
    if (this.counted === 0) this.countStart = now;
    this.counted++;
    const span = now - this.countStart;
    if (span >= 1000) {
      this.rate = Math.round(((this.counted - 1) * 1000) / span);
      this.counted = 0;
    }
  }

  private publish(now: number): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.lastPublish = now;
    const f = this.frame;
    if (!f) return;
    // runes skip an assignment of the same number on their own
    this.mode = f.mode;
    this.st = f.st;
    this.pan = f.pan;
    this.tilt = f.tilt;
    this.vp = f.vp;
    this.vt = f.vt;
    this.ex = f.ex;
    this.ey = f.ey;
    this.lvl = f.lvl;
    this.lux = f.lux;
    this.pmw = f.pmw;
    this.gain = f.gain;
    this.off = f.off;
    const ldr = quadOf(f.ldr);
    const raw = quadOf(f.raw);
    if (!sameQuad(this.ldr, ldr)) this.ldr = ldr;
    if (!sameQuad(this.raw, raw)) this.raw = raw;
    if (!sameFlat(this.pv, f.pv)) this.pv = f.pv;
    if (!sameFlat(this.tgt, f.tgt)) this.tgt = f.tgt;
    if (!sameFlat(this.sun, f.sun)) this.sun = f.sun;
    if (!sameFlat(this.sim, f.sim)) this.sim = f.sim;
    const plan = f.plan ?? null;
    if (!sameFlat(this.plan, plan)) this.plan = plan;
  }
}

export const telemetry = new Telemetry();

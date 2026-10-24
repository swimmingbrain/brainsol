// the joystick: where the knob is turns into pan and tilt rates from -1 to 1.
// right turns the pan right, up lifts the panel (more tilt)

export interface Vec {
  x: number;
  y: number;
}

export const ZERO: Vec = { x: 0, y: 0 };

// the middle of the pad where nothing moves, as a share of the radius
export const DEAD_ZONE = 0.12;

const r2 = (n: number) => Math.round(n * 100) / 100 + 0;

export function isZero(v: Vec): boolean {
  return v.x === 0 && v.y === 0;
}

export function sameVec(a: Vec, b: Vec): boolean {
  return a.x === b.x && a.y === b.y;
}

// the pointer offset in pixels kept inside the ring, for drawing the knob
export function clampOffset(dx: number, dy: number, radius: number): Vec {
  const len = Math.hypot(dx, dy);
  if (len <= radius || len === 0) return { x: dx, y: dy };
  return { x: (dx / len) * radius, y: (dy / len) * radius };
}

// the pointer offset from the centre of the pad (screen y grows downwards)
// as rates. outside the dead zone the speed starts at zero and grows with a
// soft curve, so small moves near the middle stay fine
export function padVector(dx: number, dy: number, radius: number, dead = DEAD_ZONE): Vec {
  if (!(radius > 0) || !Number.isFinite(dx) || !Number.isFinite(dy)) return ZERO;
  const x = dx / radius;
  const y = -dy / radius;
  const len = Math.hypot(x, y);
  if (len <= dead) return ZERO;
  const reach = Math.min(1, len);
  const speed = ((reach - dead) / (1 - dead)) ** 1.5;
  return { x: r2((x / len) * speed), y: r2((y / len) * speed) };
}

const KEYS: Record<string, Vec> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: 1 },
  ArrowDown: { x: 0, y: -1 }
};

export function isStickKey(key: string): boolean {
  return key in KEYS;
}

// the arrow keys held down right now. two keys go diagonal at the same speed
// as one, shift moves at a third for careful aiming
export function keyVector(keys: Iterable<string>, slow = false): Vec {
  let x = 0;
  let y = 0;
  for (const key of keys) {
    const v = KEYS[key];
    if (!v) continue;
    x += v.x;
    y += v.y;
  }
  x = Math.max(-1, Math.min(1, x));
  y = Math.max(-1, Math.min(1, y));
  const len = Math.hypot(x, y);
  if (len === 0) return ZERO;
  const speed = slow ? 1 / 3 : 1;
  return { x: r2((x / len) * speed), y: r2((y / len) * speed) };
}

// how often a held stick tells the tracker again. the tracker drops a rate
// after 400 ms without news, so a lost page stops the head on its own
export const RATE_EVERY = 100;

export interface Interval {
  start(fn: () => void, ms: number): unknown;
  stop(handle: unknown): void;
}

const realInterval: Interval = {
  start: (fn, ms) => setInterval(fn, ms),
  stop: (handle) => clearInterval(handle as ReturnType<typeof setInterval>)
};

// keeps rate commands flowing while the stick is off centre. the first one goes
// out at once, then the newest one every RATE_EVERY ms (a pointer can move at
// 120 Hz, the tracker only needs 10), and exactly one zero on release
export class RateStream {
  private current: Vec = ZERO;
  private handle: unknown = null;

  constructor(
    private send: (v: Vec) => void,
    private every = RATE_EVERY,
    private interval: Interval = realInterval
  ) {}

  get active(): boolean {
    return this.handle !== null;
  }

  set(v: Vec): void {
    if (isZero(v)) {
      this.release();
      return;
    }
    this.current = v;
    if (this.handle !== null) return;
    this.send(v);
    this.handle = this.interval.start(() => this.send(this.current), this.every);
  }

  release(): void {
    if (this.handle === null) return;
    this.interval.stop(this.handle);
    this.handle = null;
    this.current = ZERO;
    this.send(ZERO);
  }
}

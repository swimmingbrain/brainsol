// one limiter for every mode, the same rules as motion.py on the pi. the speed
// and acceleration caps hold everywhere, a mode change keeps the running speed
// instead of jumping, the head brakes in time before a soft limit and a seek
// slows down into its target. everything works in place on any object with
// pan, tilt, vp and vt, so the loop allocates nothing

export const LIMIT_PAN = 1;
export const LIMIT_TILT = 2;

// a seek plans with a bit less than the full deceleration so it never needs a hard stop
export const SEEK_DECEL = 0.8;
// below this distance a seek slows down in proportion, seconds
export const SEEK_T = 0.1;
// the last bit of a soft tail is skipped by putting the head right on the spot
export const SNAP_DEG = 0.05;
export const SNAP_SPEED = 1;
// a seek counts as there when it is this close and this slow
export const ARRIVE_DEG = SNAP_DEG;
export const ARRIVE_SPEED = 0.5;
// below this speed on both axes the head counts as still
export const STILL_SPEED = 0.5;

export interface Axes {
  pan: number;
  tilt: number;
  vp: number;
  vt: number;
}

export interface AxisLimits {
  pan: [number, number];
  tilt: [number, number];
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

// the fastest speed that still stops at the target, with a soft tail at the end
export function seekSpeed(err: number, vmax: number, amax: number): number {
  const d = Math.abs(err);
  if (d < 1e-9) return 0;
  const v = Math.min(vmax, Math.sqrt(2 * SEEK_DECEL * amax * d), d / SEEK_T);
  return err > 0 ? v : -v;
}

// caps a speed towards a soft limit so the head can still stop in time
export function brake(v: number, pos: number, lo: number, hi: number, amax: number): number {
  if (v > 0) return pos < hi ? Math.min(v, seekSpeed(hi - pos, v, amax)) : 0;
  if (v < 0) return pos > lo ? Math.max(v, seekSpeed(lo - pos, -v, amax)) : 0;
  return v;
}

// one tick towards the wanted speeds. returns which axes press against a soft
// limit, LIMIT_PAN and LIMIT_TILT as bits
export function stepAxes(m: Axes, vx: number, vy: number, amax: number, limits: AxisLimits, dt: number): number {
  const [plo, phi] = limits.pan;
  const [tlo, thi] = limits.tilt;
  const wantX = vx;
  const wantY = vy;
  const bx = brake(vx, m.pan, plo, phi, amax);
  const by = brake(vy, m.tilt, tlo, thi, amax);
  const dv = amax * dt;
  m.vp += clamp(bx - m.vp, -dv, dv);
  m.vt += clamp(by - m.vt, -dv, dv);
  let pushing = 0;

  let p = m.pan + m.vp * dt;
  // the braking tail ends a hair before the limit, snap onto it there
  if (p <= plo + SNAP_DEG && m.vp <= 0) {
    if (p < plo || Math.abs(m.vp) < SNAP_SPEED) {
      p = plo;
      m.vp = 0;
    }
    if (p === plo && wantX < 0) pushing |= LIMIT_PAN;
  } else if (p >= phi - SNAP_DEG && m.vp >= 0) {
    if (p > phi || Math.abs(m.vp) < SNAP_SPEED) {
      p = phi;
      m.vp = 0;
    }
    if (p === phi && wantX > 0) pushing |= LIMIT_PAN;
  }

  let t = m.tilt + m.vt * dt;
  if (t <= tlo + SNAP_DEG && m.vt <= 0) {
    if (t < tlo || Math.abs(m.vt) < SNAP_SPEED) {
      t = tlo;
      m.vt = 0;
    }
    if (t === tlo && wantY < 0) pushing |= LIMIT_TILT;
  } else if (t >= thi - SNAP_DEG && m.vt >= 0) {
    if (t > thi || Math.abs(m.vt) < SNAP_SPEED) {
      t = thi;
      m.vt = 0;
    }
    if (t === thi && wantY > 0) pushing |= LIMIT_TILT;
  }

  m.pan = p;
  m.tilt = t;
  return pushing;
}

export function arrived(m: Axes, pan: number, tilt: number): boolean {
  return (
    Math.abs(pan - m.pan) < ARRIVE_DEG &&
    Math.abs(tilt - m.tilt) < ARRIVE_DEG &&
    Math.abs(m.vp) < ARRIVE_SPEED &&
    Math.abs(m.vt) < ARRIVE_SPEED
  );
}

// one tick of a move to a pose. true once the head is there and slow
export function seekAxes(m: Axes, pan: number, tilt: number, vmax: number, amax: number, limits: AxisLimits, dt: number): boolean {
  const tp = clamp(pan, limits.pan[0], limits.pan[1]);
  const tt = clamp(tilt, limits.tilt[0], limits.tilt[1]);
  stepAxes(m, seekSpeed(tp - m.pan, vmax, amax), seekSpeed(tt - m.tilt, vmax, amax), amax, limits, dt);
  // settle exactly on the target once the tail is tiny, saves an endless crawl
  if (Math.abs(tp - m.pan) < SNAP_DEG && Math.abs(m.vp) < SNAP_SPEED) {
    m.pan = tp;
    m.vp = 0;
  }
  if (Math.abs(tt - m.tilt) < SNAP_DEG && Math.abs(m.vt) < SNAP_SPEED) {
    m.tilt = tt;
    m.vt = 0;
  }
  return arrived(m, tp, tt);
}

export function still(m: Axes): boolean {
  return Math.abs(m.vp) < STILL_SPEED && Math.abs(m.vt) < STILL_SPEED;
}

export function stopNow(m: Axes): void {
  m.vp = 0;
  m.vt = 0;
}

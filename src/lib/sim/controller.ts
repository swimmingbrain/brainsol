// the tracking loop of section 6, the same logic as the python side. it runs at
// a fixed 50 Hz and commands axis speeds, not positions, so the motion stays
// smooth. hysteresis on each axis stops the hunting, 1 / cos(tilt) keeps the pan
// response alive at steep tilt, its sign turns pan around behind the zenith and
// the zenith band freezes pan where pan means nothing.
//
// two things go beyond the plain formulas, both because the plain loop got
// stuck in the simulation:
// 1. the levels are made linear in light before they are normalised (see linear),
//    or the loop stops 20 to 35 degrees off the light
// 2. when the loop cannot act on its error for half a second (pan pressed
//    against a soft limit, or a light off to the side of a panel in the zenith
//    band) it aims once at where the errors say the light is, then tracks on

import { azEl, clamp, DEG, dot, normal, poseFor, right, up, type Vec3 } from './kinematics';
import { GAMMA, K, RAW_MAX, rawFor } from './physics';
import type { Param, ParamKey, Pose, Quad } from '$lib/link/protocol';

export const DT = 0.02;

export interface ControllerParams {
  kp: number;
  vmax: number;
  amax: number;
  dead_in: number;
  dead_out: number;
  tau: number;
  min_light: number;
  zenith_band: number;
}

export interface Limits {
  pan: [number, number];
  tilt: [number, number];
}

// per sensor in the order L R U D: covered, and with the lamp on it
export interface Calibration {
  dark: Quad;
  bright: Quad;
}

export type LoopState = 'tracking' | 'locked' | 'lowlight' | 'limit' | 'moving';

export interface ControllerState {
  // filtered levels 0 to 1, L R U D
  f: Quad;
  // the commanded pose and the axis speeds in degrees per second
  pan: number;
  tilt: number;
  vp: number;
  vt: number;
  // whether each axis is moving to correct an error, with hysteresis
  ax: boolean;
  ay: boolean;
  ex: number;
  ey: number;
  lvl: number;
  st: LoopState;
  // seconds the loop has had an error it cannot act on
  stuck: number;
  // the pose of a move to the estimated light while it runs
  aim: Pose | null;
}

// how long the loop may be stuck before it aims at the estimated light
export const STUCK_TIME = 0.5;
// a pose move counts as done this close to its target, degrees
const ARRIVED = 1;
// speed per degree of distance on a pose move, so it slows down into the target
const MOVE_GAIN = 5;

// the tunables with their defaults, ranges and steps
export const PARAMS: Record<ParamKey, Param> = {
  kp: { v: 90, min: 10, max: 300, step: 1 },
  vmax: { v: 60, min: 5, max: 180, step: 1 },
  amax: { v: 240, min: 20, max: 1000, step: 10 },
  dead_in: { v: 0.025, min: 0.005, max: 0.2, step: 0.005 },
  dead_out: { v: 0.05, min: 0.01, max: 0.3, step: 0.005 },
  tau: { v: 0.12, min: 0.02, max: 1, step: 0.01 },
  min_light: { v: 0.04, min: 0, max: 0.5, step: 0.01 },
  zenith_band: { v: 6, min: 0, max: 20, step: 0.5 },
  ref_pan: { v: 0, min: -88, max: 88, step: 1 },
  ref_tilt: { v: 90, min: 4, max: 176, step: 1 },
  rate: { v: 20, min: 5, max: 30, step: 1 }
};

export const LIMITS: Limits = { pan: [-88, 88], tilt: [4, 176] };

export function defaultParams(): ControllerParams {
  return paramValues(PARAMS);
}

export function paramValues(params: Record<ParamKey, Param>): ControllerParams {
  return {
    kp: params.kp.v,
    vmax: params.vmax.v,
    amax: params.amax.v,
    dead_in: params.dead_in.v,
    dead_out: params.dead_out.v,
    tau: params.tau.v,
    min_light: params.min_light.v,
    zenith_band: params.zenith_band.v
  };
}

// a reading turned back into a number that grows in step with the light. the
// photoresistor follows lux to the power of 0.7 and the divider flattens the
// bright end, a plain (raw - dark) / (bright - dark) would squeeze the last 20
// degrees of error into a few counts and the loop would stop far off the light
export function linear(raw: number): number {
  const x = clamp(raw, 1, RAW_MAX - 1);
  return Math.pow(x / (RAW_MAX - x), 1 / GAMMA);
}

// 0 in the dark, 1 in the lamp. works for either polarity, a module wired the
// other way round reads lower in brighter light and is mirrored first
export function level(raw: number, dark: number, bright: number): number {
  if (dark === bright) return 0;
  const flip = dark > bright;
  const lin = (value: number) => linear(flip ? RAW_MAX - value : value);
  const lo = lin(dark);
  const hi = lin(bright);
  return clamp((lin(raw) - lo) / (hi - lo), 0, 1);
}

// what the dark and bright calibration steps would capture in a light scene:
// all sensors covered, then all four in the full light
export function calibrationFor(light: { lux0: number; amb: number }): Calibration {
  const dark = Math.round(rawFor(0));
  const bright = Math.round(rawFor(light.lux0 + light.amb));
  return { dark: [dark, dark, dark, dark], bright: [bright, bright, bright, bright] };
}

export function levels(raw: Quad, calib: Calibration): Quad {
  return [
    level(raw[0], calib.dark[0], calib.bright[0]),
    level(raw[1], calib.dark[1], calib.bright[1]),
    level(raw[2], calib.dark[2], calib.bright[2]),
    level(raw[3], calib.dark[3], calib.bright[3])
  ];
}

export function initialState(pan: number, tilt: number, f: Quad = [0, 0, 0, 0]): ControllerState {
  return {
    f: [...f],
    pan,
    tilt,
    vp: 0,
    vt: 0,
    ax: false,
    ay: false,
    ex: 0,
    ey: 0,
    lvl: 0,
    st: 'locked',
    stuck: 0,
    aim: null
  };
}

export interface StepContext {
  params: ControllerParams;
  calib: Calibration;
  limits: Limits;
  dt?: number;
}

export interface AxisMove {
  pan: number;
  tilt: number;
  vp: number;
  vt: number;
  // an axis ran into a soft limit and was stopped there
  limit: boolean;
}

// speeds ramp towards the wanted speeds with the acceleration limit, the pose
// follows and stops at the soft limits. shared by the loop and every pose move
export function moveAxes(
  state: { pan: number; tilt: number; vp: number; vt: number },
  vx: number,
  vy: number,
  p: { amax: number },
  limits: Limits,
  dt = DT
): AxisMove {
  const dv = p.amax * dt;
  let vp = state.vp + clamp(vx - state.vp, -dv, dv);
  let vt = state.vt + clamp(vy - state.vt, -dv, dv);
  let pan = state.pan + vp * dt;
  let tilt = state.tilt + vt * dt;
  let limit = false;
  if (pan < limits.pan[0] || pan > limits.pan[1]) {
    pan = clamp(pan, limits.pan[0], limits.pan[1]);
    vp = 0;
    limit = true;
  }
  if (tilt < limits.tilt[0] || tilt > limits.tilt[1]) {
    tilt = clamp(tilt, limits.tilt[0], limits.tilt[1]);
    vt = 0;
    limit = true;
  }
  return { pan, tilt, vp, vt, limit };
}

// the speeds that bring a pose to a target and slow down into it, for manual
// targets, park and the aim move
export function approachSpeeds(state: Pose, target: Pose, p: { vmax: number }): { vx: number; vy: number; arrived: boolean } {
  const dp = target.pan - state.pan;
  const dt = target.tilt - state.tilt;
  return {
    vx: clamp(dp * MOVE_GAIN, -p.vmax, p.vmax),
    vy: clamp(dt * MOVE_GAIN, -p.vmax, p.vmax),
    arrived: Math.abs(dp) < ARRIVED && Math.abs(dt) < ARRIVED
  };
}

// the shade wall model run backwards: how far the light sits off the panel
// normal along the right and up edges, as tangents
export function errorTangents(ex: number, ey: number, k = K): { tx: number; ty: number } {
  return { tx: (2 * ex) / (k * (1 + Math.abs(ex))), ty: (2 * ey) / (k * (1 + Math.abs(ey))) };
}

// the pose that faces where the errors say the light is. far off the axis the
// model saturates and the guess falls short, the loop does the rest from there
export function aimPose(pan: number, tilt: number, ex: number, ey: number, limits: Limits, k = K): Pose {
  const { tx, ty } = errorTangents(ex, ey, k);
  const n = normal(pan, tilt);
  const r = right(pan);
  const v = up(pan, tilt);
  const s: Vec3 = [n[0] + tx * r[0] + ty * v[0], n[1] + tx * r[1] + ty * v[1], n[2] + tx * r[2] + ty * v[2]];
  const sky = azEl(s);
  const pose = poseFor(sky.az, sky.el);
  return { pan: clamp(pose.pan, limits.pan[0], limits.pan[1]), tilt: clamp(pose.tilt, limits.tilt[0], limits.tilt[1]) };
}

// one tick of the loop. returns the next state, the one passed in stays as it was
export function controllerStep(state: ControllerState, raw: Quad, ctx: StepContext): ControllerState {
  const { params: p, calib, limits } = ctx;
  const dt = ctx.dt ?? DT;
  const norm = levels(raw, calib);
  const a = 1 - Math.exp(-dt / p.tau);
  const f: Quad = [
    state.f[0] + (norm[0] - state.f[0]) * a,
    state.f[1] + (norm[1] - state.f[1]) * a,
    state.f[2] + (norm[2] - state.f[2]) * a,
    state.f[3] + (norm[3] - state.f[3]) * a
  ];
  const [L, R, U, D] = f;
  const lvl = (L + R + U + D) / 4;
  const ex = (R - L) / (R + L + 1e-6);
  const ey = (U - D) / (U + D + 1e-6);

  // an aim move runs to its end before the loop looks at the light again
  if (state.aim) {
    const go = approachSpeeds(state, state.aim, p);
    const move = moveAxes(state, go.vx, go.vy, p, limits, dt);
    const done = go.arrived && Math.abs(move.vp) < 0.5 && Math.abs(move.vt) < 0.5;
    return {
      pan: move.pan,
      tilt: move.tilt,
      vp: move.vp,
      vt: move.vt,
      f,
      ax: false,
      ay: false,
      ex,
      ey,
      lvl,
      st: done ? 'tracking' : 'moving',
      stuck: 0,
      aim: done ? null : state.aim
    };
  }

  let vx = 0;
  let vy = 0;
  let ax = false;
  let ay = false;
  let blocked = false;
  const low = lvl < p.min_light;
  const c = Math.cos(state.tilt * DEG);
  if (!low) {
    ax = state.ax ? Math.abs(ex) >= p.dead_in : Math.abs(ex) > p.dead_out;
    ay = state.ay ? Math.abs(ey) >= p.dead_in : Math.abs(ey) > p.dead_out;
    if (ay) vy = clamp(p.kp * ey, -p.vmax, p.vmax);
    if (Math.abs(state.tilt - 90) >= p.zenith_band) {
      if (ax) vx = clamp((p.kp * ex * Math.sign(c)) / Math.max(Math.abs(c), 0.35), -p.vmax, p.vmax);
    } else {
      // pan rests in the band and an x error smaller than the band does not hold
      // off the lock. a bigger one is a light off to the side that tilt alone
      // never finds
      const { tx } = errorTangents(ex, 0);
      blocked = Math.atan(Math.abs(tx)) / DEG > p.zenith_band;
      if (!blocked) ax = false;
    }
  }

  const move = moveAxes(state, vx, vy, p, limits, dt);

  // the error presses pan against a soft limit, the light is round the side.
  // the sign of cos(tilt) says which way pan wants to go
  const push = ex * Math.sign(c);
  const atMin = move.pan <= limits.pan[0] + 1e-9;
  const atMax = move.pan >= limits.pan[1] - 1e-9;
  const pressing = !low && Math.abs(ex) > p.dead_out && ((atMin && push < 0) || (atMax && push > 0));
  const stuck = pressing || blocked ? state.stuck + dt : 0;
  if (stuck >= STUCK_TIME) {
    const aim = aimPose(move.pan, move.tilt, ex, ey, limits);
    return { pan: move.pan, tilt: move.tilt, vp: move.vp, vt: move.vt, f, ax: false, ay: false, ex, ey, lvl, st: 'moving', stuck: 0, aim };
  }

  let st: LoopState;
  if (low) st = 'lowlight';
  else if (move.limit) st = 'limit';
  else if (!ax && !ay && Math.abs(move.vp) < 0.5 && Math.abs(move.vt) < 0.5) st = 'locked';
  else st = 'tracking';

  return { pan: move.pan, tilt: move.tilt, vp: move.vp, vt: move.vt, f, ax, ay, ex, ey, lvl, st, stuck, aim: null };
}

// the estimated angle between the panel normal and the light, in degrees, from
// the two errors. it inverts the shade wall model for a light near the axis
export function offAngle(ex: number, ey: number, k = K): number {
  const { tx, ty } = errorTangents(ex, ey, k);
  return Math.atan(Math.hypot(tx, ty)) / DEG;
}

// how much more light the tracker catches than a fixed panel at the reference
// pose, taking the light to be along the panel normal
export function gainAt(pan: number, tilt: number, refPan: number, refTilt: number): number {
  return 1 / Math.max(dot(normal(pan, tilt), normal(refPan, refTilt)), 0.1);
}

// estimated panel power in milliwatts. about 110 lux make a watt per square
// metre of sunlight, the panel size is in millimetres
export function panelPower(lux: number, panel: { w: number; h: number; eff: number }): number {
  const area = (panel.w * panel.h) / 1e6;
  return (lux / 110) * area * panel.eff * 1000;
}

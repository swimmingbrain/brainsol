import { describe, expect, it } from 'vitest';
import {
  aimPose,
  calibrationFor,
  controllerStep,
  copyState,
  defaultParams,
  DT,
  gainAt,
  gainFromErrors,
  gainToward,
  initialState,
  level,
  levels,
  lightEstimate,
  LIMITS,
  linear,
  offAngle,
  panelPower,
  senseLevels,
  trackStep,
  type Calibration,
  type ControllerState
} from './controller';
import { angleBetween, azEl, direction, dot, normal, offAxis, poseFor } from './kinematics';
import { mulberry32, PHONE_LIGHT, rawFor, RAW_MAX, sense, servoStep, type Light } from './physics';
import type { Quad } from '$lib/link/protocol';

const calib = calibrationFor(PHONE_LIGHT);
const params = defaultParams();

// the loop, the sensors and the servos together, the way the engine runs them
function run(light: Light, start: { pan: number; tilt: number }, seconds: number, seed = 1) {
  const random = mulberry32(seed);
  const pose = { ...start };
  let state = initialState(pose.pan, pose.tilt, levels(sense(pose.pan, pose.tilt, light).raw, calib));
  const seen = new Set<string>();
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    const reading = sense(pose.pan, pose.tilt, light, random);
    state = controllerStep(state, reading.raw, { params, calib, limits: LIMITS });
    pose.pan = servoStep(pose.pan, state.pan, DT);
    pose.tilt = servoStep(pose.tilt, state.tilt, DT);
    seen.add(state.st);
  }
  return { state, pose, seen, off: offAxis(pose.pan, pose.tilt, light.az, light.el) };
}

function quad(value: number): Quad {
  return [value, value, value, value];
}

function step(state: ControllerState, raw: Quad, c: Calibration = calib) {
  return controllerStep(state, raw, { params, calib: c, limits: LIMITS });
}

describe('the levels', () => {
  it('reads 0 in the dark and 1 in the full lamp', () => {
    expect(level(calib.dark[0], calib.dark[0], calib.bright[0])).toBe(0);
    expect(level(calib.bright[0], calib.dark[0], calib.bright[0])).toBe(1);
  });

  it('grows in step with the light, so half the light reads about half', () => {
    const half = level(rawFor(480), calib.dark[0], calib.bright[0]);
    expect(half).toBeCloseTo(0.5, 1);
    expect(linear(rawFor(400)) / linear(rawFor(100))).toBeCloseTo(4, 1);
  });

  it('stays inside 0 to 1 beyond the calibration', () => {
    expect(level(RAW_MAX, calib.dark[0], calib.bright[0])).toBe(1);
    expect(level(0, calib.dark[0], calib.bright[0])).toBe(0);
  });

  it('works for a module wired the other way round', () => {
    const dark = RAW_MAX - calib.dark[0];
    const bright = RAW_MAX - calib.bright[0];
    const lamp = RAW_MAX - Math.round(rawFor(480));
    expect(level(lamp, dark, bright)).toBeCloseTo(level(Math.round(rawFor(480)), calib.dark[0], calib.bright[0]), 9);
  });

  it('gives 0 for a calibration without a span instead of dividing by zero', () => {
    expect(level(4000, 3000, 3000)).toBe(0);
  });
});

describe('one step of the loop', () => {
  const lit = Math.round(rawFor(960));
  const dim = Math.round(rawFor(700));

  it('filters the levels with the time constant tau', () => {
    const next = step(initialState(0, 45), quad(lit));
    expect(next.f[0]).toBeCloseTo(1 - Math.exp(-DT / params.tau), 3);
  });

  it('starts an axis only above dead_out and keeps it going down to dead_in', () => {
    // light from the right: R bright, L a bit dimmer
    let state = initialState(0, 45, [0.9, 1, 1, 1]);
    state = step(state, [lit, lit, lit, lit]);
    expect(state.ax).toBe(false);
    state = { ...initialState(0, 45, [0.8, 1, 1, 1]) };
    state = step(state, [dim, lit, lit, lit]);
    expect(state.ex).toBeGreaterThan(params.dead_out);
    expect(state.ax).toBe(true);
    expect(state.vp).toBeGreaterThan(0);
    // the error falls between the two thresholds, the axis keeps going
    const between = { ...state, f: [0.94, 1, 1, 1] as Quad };
    const kept = step(between, [Math.round(rawFor(910)), lit, lit, lit]);
    expect(Math.abs(kept.ex)).toBeLessThan(params.dead_out);
    expect(Math.abs(kept.ex)).toBeGreaterThan(params.dead_in);
    expect(kept.ax).toBe(true);
    // the same error from rest does not start it
    const fresh = step({ ...between, ax: false, vp: 0 }, [Math.round(rawFor(910)), lit, lit, lit]);
    expect(fresh.ax).toBe(false);
  });

  it('turns pan the other way once the panel looks over the top', () => {
    const front = step(initialState(0, 45, [0.8, 1, 1, 1]), [dim, lit, lit, lit]);
    const back = step(initialState(0, 135, [0.8, 1, 1, 1]), [dim, lit, lit, lit]);
    expect(front.vp).toBeGreaterThan(0);
    expect(back.vp).toBeLessThan(0);
  });

  it('rests pan inside the zenith band and lets a small x error lock', () => {
    const state = step(initialState(0, 92, [0.885, 1, 1, 1]), [Math.round(rawFor(850)), lit, lit, lit]);
    expect(state.ex).toBeGreaterThan(params.dead_out);
    expect(state.vp).toBe(0);
    expect(state.ax).toBe(false);
  });

  it('holds still and says lowlight when the mean level is below min_light', () => {
    const dark = Math.round(rawFor(5));
    const state = step(initialState(10, 45, [0, 0.03, 0, 0]), [dark, Math.round(rawFor(30)), dark, dark]);
    expect(state.st).toBe('lowlight');
    expect(state.vp).toBe(0);
    expect(state.vt).toBe(0);
  });

  it('ramps the speed with the acceleration limit', () => {
    const state = step(initialState(0, 45, [0.5, 1, 1, 1]), [Math.round(rawFor(300)), lit, lit, lit]);
    expect(state.vp).toBeCloseTo(params.amax * DT, 9);
  });

  it('stops at a soft limit with the speed zeroed and says limit', () => {
    const state = step({ ...initialState(87.99, 45, [0.5, 1, 1, 1]), vp: 40 }, [Math.round(rawFor(300)), lit, lit, lit]);
    expect(state.pan).toBe(LIMITS.pan[1]);
    expect(state.vp).toBe(0);
    expect(state.st).toBe('limit');
  });

  it('says locked once both axes rest', () => {
    const state = step(initialState(25, 40, [1, 1, 1, 1]), quad(lit));
    expect(state.st).toBe('locked');
  });

  it('leaves the state it was given untouched', () => {
    const before = initialState(0, 45, [0.8, 1, 1, 1]);
    const copy = structuredClone(before);
    step(before, [dim, lit, lit, lit]);
    expect(before).toEqual(copy);
  });

  it('gives the same in place as the pure step, tick after tick', () => {
    const random = mulberry32(9);
    const light = { ...PHONE_LIGHT, az: -40, el: 60 };
    let pure = initialState(30, 20, [0.5, 0.5, 0.5, 0.5]);
    const inPlace = copyState(pure);
    const f = inPlace.f;
    for (let i = 0; i < 400; i++) {
      const raw = sense(pure.pan, pure.tilt, light, random).raw;
      pure = step(pure, raw);
      senseLevels(inPlace, raw, calib, params.tau);
      trackStep(inPlace, { params, calib, limits: LIMITS });
      expect(inPlace).toEqual(pure);
    }
    // the filter array is the same one all along
    expect(inPlace.f).toBe(f);
  });

  it('flips an axis with the polarity sign of the calibration', () => {
    const plain = step(initialState(0, 45, [0.8, 1, 1, 1]), [dim, lit, lit, lit]);
    const swapped = step(initialState(0, 45, [0.8, 1, 1, 1]), [dim, lit, lit, lit], { ...calib, sx: -1 });
    expect(swapped.ex).toBeCloseTo(-plain.ex, 12);
    expect(swapped.ey).toBeCloseTo(plain.ey, 12);
    expect(Math.sign(swapped.vp)).toBe(-Math.sign(plain.vp));
  });

  it('brakes into a soft limit instead of hitting it at full speed', () => {
    // the light is far round to the right, pan runs at it and has to stop at 88
    let state = { ...initialState(60, 30, [0.2, 1, 1, 1]), vp: 60 };
    let worst = 0;
    for (let i = 0; i < 60; i++) {
      const before = state.vp;
      state = step(state, [Math.round(rawFor(200)), lit, lit, lit]);
      worst = Math.max(worst, Math.abs(state.vp - before) / DT);
    }
    expect(state.pan).toBe(LIMITS.pan[1]);
    expect(worst).toBeLessThanOrEqual(params.amax + 1e-6);
  });
});

describe('the loop with the sensors and the servos', () => {
  // every light over the whole sky, every start pose that sees it. with the default
  // dead band an axis rests up to about 3 degrees off, so a lock is within 7
  const lights: [number, number][] = [];
  for (let az = -165; az <= 180; az += 30) for (const el of [8, 30, 55, 75]) lights.push([az, el]);
  const starts: [number, number][] = [];
  for (const pan of [-75, -30, 0, 30, 75]) for (const tilt of [12, 50, 88, 130, 168]) starts.push([pan, tilt]);

  it('converges on the light from many poses, in front and behind the zenith', () => {
    let runs = 0;
    let behind = 0;
    for (const [az, el] of lights) {
      const light = { ...PHONE_LIGHT, az, el };
      const target = poseFor(az, el);
      // a light just outside the pan range can only be reached up to the limit
      const reachable = Math.abs(target.pan) <= LIMITS.pan[1] - 2;
      for (const [pan, tilt] of starts) {
        if (dot(normal(pan, tilt), direction(az, el)) < 0.15) continue;
        const result = run(light, { pan, tilt }, 12, runs + 1);
        runs++;
        if (target.tilt > 90 || tilt > 90) behind++;
        expect(result.off, `light ${az}/${el} from ${pan}/${tilt}`).toBeLessThan(reachable ? 7 : 8);
        expect(['locked', 'limit']).toContain(result.state.st);
      }
    }
    expect(runs).toBeGreaterThan(400);
    expect(behind).toBeGreaterThan(150);
    // hundreds of simulated runs, a busy machine needs more than the default 5 s
  }, 30_000);

  it('gets close to a light high over the panel, inside the zenith band', () => {
    for (const az of [-120, -45, 10, 80, 160]) {
      const result = run({ ...PHONE_LIGHT, az, el: 86 }, { pan: 0, tilt: 60 }, 12);
      expect(result.off).toBeLessThan(8);
      expect(result.state.st).toBe('locked');
    }
  });

  it('finds a light off to the side of the flat parked panel', () => {
    const result = run({ ...PHONE_LIGHT, az: -80, el: 20 }, { pan: 0, tilt: 90 }, 12);
    expect(result.off).toBeLessThan(6);
  });

  it('turns over the top when the light is round the side beyond the pan range', () => {
    // the light is behind and to the left, the front way ends at pan -88
    const result = run({ ...PHONE_LIGHT, az: -150, el: 35 }, { pan: -60, tilt: 40 }, 15);
    expect(result.seen.has('moving')).toBe(true);
    expect(result.pose.tilt).toBeGreaterThan(90);
    expect(result.off).toBeLessThan(6);
  });

  it('follows a light that moves over the top at 5 degrees per second without losing it', () => {
    const random = mulberry32(3);
    const pose = poseFor(-60, 20);
    let state = initialState(pose.pan, pose.tilt, [1, 1, 1, 1]);
    let worst = 0;
    const seen = new Set<string>();
    // up from the front left, through the zenith and down at the back right
    for (let i = 0; i < 50 * 28; i++) {
      const phi = (20 + 5 * i * DT) * (Math.PI / 180);
      const h = direction(-60, 0);
      const sky = azEl([h[0] * Math.cos(phi), h[1] * Math.cos(phi), Math.sin(phi)]);
      const light = { ...PHONE_LIGHT, az: sky.az, el: sky.el };
      const reading = sense(pose.pan, pose.tilt, light, random);
      state = controllerStep(state, reading.raw, { params, calib, limits: LIMITS });
      pose.pan = servoStep(pose.pan, state.pan, DT);
      pose.tilt = servoStep(pose.tilt, state.tilt, DT);
      seen.add(state.st);
      if (i * DT > 2) worst = Math.max(worst, offAxis(pose.pan, pose.tilt, light.az, light.el));
    }
    expect(pose.tilt).toBeGreaterThan(140);
    expect(seen.has('moving')).toBe(false);
    expect(worst).toBeLessThan(9);
  });

  it('holds when the lamp goes out and the room is dark', () => {
    const result = run({ ...PHONE_LIGHT, on: false, amb: 5 }, { pan: 20, tilt: 30 }, 3);
    expect(result.state.st).toBe('lowlight');
    expect(result.pose.pan).toBeCloseTo(20, 6);
    expect(result.pose.tilt).toBeCloseTo(30, 6);
  });
});

describe('the derived values', () => {
  it('estimates no offset without an error and grows with it', () => {
    expect(offAngle(0, 0)).toBe(0);
    expect(offAngle(0.1, 0)).toBeGreaterThan(offAngle(0.05, 0));
    expect(offAngle(0.1, 0.1)).toBeGreaterThan(offAngle(0.1, 0));
  });

  it('inverts the shade wall model for a light near the axis without ambient light', () => {
    // light 5 degrees to the right: L sees 1 - k tan 5 of it
    const share = 1 - 1.2 * Math.tan((5 * Math.PI) / 180);
    const ex = (1 - share) / (1 + share);
    expect(offAngle(ex, 0)).toBeCloseTo(5, 1);
  });

  it('gives a gain of 1 at the reference pose and 2 at 60 degrees from it', () => {
    expect(gainAt(0, 90, 0, 90)).toBeCloseTo(1, 9);
    expect(gainAt(0, 30, 0, 90)).toBeCloseTo(2, 9);
  });

  it('caps the gain at 10 when the panel looks away from the reference', () => {
    expect(gainAt(0, 0, 0, 180)).toBe(10);
  });

  it('estimates the panel power from lux, area and efficiency', () => {
    // 1100 lux on 0.01 square metres at 15 % is 10 W/m2 * 0.01 * 0.15 = 15 mW
    expect(panelPower(1100, { w: 100, h: 100, eff: 0.15 })).toBeCloseTo(15, 9);
  });

  it('aims where the errors say the light is, over the top when it is behind', () => {
    // a light 20 degrees to the right of a panel at pan 10 tilt 30, read off the clean sensors
    const light = { ...PHONE_LIGHT, az: 30, el: 30 };
    const f = levels(sense(10, 30, light).raw, calib);
    const ex = (f[1] - f[0]) / (f[1] + f[0]);
    const ey = (f[2] - f[3]) / (f[2] + f[3]);
    const aim = aimPose(10, 30, ex, ey, LIMITS);
    expect(offAxis(aim.pan, aim.tilt, light.az, light.el)).toBeLessThan(5);
    // pressed against pan 88 with the light high behind: the aim is over the top
    const behind = { ...PHONE_LIGHT, az: -165, el: 75 };
    const g = levels(sense(88, 80, behind).raw, calib);
    const back = aimPose(88, 80, (g[1] - g[0]) / (g[1] + g[0]), (g[2] - g[3]) / (g[2] + g[3]), LIMITS);
    expect(back.tilt).toBeGreaterThan(90);
    expect(offAxis(back.pan, back.tilt, behind.az, behind.el)).toBeLessThan(5);
  });

  it('estimates the light direction from the errors as a unit vector', () => {
    const light = { ...PHONE_LIGHT, az: 32, el: 44 };
    const f = levels(sense(25, 40, light).raw, calib);
    const s = lightEstimate(25, 40, (f[1] - f[0]) / (f[1] + f[0]), (f[2] - f[3]) / (f[2] + f[3]));
    expect(Math.hypot(...s)).toBeCloseTo(1, 12);
    const sky = azEl(s);
    expect(offAxis(25, 40, sky.az, sky.el)).toBeGreaterThan(3);
    expect(angleBetween(s, direction(32, 44))).toBeLessThan(3);
  });

  it('gives the gain against a known light and 1 when the panel is the reference', () => {
    const s = direction(0, 30);
    expect(gainToward(0, 90, 0, 90, s)).toBeCloseTo(1, 12);
    // facing a light at 30 degrees elevation against a flat panel: 1 / sin 30
    expect(gainToward(0, 30, 0, 90, s)).toBeCloseTo(2, 9);
    // facing away from it the tracked panel gets nothing
    expect(gainToward(90, 0, 0, 90, direction(-90, 0))).toBe(0);
  });

  it('gives the same gain without temporary vectors as with them, and gainAt for no error', () => {
    const random = mulberry32(4);
    for (let i = 0; i < 500; i++) {
      const pan = random() * 176 - 88;
      const tilt = 4 + random() * 172;
      const ex = random() * 1.6 - 0.8;
      const ey = random() * 1.6 - 0.8;
      const refPan = random() * 176 - 88;
      const refTilt = 4 + random() * 172;
      const slow = gainToward(pan, tilt, refPan, refTilt, lightEstimate(pan, tilt, ex, ey));
      expect(gainFromErrors(pan, tilt, ex, ey, refPan, refTilt)).toBeCloseTo(slow, 9);
      expect(gainFromErrors(pan, tilt, 0, 0, refPan, refTilt)).toBeCloseTo(gainAt(pan, tilt, refPan, refTilt), 9);
    }
  });

  it('normalises exactly like level, also when the calibration changes and flips', () => {
    const random = mulberry32(6);
    const state = initialState(0, 45, [0, 0, 0, 0]);
    let check = initialState(0, 45, [0, 0, 0, 0]).f;
    const tau = 0.12;
    const a = 1 - Math.exp(-DT / tau);
    for (let i = 0; i < 300; i++) {
      // a new calibration every 50 ticks, some of them wired the other way round
      const k = Math.floor(i / 50);
      const dark = (k % 3 === 2 ? 7000 : 200) + k;
      const bright = (k % 3 === 2 ? 600 : 7800) - k;
      const c: Calibration = { dark: [dark, dark + 5, dark, dark], bright: [bright, bright, bright - 7, bright] };
      const raw: Quad = [0, 1, 2, 3].map(() => Math.round(random() * RAW_MAX)) as Quad;
      senseLevels(state, raw, c, tau);
      check = check.map((f, j) => f + (level(raw[j], c.dark[j], c.bright[j]) - f) * a) as Quad;
      expect(state.f).toEqual(check);
    }
  });

  it('keeps the aim inside the soft limits', () => {
    const aim = aimPose(80, 10, 0.9, -0.9, LIMITS);
    expect(aim.pan).toBeGreaterThanOrEqual(LIMITS.pan[0]);
    expect(aim.pan).toBeLessThanOrEqual(LIMITS.pan[1]);
    expect(aim.tilt).toBeGreaterThanOrEqual(LIMITS.tilt[0]);
    expect(aim.tilt).toBeLessThanOrEqual(LIMITS.tilt[1]);
  });
});

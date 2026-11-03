// the calibration steps, the same as calibration.py on the pi.
// dark and bright average what the simulated sensors read right now, so a dark
// capture wants the lamp off (simlight on false), just as the real one wants
// the sensors covered. polarity wiggles the head under the lamp and learns the
// loop signs, zero takes the pulses going out now as the servo centre. nothing
// is kept until save, reset goes back to the defaults

import { Activity, ActivityError, type ActivityHost } from './activities';
import { calibrationFor, type Calibration } from './controller';
import { CommandError, isFields, isNumber } from './fields';
import { PHONE_LIGHT, RAW_MAX } from './physics';
import { defaultPanMap, defaultTiltMap, toUs, US_MAX, US_MIN, type ServoMap } from './servo';
import type { CalibStep, Quad } from '$lib/link/protocol';

export const CALIB_STEPS: CalibStep[] = ['dark', 'bright', 'zero', 'polarity', 'save', 'reset'];
const CAPTURE_S = 1;
// less than this between dark and bright and the sensor cannot tell light from shade
const MIN_SPAN = 50;
const WIGGLE = 4;
const NAMES = ['L', 'R', 'U', 'D'];

// the sensor normalisation, the loop signs and the servo maps
export interface SimCalibration extends Calibration {
  sx: number;
  sy: number;
  pan: ServoMap;
  tilt: ServoMap;
}

// as if dark and bright had been taken under the phone light, like on the pi
export function defaultCalibration(): SimCalibration {
  return { ...calibrationFor(PHONE_LIGHT), sx: 1, sy: 1, pan: defaultPanMap(), tilt: defaultTiltMap() };
}

export function copyCalibration(c: SimCalibration): SimCalibration {
  return { dark: [...c.dark], bright: [...c.bright], sx: c.sx, sy: c.sy, pan: { ...c.pan }, tilt: { ...c.tilt } };
}

export interface CalibReport {
  dark: number[];
  bright: number[];
  span: number[];
  // a sensor that reads lower in light than in shade, the normalisation handles it
  inverted: boolean[];
  // a sensor whose dark and bright readings hardly differ
  weak: boolean[];
}

const r1 = (n: number) => Math.round(n * 10) / 10 + 0;

export function describe(c: Calibration): CalibReport {
  const span = c.dark.map((d, i) => r1(c.bright[i] - d));
  return {
    dark: c.dark.map(r1),
    bright: c.bright.map(r1),
    span,
    inverted: span.map((s) => s < 0),
    weak: span.map((s) => Math.abs(s) < MIN_SPAN)
  };
}

export type CalibHost = ActivityHost;

function weakNames(report: CalibReport): string {
  return NAMES.filter((_, i) => report.weak[i]).join(' ');
}

// averages the raw sums for a second, the head holds still meanwhile
export class Capture extends Activity {
  readonly kind = 'calib';
  readonly st = 'calibrating';

  constructor(
    host: CalibHost,
    readonly which: 'dark' | 'bright'
  ) {
    super(host);
    this.id = `calib-${which}`;
  }

  protected *run() {
    const sums = [0, 0, 0, 0];
    const ticks = Math.round(CAPTURE_S / 0.02);
    for (let i = 0; i < ticks; i++) {
      yield;
      const raw = this.host.raw;
      for (let k = 0; k < 4; k++) sums[k] += raw[k];
    }
    const values = sums.map((s) => r1(s / ticks)) as Quad;
    const calib = copyCalibration(this.host.calib);
    calib[this.which] = values;
    this.host.setCalibration(calib);
    this.host.calibSaved = false;
    return describe(calib);
  }

  protected finished(): void {
    if (!this.ok) {
      this.host.event('warn', `calibration ${this.which} failed, ${this.error}`);
      return;
    }
    const weak = weakNames(this.result as CalibReport);
    if (weak) this.host.event('warn', `calibration ${this.which} captured, but ${weak} hardly differ between dark and bright, not saved yet`);
    else this.host.event('info', `calibration ${this.which} captured, not saved yet`);
  }
}

// turns each axis a few degrees each way under a fixed lamp and checks the error
// moves the way the loop expects, a sensor pair wired the other way round flips that axis
export class Polarity extends Activity {
  readonly kind = 'calib';
  readonly st = 'calibrating';

  constructor(host: CalibHost) {
    super(host);
    this.id = 'calib-polarity';
  }

  protected *run() {
    const h = this.host;
    const c = h.ctrl;
    const p = h.cfg.params;
    if (c.lvl < p.min_light.v) throw new ActivityError('needs light on the sensors, point a lamp at the head');
    const band = p.zenith_band.v + 5;
    if (Math.abs(c.tilt - 90) < band) throw new ActivityError(`tilt the head at least ${band.toFixed(0)} degrees away from flat first`);
    const { pan: lp, tilt: lt } = h.cfg.limits;
    const p0 = Math.min(Math.max(c.pan, lp[0] + WIGGLE), lp[1] - WIGGLE);
    const t0 = Math.min(Math.max(c.tilt, lt[0] + WIGGLE), lt[1] - WIGGLE);
    // the errors before the signs the calibration has now, sx and sy are 1 or -1
    const sx0 = h.calib.sx;
    const sy0 = h.calib.sy;
    const reads: [number, number][] = [];
    for (const [dp, dt] of [
      [WIGGLE, 0],
      [-WIGGLE, 0],
      [0, WIGGLE],
      [0, -WIGGLE]
    ]) {
      yield* this.seek(p0 + dp, t0 + dt);
      yield* this.wait(0.3);
      let sumX = 0;
      let sumY = 0;
      for (let i = 0; i < 10; i++) {
        yield;
        sumX += c.ex * sx0;
        sumY += c.ey * sy0;
      }
      reads.push([sumX / 10, sumY / 10]);
    }
    yield* this.seek(p0, t0);
    const dx = reads[0][0] - reads[1][0];
    const dy = reads[2][1] - reads[3][1];
    if (Math.abs(dx) < 0.005 || Math.abs(dy) < 0.005) throw new ActivityError('the sensors hardly changed, check the lamp and the wiring');
    // turning right moves the lamp to the left of the panel, so ex should fall,
    // behind the zenith the pan direction is mirrored
    const cos = Math.cos((t0 * Math.PI) / 180);
    const sx = dx * (cos > 0 ? 1 : -1) < 0 ? 1 : -1;
    // tipping up moves the lamp below the panel centre, so ey should fall
    const sy = dy < 0 ? 1 : -1;
    const calib = copyCalibration(h.calib);
    calib.sx = sx;
    calib.sy = sy;
    h.setCalibration(calib);
    h.calibSaved = false;
    return { sx, sy, dx: Math.round(dx * 1e4) / 1e4, dy: Math.round(dy * 1e4) / 1e4 };
  }

  protected finished(): void {
    if (this.ok) {
      const r = this.result as { sx: number; sy: number };
      this.host.event('info', `polarity learned, sx ${r.sx} sy ${r.sy}, not saved yet`);
    } else this.host.event('warn', `polarity failed, ${this.error}`);
  }
}

// dark or bright typed in instead of captured, four numbers in the order
// L R U D or a map by sensor name
export function setValues(host: CalibHost, which: 'dark' | 'bright', values: unknown): CalibReport {
  let list: unknown[];
  if (Array.isArray(values)) list = values;
  else if (isFields(values)) {
    const low: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(values)) low[k.toLowerCase()] = v;
    list = ['l', 'r', 'u', 'd'].map((k) => low[k]);
  } else throw new CommandError('values must be four numbers');
  if (list.length !== 4) throw new CommandError('values must be four numbers');
  if (!list.every((v) => isNumber(v) && v >= 0 && v <= RAW_MAX)) throw new CommandError(`values must be numbers from 0 to ${RAW_MAX}`);
  const calib = copyCalibration(host.calib);
  calib[which] = list as Quad;
  host.setCalibration(calib);
  host.calibSaved = false;
  host.event('info', `calibration ${which} set by hand, not saved yet`);
  return describe(calib);
}

// the pulses going out now become the centre, the head is meant to sit at pan 0 and flat
export function zero(host: CalibHost, panUs: number | null, tiltUs: number | null): { pan_us: number; tilt_us: number; pan: number; tilt: number } {
  const c = host.calib;
  const pu = panUs ?? toUs(c.pan, host.ctrl.pan);
  const tu = tiltUs ?? toUs(c.tilt, host.ctrl.tilt);
  if (pu < US_MIN || pu > US_MAX || tu < US_MIN || tu > US_MAX) throw new CommandError(`pulses must be from ${US_MIN} to ${US_MAX} us`);
  const calib = copyCalibration(c);
  calib.pan.centreUs = pu;
  calib.tilt.centreUs = tu;
  host.setCalibration(calib);
  host.calibSaved = false;
  host.event('info', `servo centre set to ${pu.toFixed(0)} and ${tu.toFixed(0)} us, not saved yet`);
  return { pan_us: pu, tilt_us: tu, pan: r1(host.ctrl.pan), tilt: r1(host.ctrl.tilt) };
}

// the simulation keeps it for this visit, a pi writes it to its settings file
export function save(host: CalibHost): CalibReport {
  host.calibSaved = true;
  host.event('info', 'calibration saved for the sim profile');
  return describe(host.calib);
}

export function reset(host: CalibHost): CalibReport {
  host.setCalibration(defaultCalibration());
  host.calibSaved = false;
  host.event('info', 'calibration back to the defaults, not saved yet');
  return describe(host.calib);
}

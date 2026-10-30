// the cmd messages of section 8, checked field by field the way commands.py on
// the pi checks them, only simlight is open to everyone here. every command
// gets exactly one ack with its id: ok with
// the data the pi sends, or ok false with admin, bad, busy, unknown or
// unsupported. a handler that returns LATER answers itself when its activity ends

import { CommandError, isFields, num, oneOf, optBool, optNum, bool, text, type Fields } from './fields';
import { wrap180 } from './kinematics';
import { CALIB_STEPS, Capture, Polarity, reset, save, setValues, zero } from './calibration';
import { EXP_KINDS, makeExperiment } from './experiments';
import { Scan, SCAN_STEP, STEP_MAX, STEP_MIN } from './scan';
import { parseWhen, SPEED_MAX, SPEED_MIN } from './sun';
import { MODES } from '$lib/link/protocol';
import type { SimTracker } from './engine';

// the lamp of the simulation only lights this tab, so every visitor may move
// it. against a real tracker simlight stays admin only, the pi checks that
export const OPEN_OPS = ['ping', 'simlight'];
export const ADMIN_OPS = ['mode', 'target', 'rate', 'set', 'site', 'sun', 'scan', 'exp', 'stop', 'calib', 'rec', 'sys'];

// the ack comes later, when the activity the command started has ended
export const LATER = Symbol('later');

type Handler = (eng: SimTracker, msg: Fields, id: string) => unknown;

const r1 = (n: number) => Math.round(n * 10) / 10 + 0;
const r3 = (n: number) => Math.round(n * 1000) / 1000 + 0;

const handlers: Record<string, Handler> = {
  ping: (eng) => ({ ts: r3(eng.wall()) }),

  mode: (eng, msg) => {
    const mode = oneOf(msg, 'mode', MODES);
    eng.setMode(mode);
    return { mode };
  },

  target: (eng, msg) => {
    const pose = eng.setTarget(num(msg, 'pan', -180, 180), num(msg, 'tilt', -90, 270));
    return { pan: r1(pose.pan), tilt: r1(pose.tilt) };
  },

  // joystick packets come often, an ack without data keeps them small
  rate: (eng, msg) => {
    eng.setRate(num(msg, 'pan', -1e6, 1e6), num(msg, 'tilt', -1e6, 1e6));
    return undefined;
  },

  set: (eng, msg) => {
    const key = text(msg, 'key');
    if (!('value' in msg)) throw new CommandError('value is missing');
    return { key, value: eng.setSetting(key, msg.value) };
  },

  site: (eng, msg) => eng.setSite(num(msg, 'lat', -90, 90), num(msg, 'lon', -180, 180), num(msg, 'heading', 0, 360)),

  sun: (eng, msg) => {
    const speed = optNum(msg, 'speed', SPEED_MIN, SPEED_MAX) ?? 1;
    let start: number | null = null;
    if (msg.date !== undefined && msg.date !== null && msg.date !== '') {
      if (typeof msg.date !== 'string') throw new CommandError('date must be an iso date');
      start = parseWhen(msg.date, eng.wall());
      if (start === null) throw new CommandError('date must be an iso date like 2026-06-21 or 2026-06-21T06:00');
    }
    return { speed, t: r3(eng.setSun(speed, start)) };
  },

  scan: (eng, msg) => {
    const step = optNum(msg, 'step', STEP_MIN, STEP_MAX) ?? SCAN_STEP;
    const act = eng.startActivity(new Scan(eng, step));
    return { id: act.id, cells: act.cells };
  },

  exp: (eng, msg) => {
    const kind = oneOf(msg, 'kind', EXP_KINDS);
    const act = eng.startActivity(makeExperiment(kind, eng));
    return { id: act.id, kind };
  },

  stop: (eng) => ({ stopped: eng.stopActivity() }),

  calib: (eng, msg, id) => {
    const step = oneOf(msg, 'step', CALIB_STEPS);
    const values = msg.values;
    if (step === 'dark' || step === 'bright') {
      if (values !== undefined && values !== null) return setValues(eng, step, values);
      eng.answerLater(id, eng.startActivity(new Capture(eng, step)));
      return LATER;
    }
    if (step === 'polarity') {
      eng.answerLater(id, eng.startActivity(new Polarity(eng)));
      return LATER;
    }
    if (eng.activity) throw new CommandError(`a ${eng.activity.kind} is running, stop it first`, 'busy');
    if (step === 'zero') {
      const src = isFields(values) ? values : msg;
      return zero(eng, optNum(src, 'pan_us', 500, 2500), optNum(src, 'tilt_us', 500, 2500));
    }
    return step === 'save' ? save(eng) : reset(eng);
  },

  simlight: (eng, msg) => {
    const az = optNum(msg, 'az', -1e4, 1e4);
    const el = optNum(msg, 'el', -90, 90);
    return eng.setSimlight({
      az: az === null ? null : wrap180(az),
      el: el === null ? null : Math.min(Math.max(el, 0), 90),
      on: optBool(msg, 'on'),
      lux: optNum(msg, 'lux', 0, 200000),
      amb: optNum(msg, 'amb', 0, 100000)
    });
  },

  rec: (_eng, msg) => {
    bool(msg, 'on');
    throw new CommandError('recording needs a tracker with a data folder, the simulation has none', 'unsupported');
  },

  sys: (_eng, msg) => {
    const action = oneOf(msg, 'action', ['restart', 'reboot', 'shutdown']);
    throw new CommandError(`${action} is not available in the simulation`, 'unsupported');
  }
};

export function idOf(msg: Fields): string {
  const id = msg.id;
  if (typeof id === 'string') return id;
  return id === undefined || id === null ? '' : String(id);
}

// runs one cmd message and sends its ack, it never throws
export function runCommand(eng: SimTracker, msg: unknown, admin: boolean): void {
  const fields: Fields = isFields(msg) ? msg : {};
  const id = idOf(fields);
  const op = fields.op;
  try {
    if (typeof op !== 'string' || op === '') throw new CommandError('op is missing');
    if (!OPEN_OPS.includes(op) && !ADMIN_OPS.includes(op)) throw new CommandError(`unknown op ${op}`, 'unknown');
    if (ADMIN_OPS.includes(op) && !admin) throw new CommandError('admin only, unlock with the pin first', 'admin');
    const data = handlers[op](eng, fields, id);
    if (data === LATER) return;
    eng.ack(id, data);
  } catch (error) {
    const known = error instanceof CommandError;
    const code = known ? error.code : 'bad';
    const why = known ? error.message : 'internal error';
    if (!known) console.error(`brainsol: the simulation failed on ${String(op)}`, error);
    eng.refuse(id, code, typeof op === 'string' ? op : 'a command', why);
  }
  eng.afterCommand();
}

/*
  the simulated tracker. it plays the pi in the browser and speaks the protocol
  of section 8, so the page cannot tell it from the real one.

  the interface, SimEngine in $lib/link/transport.ts:

    start(emit)   a page connects. send hello first, then s frames at the
                  configured rate and one sys frame per second, all through
                  emit. a start after a stop is a new client: admin rights
                  are gone, the pose and the light are kept
    stop()        the page went away. stop every timer, keep the state
    handle(msg)   a message from the page, auth or cmd. every cmd is answered
                  with an ack carrying the same id, every auth with an auth.
                  it never throws, bad input gets ok:false with an err

  and the export createEngine(options) that returns one. SimTransport calls it
  once and keeps the engine for the whole visit.

  rights work like on the pi: anything but ping needs an auth first. there is
  no pin to check here, the simulation only runs in this browser, so any pin is
  taken. evt messages only go out to an admin.

  this one runs auto and hold, moves its light on simlight and takes every
  tunable with set. the other modes, scan, the experiments and calibration
  answer unsupported until the full engine replaces this file.
*/

import { DT, calibrationFor, controllerStep, gainAt, initialState, levels, offAngle, panelPower, paramValues, type Calibration, type ControllerState } from './controller';
import { defaultConfig } from './config';
import { wrap180, clamp } from './kinematics';
import { mulberry32, PHONE_LIGHT, sense, servoStep, type Light, type Reading } from './physics';
import { PARAM_KEYS, PROTO, type AckMessage, type ClientMessage, type CmdMessage, type Config, type EventLevel, type Mode, type ParamKey, type ServerMessage, type StateFrame, type SysFrame } from '$lib/link/protocol';
import type { SimEngine } from '$lib/link/transport';
import { version } from '$lib/version';

export interface EngineOptions {
  // the same seed gives the same sensor noise, for tests
  seed?: number;
  // wall clock in milliseconds, for the ts of every frame
  now?: () => number;
  // monotonic clock in milliseconds, drives the loop
  clock?: () => number;
  // false leaves the timers out, a test calls advance() itself
  timers?: boolean;
}

// a token lasts 12 hours, like on the pi
const TOKEN_LIFE = 12 * 3600;
// a tab that slept does not replay the time it missed
const MAX_CATCH_UP = 0.25;

const r1 = (n: number) => Math.round(n * 10) / 10 + 0;
const r2 = (n: number) => Math.round(n * 100) / 100 + 0;
const r3 = (n: number) => Math.round(n * 1000) / 1000 + 0;

export class PlaceholderEngine implements SimEngine {
  light: Light = { ...PHONE_LIGHT };
  cfg: Config = defaultConfig();
  calib: Calibration = calibrationFor(PHONE_LIGHT);
  mode: Mode = 'auto';
  // the servo angles, the controller state holds the commanded ones
  pose = { pan: 0, tilt: 90 };
  ctrl: ControllerState;
  reading: Reading;

  private emit: ((message: ServerMessage) => void) | null = null;
  private admin = false;
  private token: string | null = null;
  private random: () => number;
  private now: () => number;
  private clock: () => number;
  private timers: boolean;
  private interval: ReturnType<typeof setInterval> | null = null;
  private last = 0;
  private born: number;
  private stepAcc = 0;
  private frameAcc = 0;
  private sysAcc = 0;
  // loop rate and timer jitter over the last second, for sys
  private steps = 0;
  private gaps: number[] = [];
  private hz = 0;
  private jit = 0;

  constructor(options: EngineOptions = {}) {
    this.random = mulberry32(options.seed ?? (Math.random() * 2 ** 32) >>> 0);
    this.now = options.now ?? (() => Date.now());
    this.clock = options.clock ?? (() => performance.now());
    this.timers = options.timers ?? true;
    this.born = this.clock();
    this.reading = sense(this.pose.pan, this.pose.tilt, this.light, this.random, this.cfg.baffle);
    this.ctrl = initialState(this.pose.pan, this.pose.tilt, levels(this.reading.raw, this.calib));
  }

  start(emit: (message: ServerMessage) => void): void {
    this.stop();
    this.emit = emit;
    this.admin = false;
    this.send({
      t: 'hello',
      proto: PROTO,
      name: 'brainsol',
      version,
      driver: 'sim',
      caps: { lux: true, pv: false, simlight: true },
      admin: false,
      rate: this.cfg.params.rate.v,
      cfg: structuredClone(this.cfg)
    });
    this.sendFrame();
    this.sendSys();
    if (this.timers) {
      this.last = this.clock();
      this.interval = setInterval(() => this.tick(), DT * 1000);
    }
  }

  stop(): void {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
    this.emit = null;
  }

  handle(message: ClientMessage): void {
    try {
      if (message.t === 'auth') this.auth(message);
      else if (message.t === 'cmd') this.command(message);
    } catch (error) {
      console.error('brainsol: the simulation could not handle a message', error);
    }
  }

  // runs the 50 Hz loop for this many seconds and sends what falls due
  advance(seconds: number): void {
    this.stepAcc += seconds;
    while (this.stepAcc >= DT - 1e-9) {
      this.stepAcc -= DT;
      this.step();
      this.frameAcc += DT;
      this.sysAcc += DT;
      const period = 1 / this.cfg.params.rate.v;
      if (this.frameAcc >= period - 1e-9) {
        // the rest carries over, so 20 Hz stays 20 Hz on a 50 Hz loop
        this.frameAcc = Math.min(this.frameAcc - period, period);
        this.sendFrame();
      }
      if (this.sysAcc >= 1 - 1e-9) {
        this.sysAcc -= 1;
        this.sendSys();
      }
    }
  }

  private tick(): void {
    const now = this.clock();
    const gap = now - this.last;
    this.last = now;
    this.gaps.push(gap);
    if (this.gaps.length > 50) this.gaps.shift();
    this.advance(Math.min(gap / 1000, MAX_CATCH_UP));
  }

  private step(): void {
    this.steps++;
    this.reading = sense(this.pose.pan, this.pose.tilt, this.light, this.random, this.cfg.baffle);
    const next = controllerStep(this.ctrl, this.reading.raw, {
      params: paramValues(this.cfg.params),
      calib: this.calib,
      limits: this.cfg.limits
    });
    // hold keeps reading the sensors but the head stays where it is
    this.ctrl =
      this.mode === 'hold'
        ? { ...next, pan: this.ctrl.pan, tilt: this.ctrl.tilt, vp: 0, vt: 0, ax: false, ay: false, stuck: 0, aim: null }
        : next;
    this.pose.pan = servoStep(this.pose.pan, this.ctrl.pan, DT);
    this.pose.tilt = servoStep(this.pose.tilt, this.ctrl.tilt, DT);
  }

  frame(): StateFrame {
    const c = this.ctrl;
    const low = c.st === 'lowlight';
    const ref = this.cfg.params;
    const lux = this.reading.lux;
    return {
      t: 's',
      ts: Math.round(this.now()) / 1000,
      mode: this.mode,
      st: this.mode === 'hold' ? 'idle' : c.st,
      pan: r1(this.pose.pan),
      tilt: r1(this.pose.tilt),
      vp: r1(c.vp),
      vt: r1(c.vt),
      ldr: [r3(c.f[0]), r3(c.f[1]), r3(c.f[2]), r3(c.f[3])],
      raw: [...this.reading.raw],
      ex: r3(c.ex),
      ey: r3(c.ey),
      lvl: r3(c.lvl),
      lux: r1(lux),
      pmw: r2(panelPower(lux, this.cfg.panel)),
      pv: null,
      gain: low ? null : r3(gainAt(this.pose.pan, this.pose.tilt, ref.ref_pan.v, ref.ref_tilt.v)),
      off: low ? null : r1(offAngle(c.ex, c.ey, this.cfg.baffle)),
      tgt: c.aim ? { pan: r1(c.aim.pan), tilt: r1(c.aim.tilt) } : null,
      sun: null,
      sim: { az: r1(this.light.az), el: r1(this.light.el), on: this.light.on, lux: this.light.lux0, amb: this.light.amb }
    };
  }

  private sendFrame(): void {
    this.send(this.frame());
  }

  private sendSys(): void {
    const seconds = (this.clock() - this.born) / 1000;
    if (this.gaps.length > 1) {
      const mean = this.gaps.reduce((sum, gap) => sum + gap, 0) / this.gaps.length;
      this.jit = this.gaps.reduce((sum, gap) => sum + Math.abs(gap - mean), 0) / this.gaps.length;
    }
    this.hz = this.steps;
    this.steps = 0;
    const sys: SysFrame = {
      t: 'sys',
      viewers: 1,
      admins: this.admin ? 1 : 0,
      cpu: null,
      temp: null,
      mem: null,
      up: Math.round(seconds),
      hz: r1(this.hz),
      jit: r1(this.jit),
      drv: 'sim',
      link: 'ok',
      fw: null,
      rec: false,
      act: null
    };
    this.send(sys);
  }

  private send(message: ServerMessage): void {
    this.emit?.(message);
  }

  private event(lvl: EventLevel, msg: string): void {
    if (this.admin) this.send({ t: 'evt', ts: Math.round(this.now()) / 1000, lvl, msg });
  }

  private auth(message: { t: 'auth'; pin: string } | { t: 'auth'; token: string }): void {
    const exp = Math.round(this.now() / 1000) + TOKEN_LIFE;
    if ('pin' in message) {
      this.token ??= `sim${Math.floor(this.random() * 1e12).toString(36)}`;
      this.admin = true;
      this.send({ t: 'auth', ok: true, token: this.token, exp });
      this.event('info', 'admin unlocked in the simulation');
      return;
    }
    if (message.token && message.token === this.token) {
      this.admin = true;
      this.send({ t: 'auth', ok: true, token: this.token, exp });
      return;
    }
    this.send({ t: 'auth', ok: false, err: 'token', wait: 0 });
  }

  private ack(id: string, ok: true, data?: unknown): void;
  private ack(id: string, ok: false, err: string): void;
  private ack(id: string, ok: boolean, extra?: unknown): void {
    const message: AckMessage = ok ? { t: 'ack', id, ok: true, ...(extra === undefined ? {} : { data: extra }) } : { t: 'ack', id, ok: false, err: String(extra) };
    this.send(message);
  }

  private command(message: CmdMessage): void {
    const id = String(message.id ?? '');
    if (message.op === 'ping') return this.ack(id, true, { ts: Math.round(this.now()) / 1000 });
    if (!this.admin) return this.ack(id, false, 'admin');
    switch (message.op) {
      case 'mode': {
        if (message.mode !== 'auto' && message.mode !== 'hold') return this.ack(id, false, 'unsupported');
        this.mode = message.mode;
        this.ack(id, true);
        this.event('info', `mode ${message.mode}`);
        return;
      }
      case 'set': {
        const key = message.key as ParamKey;
        const value = Number(message.value);
        if (!PARAM_KEYS.includes(key) || !Number.isFinite(value)) return this.ack(id, false, 'bad');
        const param = this.cfg.params[key];
        param.v = clamp(value, param.min, param.max);
        this.ack(id, true);
        this.send({ t: 'cfg', cfg: structuredClone(this.cfg) });
        this.event('info', `${key} is now ${param.v}`);
        return;
      }
      case 'simlight': {
        const az = Number(message.az);
        const el = Number(message.el);
        if (!Number.isFinite(az) || !Number.isFinite(el)) return this.ack(id, false, 'bad');
        this.light.az = wrap180(az);
        this.light.el = clamp(el, 0, 90);
        if (typeof message.on === 'boolean') this.light.on = message.on;
        if (Number.isFinite(message.lux)) this.light.lux0 = clamp(Number(message.lux), 0, 200000);
        if (Number.isFinite(message.amb)) this.light.amb = clamp(Number(message.amb), 0, 100000);
        return this.ack(id, true);
      }
      case 'target':
      case 'rate':
      case 'site':
      case 'sun':
      case 'scan':
      case 'exp':
      case 'stop':
      case 'calib':
      case 'rec':
      case 'sys':
        return this.ack(id, false, 'unsupported');
      default:
        return this.ack(id, false, 'unknown');
    }
  }
}

export function createEngine(options: EngineOptions = {}): PlaceholderEngine {
  return new PlaceholderEngine(options);
}

/*
  the simulated tracker. it plays the pi in the browser and speaks the protocol
  of the brainsolpi service, so the page cannot tell it from the real one.

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

  rights work like on the pi: anything but ping needs an auth first, except
  simlight. the lamp only lights this tab, so every visitor may drag it. there
  is no pin to check here, the simulation only runs in this browser, so any pin
  is taken. evt messages only go out to an admin.

  inside it is built like engine.py on the pi:

    loop        a fixed 50 Hz step with an accumulator. a slow or hidden tab
                catches up at most MAX_CATCH_UP seconds, then runs on
    modes       auto, manual, sun, hold, park and demo (modes.ts) ask one
                motion limiter (motion.ts) for the tracking loop, a seek or
                axis speeds, so speed and acceleration caps hold everywhere
                and a change of mode never jumps in speed
    activities  the scan, the experiments and the calibration steps borrow
                the head and give it back to the mode (activities.ts)
    world       the lamp, the sun of sun mode, the idle wandering of the lamp
                until the first command that takes over (wander.ts), and the
                sensors read where the simulated servos really are
    commands    checked field by field like on the pi (commands.ts)

  the test options leave the timers out (timers: false) and drive the loop
  with advance(seconds), with a seed for the noise, their own clocks and
  wander: false for a lamp that stays where it is
*/

import type { Activity } from './activities';
import { defaultCalibration, type SimCalibration } from './calibration';
import { DT, gainFromErrors, initialState, levels, offAngle, panelPower, paramValues, senseLevels, trackStep, type ControllerState, type StepContext } from './controller';
import { runCommand } from './commands';
import { defaultConfig, setSite, setValue } from './config';
import { CommandError, isFields, type Fields } from './fields';
import { clamp } from './kinematics';
import { makeMode, Manual, newRequest, Sun, type ModeHost, type Request, type SimMode } from './modes';
import { seekAxes, stepAxes, still, stopNow } from './motion';
import { mulberry32, newReading, PHONE_LIGHT, senseInto, servoStep, type Light, type Reading } from './physics';
import { defaultPanMap, defaultTiltMap, sameMap, toAngle, toUs } from './servo';
import { SunClock } from './sun';
import { Wander } from './wander';
import { PROTO, type AckErr, type ClientMessage, type Config, type EventLevel, type HelloMessage, type Mode, type Pose, type Quad, type ScanMessage, type ServerMessage, type SimLight, type St, type StateFrame, type SunPosition, type SysFrame } from '$lib/link/protocol';
import type { SimEngine } from '$lib/link/transport';
import { version } from '$lib/version';

export { defaultCalibration, type SimCalibration } from './calibration';

export interface EngineOptions {
  // the same seed gives the same sensor noise, for tests
  seed?: number;
  // wall clock in milliseconds, for the ts of every frame
  now?: () => number;
  // monotonic clock in milliseconds, drives the loop
  clock?: () => number;
  // false leaves the timers out, a test calls advance() itself
  timers?: boolean;
  // false keeps the lamp still from the start instead of letting it wander
  wander?: boolean;
}

// a token lasts 12 hours, like on the pi
const TOKEN_LIFE = 12 * 3600;
// a tab that slept does not replay the time it missed, it runs on from where it was
export const MAX_CATCH_UP = 0.25;
// cfg pushes go out at most this often while a slider is dragged, like on the pi
const CFG_EVERY = 0.2;
// timer gaps the jitter is measured over
const GAPS = 50;
// the simulated servos turn like this, whatever the calibration believes
const TRUE_PAN = defaultPanMap();
const TRUE_TILT = defaultTiltMap();

const r1 = (n: number) => Math.round(n * 10) / 10 + 0;
const r2 = (n: number) => Math.round(n * 100) / 100 + 0;
const r3 = (n: number) => Math.round(n * 1000) / 1000 + 0;

export class SimTracker implements SimEngine, ModeHost {
  light: Light = { ...PHONE_LIGHT };
  cfg: Config = defaultConfig();
  calib: SimCalibration = defaultCalibration();
  // false once the calibration changed and save has not run since
  calibSaved = true;
  // the filtered levels, the errors, the commanded pose and the speeds in one
  // object the loop changes in place
  ctrl: ControllerState;
  // the newest sensor readings, at the pose the servos really have
  reading: Reading = newReading();
  servo = { pan: 0, tilt: 90 };
  current: SimMode = makeMode('auto');
  readonly sunClock = new SunClock();
  sun: SunPosition | null = null;
  // seconds of the loop since the engine was made
  t = 0;
  // what the mode logic says, the loop state in auto, and what the frame says
  cstate: St = 'idle';
  st: St = 'idle';
  lastSys: SysFrame | null = null;
  // a new page gets the newest sky map straight after hello, like on the pi
  lastScan: ScanMessage | null = null;
  // the scan, experiment or calibration step that has the head, null when the mode has it
  activity: Activity | null = null;
  // the lamp drifts on its own until the first command that moves it, the mode or the head
  wandering: boolean;

  private wander = new Wander();
  private ids = new Set<string>();

  private req: Request = newRequest();
  private ctx: StepContext;
  private tgtOn = false;
  private tgtPan = 0;
  private tgtTilt = 0;
  private emit: ((message: ServerMessage) => void) | null = null;
  private admin = false;
  private token: string | null = null;
  // counts the pages, an answer that comes late only goes to the page that asked
  private session = 0;
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
  // the wall clock of the current advance and the loop time it still has to run
  private wallNow = 0;
  private behind = 0;
  // loop rate and timer jitter, for sys
  private steps = 0;
  private sysAt: number;
  private gaps = new Float64Array(GAPS);
  private gapCount = 0;
  private gapHead = 0;
  private cfgDirty = false;
  private cfgAt = -Infinity;

  constructor(options: EngineOptions = {}) {
    this.random = mulberry32(options.seed ?? (Math.random() * 2 ** 32) >>> 0);
    this.now = options.now ?? (() => Date.now());
    this.clock = options.clock ?? (() => performance.now());
    this.timers = options.timers ?? true;
    this.wandering = options.wander ?? true;
    this.born = this.clock();
    this.sysAt = this.born;
    this.wallNow = this.now() / 1000;
    senseInto(this.reading, this.servo.pan, this.servo.tilt, this.light, this.random, this.cfg.baffle);
    this.ctrl = initialState(this.servo.pan, this.servo.tilt, levels(this.reading.raw, this.calib));
    this.ctx = { params: paramValues(this.cfg.params), calib: this.calib, limits: this.cfg.limits };
    this.current.enter(this);
  }

  get mode(): Mode {
    return this.current.name;
  }

  wall(): number {
    return this.now() / 1000;
  }

  start(emit: (message: ServerMessage) => void): void {
    this.stop();
    this.session++;
    this.emit = emit;
    this.admin = false;
    this.send(this.hello());
    if (this.lastSys) this.send(this.lastSys);
    if (this.lastScan) this.send(this.lastScan);
    this.wallNow = this.wall();
    this.behind = 0;
    this.send(this.frame());
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
      const msg: unknown = message;
      if (!isFields(msg)) this.refuse('', 'bad', 'a message', 'it is not an object');
      else if (msg.t === 'auth') this.auth(msg);
      else if (msg.t === 'cmd') runCommand(this, msg, this.admin);
      else this.refuse(typeof msg.id === 'string' ? msg.id : '', 'unknown', 'a message', `unknown type ${String(msg.t)}`);
    } catch (error) {
      console.error('brainsol: the simulation could not handle a message', error);
    }
  }

  // runs the 50 Hz loop for this many seconds and sends what falls due
  advance(seconds: number): void {
    if (!(seconds > 0)) return;
    this.wallNow = this.wall();
    this.stepAcc += seconds;
    while (this.stepAcc >= DT - 1e-9) {
      this.stepAcc -= DT;
      // a burst of frames after a slow tick gets times spread over the burst
      this.behind = Math.max(0, this.stepAcc);
      this.step();
      this.outputs();
    }
    this.behind = 0;
  }

  private tick(): void {
    try {
      const now = this.clock();
      const gap = now - this.last;
      this.last = now;
      this.gaps[this.gapHead] = gap;
      this.gapHead = (this.gapHead + 1) % GAPS;
      if (this.gapCount < GAPS) this.gapCount++;
      this.advance(Math.min(Math.max(gap, 0) / 1000, MAX_CATCH_UP));
    } catch (error) {
      console.error('brainsol: a tick of the simulation failed', error);
    }
  }

  private step(): void {
    this.t += DT;
    this.steps++;
    this.sunClock.advance(DT);
    if (this.wandering) this.wander.step(DT, this.light);
    this.current.world(this);
    const p = this.cfg.params;
    senseInto(this.reading, this.servo.pan, this.servo.tilt, this.light, this.random, this.cfg.baffle);
    senseLevels(this.ctrl, this.reading.raw, this.calib, p.tau.v, DT);
    let req = this.req;
    const act = this.activity;
    if (act) {
      req = act.step();
      if (act.done && this.activity === act) this.activity = null;
    } else this.current.step(this, req);
    this.apply(req);
    this.st = this.activity ? this.activity.st : this.cstate;
    this.guard();
    // the servos turn towards the pulses of this command, at most 400 degrees per second
    this.servo.pan = servoStep(this.servo.pan, toAngle(TRUE_PAN, toUs(this.calib.pan, this.ctrl.pan)), DT);
    this.servo.tilt = servoStep(this.servo.tilt, toAngle(TRUE_TILT, toUs(this.calib.tilt, this.ctrl.tilt)), DT);
  }

  // one request through the limiter, the same as _apply on the pi
  private apply(req: Request): void {
    const p = this.cfg.params;
    const limits = this.cfg.limits;
    const c = this.ctrl;
    if (req.kind === 'auto') {
      trackStep(c, this.ctx);
      this.cstate = c.st;
      this.tgtOn = c.aim !== null;
      if (c.aim) {
        this.tgtPan = c.aim.pan;
        this.tgtTilt = c.aim.tilt;
      }
      return;
    }
    // any other request ends a running aim move, the next auto start looks afresh
    c.stuck = 0;
    c.aim = null;
    if (req.kind === 'seek') {
      const pan = clamp(req.a, limits.pan[0], limits.pan[1]);
      const tilt = clamp(req.b, limits.tilt[0], limits.tilt[1]);
      const vmax = req.vmax === null ? p.vmax.v : Math.min(req.vmax, p.vmax.v);
      const there = seekAxes(c, pan, tilt, vmax, p.amax.v, limits, DT);
      this.tgtOn = true;
      this.tgtPan = pan;
      this.tgtTilt = tilt;
      this.cstate = there ? 'idle' : 'moving';
      return;
    }
    const pushing = stepAxes(c, req.a, req.b, p.amax.v, limits, DT);
    this.tgtOn = false;
    if (pushing) this.cstate = 'limit';
    else if (still(c) && req.a === 0 && req.b === 0) this.cstate = 'idle';
    else this.cstate = 'moving';
  }

  // nothing the page sends can make a number go bad, this is the last line
  // in case something does: the head stops where the servos are
  private guard(): void {
    const c = this.ctrl;
    if (Number.isFinite(c.pan + c.tilt + c.vp + c.vt + c.lvl + c.ex + c.ey)) return;
    this.ctrl = initialState(this.servo.pan, this.servo.tilt, levels(this.reading.raw, this.calib));
    this.cstate = this.st = 'fault';
    this.event('error', 'the simulation lost its numbers and started the loop again where the head is');
  }

  private outputs(): void {
    this.frameAcc += DT;
    this.sysAcc += DT;
    const period = 1 / this.cfg.params.rate.v;
    if (this.frameAcc >= period - 1e-9) {
      // the rest carries over, so 20 Hz stays 20 Hz on a 50 Hz loop
      this.frameAcc = Math.min(this.frameAcc - period, period);
      this.send(this.frame());
    }
    if (this.sysAcc >= 1 - 1e-9) {
      this.sysAcc -= 1;
      this.sendSys();
    }
    if (this.cfgDirty && this.t - this.cfgAt >= CFG_EVERY - 1e-9) this.pushCfg();
  }

  hello(): HelloMessage {
    return {
      t: 'hello',
      proto: PROTO,
      name: 'brainsol',
      version,
      driver: 'sim',
      caps: { lux: true, pv: false, simlight: true },
      admin: false,
      rate: this.cfg.params.rate.v,
      cfg: structuredClone(this.cfg)
    };
  }

  frame(): StateFrame {
    const c = this.ctrl;
    const p = this.cfg.params;
    const k = this.cfg.baffle;
    const low = c.lvl < p.min_light.v;
    const lux = this.reading.lux;
    let gain: number | null = null;
    if (!low) {
      // while the loop faces the light it is taken to be along the normal, else
      // the sensor balance says where it is, the same as on the pi
      const closed = this.cstate === 'tracking' || this.cstate === 'locked' || this.cstate === 'limit';
      gain = closed ? gainFromErrors(c.pan, c.tilt, 0, 0, p.ref_pan.v, p.ref_tilt.v, k) : gainFromErrors(c.pan, c.tilt, c.ex, c.ey, p.ref_pan.v, p.ref_tilt.v, k);
    }
    const raw = this.reading.raw;
    return {
      t: 's',
      ts: Math.round((this.wallNow - this.behind) * 1000) / 1000,
      mode: this.current.name,
      st: this.st,
      pan: r1(c.pan),
      tilt: r1(c.tilt),
      vp: r1(c.vp),
      vt: r1(c.vt),
      ldr: [r3(c.f[0]), r3(c.f[1]), r3(c.f[2]), r3(c.f[3])],
      raw: [raw[0], raw[1], raw[2], raw[3]],
      ex: r3(c.ex),
      ey: r3(c.ey),
      lvl: r3(c.lvl),
      lux: r1(lux),
      pmw: r2(panelPower(lux, this.cfg.panel)),
      pv: null,
      gain: gain === null ? null : r3(gain),
      off: low ? null : r1(offAngle(c.ex, c.ey, k)),
      tgt: this.tgtOn ? { pan: r1(this.tgtPan), tilt: r1(this.tgtTilt) } : null,
      sun: this.sun ? { az: r1(this.sun.az), el: r1(this.sun.el), caz: r1(this.sun.caz), t: r3(this.sun.t) } : null,
      sim: this.simLight()
    };
  }

  private simLight(): SimLight {
    const l = this.light;
    return { az: r1(l.az), el: r1(l.el), on: l.on, lux: r1(l.lux0), amb: r1(l.amb) };
  }

  private sendSys(): void {
    const now = this.clock();
    const real = (now - this.sysAt) / 1000;
    // the real rate: steps per second of the clock, a slow or sleeping tab shows
    // here. without a clock that moves, the second of loop time it took
    const hz = real > 0.05 ? this.steps / real : this.steps;
    this.steps = 0;
    this.sysAt = now;
    const sys: SysFrame = {
      t: 'sys',
      viewers: 1,
      admins: this.admin ? 1 : 0,
      // a browser cannot see the load, the temperature or the memory of the machine
      cpu: null,
      temp: null,
      mem: null,
      up: Math.floor((now - this.born) / 1000),
      hz: r1(hz),
      jit: r2(this.jitter()),
      drv: 'sim',
      link: 'ok',
      fw: null,
      rec: false,
      act: this.activity?.kind ?? null,
      // no serial line in the browser, nothing can get lost
      drop: 0
    };
    this.lastSys = sys;
    this.send(sys);
  }

  // the spread of the timer gaps in milliseconds, the population standard deviation like on the pi
  private jitter(): number {
    const n = this.gapCount;
    if (n < 2) return 0;
    let sum = 0;
    for (let i = 0; i < n; i++) sum += this.gaps[i];
    const mean = sum / n;
    let sq = 0;
    for (let i = 0; i < n; i++) sq += (this.gaps[i] - mean) ** 2;
    return Math.sqrt(sq / n);
  }

  private send(message: ServerMessage): void {
    this.emit?.(message);
  }

  event(lvl: EventLevel, msg: string): void {
    if (this.admin) this.send({ t: 'evt', ts: r3(this.wall()), lvl, msg });
  }

  private auth(message: Fields): void {
    const exp = Math.round(this.wall()) + TOKEN_LIFE;
    const pin = message.pin;
    if (typeof pin === 'string' || typeof pin === 'number') {
      this.token ??= `sim${Math.floor(this.random() * 1e12).toString(36)}`;
      const was = this.admin;
      this.admin = true;
      this.send({ t: 'auth', ok: true, token: this.token, exp });
      if (!was) this.event('info', 'admin unlocked in the simulation');
      return;
    }
    if (typeof message.token === 'string' && message.token === this.token) {
      this.admin = true;
      this.send({ t: 'auth', ok: true, token: this.token, exp });
      return;
    }
    const token = 'token' in message;
    const msg = token ? 'the token is unknown or expired, log in with the pin' : 'the pin is missing';
    this.send({ t: 'auth', ok: false, err: token ? 'token' : 'pin', msg, wait: 0 });
  }

  // the answers, for commands.ts

  ack(id: string, data?: unknown): void {
    this.send(data === undefined ? { t: 'ack', id, ok: true } : { t: 'ack', id, ok: true, data });
  }

  // an ack with ok false and the reason in msg, like on the pi. an admin also sees it in the event log
  refuse(id: string, code: AckErr, what: string, why: string): void {
    this.send({ t: 'ack', id, ok: false, err: code, msg: why });
    if (code !== 'admin') this.event('warn', `${what} refused, ${why}`);
  }

  // the ack of a command that started an activity, sent when it ends, the way
  // the pi answers a calibration step once the capture is done
  answerLater(id: string, act: Activity): void {
    const session = this.session;
    act.onDone((done) => {
      if (session !== this.session) return;
      if (done.ok) this.ack(id, done.result);
      else this.send({ t: 'ack', id, ok: false, err: 'bad', msg: done.error ?? 'the step failed' });
    });
  }

  // a cfg push right after the ack that changed it, unless one went out a moment ago
  afterCommand(): void {
    if (this.cfgDirty && this.t - this.cfgAt >= CFG_EVERY - 1e-9) this.pushCfg();
  }

  private pushCfg(): void {
    this.cfgDirty = false;
    this.cfgAt = this.t;
    this.send({ t: 'cfg', cfg: structuredClone(this.cfg) });
  }

  // someone took over: the lamp stays where it is now, for the rest of the visit
  private calm(): void {
    if (!this.wandering) return;
    this.wandering = false;
    this.event('info', 'the lamp stops wandering and stays where it is');
  }

  // the commands, the same steps as the methods of engine.py

  setMode(name: Mode): void {
    this.calm();
    this.endActivity('stopped by a mode change');
    if (name !== this.current.name || name === 'manual') this.switchMode(name);
  }

  private switchMode(name: Mode): void {
    this.current.leave(this);
    this.current = makeMode(name);
    this.current.enter(this);
    this.event('info', `mode changed to ${name}`);
  }

  private manual(): Manual {
    this.calm();
    this.endActivity('stopped by manual control');
    if (!(this.current instanceof Manual)) this.switchMode('manual');
    return this.current as Manual;
  }

  setTarget(pan: number, tilt: number): Pose {
    const { pan: lp, tilt: lt } = this.cfg.limits;
    const pose = { pan: clamp(pan, lp[0], lp[1]), tilt: clamp(tilt, lt[0], lt[1]) };
    this.manual().setTarget(pose.pan, pose.tilt);
    return pose;
  }

  setRate(pan: number, tilt: number): void {
    this.manual().setRate(clamp(pan, -1, 1), clamp(tilt, -1, 1), this.t);
  }

  setSetting(key: string, value: unknown): number {
    const v = setValue(this.cfg, key, value);
    this.ctx.params = paramValues(this.cfg.params);
    this.cfgDirty = true;
    return v;
  }

  setSite(lat: number, lon: number, heading: number): Config['site'] {
    const site = setSite(this.cfg, lat, lon, heading);
    this.cfgDirty = true;
    this.event('info', `site set to latitude ${site.lat}, longitude ${site.lon}, the front facing ${site.heading} degrees`);
    if (this.current instanceof Sun) this.current.refresh(this);
    return site;
  }

  // returns the sun time it runs from now, unix seconds
  setSun(speed: number, start: number | null): number {
    this.calm();
    this.sunClock.set(speed, start, this.wall());
    const now = this.sunClock.now(this.wall());
    const from = new Date(now * 1000).toISOString().slice(0, 16).replace('T', ' ');
    const pace = speed === 1 ? 'in real time' : `${speed} times faster`;
    this.event('info', this.sunClock.live ? 'sun clock follows the real time' : `sun clock runs ${pace} from ${from} utc`);
    if (this.current instanceof Sun) this.current.refresh(this);
    else this.setMode('sun');
    return this.sunClock.now(this.wall());
  }

  setSimlight(change: { az: number | null; el: number | null; on: boolean | null; lux: number | null; amb: number | null }): SimLight {
    if (this.current instanceof Sun) throw new CommandError('the sun moves the light in sun mode, pick another mode first', 'busy');
    this.calm();
    const l = this.light;
    if (change.az !== null) l.az = change.az;
    if (change.el !== null) l.el = change.el;
    if (change.on !== null) l.on = change.on;
    if (change.lux !== null) l.lux0 = change.lux;
    if (change.amb !== null) l.amb = change.amb;
    return this.simLight();
  }

  startActivity<T extends Activity>(act: T): T {
    if (this.activity) throw new CommandError(`a ${this.activity.kind} is running, stop it first`, 'busy');
    this.calm();
    act.start();
    this.activity = act;
    return act;
  }

  stopActivity(): boolean {
    if (!this.activity) return false;
    this.endActivity('stopped');
    return true;
  }

  private endActivity(why: string): void {
    const act = this.activity;
    if (!act) return;
    this.activity = null;
    act.cancel(why);
  }

  // for the activities

  get lux(): number | null {
    return this.reading.lux;
  }

  get raw(): Quad {
    return this.reading.raw;
  }

  newId(kind: string): string {
    const d = new Date(this.now());
    const two = (n: number) => String(n).padStart(2, '0');
    const base = `${kind}-${d.getFullYear()}${two(d.getMonth() + 1)}${two(d.getDate())}-${two(d.getHours())}${two(d.getMinutes())}${two(d.getSeconds())}`;
    let id = base;
    for (let n = 2; this.ids.has(id); n++) id = `${base}-${n}`;
    this.ids.add(id);
    return id;
  }

  publish(message: ServerMessage): void {
    if (message.t === 'scan') this.lastScan = message;
    this.send(message);
  }

  // a new servo mapping must not move the head, so the pose follows the pulses
  setCalibration(calib: SimCalibration): void {
    const old = this.calib;
    this.calib = calib;
    this.ctx.calib = calib;
    if (sameMap(old.pan, calib.pan) && sameMap(old.tilt, calib.tilt)) return;
    const { pan: lp, tilt: lt } = this.cfg.limits;
    const c = this.ctrl;
    c.pan = clamp(toAngle(calib.pan, toUs(old.pan, c.pan)), lp[0], lp[1]);
    c.tilt = clamp(toAngle(calib.tilt, toUs(old.tilt, c.tilt)), lt[0], lt[1]);
    stopNow(c);
  }
}

export function createEngine(options: EngineOptions = {}): SimTracker {
  return new SimTracker(options);
}

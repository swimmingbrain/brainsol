// the modes of section 7, the same as modes.py on the pi. each tick a mode
// says what it wants from the motion limiter: the tracking loop, a seek to a
// pose, or axis speeds. all of them go through the same speed and acceleration
// limits, so a change of mode never jumps in speed

import { poseNear } from './kinematics';
import type { Light } from './physics';
import { relativeAz, sunLight, sunPosition, type SunClock } from './sun';
import type { Config, Mode } from '$lib/link/protocol';

export type RequestKind = 'auto' | 'seek' | 'vel';

// one request is reused tick after tick. a and b are the target pose of a seek
// or the axis speeds of vel in degrees per second, vmax a lower speed cap for a seek
export interface Request {
  kind: RequestKind;
  a: number;
  b: number;
  vmax: number | null;
}

export function newRequest(): Request {
  return { kind: 'vel', a: 0, b: 0, vmax: null };
}

export function askAuto(r: Request): void {
  r.kind = 'auto';
}

export function askSeek(r: Request, pan: number, tilt: number, vmax: number | null = null): void {
  r.kind = 'seek';
  r.a = pan;
  r.b = tilt;
  r.vmax = vmax;
}

export function askSpeeds(r: Request, vx: number, vy: number): void {
  r.kind = 'vel';
  r.a = vx;
  r.b = vy;
}

// speeds of zero, the head comes to rest with the normal deceleration
export function askStop(r: Request): void {
  askSpeeds(r, 0, 0);
}

// joystick rates fade to zero when the page stops refreshing them
export const RATE_TTL = 0.4;

// what a mode may read and change on the engine
export interface ModeHost {
  // seconds of the loop since the engine started
  readonly t: number;
  readonly cfg: Config;
  // the commanded head pose
  readonly ctrl: { pan: number; tilt: number };
  readonly sunClock: SunClock;
  light: Light;
  // where the sun stands seen from the device while sun mode runs
  sun: { az: number; el: number } | null;
  // unix seconds
  wall(): number;
}

export abstract class SimMode {
  abstract readonly name: Mode;
  enter(_host: ModeHost): void {}
  leave(_host: ModeHost): void {}
  // every tick, also while an activity has the head, for what the mode does to the world
  world(_host: ModeHost): void {}
  abstract step(host: ModeHost, r: Request): void;
}

class Auto extends SimMode {
  readonly name = 'auto';
  step(_host: ModeHost, r: Request): void {
    askAuto(r);
  }
}

class Hold extends SimMode {
  readonly name = 'hold';
  step(_host: ModeHost, r: Request): void {
    askStop(r);
  }
}

class Park extends SimMode {
  readonly name = 'park';
  step(host: ModeHost, r: Request): void {
    askSeek(r, host.cfg.park.pan, host.cfg.park.tilt);
  }
}

export class Manual extends SimMode {
  readonly name = 'manual';
  target: { pan: number; tilt: number } | null = null;
  ratePan = 0;
  rateTilt = 0;
  rateAt = -Infinity;

  setTarget(pan: number, tilt: number): void {
    this.target = { pan, tilt };
    this.ratePan = 0;
    this.rateTilt = 0;
  }

  // -1 to 1 per axis, a share of vmax
  setRate(pan: number, tilt: number, now: number): void {
    this.target = null;
    this.ratePan = pan;
    this.rateTilt = tilt;
    this.rateAt = now;
  }

  step(host: ModeHost, r: Request): void {
    if (this.target) {
      askSeek(r, this.target.pan, this.target.tilt);
      return;
    }
    if (host.t - this.rateAt > RATE_TTL) {
      this.ratePan = 0;
      this.rateTilt = 0;
    }
    const vmax = host.cfg.params.vmax.v;
    askSpeeds(r, this.ratePan * vmax, this.rateTilt * vmax);
  }
}

export class Sun extends SimMode {
  readonly name = 'sun';
  az = 0;
  el = -90;
  // the light of the scene before the sun took it over
  private saved: Light | null = null;
  // when the position was worked out last, in loop seconds and in sun seconds
  private lastT = -Infinity;
  private lastSun = -Infinity;
  // reused every tick, sun mode allocates nothing in a fast time lapse
  private position = { caz: 0, el: 0 };
  private glow = { lux: 0, amb: 0 };
  private pose = { pan: 0, tilt: 0 };

  enter(host: ModeHost): void {
    this.saved = { ...host.light };
    this.lastT = -Infinity;
    this.update(host);
  }

  leave(host: ModeHost): void {
    // the sim light goes back to where it was before the sun took it over
    if (this.saved) Object.assign(host.light, this.saved);
    this.saved = null;
    host.sun = null;
  }

  // the sun keeps moving while an activity has the head
  world(host: ModeHost): void {
    const now = host.sunClock.now(host.wall());
    // the real sun crawls, a fast time lapse gets a new position every tick
    if (Math.abs(now - this.lastSun) >= 6 || host.t - this.lastT >= 1) this.update(host);
  }

  // a new speed or a start date shows on the next frame
  refresh(host: ModeHost): void {
    this.update(host);
  }

  private update(host: ModeHost): void {
    const now = host.sunClock.now(host.wall());
    this.lastT = host.t;
    this.lastSun = now;
    const site = host.cfg.site;
    const { caz, el } = sunPosition(site.lat, site.lon, now, this.position);
    this.az = relativeAz(caz, site.heading);
    this.el = el;
    if (host.sun) {
      host.sun.az = this.az;
      host.sun.el = el;
    } else host.sun = { az: this.az, el };
    const { lux, amb } = sunLight(el, this.glow);
    const light = host.light;
    light.az = this.az;
    light.el = Math.min(Math.max(el, 0), 90);
    light.on = el > 0;
    light.lux0 = lux;
    light.amb = amb;
  }

  step(host: ModeHost, r: Request): void {
    if (this.el > 0) {
      const pose = poseNear(this.az, this.el, host.ctrl, host.cfg.limits, 3, this.pose);
      askSeek(r, pose.pan, pose.tilt);
      return;
    }
    // below the horizon the head rests in the park pose
    askSeek(r, host.cfg.park.pan, host.cfg.park.tilt);
  }
}

class Demo extends SimMode {
  readonly name = 'demo';
  // slow enough to read as calm, an exhibit and not a test
  static readonly VMAX = 25;
  private t0 = 0;

  enter(host: ModeHost): void {
    this.t0 = host.t;
  }

  step(host: ModeHost, r: Request): void {
    // two slow sines with periods that never line up, so the path keeps
    // changing. tilt swings past 90, the head goes over the top and back
    const t = host.t - this.t0;
    const pan = 55 * Math.sin((2 * Math.PI * t) / 37);
    const tilt = 90 + 50 * Math.sin((2 * Math.PI * t) / 23 + 0.6);
    askSeek(r, pan, tilt, Demo.VMAX);
  }
}

const MAKERS: Record<Mode, () => SimMode> = {
  auto: () => new Auto(),
  manual: () => new Manual(),
  sun: () => new Sun(),
  hold: () => new Hold(),
  park: () => new Park(),
  demo: () => new Demo()
};

export function makeMode(name: Mode): SimMode {
  return MAKERS[name]();
}

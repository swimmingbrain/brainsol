// the commands the admin tools send, built in one place so every control speaks
// protocol.ts exactly. numbers are clamped into the limits from the config and
// rounded the way the wire carries them, angles with one decimal

import type {
  CalibStep,
  Command,
  Config,
  ExpKind,
  Mode,
  ParamKey,
  Pose,
  SimLight,
  SunSpeed,
  SysAction
} from '$lib/link/protocol';

export type Limits = Config['limits'];

export function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

// + 0 turns -0 into 0, the wire never needs a negative zero
export const round1 = (value: number): number => Math.round(value * 10) / 10 + 0;
export const round2 = (value: number): number => Math.round(value * 100) / 100 + 0;

export function wrap180(deg: number): number {
  const wrapped = ((((deg + 180) % 360) + 360) % 360) - 180;
  return wrapped === -180 && deg > 0 ? 180 : wrapped;
}

// the mechanical range of the two axes when no config has come in yet
export const FALLBACK_LIMITS: Limits = { pan: [-90, 90], tilt: [0, 180] };

export function modeCommand(mode: Mode): Command {
  return { op: 'mode', mode };
}

export function clampPose(pose: Pose, limits: Limits | null | undefined): Pose {
  const { pan, tilt } = limits ?? FALLBACK_LIMITS;
  return { pan: round1(clamp(pose.pan, pan[0], pan[1])), tilt: round1(clamp(pose.tilt, tilt[0], tilt[1])) };
}

export function targetCommand(pose: Pose, limits: Limits | null | undefined): Command {
  return { op: 'target', ...clampPose(pose, limits) };
}

// joystick rates, -1 to 1 per axis
export function rateCommand(pan: number, tilt: number): Command {
  const safe = (n: number) => (Number.isFinite(n) ? round2(clamp(n, -1, 1)) : 0);
  return { op: 'rate', pan: safe(pan), tilt: safe(tilt) };
}

export type PoseName = 'flat' | 'front' | 'left' | 'right' | 'back';
export const POSE_NAMES: PoseName[] = ['flat', 'front', 'left', 'right', 'back'];

// a few poses worth showing in a talk. back goes over the top: tilt past 90
// turns the panel to face backwards without any pan
const POSES: Record<PoseName, Pose> = {
  flat: { pan: 0, tilt: 90 },
  front: { pan: 0, tilt: 15 },
  left: { pan: -60, tilt: 45 },
  right: { pan: 60, tilt: 45 },
  back: { pan: 0, tilt: 150 }
};

export function quickPose(name: PoseName, limits: Limits | null | undefined): Pose {
  return clampPose(POSES[name], limits);
}

// the two light scenes. the sun scene keeps the direction of the light
export type SceneName = 'phone' | 'sun';
export const SCENES: Record<SceneName, Partial<SimLight>> = {
  phone: { az: 25, el: 40, lux: 900, amb: 60, on: true },
  sun: { lux: 80000, amb: 9000, on: true }
};

// the most a simulated light can do, the same caps the trackers use
export const LIGHT_MAX = 200000;
export const AMBIENT_MAX = 100000;

export function simlightCommand(light: SimLight, change: Partial<SimLight> = {}): Command {
  const next = { ...light, ...change };
  return {
    op: 'simlight',
    az: round1(wrap180(next.az)),
    el: round1(clamp(next.el, 0, 90)),
    on: next.on,
    lux: Math.round(clamp(next.lux, 0, LIGHT_MAX)),
    amb: Math.round(clamp(next.amb, 0, AMBIENT_MAX))
  };
}

export function sceneCommand(name: SceneName, light: SimLight): Command {
  return simlightCommand(light, SCENES[name]);
}

export function setCommand(key: ParamKey, value: number): Command {
  return { op: 'set', key, value };
}

export interface Site {
  lat: number;
  lon: number;
  heading: number;
}

// null when a value is not a number or out of range, the field says why
export function siteCommand(site: Site): Command | null {
  const { lat, lon, heading } = site;
  if (![lat, lon, heading].every(Number.isFinite)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  // a bearing of 360 is north again
  const bearing = round1(((heading % 360) + 360) % 360);
  return { op: 'site', lat: round2(lat), lon: round2(lon), heading: bearing };
}

export const SUN_SPEEDS: SunSpeed[] = [1, 60, 600, 3600];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(text: string): boolean {
  if (!ISO_DATE.test(text)) return false;
  const date = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(text);
}

// an empty or broken date leaves the date out, the time lapse then starts now
export function sunCommand(speed: SunSpeed, date?: string | null): Command {
  const text = (date ?? '').trim();
  return isIsoDate(text) ? { op: 'sun', speed, date: text } : { op: 'sun', speed };
}

export const SCAN_STEPS = [10, 15, 20, 30];
export const SCAN_STEP_DEFAULT = 15;

export function scanCommand(step: number = SCAN_STEP_DEFAULT): Command {
  return { op: 'scan', step };
}

export function expCommand(kind: ExpKind): Command {
  return { op: 'exp', kind };
}

export const STOP: Command = { op: 'stop' };

export function calibCommand(step: CalibStep): Command {
  return { op: 'calib', step };
}

export function recCommand(on: boolean): Command {
  return { op: 'rec', on };
}

export function sysCommand(action: SysAction): Command {
  return { op: 'sys', action };
}

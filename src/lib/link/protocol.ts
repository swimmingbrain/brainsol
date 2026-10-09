// the messages between the tracker and the page. the pi and the simulation in
// sim/ both speak exactly this, the field names are the wire names.
// times are unix seconds with milliseconds as decimals, angles are degrees with
// one decimal, levels carry three. a number that is missing is null, never NaN

export const PROTO = 1;

// the http port of the tracker, an address without a port on a plain http page gets it
export const DEFAULT_PORT = 8080;

export type Quad = [number, number, number, number];

export type Mode = 'auto' | 'manual' | 'sun' | 'hold' | 'park' | 'demo';
export const MODES: Mode[] = ['auto', 'manual', 'sun', 'hold', 'park', 'demo'];

export type St =
  | 'tracking'
  | 'locked'
  | 'lowlight'
  | 'limit'
  | 'moving'
  | 'idle'
  | 'scanning'
  | 'measuring'
  | 'calibrating'
  | 'fault';
export const STATES: St[] = [
  'tracking',
  'locked',
  'lowlight',
  'limit',
  'moving',
  'idle',
  'scanning',
  'measuring',
  'calibrating',
  'fault'
];

export type Driver = 'sim' | 'bridge';

export type ParamKey =
  | 'kp'
  | 'vmax'
  | 'amax'
  | 'dead_in'
  | 'dead_out'
  | 'tau'
  | 'min_light'
  | 'zenith_band'
  | 'ref_pan'
  | 'ref_tilt'
  | 'rate';
export const PARAM_KEYS: ParamKey[] = [
  'kp',
  'vmax',
  'amax',
  'dead_in',
  'dead_out',
  'tau',
  'min_light',
  'zenith_band',
  'ref_pan',
  'ref_tilt',
  'rate'
];

// one tunable with its range and the step a control should snap to
export interface Param {
  v: number;
  min: number;
  max: number;
  step: number;
}

export interface Pose {
  pan: number;
  tilt: number;
}

export interface Config {
  limits: { pan: [number, number]; tilt: [number, number] };
  park: Pose;
  // heading is the compass bearing the front of the device faces
  site: { lat: number; lon: number; heading: number };
  // panel size in millimetres, eff is the cell efficiency 0 to 1
  panel: { w: number; h: number; eff: number };
  // shade wall height over sensor width, k in the sensor model
  baffle: number;
  params: Record<ParamKey, Param>;
}

export interface Caps {
  lux: boolean;
  pv: boolean;
  simlight: boolean;
}

// the light of the simulation, lux is the direct light, amb the ambient light
export interface SimLight {
  az: number;
  el: number;
  on: boolean;
  lux: number;
  amb: number;
}

// server to page

export interface HelloMessage {
  t: 'hello';
  proto: number;
  name: 'brainsol';
  version: string;
  driver: Driver;
  caps: Caps;
  admin: boolean;
  rate: number;
  cfg: Config;
}

export interface StateFrame {
  t: 's';
  ts: number;
  mode: Mode;
  st: St;
  pan: number;
  tilt: number;
  // axis speeds in degrees per second
  vp: number;
  vt: number;
  // filtered levels 0 to 1 and the raw sums 0 to 8184, both in the order L R U D
  ldr: Quad;
  raw: Quad;
  ex: number;
  ey: number;
  lvl: number;
  lux: number | null;
  pmw: number | null;
  // measured panel voltage in volts and current in milliamps, only with an INA219
  pv: { v: number; ma: number } | null;
  gain: number | null;
  off: number | null;
  tgt: Pose | null;
  sun: { az: number; el: number } | null;
  sim: SimLight | null;
}

export type Activity = 'scan' | 'exp' | 'calib';

// once per second
export interface SysFrame {
  t: 'sys';
  viewers: number;
  admins: number;
  // cpu load in percent, temperature in degrees celsius, memory in percent, null when unknown
  cpu: number | null;
  temp: number | null;
  mem: number | null;
  // uptime in seconds
  up: number;
  // control loop rate in hertz and its jitter in milliseconds
  hz: number;
  jit: number;
  drv: Driver;
  link: 'ok' | 'down';
  fw: string | null;
  rec: boolean;
  act: Activity | null;
}

export interface AckOk {
  t: 'ack';
  id: string;
  ok: true;
  data?: unknown;
}

export interface AckError {
  t: 'ack';
  id: string;
  ok: false;
  err: string;
}

export type AckMessage = AckOk | AckError;

// the err strings in use. the page also makes up timeout and offline itself
export type AckErr = 'admin' | 'bad' | 'busy' | 'unknown' | 'unsupported' | 'timeout' | 'offline';

// exp is the unix time the token runs out, wait the seconds until the pin may be tried again
export type AuthMessage =
  | { t: 'auth'; ok: true; token: string; exp: number }
  | { t: 'auth'; ok: false; err: string; wait: number };

// pushed to everyone when a setting changes
export interface CfgMessage {
  t: 'cfg';
  cfg: Config;
}

// the sky map. v[i][j] is the light at tilt[i] and pan[j], null until visited
export interface ScanMessage {
  t: 'scan';
  id: string;
  pan: number[];
  tilt: number[];
  v: (number | null)[][];
  done: boolean;
  best: { pan: number; tilt: number; v: number } | null;
}

export type ExpKind = 'cosine' | 'compare' | 'step';

// lux = amb + peak * max(0, cos(delta)), points are [delta in degrees, lux]
export interface CosineResult {
  peak: number;
  amb: number;
  r2: number;
  points: [number, number][];
}

// fixed and tracked lux of each round, gain is the mean ratio and spread its range
export interface CompareResult {
  gain: number;
  spread: number;
  rounds: { fixed: number; tracked: number }[];
}

// settle in seconds, null when it did not lock within 8 s, overshoot in degrees.
// samples are [seconds since release, ex, ey, pan, tilt] at 50 Hz
export interface StepResult {
  settle: number | null;
  overshoot: number;
  samples: [number, number, number, number, number][];
}

export type ExpResult = CosineResult | CompareResult | StepResult;

export interface ExpMessage {
  t: 'exp';
  id: string;
  kind: ExpKind;
  phase: string;
  // 0 to 1
  progress: number;
  result: ExpResult | null;
}

export type EventLevel = 'info' | 'warn' | 'error';

// only admins get these
export interface EvtMessage {
  t: 'evt';
  ts: number;
  lvl: EventLevel;
  msg: string;
}

export type ServerMessage =
  | HelloMessage
  | StateFrame
  | SysFrame
  | AckMessage
  | AuthMessage
  | CfgMessage
  | ScanMessage
  | ExpMessage
  | EvtMessage;

export const SERVER_TYPES: ServerMessage['t'][] = ['hello', 's', 'sys', 'ack', 'auth', 'cfg', 'scan', 'exp', 'evt'];

// page to server

export type AuthRequest = { t: 'auth'; pin: string } | { t: 'auth'; token: string };

export type CalibStep = 'dark' | 'bright' | 'zero' | 'polarity' | 'save' | 'reset';
export type SunSpeed = 1 | 60 | 600 | 3600;
export type SysAction = 'restart' | 'reboot' | 'shutdown';

// a command without the envelope, the connection adds t and id
export type Command =
  | { op: 'ping' }
  | { op: 'mode'; mode: Mode }
  | { op: 'target'; pan: number; tilt: number }
  // joystick rates -1 to 1 per axis, they run out after 400 ms without a refresh
  | { op: 'rate'; pan: number; tilt: number }
  | { op: 'set'; key: ParamKey; value: number }
  | { op: 'site'; lat: number; lon: number; heading: number }
  // date is an iso date, the time lapse starts there
  | { op: 'sun'; speed: SunSpeed; date?: string }
  | { op: 'scan'; step?: number }
  | { op: 'exp'; kind: ExpKind }
  | { op: 'stop' }
  | { op: 'calib'; step: CalibStep; values?: Record<string, number> }
  | { op: 'simlight'; az: number; el: number; on?: boolean; lux?: number; amb?: number }
  | { op: 'rec'; on: boolean }
  | { op: 'sys'; action: SysAction };

export type CmdOp = Command['op'];

export type CmdMessage = Command & { t: 'cmd'; id: string };

export type ClientMessage = AuthRequest | CmdMessage;

// http, the json the tracker answers on /api/*

export interface InfoResponse {
  name: string;
  version: string;
  proto: number;
  driver: Driver;
  caps: Caps;
  viewers: number;
  uptime: number;
}

// rows are one per dt seconds from t0, in the order of cols
export interface HistoryResponse {
  t0: number;
  dt: number;
  cols: string[];
  rows: (number | null)[][];
}

export interface ExperimentSummary {
  id: string;
  kind: ExpKind;
  ts: number;
}

export interface ExperimentRecord extends ExperimentSummary {
  result: ExpResult;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// a frame from the wire, or null for anything that is not one of ours. the
// tracker is trusted for the fields, this only keeps garbage away from the stores
export function parseServerMessage(data: unknown): ServerMessage | null {
  if (typeof data !== 'string') return null;
  let value: unknown;
  try {
    value = JSON.parse(data);
  } catch {
    return null;
  }
  if (!isObject(value) || typeof value.t !== 'string') return null;
  if (!SERVER_TYPES.includes(value.t as ServerMessage['t'])) return null;
  return value as unknown as ServerMessage;
}

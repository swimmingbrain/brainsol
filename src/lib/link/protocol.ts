// the messages between the tracker and the page. the pi and the simulation in
// sim/ both speak exactly this, the field names are the wire names, and
// the python service in brainsolpi is the reference on the pi side.
// times are unix seconds with milliseconds as decimals, angles are degrees with
// one decimal, levels carry three. a number that is missing is null, never NaN

export const PROTO = 1;

// the http port of the tracker, an address without a port on a plain http page gets it
export const DEFAULT_PORT = 8080;

export type Quad = [number, number, number, number];
// what the pi sends in place of a quad before its first sensor reading
export type NoQuad = [null, null, null, null];

export type Mode = 'auto' | 'manual' | 'sun' | 'hold' | 'park' | 'demo';
export const MODES: Mode[] = ['auto', 'manual', 'sun', 'hold', 'park', 'demo'];

// a pi with a brain server has one mode more: in plan the device does what the
// simulation of the planner does. the simulation in this tab never has it
export type AnyMode = Mode | 'plan';
export const PLAN_MODE: AnyMode = 'plan';

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

// set also takes the soft limits, the park pose and the panel, cfg shows them
export type ExtraKey = 'pan_min' | 'pan_max' | 'tilt_min' | 'tilt_max' | 'park_pan' | 'park_tilt' | 'panel_w' | 'panel_h' | 'panel_eff';
export const EXTRA_KEYS: ExtraKey[] = ['pan_min', 'pan_max', 'tilt_min', 'tilt_max', 'park_pan', 'park_tilt', 'panel_w', 'panel_h', 'panel_eff'];
export type SetKey = ParamKey | ExtraKey;

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

// where the sun stands in sun mode. az and el are seen from the device, caz is
// the compass azimuth and t the time of the sun clock, ahead of now in a time lapse
export interface SunPosition {
  az: number;
  el: number;
  caz: number;
  t: number;
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
  mode: AnyMode;
  st: St;
  pan: number;
  tilt: number;
  // axis speeds in degrees per second
  vp: number;
  vt: number;
  // filtered levels 0 to 1 and the raw sums 0 to 8184, both in the order L R U D.
  // a pi sends nulls here and in the errors until the board gave a first reading
  ldr: Quad | NoQuad;
  raw: Quad | NoQuad;
  ex: number | null;
  ey: number | null;
  lvl: number | null;
  lux: number | null;
  pmw: number | null;
  // measured panel voltage in volts and current in milliamps, only with an INA219
  pv: { v: number; ma: number } | null;
  gain: number | null;
  off: number | null;
  tgt: Pose | null;
  sun: SunPosition | null;
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
  // control loop rate in hertz and its jitter in milliseconds, null until measured
  hz: number | null;
  jit: number | null;
  drv: Driver;
  link: 'ok' | 'down';
  fw: string | null;
  rec: boolean;
  act: Activity | null;
  // serial frames lost since the start, always 0 in a simulation
  drop: number;
}

export interface AckOk {
  t: 'ack';
  id: string;
  ok: true;
  data?: unknown;
}

// err is a short code the page puts into words, msg the details in plain english
export interface AckError {
  t: 'ack';
  id: string;
  ok: false;
  err: string;
  msg?: string;
}

export type AckMessage = AckOk | AckError;

// the err strings in use. the page also makes up timeout and offline itself
export type AckErr = 'admin' | 'bad' | 'busy' | 'unknown' | 'unsupported' | 'timeout' | 'offline';

// exp is the unix time the token runs out, wait the seconds until the pin may be
// tried again. err is pin or token, msg says the details in plain english
export type AuthMessage =
  | { t: 'auth'; ok: true; token: string; exp: number }
  | { t: 'auth'; ok: false; err: string; wait: number; msg?: string };

// what a refused pin means beyond err and wait. the pi says it only in msg,
// "wrong pin, 3 tries left" or "no pin is set on the tracker, run ..."
export function pinRefusal(msg: unknown): { left: number | null; noPin: boolean } {
  const text = typeof msg === 'string' ? msg : '';
  const tries = /(\d+)\s+tr(?:y|ies)\s+left/i.exec(text);
  return { left: tries ? Number(tries[1]) : null, noPin: /\bno pin is set\b/i.test(text) };
}

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
  // the last frame of a scan that was stopped or failed, err says why
  stopped?: boolean;
  err?: string;
}

export type ExpKind = 'cosine' | 'compare' | 'step';

// what an experiment reports while it runs, done and error end it
export type ExpPhase = 'start' | 'lock' | 'sweep' | 'fit' | 'ref' | 'track' | 'offset' | 'release' | 'done' | 'error';
export const EXP_PHASES: ExpPhase[] = ['start', 'lock', 'sweep', 'fit', 'ref', 'track', 'offset', 'release', 'done', 'error'];

// lux = amb + peak * max(0, cos(delta - offset)), points are [delta in degrees, lux].
// offset is the pointing error of the lock that the fit took out, in degrees,
// fit the fitted curve at the same angles. r2 is null when every point read the
// same. the fields after points, and in the other results below, may be missing
// in a result that an older tracker kept
export interface CosineResult {
  peak: number;
  amb: number;
  r2: number | null;
  points: [number, number][];
  fit?: [number, number][];
  offset?: number;
  lock?: Pose;
}

// fixed and tracked lux of one round and their ratio
export interface CompareRound {
  fixed: number;
  tracked: number;
  gain?: number;
}

// gain is the mean ratio over the rounds, spread its range and sd its standard
// deviation, ref the pose of the fixed panel
export interface CompareResult {
  gain: number;
  spread: number;
  rounds: CompareRound[];
  sd?: number;
  ref?: Pose;
}

// settle in seconds, null when it did not lock within 8 s. overshoot in degrees,
// overshoot_pct in percent of the way back, null when the way was too short to
// say. samples are [seconds since release, ex, ey, pan, tilt] at 50 Hz. offset
// is the pan step in degrees, lock where it started and final where it came to rest
export interface StepResult {
  settle: number | null;
  overshoot: number;
  samples: [number, number, number, number, number][];
  overshoot_pct?: number | null;
  offset?: number;
  lock?: Pose;
  final?: Pose;
}

export type ExpResult = CosineResult | CompareResult | StepResult;

export interface ExpMessage {
  t: 'exp';
  id: string;
  kind: ExpKind;
  phase: ExpPhase;
  // 0 to 1
  progress: number;
  result: ExpResult | null;
  // why it ended early, with the phase error
  err?: string;
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

// dark and bright by hand: {L, R, U, D} or a list in that order. zero by hand: {pan_us, tilt_us}
export type CalibValues = Record<string, number> | number[];

// the ack data of the calibration steps. dark, bright, save and reset answer
// with the whole normalisation, every list in the order L R U D
export interface CalibReport {
  dark: number[];
  bright: number[];
  span: number[];
  // a sensor that reads lower in light than in shade, the normalisation handles it
  inverted: boolean[];
  // a sensor whose dark and bright readings hardly differ
  weak: boolean[];
}

// zero: the pulses that are the centre now and the pose they mean
export interface ZeroReport {
  pan_us: number;
  tilt_us: number;
  pan: number;
  tilt: number;
}

// polarity: the learned loop signs, 1 as wired in the docs, and how far the errors moved
export interface PolarityReport {
  sx: 1 | -1;
  sy: 1 | -1;
  dx: number;
  dy: number;
}

export type SunSpeed = 1 | 60 | 600 | 3600;
export type SysAction = 'restart' | 'reboot' | 'shutdown';

// a command without the envelope, the connection adds t and id
export type Command =
  | { op: 'ping' }
  | { op: 'mode'; mode: AnyMode }
  | { op: 'target'; pan: number; tilt: number }
  // joystick rates -1 to 1 per axis, they run out after 400 ms without a refresh
  | { op: 'rate'; pan: number; tilt: number }
  | { op: 'set'; key: SetKey; value: number }
  | { op: 'site'; lat: number; lon: number; heading: number }
  // date is an iso date, the time lapse starts there
  | { op: 'sun'; speed: SunSpeed; date?: string }
  | { op: 'scan'; step?: number }
  | { op: 'exp'; kind: ExpKind }
  | { op: 'stop' }
  | { op: 'calib'; step: CalibStep; values?: CalibValues }
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
  // a brain server is set, the pi passes /brain/* on to it and offers the plan mode
  brain?: boolean;
}

// rows are one per dt seconds from t0, in the order of cols
export interface HistoryResponse {
  t0: number;
  dt: number;
  cols: string[];
  rows: (number | null)[][];
}

// summary holds the headline numbers of a result, like r2, gain or settle
export interface ExperimentSummary {
  id: string;
  kind: ExpKind;
  ts: number;
  summary?: Record<string, number | null>;
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

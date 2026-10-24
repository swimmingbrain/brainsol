// the tuning form. value, range and step of every tunable come from the config
// the tracker sends, this only snaps, checks and orders them

import { PARAM_KEYS, type Param, type ParamKey } from '$lib/link/protocol';

// the defaults of section 6. the config has no default, reset goes back to
// these, kept inside the range the tracker allows
export const DEFAULTS: Record<ParamKey, number> = {
  kp: 90,
  vmax: 60,
  amax: 240,
  dead_in: 0.025,
  dead_out: 0.05,
  tau: 0.12,
  min_light: 0.04,
  zenith_band: 6,
  ref_pan: 0,
  ref_tilt: 90,
  rate: 20
};

export const UNITS: Record<ParamKey, string> = {
  kp: '°/s',
  vmax: '°/s',
  amax: '°/s²',
  dead_in: '',
  dead_out: '',
  tau: ' s',
  min_light: '',
  zenith_band: '°',
  ref_pan: '°',
  ref_tilt: '°',
  rate: ' Hz'
};

export type ParamGroup = 'loop' | 'sensors' | 'reference' | 'stream' | 'other';

export const GROUPS: { id: Exclude<ParamGroup, 'other'>; keys: ParamKey[] }[] = [
  { id: 'loop', keys: ['kp', 'vmax', 'amax', 'dead_in', 'dead_out'] },
  { id: 'sensors', keys: ['tau', 'min_light', 'zenith_band'] },
  { id: 'reference', keys: ['ref_pan', 'ref_tilt'] },
  { id: 'stream', keys: ['rate'] }
];

export function isKnown(key: string): key is ParamKey {
  return (PARAM_KEYS as string[]).includes(key);
}

// the groups with the keys this config really has, a key a newer tracker
// added lands in other so it can still be tuned
export function groupsOf(params: Record<string, Param> | null | undefined): { id: ParamGroup; keys: string[] }[] {
  if (!params) return [];
  const present = new Set(Object.keys(params));
  const out: { id: ParamGroup; keys: string[] }[] = [];
  for (const group of GROUPS) {
    const keys = group.keys.filter((key) => present.has(key));
    if (keys.length > 0) out.push({ id: group.id, keys });
  }
  const other = [...present].filter((key) => !isKnown(key)).sort();
  if (other.length > 0) out.push({ id: 'other', keys: other });
  return out;
}

// how many decimals a step needs: 0.005 has three, 10 has none
export function decimals(step: number): number {
  if (!Number.isFinite(step) || step <= 0) return 2;
  let places = 0;
  while (places < 6 && Math.abs(Math.round(step * 10 ** places) - step * 10 ** places) > 1e-9) places++;
  return places;
}

// clamped into the range and onto the grid that starts at the minimum
export function snap(value: number, param: Param): number {
  if (!Number.isFinite(value)) return param.v;
  // the ends are always valid, even when the range is no whole number of steps
  if (value >= param.max) return param.max;
  if (value <= param.min) return param.min;
  if (!(param.step > 0)) return value;
  const snapped = param.min + Math.round((value - param.min) / param.step) * param.step;
  return Math.min(param.max, Number(snapped.toFixed(decimals(param.step))));
}

export function sameValue(a: number, b: number, param: Param): boolean {
  return Math.abs(a - b) <= (param.step > 0 ? param.step / 1000 : 1e-9);
}

export function defaultValue(key: string, param: Param): number | null {
  return isKnown(key) ? snap(DEFAULTS[key], param) : null;
}

export function isDefault(key: string, param: Param): boolean {
  const value = defaultValue(key, param);
  return value === null || sameValue(param.v, value, param);
}

export type Check = { ok: true; value: number } | { ok: false; value: number; other: ParamKey };

// the one rule between two tunables: the rest threshold stays below the start
// threshold, or an axis would never come to rest. the tracker refuses it too
export function check(key: string, value: number, params: Record<string, Param>): Check {
  const param = params[key];
  const next = param ? snap(value, param) : value;
  if (key === 'dead_in' && params.dead_out && next >= params.dead_out.v) return { ok: false, value: next, other: 'dead_out' };
  if (key === 'dead_out' && params.dead_in && next <= params.dead_in.v) return { ok: false, value: next, other: 'dead_in' };
  return { ok: true, value: next };
}

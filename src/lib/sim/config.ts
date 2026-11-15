// what the simulated tracker reports about itself in hello and cfg, and the
// checks for changing it, the same rules as config.py on the pi

import { LIMITS, PARAMS } from './controller';
import { CommandError, isNumber } from './fields';
import { K } from './physics';
import { PARAM_KEYS, type Config, type ParamKey, type Param } from '$lib/link/protocol';

export function defaultConfig(): Config {
  const params = structuredClone(PARAMS) as Record<ParamKey, Param>;
  // the reference pose of the fixed panel can be anywhere the head can go
  params.ref_pan = { ...params.ref_pan, min: LIMITS.pan[0], max: LIMITS.pan[1] };
  params.ref_tilt = { ...params.ref_tilt, min: LIMITS.tilt[0], max: LIMITS.tilt[1] };
  return {
    limits: { pan: [...LIMITS.pan], tilt: [...LIMITS.tilt] },
    park: { pan: 0, tilt: 90 },
    // vienna, the front of the device facing south
    site: { lat: 48.21, lon: 16.37, heading: 180 },
    // the delivered kit panel in millimetres, its label says 137 x 85
    panel: { w: 137, h: 85, eff: 0.15 },
    baffle: K,
    params
  };
}

// the frames per second go out as a whole number
const INTEGER: ParamKey[] = ['rate'];

// the soft limits may sit anywhere inside the mechanical range, with room between both ends
const RANGE = { pan: [-90, 90], tilt: [0, 180] } as const;
const MIN_SPAN = 10;

// keys besides the tunables that set takes, like on the pi
export const EXTRA_KEYS = ['pan_min', 'pan_max', 'tilt_min', 'tilt_max', 'park_pan', 'park_tilt', 'panel_w', 'panel_h', 'panel_eff'] as const;
export type ExtraKey = (typeof EXTRA_KEYS)[number];

const show = (n: number) => String(+n.toPrecision(6));

function check(key: string, value: unknown, lo: number, hi: number): number {
  if (!isNumber(value)) throw new CommandError(`${key} must be a number`);
  if (value < lo || value > hi) throw new CommandError(`${key} must be from ${show(lo)} to ${show(hi)}`);
  return value;
}

// the reference pose and the park pose stay inside the soft limits, and the
// ranges of ref_pan and ref_tilt follow them
function fixRelations(cfg: Config): void {
  const [plo, phi] = cfg.limits.pan;
  const [tlo, thi] = cfg.limits.tilt;
  const p = cfg.params;
  p.ref_pan.min = plo;
  p.ref_pan.max = phi;
  p.ref_tilt.min = tlo;
  p.ref_tilt.max = thi;
  p.ref_pan.v = Math.min(Math.max(p.ref_pan.v, plo), phi);
  p.ref_tilt.v = Math.min(Math.max(p.ref_tilt.v, tlo), thi);
  cfg.park.pan = Math.min(Math.max(cfg.park.pan, plo), phi);
  cfg.park.tilt = Math.min(Math.max(cfg.park.tilt, tlo), thi);
}

// changes one setting in place and returns the value it took. anything out of
// range or of the wrong kind throws a bad CommandError and changes nothing
export function setValue(cfg: Config, key: string, value: unknown): number {
  if ((PARAM_KEYS as string[]).includes(key)) {
    const k = key as ParamKey;
    const param = cfg.params[k];
    let v = check(k, value, param.min, param.max);
    if (INTEGER.includes(k)) v = Math.round(v);
    if (k === 'dead_in' && v >= cfg.params.dead_out.v) throw new CommandError('dead_in must stay below dead_out');
    if (k === 'dead_out' && v <= cfg.params.dead_in.v) throw new CommandError('dead_out must stay above dead_in');
    param.v = v;
    return v;
  }
  switch (key as ExtraKey) {
    case 'pan_min':
    case 'pan_max':
    case 'tilt_min':
    case 'tilt_max': {
      const axis = key.startsWith('pan') ? 'pan' : 'tilt';
      const end = key.endsWith('min') ? 0 : 1;
      const v = check(key, value, RANGE[axis][0], RANGE[axis][1]);
      const pair: [number, number] = [...cfg.limits[axis]];
      pair[end] = v;
      if (pair[1] - pair[0] < MIN_SPAN) throw new CommandError(`${key} needs at least ${MIN_SPAN} degrees between both ends`);
      cfg.limits[axis] = pair;
      fixRelations(cfg);
      return v;
    }
    case 'park_pan':
    case 'park_tilt': {
      const axis = key === 'park_pan' ? 'pan' : 'tilt';
      const [lo, hi] = cfg.limits[axis];
      const v = check(key, value, RANGE[axis][0], RANGE[axis][1]);
      if (v < lo || v > hi) throw new CommandError(`${key} must sit inside the limits ${show(lo)} to ${show(hi)}`);
      cfg.park[axis] = v;
      return v;
    }
    case 'panel_w':
    case 'panel_h': {
      const v = check(key, value, 10, 1000);
      cfg.panel[key === 'panel_w' ? 'w' : 'h'] = v;
      return v;
    }
    case 'panel_eff': {
      const v = check(key, value, 0.01, 0.5);
      cfg.panel.eff = v;
      return v;
    }
    default:
      throw new CommandError(`unknown setting ${key}`);
  }
}

// latitude, longitude and the compass bearing the front of the device faces
export function setSite(cfg: Config, lat: unknown, lon: unknown, heading: unknown): Config['site'] {
  const site = {
    lat: check('lat', lat, -90, 90),
    lon: check('lon', lon, -180, 180),
    heading: check('heading', heading, 0, 360)
  };
  cfg.site = site;
  return { ...site };
}

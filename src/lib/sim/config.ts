// what the simulated tracker reports about itself in hello and cfg

import { LIMITS, PARAMS } from './controller';
import { K } from './physics';
import type { Config, ParamKey, Param } from '$lib/link/protocol';

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
    // the kit panel is not documented, this is the working estimate in millimetres
    panel: { w: 125, h: 85, eff: 0.15 },
    baffle: K,
    params
  };
}

import { describe, expect, it } from 'vitest';
import { check, decimals, defaultValue, DEFAULTS, groupsOf, isDefault, sameValue, snap, UNITS } from './params';
import { PARAM_KEYS, type Param } from '$lib/link/protocol';

// the params block exactly as the python tracker sends it in hello
const params: Record<string, Param> = {
  kp: { v: 90, min: 10, max: 300, step: 1 },
  vmax: { v: 60, min: 5, max: 180, step: 1 },
  amax: { v: 240, min: 20, max: 1000, step: 10 },
  dead_in: { v: 0.025, min: 0.005, max: 0.2, step: 0.005 },
  dead_out: { v: 0.05, min: 0.01, max: 0.3, step: 0.005 },
  tau: { v: 0.12, min: 0.02, max: 1, step: 0.01 },
  min_light: { v: 0.04, min: 0, max: 0.5, step: 0.01 },
  zenith_band: { v: 6, min: 0, max: 20, step: 0.5 },
  ref_pan: { v: 0, min: -88, max: 88, step: 1 },
  ref_tilt: { v: 90, min: 4, max: 176, step: 1 },
  rate: { v: 20, min: 5, max: 30, step: 1 }
};

describe('decimals', () => {
  it('counts the places a step needs', () => {
    expect(decimals(1)).toBe(0);
    expect(decimals(10)).toBe(0);
    expect(decimals(0.5)).toBe(1);
    expect(decimals(0.01)).toBe(2);
    expect(decimals(0.005)).toBe(3);
    expect(decimals(0)).toBe(2);
  });
});

describe('snap', () => {
  it('clamps into the range from the config', () => {
    expect(snap(9999, params.kp)).toBe(300);
    expect(snap(-4, params.kp)).toBe(10);
  });

  it('lands on the grid that starts at the minimum without float dust', () => {
    expect(snap(0.0262, params.dead_in)).toBe(0.025);
    expect(snap(0.1 + 0.2, params.tau)).toBe(0.3);
    expect(snap(244, params.amax)).toBe(240);
    expect(snap(6.3, params.zenith_band)).toBe(6.5);
  });

  it('keeps the old value for a broken number', () => {
    expect(snap(NaN, params.kp)).toBe(90);
  });

  it('never steps past the maximum when the range is not a whole number of steps', () => {
    expect(snap(1, { v: 0, min: 0, max: 0.95, step: 0.1 })).toBe(0.95);
  });
});

describe('check', () => {
  it('passes a fine value through snapped', () => {
    expect(check('kp', 120.4, params)).toEqual({ ok: true, value: 120 });
  });

  it('keeps the rest threshold below the start threshold', () => {
    expect(check('dead_in', 0.05, params)).toEqual({ ok: false, value: 0.05, other: 'dead_out' });
    expect(check('dead_in', 0.045, params).ok).toBe(true);
    expect(check('dead_out', 0.025, params)).toEqual({ ok: false, value: 0.025, other: 'dead_in' });
    expect(check('dead_out', 0.03, params).ok).toBe(true);
  });

  it('lets a key it does not know through untouched', () => {
    expect(check('gamma', 3.3, params)).toEqual({ ok: true, value: 3.3 });
  });
});

describe('defaults', () => {
  it('has a default and a unit for every tunable of the protocol', () => {
    for (const key of PARAM_KEYS) {
      expect(DEFAULTS).toHaveProperty(key);
      expect(UNITS).toHaveProperty(key);
    }
  });

  it('keeps a default inside a range that the tracker narrowed', () => {
    expect(defaultValue('ref_tilt', { v: 120, min: 100, max: 176, step: 1 })).toBe(100);
    expect(defaultValue('gamma', { v: 1, min: 0, max: 2, step: 0.1 })).toBeNull();
  });

  it('tells a changed value from the default', () => {
    expect(isDefault('kp', params.kp)).toBe(true);
    expect(isDefault('kp', { ...params.kp, v: 95 })).toBe(false);
    expect(isDefault('dead_in', { ...params.dead_in, v: 0.0250000001 })).toBe(true);
    expect(sameValue(0.1, 0.1 + 1e-7, params.tau)).toBe(true);
  });
});

describe('groupsOf', () => {
  it('orders the tunables into groups and only lists what the config has', () => {
    const groups = groupsOf(params);
    expect(groups.map((g) => g.id)).toEqual(['loop', 'sensors', 'reference', 'stream']);
    expect(groups[0].keys).toEqual(['kp', 'vmax', 'amax', 'dead_in', 'dead_out']);
    const { rate: _, ...fewer } = params;
    expect(groupsOf(fewer).map((g) => g.id)).toEqual(['loop', 'sensors', 'reference']);
  });

  it('keeps a tunable of a newer tracker in its own group', () => {
    const groups = groupsOf({ ...params, gamma: { v: 1, min: 0, max: 2, step: 0.1 } });
    expect(groups[groups.length - 1]).toEqual({ id: 'other', keys: ['gamma'] });
  });

  it('is empty before a config came in', () => {
    expect(groupsOf(null)).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import { defaultConfig, setSite, setValue } from './config';
import { CommandError, num, optBool, optNum, oneOf, text } from './fields';
import { PARAM_KEYS } from '$lib/link/protocol';

function fails(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(CommandError);
    return (error as CommandError).code;
  }
  throw new Error('it did not fail');
}

describe('the field checks', () => {
  it('take a number inside its range and nothing else', () => {
    expect(num({ a: 4 }, 'a', 0, 5)).toBe(4);
    for (const value of ['4', true, null, undefined, NaN, Infinity, [4], { v: 4 }]) {
      expect(fails(() => num({ a: value }, 'a', 0, 5))).toBe('bad');
    }
    expect(fails(() => num({ a: 6 }, 'a', 0, 5))).toBe('bad');
  });

  it('let optional fields be left out or null', () => {
    expect(optNum({}, 'a', 0, 1)).toBeNull();
    expect(optNum({ a: null }, 'a', 0, 1)).toBeNull();
    expect(optBool({ a: false }, 'a')).toBe(false);
    expect(fails(() => optBool({ a: 'yes' }, 'a'))).toBe('bad');
  });

  it('check words and text', () => {
    expect(oneOf({ m: 'auto' }, 'm', ['auto', 'hold'])).toBe('auto');
    expect(fails(() => oneOf({ m: 'fly' }, 'm', ['auto', 'hold']))).toBe('bad');
    expect(fails(() => text({ k: '' }, 'k'))).toBe('bad');
  });
});

describe('the settings', () => {
  it('report every tunable with value, range and step', () => {
    const cfg = defaultConfig();
    for (const key of PARAM_KEYS) {
      const p = cfg.params[key];
      expect(p.min).toBeLessThanOrEqual(p.v);
      expect(p.max).toBeGreaterThanOrEqual(p.v);
      expect(p.step).toBeGreaterThan(0);
    }
  });

  it('take a tunable inside its range and refuse one outside without changing it', () => {
    const cfg = defaultConfig();
    expect(setValue(cfg, 'kp', 120)).toBe(120);
    expect(cfg.params.kp.v).toBe(120);
    expect(fails(() => setValue(cfg, 'vmax', 5000))).toBe('bad');
    expect(cfg.params.vmax.v).toBe(60);
    expect(fails(() => setValue(cfg, 'kp', '100'))).toBe('bad');
    expect(fails(() => setValue(cfg, 'nope', 1))).toBe('bad');
  });

  it('rounds the frame rate to a whole number', () => {
    const cfg = defaultConfig();
    expect(setValue(cfg, 'rate', 12.6)).toBe(13);
  });

  it('keeps dead_in below dead_out', () => {
    const cfg = defaultConfig();
    expect(fails(() => setValue(cfg, 'dead_in', 0.06))).toBe('bad');
    expect(fails(() => setValue(cfg, 'dead_out', 0.02))).toBe('bad');
    setValue(cfg, 'dead_out', 0.1);
    expect(setValue(cfg, 'dead_in', 0.06)).toBe(0.06);
  });

  it('moves the soft limits and keeps the reference and the park pose inside them', () => {
    const cfg = defaultConfig();
    setValue(cfg, 'ref_tilt', 150);
    setValue(cfg, 'tilt_max', 120);
    expect(cfg.limits.tilt).toEqual([4, 120]);
    expect(cfg.params.ref_tilt).toMatchObject({ v: 120, max: 120 });
    setValue(cfg, 'pan_min', -40);
    expect(cfg.params.ref_pan.min).toBe(-40);
    expect(fails(() => setValue(cfg, 'pan_max', -35))).toBe('bad');
    expect(fails(() => setValue(cfg, 'park_pan', -60))).toBe('bad');
    expect(setValue(cfg, 'park_tilt', 100)).toBe(100);
  });

  it('change the panel', () => {
    const cfg = defaultConfig();
    setValue(cfg, 'panel_w', 110);
    setValue(cfg, 'panel_eff', 0.2);
    expect(cfg.panel).toEqual({ w: 110, h: 85, eff: 0.2 });
    expect(fails(() => setValue(cfg, 'panel_eff', 0.9))).toBe('bad');
  });

  it('take a site with latitude, longitude and heading in range', () => {
    const cfg = defaultConfig();
    expect(setSite(cfg, 52.5, 13.4, 200)).toEqual({ lat: 52.5, lon: 13.4, heading: 200 });
    expect(cfg.site.heading).toBe(200);
    expect(fails(() => setSite(cfg, 95, 0, 0))).toBe('bad');
    expect(fails(() => setSite(cfg, 0, 0, 'north'))).toBe('bad');
    expect(cfg.site.lat).toBe(52.5);
  });
});

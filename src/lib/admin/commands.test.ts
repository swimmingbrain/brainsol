import { describe, expect, it } from 'vitest';
import {
  calibCommand,
  expCommand,
  isIsoDate,
  modeCommand,
  quickPose,
  rateCommand,
  recCommand,
  sceneCommand,
  scanCommand,
  setCommand,
  simlightCommand,
  siteCommand,
  STOP,
  sunCommand,
  sysCommand,
  targetCommand,
  wrap180,
  POSE_NAMES
} from './commands';
import type { SimLight } from '$lib/link/protocol';

const limits = { pan: [-88, 88] as [number, number], tilt: [4, 176] as [number, number] };
const light: SimLight = { az: 25, el: 40, on: true, lux: 900, amb: 60 };

describe('mode and moves', () => {
  it('builds the mode command with the wire names', () => {
    expect(modeCommand('demo')).toEqual({ op: 'mode', mode: 'demo' });
  });

  it('keeps a target inside the soft limits with one decimal', () => {
    expect(targetCommand({ pan: 100, tilt: -3 }, limits)).toEqual({ op: 'target', pan: 88, tilt: 4 });
    expect(targetCommand({ pan: 12.345, tilt: 90.06 }, limits)).toEqual({ op: 'target', pan: 12.3, tilt: 90.1 });
  });

  it('falls back to the mechanical range before a config came in', () => {
    expect(targetCommand({ pan: -120, tilt: 200 }, null)).toEqual({ op: 'target', pan: -90, tilt: 180 });
  });

  it('caps joystick rates at one, rounds them and never sends NaN or minus zero', () => {
    expect(rateCommand(1.7, -0.333)).toEqual({ op: 'rate', pan: 1, tilt: -0.33 });
    expect(rateCommand(NaN, -0.001)).toEqual({ op: 'rate', pan: 0, tilt: 0 });
    expect(Object.is((rateCommand(-0.001, 0) as { pan: number }).pan, -0)).toBe(false);
  });

  it('has quick poses that respect the limits, back goes over the top', () => {
    for (const name of POSE_NAMES) {
      const pose = quickPose(name, limits);
      expect(pose.pan).toBeGreaterThanOrEqual(-88);
      expect(pose.pan).toBeLessThanOrEqual(88);
      expect(pose.tilt).toBeGreaterThanOrEqual(4);
      expect(pose.tilt).toBeLessThanOrEqual(176);
    }
    expect(quickPose('flat', limits)).toEqual({ pan: 0, tilt: 90 });
    expect(quickPose('back', limits).tilt).toBeGreaterThan(90);
    expect(quickPose('front', { pan: [-10, 10], tilt: [20, 160] })).toEqual({ pan: 0, tilt: 20 });
  });
});

describe('the simulated light', () => {
  it('sends the whole light with the change on top', () => {
    expect(simlightCommand(light, { az: 190 })).toEqual({ op: 'simlight', az: -170, el: 40, on: true, lux: 900, amb: 60 });
    expect(simlightCommand(light, { el: 95, lux: -5, amb: 12.6 })).toEqual({ op: 'simlight', az: 25, el: 90, on: true, lux: 0, amb: 13 });
  });

  it('has the phone light and the sun scene of the simulation model', () => {
    expect(sceneCommand('phone', { ...light, az: -70, lux: 50000 })).toEqual({ op: 'simlight', az: 25, el: 40, on: true, lux: 900, amb: 60 });
    expect(sceneCommand('sun', { ...light, on: false })).toEqual({ op: 'simlight', az: 25, el: 40, on: true, lux: 80000, amb: 9000 });
  });

  it('wraps an azimuth into -180 to 180', () => {
    expect(wrap180(0)).toBe(0);
    expect(wrap180(180)).toBe(180);
    expect(wrap180(-180)).toBe(-180);
    expect(wrap180(270)).toBe(-90);
    expect(wrap180(-450)).toBe(-90);
  });
});

describe('site and sun', () => {
  it('checks the site and turns a bearing of 360 into north', () => {
    expect(siteCommand({ lat: 48.2082, lon: 16.3738, heading: 360 })).toEqual({ op: 'site', lat: 48.21, lon: 16.37, heading: 0 });
    expect(siteCommand({ lat: 91, lon: 0, heading: 0 })).toBeNull();
    expect(siteCommand({ lat: 0, lon: -181, heading: 0 })).toBeNull();
    expect(siteCommand({ lat: NaN, lon: 0, heading: 0 })).toBeNull();
    expect(siteCommand({ lat: 0, lon: 0, heading: -90 })).toEqual({ op: 'site', lat: 0, lon: 0, heading: 270 });
  });

  it('adds the date to the time lapse only when it is a real iso date', () => {
    expect(sunCommand(600, '2026-06-21')).toEqual({ op: 'sun', speed: 600, date: '2026-06-21' });
    expect(sunCommand(60, '')).toEqual({ op: 'sun', speed: 60 });
    expect(sunCommand(1, '2026-02-30')).toEqual({ op: 'sun', speed: 1 });
    expect(isIsoDate('21.06.2026')).toBe(false);
  });
});

describe('activities and the rest', () => {
  it('builds every other admin command as protocol.ts names it', () => {
    expect(setCommand('kp', 120)).toEqual({ op: 'set', key: 'kp', value: 120 });
    expect(scanCommand()).toEqual({ op: 'scan', step: 15 });
    expect(scanCommand(30)).toEqual({ op: 'scan', step: 30 });
    expect(expCommand('cosine')).toEqual({ op: 'exp', kind: 'cosine' });
    expect(STOP).toEqual({ op: 'stop' });
    expect(calibCommand('polarity')).toEqual({ op: 'calib', step: 'polarity' });
    expect(recCommand(true)).toEqual({ op: 'rec', on: true });
    expect(sysCommand('reboot')).toEqual({ op: 'sys', action: 'reboot' });
  });
});

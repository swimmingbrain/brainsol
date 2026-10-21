import { describe, expect, it } from 'vitest';
import { harness, motionBounds } from './harness';
import { offAxis } from './kinematics';
import { RATE_TTL } from './modes';
import type { StateFrame } from '$lib/link/protocol';

// the limits a frame can show: amax plus what the rounding of vp and vt to 0.1 adds
const AMAX = 240 + 0.1 / 0.05 + 1e-6;

function setup() {
  const h = harness();
  h.unlock();
  return h;
}

describe('park', () => {
  it('moves to the park pose, says moving on the way and idle once there', () => {
    const { cmd, advance, last, frames } = setup();
    cmd({ op: 'target', pan: 60, tilt: 30 });
    advance(3);
    expect(cmd({ op: 'mode', mode: 'park' })).toMatchObject({ ok: true });
    advance(0.2);
    expect(last()).toMatchObject({ mode: 'park', st: 'moving', tgt: { pan: 0, tilt: 90 } });
    advance(3);
    expect(last()).toMatchObject({ st: 'idle', pan: 0, tilt: 90, vp: 0, vt: 0 });
    expect(motionBounds(frames()).accel).toBeLessThanOrEqual(AMAX);
  });
});

describe('manual', () => {
  it('moves to a target pose and says where it goes', () => {
    const { cmd, advance, last } = setup();
    expect(cmd({ op: 'target', pan: -40, tilt: 120 })).toMatchObject({ ok: true, data: { pan: -40, tilt: 120 } });
    advance(0.1);
    expect(last()).toMatchObject({ mode: 'manual', st: 'moving', tgt: { pan: -40, tilt: 120 } });
    advance(3);
    expect(last()).toMatchObject({ st: 'idle', pan: -40, tilt: 120 });
  });

  it('keeps a target inside the soft limits and answers with the pose it took', () => {
    const { cmd } = setup();
    expect(cmd({ op: 'target', pan: 120, tilt: -10 })).toMatchObject({ ok: true, data: { pan: 88, tilt: 4 } });
    expect(cmd({ op: 'target', pan: 500, tilt: 0 })).toMatchObject({ ok: false, err: 'bad' });
    expect(cmd({ op: 'target', pan: 0 })).toMatchObject({ ok: false, err: 'bad' });
  });

  it('follows the joystick at a share of vmax while it is refreshed', () => {
    const { cmd, advance, last } = setup();
    for (let i = 0; i < 20; i++) {
      expect(cmd({ op: 'rate', pan: 0.5, tilt: -3 })).toEqual({ t: 'ack', id: expect.any(String), ok: true });
      advance(0.1);
    }
    const frame = last();
    expect(frame.mode).toBe('manual');
    expect(frame.vp).toBeCloseTo(30, 0);
    // the tilt rate is cut to -1, full speed down until the soft limit
    expect(frame.tilt).toBe(4);
    expect(frame.st).toBe('limit');
    expect(frame.tgt).toBeNull();
  });

  it('runs out 400 ms after the last refresh and brakes to rest', () => {
    const { cmd, advance, frames } = setup();
    cmd({ op: 'rate', pan: 1, tilt: 0 });
    advance(RATE_TTL - 0.06);
    const before = frames().length;
    advance(0.5);
    const after = frames().slice(before);
    // still at full speed until the rate runs out, then it slows down
    expect(after[0].vp).toBeGreaterThan(50);
    advance(1);
    const rest = frames().pop()!;
    expect(rest.vp).toBe(0);
    expect(rest.st).toBe('idle');
    expect(motionBounds(frames()).accel).toBeLessThanOrEqual(AMAX);
  });

  it('a target ends the joystick and the joystick ends a target', () => {
    const { cmd, advance, last } = setup();
    cmd({ op: 'target', pan: 50, tilt: 50 });
    advance(0.3);
    cmd({ op: 'rate', pan: -1, tilt: 0 });
    advance(0.3);
    expect(last().vp).toBeLessThan(0);
    expect(last().tgt).toBeNull();
    cmd({ op: 'target', pan: 10, tilt: 60 });
    advance(3);
    expect(last()).toMatchObject({ pan: 10, tilt: 60, st: 'idle' });
  });
});

describe('demo', () => {
  it('moves slowly and smoothly over the top and back, both ways in pan', () => {
    const { cmd, advance, frames } = setup();
    cmd({ op: 'mode', mode: 'demo' });
    const start = frames().length;
    advance(60);
    const run = frames().slice(start);
    const pans = run.map((f) => f.pan);
    const tilts = run.map((f) => f.tilt);
    expect(Math.max(...pans)).toBeGreaterThan(40);
    expect(Math.min(...pans)).toBeLessThan(-40);
    expect(Math.max(...tilts)).toBeGreaterThan(125);
    expect(Math.min(...tilts)).toBeLessThan(55);
    const bounds = motionBounds(run);
    expect(bounds.speed).toBeLessThanOrEqual(25);
    expect(bounds.accel).toBeLessThanOrEqual(AMAX);
    expect(run.every((f) => f.mode === 'demo' && f.tgt !== null)).toBe(true);
  });
});

describe('sun mode', () => {
  function day(speed: number, date: string) {
    const h = setup();
    const ack = h.cmd({ op: 'sun', speed, date });
    const start = h.frames().length;
    h.advance((24 * 3600) / speed);
    return { ...h, ack, run: h.frames().slice(start) };
  }

  it('follows a summer day at 600 times, goes over the top for the sun behind and parks at night', () => {
    const { ack, run } = day(600, '2026-06-21T00:00Z');
    expect(ack).toMatchObject({ ok: true, data: { speed: 600, t: Date.parse('2026-06-21T00:00Z') / 1000 } });
    const daylight = run.filter((f) => f.sun!.el > 2);
    const night = run.filter((f) => f.sun!.el < -1);
    expect(daylight.length).toBeGreaterThan(1500);
    expect(night.length).toBeGreaterThan(800);
    // on the sun most of the day, the misses are sunrise and the two swings round the side
    const close = daylight.filter((f) => offAxis(f.pan, f.tilt, f.sun!.az, f.sun!.el) < 2);
    expect(close.length / daylight.length).toBeGreaterThan(0.85);
    // in june the sun rises and sets behind a tracker that faces south
    const behind = daylight.filter((f) => Math.abs(f.sun!.az) > 100);
    expect(behind.length).toBeGreaterThan(300);
    expect(behind.filter((f) => f.tilt > 90).length / behind.length).toBeGreaterThan(0.9);
    // night: parked, the lamp of the simulation is the dark sky
    const parked = night.filter((f) => f.pan === 0 && f.tilt === 90);
    expect(parked.length / night.length).toBeGreaterThan(0.95);
    expect(night.every((f) => f.sim!.on === false && f.sim!.amb <= 9000)).toBe(true);
    expect(daylight.every((f) => f.sim!.on && f.sim!.az === f.sun!.az)).toBe(true);
    const bounds = motionBounds(run);
    expect(bounds.accel).toBeLessThanOrEqual(AMAX);
    expect(bounds.speed).toBeLessThanOrEqual(60);
  });

  it('keeps up in the middle of the day at 3600 times and has the sun in every frame', () => {
    const { run } = day(3600, '2026-06-21T00:00Z');
    expect(run.every((f) => f.mode === 'sun' && f.sun !== null)).toBe(true);
    // the morning swing round the side takes about 3.5 s, three and a half
    // hours of sun at this speed, so the check starts near the meridian
    const noon = run.filter((f) => f.sun!.el > 55 && Math.abs(f.sun!.az) < 50);
    expect(noon.length).toBeGreaterThan(30);
    for (const f of noon) expect(offAxis(f.pan, f.tilt, f.sun!.az, f.sun!.el)).toBeLessThan(4);
    expect(motionBounds(run).accel).toBeLessThanOrEqual(AMAX);
  });

  it('faces the real sun in real time and parks when it is night now', () => {
    const { cmd, advance, last, clock } = setup();
    // 23:00 utc in vienna is night all year round
    clock.ms = Date.parse('2026-11-14T23:00:00Z');
    cmd({ op: 'mode', mode: 'sun' });
    advance(4);
    expect(last()).toMatchObject({ mode: 'sun', st: 'idle', pan: 0, tilt: 90 });
    expect(last().sun!.el).toBeLessThan(0);
    clock.ms = Date.parse('2026-11-14T11:00:00Z');
    advance(4);
    const noon = last();
    expect(noon.sun!.el).toBeGreaterThan(15);
    expect(offAxis(noon.pan, noon.tilt, noon.sun!.az, noon.sun!.el)).toBeLessThan(1);
  });

  it('refuses a bad speed or date, and moving the lamp while the sun has it', () => {
    const { cmd } = setup();
    expect(cmd({ op: 'sun', speed: 7200 })).toMatchObject({ ok: false, err: 'bad' });
    expect(cmd({ op: 'sun', speed: 60, date: 'midsummer' })).toMatchObject({ ok: false, err: 'bad' });
    expect(cmd({ op: 'sun', speed: 60, date: 12 })).toMatchObject({ ok: false, err: 'bad' });
    expect(cmd({ op: 'sun' })).toMatchObject({ ok: true, data: { speed: 1 } });
    expect(cmd({ op: 'simlight', az: 0, el: 30 })).toMatchObject({ ok: false, err: 'busy' });
  });

  it('gives the lamp back as it was when sun mode ends', () => {
    const { cmd, advance, last } = setup();
    cmd({ op: 'simlight', az: -30, el: 50, lux: 1200, amb: 40 });
    cmd({ op: 'sun', speed: 3600, date: '2026-06-21T12:00Z' });
    advance(1);
    expect(last().sim!.lux).toBeGreaterThan(10000);
    cmd({ op: 'mode', mode: 'auto' });
    advance(0.1);
    expect(last().sim).toEqual({ az: -30, el: 50, on: true, lux: 1200, amb: 40 });
    expect(last().sun).toBeNull();
  });

  it('uses a new site right away', () => {
    const { cmd, advance, last, of } = setup();
    cmd({ op: 'sun', speed: 1, date: '2026-06-21T10:00Z' });
    advance(0.1);
    const vienna = last().sun!;
    expect(cmd({ op: 'site', lat: -33.9, lon: 18.4, heading: 0 })).toMatchObject({ ok: true, data: { lat: -33.9, lon: 18.4, heading: 0 } });
    expect(of('cfg').pop()!.cfg.site).toEqual({ lat: -33.9, lon: 18.4, heading: 0 });
    advance(0.1);
    // cape town in june, winter, the sun low in the north, ahead for a device facing north
    const cape = last().sun!;
    expect(cape.el).toBeLessThan(vienna.el);
    expect(Math.abs(cape.az)).toBeLessThan(60);
    expect(cmd({ op: 'site', lat: 'south', lon: 0, heading: 0 })).toMatchObject({ ok: false, err: 'bad' });
  });
});

describe('the hand over between modes', () => {
  it('never jumps in speed, whatever comes next, and never goes over vmax', () => {
    const { cmd, advance, frames } = setup();
    const steps: Record<string, unknown>[] = [
      { op: 'mode', mode: 'demo' },
      { op: 'target', pan: -80, tilt: 160 },
      { op: 'rate', pan: 1, tilt: 1 },
      { op: 'mode', mode: 'auto' },
      { op: 'mode', mode: 'park' },
      { op: 'sun', speed: 3600, date: '2026-06-21T05:00Z' },
      { op: 'mode', mode: 'hold' },
      { op: 'target', pan: 80, tilt: 10 },
      { op: 'mode', mode: 'demo' },
      { op: 'rate', pan: -1, tilt: 0.4 },
      { op: 'simlight', az: 160, el: 30 },
      { op: 'mode', mode: 'auto' }
    ];
    // each change comes while the head is still on its way somewhere
    for (let round = 0; round < 3; round++) {
      for (const step of steps) {
        expect(cmd(step)).toMatchObject({ ok: true });
        advance(0.7 + round * 0.4);
      }
    }
    const all: StateFrame[] = frames();
    const bounds = motionBounds(all);
    expect(bounds.accel).toBeLessThanOrEqual(AMAX);
    expect(bounds.speed).toBeLessThanOrEqual(60);
    // and the pose moves the way the speeds say
    for (let i = 1; i < all.length; i++) {
      const dt = all[i].ts - all[i - 1].ts;
      expect(Math.abs(all[i].pan - all[i - 1].pan)).toBeLessThanOrEqual(60 * dt + 0.2);
    }
  });
});

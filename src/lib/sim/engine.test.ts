import { describe, expect, it } from 'vitest';
import { harness, START_MS } from './harness';
import { offAxis } from './kinematics';
import type { ServerMessage } from '$lib/link/protocol';

const setup = harness;

describe('the engine', () => {
  it('says hello first, as the simulation, then a state frame, and the system state a second later', () => {
    const { out, advance, of } = setup();
    expect(out[0]).toMatchObject({
      t: 'hello',
      proto: 1,
      name: 'brainsol',
      driver: 'sim',
      caps: { lux: true, pv: false, simlight: true },
      admin: false,
      rate: 20
    });
    const hello = out[0] as Extract<ServerMessage, { t: 'hello' }>;
    expect(hello.cfg.limits).toEqual({ pan: [-88, 88], tilt: [4, 176] });
    expect(hello.cfg.params.kp).toEqual({ v: 90, min: 10, max: 300, step: 1 });
    expect(out[1].t).toBe('s');
    expect(of('sys')).toHaveLength(0);
    advance(1);
    expect(of('sys')).toHaveLength(1);
  });

  it('sends 20 state frames and one sys frame per second', () => {
    const { out, advance } = setup();
    out.length = 0;
    advance(2);
    expect(out.filter((m) => m.t === 's')).toHaveLength(40);
    expect(out.filter((m) => m.t === 'sys')).toHaveLength(2);
  });

  it('fills every field of a state frame, angles with one decimal and levels with three', () => {
    const { advance, last } = setup();
    advance(0.5);
    const frame = last();
    expect(frame.mode).toBe('auto');
    expect(frame.ts).toBeCloseTo(1_700_000_000.5, 2);
    for (const value of [frame.pan, frame.tilt, frame.vp, frame.vt, frame.off ?? 0]) {
      expect(Math.round(value * 10) / 10).toBe(value);
    }
    for (const value of [...frame.ldr, frame.ex, frame.ey, frame.lvl]) {
      expect(Math.round(value * 1000) / 1000).toBe(value);
    }
    expect(frame.raw.every((value) => Number.isInteger(value) && value >= 0 && value <= 8184)).toBe(true);
    expect(frame.sim).toEqual({ az: 25, el: 40, on: true, lux: 900, amb: 60 });
    expect(frame.pv).toBeNull();
    expect(frame.sun).toBeNull();
    expect(JSON.stringify(frame)).not.toContain('NaN');
  });

  it('turns from the park pose onto the phone light and locks', () => {
    const { advance, last } = setup();
    advance(6);
    const frame = last();
    expect(frame.st).toBe('locked');
    expect(offAxis(frame.pan, frame.tilt, 25, 40)).toBeLessThan(6);
    expect(frame.gain).toBeGreaterThan(1);
    expect(frame.lux).toBeGreaterThan(850);
    expect(frame.pmw).toBeGreaterThan(10);
  });

  it('answers a ping from anyone with the time', () => {
    const { cmd } = setup();
    expect(cmd({ op: 'ping' })).toMatchObject({ ok: true, data: { ts: 1_700_000_000 } });
  });

  it('keeps everything but ping and the lamp for an admin', () => {
    const { cmd } = setup();
    expect(cmd({ op: 'mode', mode: 'hold' })).toMatchObject({ ok: false, err: 'admin' });
    expect(cmd({ op: 'target', pan: 0, tilt: 30 })).toMatchObject({ ok: false, err: 'admin' });
  });

  it('takes any pin and gives a token that works again after a reconnect', () => {
    const { engine, out } = setup();
    engine.handle({ t: 'auth', pin: '1234' });
    const auth = out.filter((m) => m.t === 'auth').pop() as Extract<ServerMessage, { t: 'auth'; ok: true }>;
    expect(auth.ok).toBe(true);
    expect(auth.exp).toBe(1_700_000_000 + 12 * 3600);
    engine.stop();
    const again: ServerMessage[] = [];
    engine.start((m) => again.push(m));
    engine.handle({ t: 'auth', token: auth.token });
    expect(again.filter((m) => m.t === 'auth').pop()).toMatchObject({ ok: true, token: auth.token });
    engine.handle({ t: 'auth', token: 'made up' });
    expect(again.filter((m) => m.t === 'auth').pop()).toMatchObject({ ok: false, err: 'token', wait: 0 });
  });

  it('forgets admin rights when a page connects again', () => {
    const { engine } = setup();
    engine.handle({ t: 'auth', pin: '' });
    engine.stop();
    const again: ServerMessage[] = [];
    engine.start((m) => again.push(m));
    engine.handle({ t: 'cmd', id: 'x', op: 'mode', mode: 'hold' });
    expect(again.pop()).toMatchObject({ t: 'ack', id: 'x', ok: false, err: 'admin' });
  });

  it('comes to rest with the normal deceleration in hold mode and reports idle', () => {
    const { cmd, unlock, advance, last, frames } = setup();
    unlock();
    advance(0.3);
    expect(cmd({ op: 'mode', mode: 'hold' })).toMatchObject({ ok: true, data: { mode: 'hold' } });
    const moving = last();
    advance(0.5);
    const rest = last();
    advance(2);
    const after = last();
    expect(after.st).toBe('idle');
    expect(after.mode).toBe('hold');
    expect(after.vp).toBe(0);
    expect(after.vt).toBe(0);
    expect(after.pan).toBe(rest.pan);
    expect(after.tilt).toBe(rest.tilt);
    // it stopped within the braking distance of the speed it had
    const v = Math.hypot(moving.vp, moving.vt);
    expect(Math.hypot(rest.pan - moving.pan, rest.tilt - moving.tilt)).toBeLessThan((v * v) / (2 * 240) + 1);
    expect(frames().length).toBeGreaterThan(50);
  });

  it('moves the light on simlight and follows it', () => {
    const { cmd, unlock, advance, last } = setup();
    unlock();
    expect(cmd({ op: 'simlight', az: -50, el: 25 })).toMatchObject({ ok: true, data: { az: -50, el: 25, on: true } });
    advance(8);
    const frame = last();
    expect(frame.sim).toMatchObject({ az: -50, el: 25 });
    expect(offAxis(frame.pan, frame.tilt, -50, 25)).toBeLessThan(6);
  });

  it('says lowlight with gain and offset null when the lamp goes out in a dark room', () => {
    const { cmd, unlock, advance, last } = setup();
    unlock();
    cmd({ op: 'simlight', az: 25, el: 40, on: false, amb: 2 });
    advance(2);
    const frame = last();
    expect(frame.st).toBe('lowlight');
    expect(frame.gain).toBeNull();
    expect(frame.off).toBeNull();
  });

  it('changes a tunable, refuses one out of range and tells every page with cfg', () => {
    const { engine, of, cmd, unlock } = setup();
    unlock();
    expect(cmd({ op: 'set', key: 'kp', value: 120 })).toMatchObject({ ok: true, data: { key: 'kp', value: 120 } });
    expect(of('cfg').pop()!.cfg.params.kp.v).toBe(120);
    expect(cmd({ op: 'set', key: 'vmax', value: 5000 })).toMatchObject({ ok: false, err: 'bad' });
    expect(engine.cfg.params.vmax.v).toBe(60);
    expect(cmd({ op: 'set', key: 'nope', value: 1 })).toMatchObject({ ok: false, err: 'bad' });
    expect(cmd({ op: 'set', key: 'kp', value: 'x' })).toMatchObject({ ok: false, err: 'bad' });
  });

  it('sends frames at the new rate after set rate', () => {
    const { out, cmd, unlock, advance } = setup();
    unlock();
    cmd({ op: 'set', key: 'rate', value: 10 });
    out.length = 0;
    advance(2);
    expect(out.filter((m) => m.t === 's')).toHaveLength(20);
  });

  it('only sends events to an admin', () => {
    const { out, cmd, unlock } = setup();
    cmd({ op: 'mode', mode: 'hold' });
    expect(out.some((m) => m.t === 'evt')).toBe(false);
    unlock();
    cmd({ op: 'mode', mode: 'park' });
    expect(out.filter((m) => m.t === 'evt').pop()).toMatchObject({ lvl: 'info', msg: 'mode changed to park' });
  });

  it('answers recording and system actions with unsupported and nonsense with unknown', () => {
    const { cmd, unlock } = setup();
    unlock();
    expect(cmd({ op: 'rec', on: true })).toMatchObject({ ok: false, err: 'unsupported' });
    expect(cmd({ op: 'sys', action: 'reboot' })).toMatchObject({ ok: false, err: 'unsupported' });
    expect(cmd({ op: 'dance' })).toMatchObject({ ok: false, err: 'unknown' });
  });

  it('tells an admin in plain words what happens and why a command was refused', () => {
    const { cmd, unlock, advance, of } = setup();
    unlock();
    cmd({ op: 'mode', mode: 'park' });
    cmd({ op: 'site', lat: 47.07, lon: 15.44, heading: 170 });
    cmd({ op: 'sun', speed: 600, date: '2026-06-21T04:00Z' });
    cmd({ op: 'set', key: 'vmax', value: 500 });
    cmd({ op: 'rec', on: true });
    cmd({ op: 'mode', mode: 'auto' });
    cmd({ op: 'scan', step: 45 });
    advance(1);
    cmd({ op: 'stop' });
    const lines = of('evt').map((e) => e.msg);
    expect(lines).toEqual([
      'admin unlocked in the simulation',
      'mode changed to park',
      'site set to latitude 47.07, longitude 15.44, the front facing 170 degrees',
      'sun clock runs 600 times faster from 2026-06-21 04:00 utc',
      'mode changed to sun',
      'set refused, vmax must be from 5 to 180',
      'rec refused, recording needs a tracker with a data folder, the simulation has none',
      'mode changed to auto',
      'scan started, 20 cells in steps of 45 degrees',
      'scan ended early, stopped'
    ]);
    // plain ascii, a hyphen only inside an iso date, never as punctuation
    for (const line of lines) {
      expect(line).toMatch(/^[a-z][a-z0-9 ,.:-]*$/);
      expect(line).not.toMatch(/\s-|-\s/);
    }
    expect(of('evt').every((e) => e.lvl === 'info' || e.lvl === 'warn')).toBe(true);
  });

  it('says when the sun clock is back on real time', () => {
    const { cmd, unlock, of } = setup();
    unlock();
    cmd({ op: 'sun', speed: 1 });
    expect(of('evt').map((e) => e.msg)).toContain('sun clock follows the real time');
  });

  it('sends nothing after stop', () => {
    const { engine, out, advance } = setup();
    engine.stop();
    const count = out.length;
    advance(1);
    expect(out.length).toBe(count);
  });

  it('stamps frames with the wall clock', () => {
    const { advance, last, clock } = setup();
    advance(1);
    expect(last().ts).toBe((START_MS + 1000) / 1000);
    expect(clock.ms).toBe(START_MS + 1000);
  });
});

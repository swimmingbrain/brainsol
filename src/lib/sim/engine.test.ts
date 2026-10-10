import { describe, expect, it } from 'vitest';
import { createEngine } from './engine';
import { offAxis } from './kinematics';
import type { AckMessage, CmdMessage, ServerMessage, StateFrame } from '$lib/link/protocol';

function setup() {
  let ms = 1_700_000_000_000;
  const engine = createEngine({ seed: 11, timers: false, now: () => ms, clock: () => ms });
  const out: ServerMessage[] = [];
  engine.start((message) => out.push(message));
  const advance = (seconds: number) => {
    // the clock moves with the loop, like it would in the browser
    for (let i = 0; i < Math.round(seconds * 50); i++) {
      ms += 20;
      engine.advance(0.02);
    }
  };
  let next = 0;
  const cmd = (body: Record<string, unknown>) => {
    const id = `t${++next}`;
    engine.handle({ t: 'cmd', id, ...body } as CmdMessage);
    return out.filter((m): m is AckMessage => m.t === 'ack' && m.id === id).pop();
  };
  const frames = () => out.filter((m): m is StateFrame => m.t === 's');
  const last = () => frames().pop()!;
  return { engine, out, advance, cmd, frames, last };
}

describe('the placeholder engine', () => {
  it('says hello first, as the simulation, then sends a frame and the system state', () => {
    const { out } = setup();
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
    expect(out[2].t).toBe('sys');
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

  it('keeps everything but ping for an admin', () => {
    const { cmd } = setup();
    expect(cmd({ op: 'mode', mode: 'hold' })).toMatchObject({ ok: false, err: 'admin' });
    expect(cmd({ op: 'simlight', az: 0, el: 30 })).toMatchObject({ ok: false, err: 'admin' });
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

  it('holds the head where it is in hold mode and reports idle', () => {
    const { engine, cmd, advance, last } = setup();
    engine.handle({ t: 'auth', pin: '' });
    advance(0.3);
    expect(cmd({ op: 'mode', mode: 'hold' })).toMatchObject({ ok: true });
    const before = last();
    advance(2);
    const after = last();
    expect(after.st).toBe('idle');
    expect(after.mode).toBe('hold');
    expect(after.pan).toBeCloseTo(before.pan, 0);
    expect(after.tilt).toBeCloseTo(before.tilt, 0);
  });

  it('moves the light on simlight and follows it', () => {
    const { engine, cmd, advance, last } = setup();
    engine.handle({ t: 'auth', pin: '' });
    expect(cmd({ op: 'simlight', az: -50, el: 25 })).toMatchObject({ ok: true });
    advance(8);
    const frame = last();
    expect(frame.sim).toMatchObject({ az: -50, el: 25 });
    expect(offAxis(frame.pan, frame.tilt, -50, 25)).toBeLessThan(6);
  });

  it('says lowlight with gain and offset null when the lamp goes out in a dark room', () => {
    const { engine, cmd, advance, last } = setup();
    engine.handle({ t: 'auth', pin: '' });
    cmd({ op: 'simlight', az: 25, el: 40, on: false, amb: 2 });
    advance(2);
    const frame = last();
    expect(frame.st).toBe('lowlight');
    expect(frame.gain).toBeNull();
    expect(frame.off).toBeNull();
  });

  it('changes a tunable, keeps it in range and tells every page with cfg', () => {
    const { engine, out, cmd } = setup();
    engine.handle({ t: 'auth', pin: '' });
    expect(cmd({ op: 'set', key: 'kp', value: 120 })).toMatchObject({ ok: true });
    const cfg = out.filter((m) => m.t === 'cfg').pop() as Extract<ServerMessage, { t: 'cfg' }>;
    expect(cfg.cfg.params.kp.v).toBe(120);
    cmd({ op: 'set', key: 'vmax', value: 5000 });
    expect(engine.cfg.params.vmax.v).toBe(180);
    expect(cmd({ op: 'set', key: 'nope', value: 1 })).toMatchObject({ ok: false, err: 'bad' });
    expect(cmd({ op: 'set', key: 'kp', value: 'x' })).toMatchObject({ ok: false, err: 'bad' });
  });

  it('sends frames at the new rate after set rate', () => {
    const { engine, out, cmd, advance } = setup();
    engine.handle({ t: 'auth', pin: '' });
    cmd({ op: 'set', key: 'rate', value: 10 });
    out.length = 0;
    advance(2);
    expect(out.filter((m) => m.t === 's')).toHaveLength(20);
  });

  it('only sends events to an admin', () => {
    const { engine, out, cmd } = setup();
    engine.handle({ t: 'auth', pin: '' });
    cmd({ op: 'mode', mode: 'auto' });
    expect(out.some((m) => m.t === 'evt')).toBe(true);
  });

  it('answers what it cannot do yet with unsupported and nonsense with unknown', () => {
    const { engine, cmd } = setup();
    engine.handle({ t: 'auth', pin: '' });
    expect(cmd({ op: 'mode', mode: 'sun' })).toMatchObject({ ok: false, err: 'unsupported' });
    expect(cmd({ op: 'scan' })).toMatchObject({ ok: false, err: 'unsupported' });
    expect(cmd({ op: 'dance' })).toMatchObject({ ok: false, err: 'unknown' });
  });

  it('sends nothing after stop', () => {
    const { engine, out, advance } = setup();
    engine.stop();
    const count = out.length;
    advance(1);
    expect(out.length).toBe(count);
  });
});

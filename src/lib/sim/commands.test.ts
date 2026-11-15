import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ADMIN_OPS, OPEN_OPS } from './commands';
import { harness, hasBadNumber } from './harness';
import { PARAM_KEYS, type AckMessage, type ClientMessage, type HelloMessage } from '$lib/link/protocol';

const GARBAGE: unknown[] = [null, undefined, '', 'x', '12', true, false, NaN, Infinity, -Infinity, 1e308, -1e308, -0, [], [1, 2], {}, { v: 1 }, '__proto__'];

// the fields each op reads
const FIELDS: Record<string, string[]> = {
  ping: [],
  mode: ['mode'],
  target: ['pan', 'tilt'],
  rate: ['pan', 'tilt'],
  set: ['key', 'value'],
  site: ['lat', 'lon', 'heading'],
  sun: ['speed', 'date'],
  scan: ['step'],
  exp: ['kind'],
  stop: [],
  calib: ['step', 'values', 'pan_us', 'tilt_us'],
  simlight: ['az', 'el', 'on', 'lux', 'amb'],
  rec: ['on'],
  sys: ['action']
};

const CODES = ['bad', 'busy', 'unsupported', 'unknown'];

let errors: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errors = vi.spyOn(console, 'error');
});
afterEach(() => {
  // nothing may end in the catch all of the engine, every bad input has a proper answer
  expect(errors).not.toHaveBeenCalled();
  errors.mockRestore();
});

describe('garbage in every field of every op', () => {
  it('gets exactly one clean ack per command and never throws', () => {
    const h = harness();
    h.unlock();
    const ids: string[] = [];
    let n = 0;
    const send = (body: Record<string, unknown>) => {
      const id = `g${++n}`;
      ids.push(id);
      expect(() => h.engine.handle({ t: 'cmd', id, ...body } as unknown as ClientMessage)).not.toThrow();
      h.advance(0.02);
    };
    for (const op of [...OPEN_OPS, ...ADMIN_OPS]) {
      send({ op });
      for (const field of FIELDS[op]) for (const value of GARBAGE) send({ op, [field]: value });
      // everything garbage at once
      for (const value of GARBAGE) send({ op, ...Object.fromEntries(FIELDS[op].map((f) => [f, value])) });
    }
    // the late answers of calibration steps that did start
    h.advance(10);
    const acks = h.out.filter((m): m is AckMessage => m.t === 'ack');
    for (const id of ids) {
      const mine = acks.filter((a) => a.id === id);
      expect(mine, id).toHaveLength(1);
      if (!mine[0].ok) expect(CODES).toContain(mine[0].err);
    }
    expect(h.out.some(hasBadNumber)).toBe(false);
    h.advance(5);
    expect(hasBadNumber(h.last())).toBe(false);
  });

  it('answers messages that are no command at all', () => {
    // a viewer, so only the acks come back and no events
    const h = harness();
    const before = h.out.length;
    for (const message of [null, undefined, 42, 'cmd', [], [1], true]) {
      expect(() => h.engine.handle(message as unknown as ClientMessage)).not.toThrow();
    }
    const acks = h.out.slice(before);
    expect(acks).toHaveLength(7);
    expect(acks.every((m) => m.t === 'ack' && m.id === '' && !m.ok && m.err === 'bad')).toBe(true);
    h.engine.handle({ t: 'hello', id: 'q' } as unknown as ClientMessage);
    expect(h.out.pop()).toMatchObject({ t: 'ack', id: 'q', ok: false, err: 'unknown' });
    h.engine.handle({} as unknown as ClientMessage);
    expect(h.out.pop()).toMatchObject({ t: 'ack', ok: false, err: 'unknown' });
  });

  it('answers a missing op with bad and ops it does not know with unknown, also the tricky names', () => {
    const h = harness();
    h.unlock();
    expect(h.cmd({})).toMatchObject({ ok: false, err: 'bad' });
    expect(h.cmd({ op: 7 })).toMatchObject({ ok: false, err: 'bad' });
    for (const op of ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'PING', 'ping ']) {
      expect(h.cmd({ op }), op).toMatchObject({ ok: false, err: 'unknown' });
    }
  });

  it('says why in msg, in the same words as the event log', () => {
    const h = harness();
    expect(h.cmd({ op: 'mode', mode: 'hold' })).toEqual({ t: 'ack', id: 't1', ok: false, err: 'admin', msg: 'admin only, unlock with the pin first' });
    h.unlock();
    expect(h.cmd({ op: 'set', key: 'vmax', value: 500 })).toMatchObject({ ok: false, err: 'bad', msg: 'vmax must be from 5 to 180' });
    expect(h.of('evt').pop()!.msg).toBe('set refused, vmax must be from 5 to 180');
    expect(h.cmd({ op: 'dance' })).toMatchObject({ ok: false, err: 'unknown', msg: 'unknown op dance' });
    h.engine.handle({ t: 'auth', token: 'made up' });
    expect(h.out.pop()).toMatchObject({ t: 'auth', ok: false, err: 'token', msg: 'the token is unknown or expired, log in with the pin' });
  });

  it('carries any id back as text', () => {
    const h = harness();
    for (const [id, text] of [
      [5, '5'],
      [null, ''],
      [undefined, '']
    ]) {
      h.engine.handle({ t: 'cmd', id, op: 'ping' } as unknown as ClientMessage);
      expect(h.out.pop()).toMatchObject({ t: 'ack', id: text, ok: true });
    }
  });

  it('answers an auth without a pin or a token with a refusal', () => {
    const h = harness();
    h.engine.handle({ t: 'auth' } as unknown as ClientMessage);
    expect(h.out.pop()).toMatchObject({ t: 'auth', ok: false, err: 'pin', wait: 0 });
    h.engine.handle({ t: 'auth', token: 5 } as unknown as ClientMessage);
    expect(h.out.pop()).toMatchObject({ t: 'auth', ok: false, err: 'token', wait: 0 });
    expect(h.cmd({ op: 'mode', mode: 'hold' })).toMatchObject({ ok: false, err: 'admin' });
  });
});

describe('the config', () => {
  it('is complete in hello, every tunable with value, range and step', () => {
    const h = harness();
    const hello = h.out[0] as HelloMessage;
    expect(Object.keys(hello.cfg).sort()).toEqual(['baffle', 'limits', 'panel', 'params', 'park', 'site']);
    expect(Object.keys(hello.cfg.params).sort()).toEqual([...PARAM_KEYS].sort());
    for (const p of Object.values(hello.cfg.params)) expect(Object.keys(p).sort()).toEqual(['max', 'min', 'step', 'v']);
    expect(hello.cfg).toMatchObject({ park: { pan: 0, tilt: 90 }, site: { lat: 48.21, lon: 16.37, heading: 180 }, panel: { w: 137, h: 85, eff: 0.15 }, baffle: 1.2 });
    expect(hello.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('is pushed after the ack that changed it, at most every 0.2 s while a slider moves', () => {
    const h = harness();
    h.unlock();
    h.cmd({ op: 'set', key: 'kp', value: 100 });
    expect(h.out.at(-2)).toMatchObject({ t: 'ack', ok: true });
    expect(h.out.at(-1)).toMatchObject({ t: 'cfg' });
    h.cmd({ op: 'set', key: 'kp', value: 110 });
    h.cmd({ op: 'set', key: 'kp', value: 120 });
    expect(h.of('cfg')).toHaveLength(1);
    h.advance(0.2);
    expect(h.of('cfg')).toHaveLength(2);
    expect(h.of('cfg').pop()!.cfg.params.kp.v).toBe(120);
    h.advance(1);
    expect(h.of('cfg')).toHaveLength(2);
  });

  it('is not pushed for a refused setting, nor for the lamp or the sun clock', () => {
    const h = harness();
    h.unlock();
    h.cmd({ op: 'set', key: 'kp', value: 9999 });
    h.cmd({ op: 'simlight', az: 10, el: 10 });
    h.cmd({ op: 'sun', speed: 60 });
    h.advance(1);
    expect(h.of('cfg')).toHaveLength(0);
  });

  it('keeps every cfg push apart from the engine, a page that changes one changes nothing here', () => {
    const h = harness();
    h.unlock();
    h.cmd({ op: 'site', lat: 10, lon: 20, heading: 30 });
    const pushed = h.of('cfg').pop()!.cfg;
    pushed.site.lat = 80;
    pushed.params.kp.v = 1;
    expect(h.engine.cfg.site.lat).toBe(10);
    expect(h.engine.cfg.params.kp.v).toBe(90);
  });
});

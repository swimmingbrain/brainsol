import { describe, expect, it, vi } from 'vitest';
import { createEngine } from './engine';
import { hasBadNumber, START_MS } from './harness';
import { mulberry32 } from './physics';
import { MODES, STATES, type AckMessage, type ClientMessage, type ServerMessage } from '$lib/link/protocol';

describe('a long run', () => {
  it('takes a simulated hour of random commands, reconnects and odd timing without one error', () => {
    const errors = vi.spyOn(console, 'error');
    const rnd = mulberry32(2026);
    const pick = <T>(list: readonly T[]): T => list[Math.floor(rnd() * list.length)];
    const any = () => pick<unknown>([rnd() * 400 - 200, rnd() * 2 - 1, rnd() * 90, 0, 90, -90, 180, 1e6, NaN, null, '5', true, undefined, [], {}]);
    let ms = START_MS;
    const engine = createEngine({ seed: 99, timers: false, wander: true, now: () => ms, clock: () => ms });

    let token: string | null = null;
    let frames = 0;
    const problems: string[] = [];
    const acks = new Map<string, number>();
    const asked = new Set<string>();
    const receive = (m: ServerMessage) => {
      if (hasBadNumber(m)) problems.push(`bad number in ${JSON.stringify(m)}`);
      if (m.t === 'auth' && m.ok) token = m.token;
      if (m.t === 'ack') acks.set(m.id, (acks.get(m.id) ?? 0) + 1);
      if (m.t !== 's') return;
      frames++;
      const ok =
        MODES.includes(m.mode) &&
        STATES.includes(m.st) &&
        m.pan >= -90 && m.pan <= 90 &&
        m.tilt >= 0 && m.tilt <= 180 &&
        Math.abs(m.vp) <= 180.1 && Math.abs(m.vt) <= 180.1 &&
        m.raw.every((x) => x !== null && Number.isInteger(x) && x >= 0 && x <= 8184) &&
        m.ldr.every((x) => x !== null && x >= 0 && x <= 1) &&
        m.lvl !== null && m.lvl >= 0 && m.lvl <= 1 &&
        (m.gain === null || m.gain >= 0) &&
        (m.off === null || m.off >= 0) &&
        m.sim !== null && m.sim.el >= 0 && m.sim.el <= 90;
      if (!ok) problems.push(`odd frame ${JSON.stringify(m)}`);
    };
    engine.start(receive);
    engine.handle({ t: 'auth', pin: '0000' });

    const ops: (() => Record<string, unknown>)[] = [
      () => ({ op: 'ping' }),
      () => ({ op: 'mode', mode: pick([...MODES, 'fly', null]) }),
      () => ({ op: 'target', pan: rnd() * 220 - 110, tilt: rnd() * 200 - 10 }),
      () => ({ op: 'target', pan: any(), tilt: any() }),
      () => ({ op: 'rate', pan: rnd() * 2.4 - 1.2, tilt: rnd() * 2.4 - 1.2 }),
      () => ({ op: 'set', key: pick(['kp', 'vmax', 'amax', 'dead_in', 'dead_out', 'tau', 'min_light', 'zenith_band', 'ref_pan', 'ref_tilt', 'rate', 'pan_min', 'tilt_max', 'park_tilt', 'panel_eff', 'nope']), value: any() }),
      () => ({ op: 'set', key: pick(['kp', 'vmax', 'amax', 'tau', 'rate']), value: pick([10, 30, 60, 100, 180, 300, 0.05, 0.5, 1]) }),
      () => ({ op: 'site', lat: rnd() * 180 - 90, lon: rnd() * 360 - 180, heading: rnd() * 360 }),
      () => ({ op: 'sun', speed: pick([1, 60, 600, 3600, any()]), date: pick([undefined, '2026-06-21', '2026-12-21T08:00Z', 'soon', 3]) }),
      () => ({ op: 'scan', step: pick([undefined, 30, 45, any()]) }),
      () => ({ op: 'exp', kind: pick(['cosine', 'compare', 'step', 'x']) }),
      () => ({ op: 'stop' }),
      () => ({ op: 'calib', step: pick(['dark', 'bright', 'zero', 'polarity', 'save', 'reset', 'x']), values: pick([undefined, [1, 2, 3, 4], { pan_us: 1400 }, any()]) }),
      () => ({ op: 'simlight', az: any(), el: any(), on: pick([true, false, undefined, 1]), lux: pick([undefined, 900, 80000, any()]), amb: pick([undefined, 5, 60, 9000, any()]) }),
      () => ({ op: 'simlight', az: rnd() * 360 - 180, el: rnd() * 90 }),
      () => ({ op: 'rec', on: any() }),
      () => ({ op: 'sys', action: pick(['restart', 'reboot', 'x']) }),
      () => ({ op: pick(['dance', '', 'constructor']) })
    ];

    let n = 0;
    let session = 0;
    const late = new Set<string>();
    const hour = 3600;
    let t = 0;
    while (t < hour) {
      const roll = rnd();
      if (roll < 0.6) {
        // a normal stretch of ticks
        const ticks = 1 + Math.floor(rnd() * 150);
        for (let i = 0; i < ticks; i++) {
          ms += 20;
          engine.advance(0.02);
        }
        t += ticks * 0.02;
      } else if (roll < 0.63) {
        // a slow tick or a tab that slept, the engine gets a big chunk at once
        const seconds = pick([0.25, 1, 5]);
        ms += seconds * 1000;
        engine.advance(seconds);
        t += seconds;
      } else if (roll < 0.96) {
        const id = `s${session}-${++n}`;
        const body = pick(ops)();
        if (body.op === 'calib' && (body.step === 'dark' || body.step === 'bright' || body.step === 'polarity')) late.add(id);
        asked.add(id);
        engine.handle({ t: 'cmd', id, ...body } as unknown as ClientMessage);
      } else if (roll < 0.99) {
        // the page goes away and comes back, with its token or a pin
        engine.stop();
        session++;
        engine.start(receive);
        if (rnd() < 0.7 && token) engine.handle({ t: 'auth', token });
        else engine.handle({ t: 'auth', pin: '1' });
      } else {
        engine.handle({ t: 'auth', ...(rnd() < 0.5 ? { token: 'nope' } : {}) } as unknown as ClientMessage);
        engine.handle({ t: 'auth', pin: '2' });
      }
    }

    expect(problems.slice(0, 3)).toEqual([]);
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
    expect(frames).toBeGreaterThan(hour * 15);
    // one answer for every command, a late calibration answer may have been
    // dropped when the page that asked was gone
    for (const id of asked) {
      const count = acks.get(id) ?? 0;
      if (late.has(id)) expect(count, id).toBeLessThanOrEqual(1);
      else expect(count, id).toBe(1);
    }
  });
});

describe('the cost of the loop', () => {
  it('costs less than a millisecond of cpu per second of simulation', () => {
    const engine = createEngine({ seed: 1, timers: false, wander: true, now: () => START_MS, clock: () => 0 });
    let frames = 0;
    engine.start((m: ServerMessage | AckMessage) => {
      if (m.t === 's') frames++;
    });
    const start = performance.now();
    for (let i = 0; i < 3600 * 50; i++) engine.advance(0.02);
    const ms = performance.now() - start;
    engine.stop();
    // one frame goes out on start, then 20 a second
    expect(frames).toBe(3600 * 20 + 1);
    console.log(`an hour of simulation took ${ms.toFixed(0)} ms, ${(ms / 3600).toFixed(3)} ms per second of simulation`);
    expect(ms).toBeLessThan(3600);
  });
});

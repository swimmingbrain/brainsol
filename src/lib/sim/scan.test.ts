import { describe, expect, it } from 'vitest';
import { harness } from './harness';
import { poseFor } from './kinematics';
import { axis } from './scan';
import type { ServerMessage } from '$lib/link/protocol';

function setup() {
  const h = harness();
  h.unlock();
  return h;
}

describe('the scan grid', () => {
  it('runs from end to end in the given step', () => {
    expect(axis(-90, 90, 15)).toHaveLength(13);
    expect(axis(15, 165, 15)).toEqual([15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165]);
    expect(axis(-90, 90, 7).at(-1)).toBe(85);
  });
});

describe('a scan', () => {
  for (const [az, el] of [
    [25, 40],
    [150, 35],
    [-70, 20]
  ]) {
    it(`finds a lamp at azimuth ${az} and elevation ${el} within one cell`, () => {
      const { cmd, advance, of } = setup();
      cmd({ op: 'simlight', az, el });
      const ack = cmd({ op: 'scan' });
      expect(ack).toMatchObject({ ok: true, data: { cells: 143 } });
      advance(200);
      const done = of('scan').pop()!;
      expect(done.done).toBe(true);
      const want = poseFor(az, el);
      expect(Math.abs(done.best!.pan - want.pan)).toBeLessThanOrEqual(15);
      expect(Math.abs(done.best!.tilt - want.tilt)).toBeLessThanOrEqual(15);
      expect(done.best!.v).toBeGreaterThan(800);
      expect(done.v.flat().every((x) => x !== null && x >= 0)).toBe(true);
    });
  }

  it('sends the map after every cell, filled in a serpentine, with v[i][j] at tilt[i] and pan[j]', () => {
    const { cmd, advance, of } = setup();
    cmd({ op: 'scan', step: 30 });
    advance(120);
    const maps = of('scan');
    const cells = 7 * 6;
    expect(maps).toHaveLength(cells + 2);
    expect(maps[0].v.flat().every((x) => x === null)).toBe(true);
    expect(maps[0].done).toBe(false);
    // the first row runs left to right, the second right to left
    expect(maps[1].v[0][0]).not.toBeNull();
    expect(maps[7].v[0][6]).not.toBeNull();
    expect(maps[8].v[1][6]).not.toBeNull();
    expect(maps[8].v[1][5]).toBeNull();
    expect(maps.slice(0, -1).every((m) => !m.done)).toBe(true);
    const last = maps.at(-1)!;
    expect(last).toMatchObject({ done: true, pan: [-90, -60, -30, 0, 30, 60, 90], tilt: [15, 45, 75, 105, 135, 165] });
    // the lux on a cell facing away from the lamp is the ambient light
    expect(Math.min(...(last.v.flat() as number[]))).toBeLessThan(80);
  });

  it('says scanning and act scan while it runs, then tracks from the brightest cell', () => {
    const { cmd, advance, last, of } = setup();
    cmd({ op: 'scan', step: 30 });
    advance(5);
    expect(last()).toMatchObject({ mode: 'auto', st: 'scanning' });
    expect(of('sys').pop()).toMatchObject({ act: 'scan' });
    advance(110);
    expect(of('scan').pop()!.done).toBe(true);
    advance(4);
    expect(last().st).toBe('locked');
    expect(of('sys').pop()).toMatchObject({ act: null });
  });

  it('is busy while one runs, ends on stop with what it has and says so', () => {
    const { cmd, advance, of, out } = setup();
    cmd({ op: 'scan', step: 30 });
    advance(8);
    expect(cmd({ op: 'scan' })).toMatchObject({ ok: false, err: 'busy' });
    expect(cmd({ op: 'stop' })).toMatchObject({ ok: true, data: { stopped: true } });
    const end = of('scan').pop()!;
    expect(end.done).toBe(true);
    expect(end).toMatchObject({ stopped: true, err: 'stopped' });
    const seen = end.v.flat().filter((x) => x !== null).length;
    expect(seen).toBeGreaterThan(2);
    expect(seen).toBeLessThan(42);
    expect(out.filter((m) => m.t === 'evt').pop()).toMatchObject({ lvl: 'warn', msg: 'scan ended early, stopped' });
    expect(cmd({ op: 'stop' })).toMatchObject({ ok: true, data: { stopped: false } });
  });

  it('ends when the mode changes and the new mode takes the head', () => {
    const { cmd, advance, last, of } = setup();
    cmd({ op: 'scan', step: 30 });
    advance(3);
    cmd({ op: 'mode', mode: 'park' });
    expect(of('scan').pop()!.done).toBe(true);
    advance(3);
    expect(last()).toMatchObject({ mode: 'park', st: 'idle', pan: 0, tilt: 90 });
  });

  it('ends when someone takes the head by hand, with a target or the joystick', () => {
    for (const body of [
      { op: 'target', pan: -20, tilt: 70 },
      { op: 'rate', pan: 0.5, tilt: 0 }
    ]) {
      const { cmd, advance, last, of } = setup();
      cmd({ op: 'scan', step: 30 });
      advance(3);
      expect(cmd(body)).toMatchObject({ ok: true });
      expect(of('scan').pop()!.done).toBe(true);
      // the scan ends first, then the mode changes
      expect(of('evt').map((e) => e.msg).slice(-2)).toEqual(['scan ended early, stopped by manual control', 'mode changed to manual']);
      advance(0.2);
      expect(last()).toMatchObject({ mode: 'manual' });
      expect(last().st).not.toBe('scanning');
    }
  });

  it('goes back to the mode it borrowed the head from', () => {
    const { cmd, advance, last } = setup();
    cmd({ op: 'mode', mode: 'demo' });
    cmd({ op: 'scan', step: 45 });
    advance(60);
    expect(last().st).not.toBe('scanning');
    expect(last().mode).toBe('demo');
    expect(last().tgt).not.toBeNull();
  });

  it('gives a page that connects later the newest map right after hello', () => {
    const { engine, cmd, advance } = setup();
    cmd({ op: 'scan', step: 45 });
    advance(60);
    engine.stop();
    const again: ServerMessage[] = [];
    engine.start((m) => again.push(m));
    expect(again[0].t).toBe('hello');
    expect(again.find((m) => m.t === 'scan')).toMatchObject({ done: true });
  });

  it('refuses a step out of range', () => {
    const { cmd } = setup();
    expect(cmd({ op: 'scan', step: 2 })).toMatchObject({ ok: false, err: 'bad' });
    expect(cmd({ op: 'scan', step: '15' })).toMatchObject({ ok: false, err: 'bad' });
  });
});

import { describe, expect, it } from 'vitest';
import { copyCalibration, describe as report } from './calibration';
import { harness } from './harness';
import { offAxis } from './kinematics';
import { rawFor } from './physics';
import type { AckMessage, ServerMessage } from '$lib/link/protocol';

function setup() {
  const h = harness();
  h.unlock();
  return h;
}

// sends a command and runs the loop until its ack comes, at most some seconds
function waitFor(h: ReturnType<typeof setup>, body: Record<string, unknown>, seconds = 8): { ack: AckMessage | undefined; took: number } {
  const before = h.out.length;
  const ack = h.cmd(body);
  if (ack) return { ack, took: 0 };
  for (let took = 0; took < seconds; took += 0.02) {
    h.advance(0.02);
    const found = h.out.slice(before).find((m): m is AckMessage => m.t === 'ack');
    if (found) return { ack: found, took };
  }
  return { ack: undefined, took: Infinity };
}

describe('the dark and bright captures', () => {
  it('measure the simulated sensors for a second and answer when done', () => {
    const h = setup();
    h.advance(4);
    // the lamp off is the simulated way of covering the sensors
    h.cmd({ op: 'simlight', on: false });
    h.advance(0.5);
    const dark = waitFor(h, { op: 'calib', step: 'dark' });
    expect(dark.took).toBeGreaterThan(0.9);
    expect(dark.took).toBeLessThan(1.2);
    const data = (dark.ack as Extract<AckMessage, { ok: true }>).data as ReturnType<typeof report>;
    // with the lamp off every sensor sees the 60 lux of the room
    for (const value of data.dark) expect(Math.abs(value - rawFor(60))).toBeLessThan(5);
    h.cmd({ op: 'simlight', on: true });
    h.advance(1);
    const bright = waitFor(h, { op: 'calib', step: 'bright' });
    const after = (bright.ack as Extract<AckMessage, { ok: true }>).data as ReturnType<typeof report>;
    for (const value of after.bright) expect(Math.abs(value - rawFor(960))).toBeLessThan(15);
    expect(after.weak).toEqual([false, false, false, false]);
    expect(after.inverted).toEqual([false, false, false, false]);
    expect(after.span.every((s) => s > 1000)).toBe(true);
    expect(h.engine.calibSaved).toBe(false);
    expect(h.of('evt').pop()!.msg).toBe('calibration bright captured, not saved yet');
  });

  it('say calibrating and act calib while they run and hold the head still', () => {
    const h = setup();
    h.advance(4.3);
    const pose = h.last();
    h.cmd({ op: 'calib', step: 'bright' });
    // the sys frame at 5 s falls inside the capture
    h.advance(0.8);
    expect(h.last()).toMatchObject({ st: 'calibrating', pan: pose.pan, tilt: pose.tilt });
    expect(h.of('sys').pop()).toMatchObject({ act: 'calib' });
  });

  it('keeps the loop working after a dark capture with the lamp off and the room light on', () => {
    const h = setup();
    h.advance(4);
    h.cmd({ op: 'simlight', on: false });
    h.advance(0.5);
    waitFor(h, { op: 'calib', step: 'dark' });
    h.cmd({ op: 'simlight', on: true, az: -45, el: 30 });
    h.advance(8);
    const frame = h.last();
    expect(frame.st).toBe('locked');
    expect(offAxis(frame.pan, frame.tilt, -45, 30)).toBeLessThan(6);
  });

  it('warn in the event log when a dark capture sees the lamp', () => {
    const h = setup();
    h.advance(4);
    const { ack } = waitFor(h, { op: 'calib', step: 'dark' });
    const data = (ack as Extract<AckMessage, { ok: true }>).data as ReturnType<typeof report>;
    expect(data.weak).toEqual([true, true, true, true]);
    expect(h.of('evt').pop()).toMatchObject({ lvl: 'warn', msg: 'calibration dark captured, but L R U D hardly differ between dark and bright, not saved yet' });
  });

  it('take values typed in, as a list or by sensor name, and refuse others', () => {
    const h = setup();
    expect(h.cmd({ op: 'calib', step: 'dark', values: [200, 210, 220, 230] })).toMatchObject({ ok: true, data: { dark: [200, 210, 220, 230] } });
    expect(h.cmd({ op: 'calib', step: 'bright', values: { L: 7000, r: 7100, U: 7200, d: 7300 } })).toMatchObject({ ok: true, data: { bright: [7000, 7100, 7200, 7300] } });
    expect(h.engine.calib.dark).toEqual([200, 210, 220, 230]);
    for (const values of [[1, 2, 3], [1, 2, 3, 9000], ['1', 2, 3, 4], 'dark', { l: 1 }]) {
      expect(h.cmd({ op: 'calib', step: 'dark', values })).toMatchObject({ ok: false, err: 'bad' });
    }
  });

  it('answer bad when stopped before the second is over', () => {
    const h = setup();
    const before = h.out.length;
    h.cmd({ op: 'calib', step: 'dark' });
    h.advance(0.3);
    expect(h.cmd({ op: 'stop' })).toMatchObject({ ok: true, data: { stopped: true } });
    const acks = h.out.slice(before).filter((m): m is AckMessage => m.t === 'ack');
    expect(acks[0]).toMatchObject({ ok: false, err: 'bad' });
  });

  it('do not answer a page that came after the one that asked', () => {
    const h = setup();
    h.cmd({ op: 'calib', step: 'bright' });
    h.engine.stop();
    const again: ServerMessage[] = [];
    h.engine.start((m) => again.push(m));
    h.advance(2);
    expect(again.some((m) => m.t === 'ack')).toBe(false);
  });
});

describe('the polarity step', () => {
  it('learns that the wiring matches the docs, in front and behind the zenith, in under 5 s', () => {
    for (const lamp of [
      { az: 25, el: 40 },
      { az: 150, el: 40 }
    ]) {
      const h = setup();
      h.cmd({ op: 'simlight', ...lamp });
      h.advance(8);
      const { ack, took } = waitFor(h, { op: 'calib', step: 'polarity' });
      expect(ack).toMatchObject({ ok: true, data: { sx: 1, sy: 1 } });
      const data = (ack as Extract<AckMessage, { ok: true }>).data as { dx: number; dy: number };
      expect(Math.abs(data.dx)).toBeGreaterThan(0.005);
      expect(data.dy).toBeLessThan(0);
      expect(took).toBeLessThan(5);
    }
  });

  it('turns a wrong loop sign back round', () => {
    const h = setup();
    h.advance(6);
    const wrong = copyCalibration(h.engine.calib);
    wrong.sx = -1;
    h.engine.setCalibration(wrong);
    const { ack } = waitFor(h, { op: 'calib', step: 'polarity' });
    expect(ack).toMatchObject({ ok: true, data: { sx: 1, sy: 1 } });
    expect(h.engine.calib.sx).toBe(1);
  });

  it('refuses in the dark and with the head flat, and says why in the event log', () => {
    const h = setup();
    h.cmd({ op: 'simlight', on: false, amb: 1 });
    h.advance(1);
    expect(waitFor(h, { op: 'calib', step: 'polarity' }).ack).toMatchObject({ ok: false, err: 'bad' });
    expect(h.of('evt').pop()!.msg).toBe('polarity failed, needs light on the sensors, point a lamp at the head');
    h.cmd({ op: 'simlight', on: true, amb: 60, az: 0, el: 88 });
    h.advance(8);
    expect(waitFor(h, { op: 'calib', step: 'polarity' }).ack).toMatchObject({ ok: false, err: 'bad' });
    expect(h.of('evt').pop()!.msg).toBe('polarity failed, tilt the head at least 11 degrees away from flat first');
  });
});

describe('zero, save and reset', () => {
  it('takes the pulses going out now as the centre without moving the head', () => {
    const h = setup();
    h.cmd({ op: 'target', pan: 30, tilt: 60 });
    h.advance(3);
    // in manual the old target would drive the head back to it, hold keeps it still
    h.cmd({ op: 'mode', mode: 'hold' });
    const { ack } = waitFor(h, { op: 'calib', step: 'zero' });
    // pan 30 is 1500 + 30 * 2000 / 180 us, tilt 60 is 1500 - 30 * 2000 / 180 us
    expect(ack).toMatchObject({ ok: true, data: { pan_us: 1833, tilt_us: 1167, pan: 0, tilt: 90 } });
    expect(h.engine.servo.pan).toBeCloseTo(30, 0);
    expect(h.engine.servo.tilt).toBeCloseTo(60, 0);
    h.advance(1);
    expect(h.last()).toMatchObject({ pan: 0, tilt: 90 });
    expect(h.of('evt').pop()!.msg).toBe('servo centre set to 1833 and 1167 us, not saved yet');
    expect(h.cmd({ op: 'calib', step: 'reset' })).toMatchObject({ ok: true });
    h.advance(0.1);
    expect(h.last().pan).toBeCloseTo(30, 0);
    expect(h.engine.servo.pan).toBeCloseTo(30, 0);
  });

  it('takes pulses given in values and refuses ones out of range', () => {
    const h = setup();
    expect(h.cmd({ op: 'calib', step: 'zero', values: { pan_us: 1520, tilt_us: 1480 } })).toMatchObject({ ok: true, data: { pan_us: 1520, tilt_us: 1480 } });
    expect(h.engine.calib.pan.centreUs).toBe(1520);
    expect(h.cmd({ op: 'calib', step: 'zero', values: { pan_us: 3000 } })).toMatchObject({ ok: false, err: 'bad' });
  });

  it('saves, resets to the defaults and is busy while an activity runs', () => {
    const h = setup();
    h.cmd({ op: 'calib', step: 'dark', values: [1, 2, 3, 4] });
    expect(h.cmd({ op: 'calib', step: 'save' })).toMatchObject({ ok: true, data: { dark: [1, 2, 3, 4] } });
    expect(h.engine.calibSaved).toBe(true);
    expect(h.cmd({ op: 'calib', step: 'reset' })).toMatchObject({ ok: true });
    expect(h.engine.calib.dark[0]).toBeGreaterThan(100);
    expect(h.engine.calibSaved).toBe(false);
    h.cmd({ op: 'scan', step: 45 });
    expect(h.cmd({ op: 'calib', step: 'zero' })).toMatchObject({ ok: false, err: 'busy' });
    expect(h.cmd({ op: 'calib', step: 'dark' })).toMatchObject({ ok: false, err: 'busy' });
    expect(h.cmd({ op: 'calib', step: 'wiggle' })).toMatchObject({ ok: false, err: 'bad' });
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEngine, MAX_CATCH_UP } from './engine';
import type { ServerMessage, StateFrame, SysFrame } from '$lib/link/protocol';

const WALL = 1_700_000_000_000;
const DT = 0.02;

// the engine on its own timers, with a clock the test moves along with them
function live() {
  let ms = 0;
  const engine = createEngine({ seed: 3, wander: false, clock: () => ms, now: () => WALL + ms });
  const out: ServerMessage[] = [];
  engine.start((m) => out.push(m));
  // exactly one timer tick, gap milliseconds after the last one
  const tick = (gap: number) => {
    ms += gap;
    vi.advanceTimersToNextTimer();
  };
  const frames = () => out.filter((m): m is StateFrame => m.t === 's');
  const sys = () => out.filter((m): m is SysFrame => m.t === 'sys');
  return { engine, out, tick, frames, sys };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the loop on its timers', () => {
  it('runs 50 steps and 20 frames a second and measures a loop rate of 50', () => {
    const { engine, tick, frames, sys } = live();
    for (let i = 0; i < 150; i++) tick(20);
    expect(engine.t).toBeCloseTo(3, 6);
    expect(frames()).toHaveLength(61);
    expect(sys()).toHaveLength(3);
    expect(sys().at(-1)!.hz).toBe(50);
    expect(sys().at(-1)!.jit).toBe(0);
    engine.stop();
  });

  it('catches up at most a quarter of a second after the tab slept, then runs on', () => {
    const { engine, tick, frames } = live();
    for (let i = 0; i < 50; i++) tick(20);
    const before = engine.t;
    const count = frames().length;
    // the tab was hidden for half a minute, then one timer fires
    tick(30000);
    // what is left over from the last tick may add one step
    expect(engine.t - before).toBeLessThanOrEqual(MAX_CATCH_UP + DT + 1e-9);
    expect(engine.t - before).toBeGreaterThan(MAX_CATCH_UP - DT);
    const burst = frames().slice(count);
    expect(burst.length).toBeLessThanOrEqual(6);
    // the frames of the burst carry the times of their steps, spread over the
    // quarter second before the wall clock
    const wall = (WALL + 31000) / 1000;
    expect(burst.at(-1)!.ts).toBeLessThanOrEqual(wall);
    expect(burst[0].ts).toBeGreaterThanOrEqual(wall - MAX_CATCH_UP - DT);
    // 20 frames a second on 50 steps a second come every second or third step
    for (let i = 1; i < burst.length; i++) {
      const gap = burst[i].ts - burst[i - 1].ts;
      expect(gap).toBeGreaterThan(0.039);
      expect(gap).toBeLessThan(0.061);
    }
    const after = engine.t;
    tick(20);
    expect(engine.t - after).toBeCloseTo(0.02, 6);
    engine.stop();
  });

  it('never spirals on a machine that is late every time, each tick does a bounded amount', () => {
    const { engine, tick, sys } = live();
    let worst = 0;
    for (let i = 0; i < 40; i++) {
      const before = engine.t;
      tick(400);
      worst = Math.max(worst, engine.t - before);
    }
    expect(worst).toBeLessThanOrEqual(MAX_CATCH_UP + DT + 1e-9);
    // the real rate shows what the machine manages, a quarter second of loop per 0.4 s
    const hz = sys().at(-1)!.hz;
    expect(hz).toBeGreaterThan(25);
    expect(hz).toBeLessThan(35);
    engine.stop();
  });

  it('measures the jitter of the timer in milliseconds', () => {
    const { engine, tick, sys } = live();
    for (let i = 0; i < 100; i++) tick(i % 2 === 0 ? 16 : 24);
    expect(sys().at(-1)!.jit).toBeCloseTo(4, 1);
    expect(sys().at(-1)!.hz).toBeCloseTo(50, 0);
    engine.stop();
  });

  it('keeps the frame times rising through slow and fast ticks', () => {
    const { engine, tick, frames } = live();
    const gaps = [20, 20, 35, 5, 120, 20, 2000, 20, 20, 60, 20];
    for (let round = 0; round < 10; round++) for (const gap of gaps) tick(gap);
    const ts = frames().map((f) => f.ts);
    for (let i = 1; i < ts.length; i++) expect(ts[i]).toBeGreaterThan(ts[i - 1]);
    engine.stop();
  });

  it('stops every timer on stop and starts them again on the next start', () => {
    const { engine, tick, out } = live();
    tick(100);
    engine.stop();
    const count = out.length;
    tick(1000);
    expect(out.length).toBe(count);
    expect(vi.getTimerCount()).toBe(0);
    engine.start(() => undefined);
    expect(vi.getTimerCount()).toBe(1);
    engine.stop();
  });
});

// a simulated page for the engine tests: it records every message, moves both
// clocks with the loop like a browser would and sends commands with fresh ids

import { createEngine, type EngineOptions } from './engine';
import type { AckMessage, CmdMessage, ServerMessage, StateFrame } from '$lib/link/protocol';

export const START_MS = 1_700_000_000_000;

export function harness(options: EngineOptions = {}) {
  let ms = START_MS;
  // the lamp stays still unless a test asks for the idle wandering
  const engine = createEngine({ seed: 11, timers: false, wander: false, now: () => ms, clock: () => ms, ...options });
  const out: ServerMessage[] = [];
  engine.start((message) => out.push(message));
  // calls back after every tick, for checks that look at each step
  const advance = (seconds: number, each?: () => void) => {
    const ticks = Math.round(seconds * 50);
    for (let i = 0; i < ticks; i++) {
      ms += 20;
      engine.advance(0.02);
      each?.();
    }
  };
  let next = 0;
  const cmd = (body: Record<string, unknown>): AckMessage | undefined => {
    const id = `t${++next}`;
    engine.handle({ t: 'cmd', id, ...body } as CmdMessage);
    return out.filter((m): m is AckMessage => m.t === 'ack' && m.id === id).pop();
  };
  const unlock = () => engine.handle({ t: 'auth', pin: '' });
  const frames = () => out.filter((m): m is StateFrame => m.t === 's');
  const last = () => frames().pop()!;
  const of = <T extends ServerMessage['t']>(t: T) => out.filter((m): m is Extract<ServerMessage, { t: T }> => m.t === t);
  const clock = {
    get ms() {
      return ms;
    },
    set ms(value: number) {
      ms = value;
    }
  };
  return { engine, out, advance, cmd, unlock, frames, last, of, clock };
}

// the biggest change of axis speed between two frames, per second, and the
// biggest speed, over frames that came at a steady rate
export function motionBounds(frames: StateFrame[]): { accel: number; speed: number } {
  let accel = 0;
  let speed = 0;
  for (let i = 1; i < frames.length; i++) {
    const dt = frames[i].ts - frames[i - 1].ts;
    if (dt <= 0) continue;
    accel = Math.max(accel, Math.abs(frames[i].vp - frames[i - 1].vp) / dt, Math.abs(frames[i].vt - frames[i - 1].vt) / dt);
    speed = Math.max(speed, Math.abs(frames[i].vp), Math.abs(frames[i].vt));
  }
  return { accel, speed };
}

// any NaN or Infinity anywhere inside a message
export function hasBadNumber(value: unknown): boolean {
  if (typeof value === 'number') return !Number.isFinite(value);
  if (Array.isArray(value)) return value.some(hasBadNumber);
  if (value && typeof value === 'object') return Object.values(value).some(hasBadNumber);
  return false;
}

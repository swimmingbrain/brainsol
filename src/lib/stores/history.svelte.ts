// the last ten minutes of the stream for the charts. the samples live in the
// ring, outside svelte. version is the one rune: it ticks at most 10 times a
// second after new samples, a chart redraws when it changes

import { Ring, type HistoryColumn, type HistorySample } from './ring';
import type { HistoryResponse, StateFrame } from '$lib/link/protocol';

// ten minutes at the full 20 Hz
export const HISTORY_SECONDS = 600;
export const HISTORY_CAPACITY = HISTORY_SECONDS * 20;
export const TICK_EVERY = 100;

export function sampleOf(frame: StateFrame): HistorySample {
  return {
    time: frame.ts,
    pan: frame.pan,
    tilt: frame.tilt,
    lvl: frame.lvl,
    lux: frame.lux,
    pmw: frame.pmw,
    off: frame.off,
    gain: frame.gain,
    ex: frame.ex,
    ey: frame.ey
  };
}

export class History {
  readonly ring: Ring;
  version = $state(0);
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastTick = -Infinity;
  private now: () => number;

  constructor(capacity = HISTORY_CAPACITY, now: () => number = () => performance.now()) {
    this.ring = new Ring(capacity);
    this.now = now;
  }

  get length(): number {
    return this.ring.length;
  }

  push(frame: StateFrame): void {
    this.ring.push(sampleOf(frame));
    this.tick();
  }

  clear(): void {
    this.ring.clear();
    this.tick();
  }

  // the 1 Hz history of the tracker goes in front of what the stream has
  // brought so far, nothing older than the ring can hold
  prefill(response: HistoryResponse): void {
    if (!response || !Array.isArray(response.rows) || !Array.isArray(response.cols)) return;
    const columns = response.cols as HistoryColumn[];
    const firstLive = this.ring.length > 0 ? (this.ring.get('time', 0) ?? Infinity) : Infinity;
    const kept: HistorySample[] = [];
    for (let i = 0; i < this.ring.length; i++) {
      const sample: HistorySample = {};
      for (const name of Object.keys(this.ring.columns) as HistoryColumn[]) sample[name] = this.ring.get(name, i);
      kept.push(sample);
    }
    this.ring.clear();
    const room = this.ring.capacity - kept.length;
    const rows = response.rows.slice(Math.max(0, response.rows.length - room));
    const offset = response.rows.length - rows.length;
    rows.forEach((row, i) => {
      const time = response.t0 + (offset + i) * response.dt;
      if (time >= firstLive) return;
      const sample: HistorySample = { time };
      columns.forEach((name, c) => {
        if (name !== 'time') sample[name] = row[c];
      });
      this.ring.push(sample);
    });
    for (const sample of kept) this.ring.push(sample);
    this.tick();
  }

  private tick(): void {
    if (this.timer) return;
    const wait = Math.max(0, TICK_EVERY - (this.now() - this.lastTick));
    this.timer = setTimeout(() => {
      this.timer = null;
      this.lastTick = this.now();
      this.version++;
    }, wait);
  }
}

export const history = new History();

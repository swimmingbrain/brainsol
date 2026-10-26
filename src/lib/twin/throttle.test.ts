import { describe, expect, it } from 'vitest';
import { throttle, type Clock } from './throttle';

// a clock the test moves by hand
function fakeClock() {
  let now = 0;
  let timers: { at: number; fn: () => void; id: number }[] = [];
  let seq = 0;
  const clock: Clock = {
    now: () => now,
    later: (fn, ms) => {
      const id = ++seq;
      timers.push({ at: now + ms, fn, id });
      return id;
    },
    clear: (id) => {
      timers = timers.filter((t) => t.id !== id);
    }
  };
  const advance = (ms: number) => {
    const end = now + ms;
    for (;;) {
      timers.sort((a, b) => a.at - b.at);
      const next = timers[0];
      if (!next || next.at > end) break;
      timers.shift();
      now = next.at;
      next.fn();
    }
    now = end;
  };
  return { clock, advance };
}

describe('throttle', () => {
  it('sends the first call at once', () => {
    const { clock } = fakeClock();
    const sent: number[] = [];
    const t = throttle((v: number) => sent.push(v), 50, clock);
    t.call(1);
    expect(sent).toEqual([1]);
  });

  it('sends at most one call per interval, always the newest', () => {
    const { clock, advance } = fakeClock();
    const sent: number[] = [];
    const t = throttle((v: number) => sent.push(v), 50, clock);
    // a drag at 100 events a second for half a second
    for (let i = 0; i < 50; i++) {
      t.call(i);
      advance(10);
    }
    advance(100);
    expect(sent.length).toBeGreaterThanOrEqual(10);
    expect(sent.length).toBeLessThanOrEqual(11);
    expect(sent[sent.length - 1]).toBe(49);
    for (let i = 1; i < sent.length; i++) expect(sent[i]).toBeGreaterThan(sent[i - 1]);
  });

  it('never loses the last call', () => {
    const { clock, advance } = fakeClock();
    const sent: string[] = [];
    const t = throttle((v: string) => sent.push(v), 50, clock);
    t.call('a');
    t.call('b');
    t.call('c');
    expect(sent).toEqual(['a']);
    advance(50);
    expect(sent).toEqual(['a', 'c']);
  });

  it('sends what waits on flush and nothing twice', () => {
    const { clock, advance } = fakeClock();
    const sent: number[] = [];
    const t = throttle((v: number) => sent.push(v), 50, clock);
    t.call(1);
    t.call(2);
    t.flush();
    expect(sent).toEqual([1, 2]);
    advance(200);
    t.flush();
    expect(sent).toEqual([1, 2]);
  });

  it('drops what waits on cancel', () => {
    const { clock, advance } = fakeClock();
    const sent: number[] = [];
    const t = throttle((v: number) => sent.push(v), 50, clock);
    t.call(1);
    t.call(2);
    t.cancel();
    advance(200);
    expect(sent).toEqual([1]);
  });
});

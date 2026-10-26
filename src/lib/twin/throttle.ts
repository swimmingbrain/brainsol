// at most one call per interval with the newest arguments. the first call goes
// out at once, the last one is never lost: it follows when the interval is up,
// or right away on flush, so a drag that stops lands exactly where it stopped

export interface Throttled<A extends unknown[]> {
  call(...args: A): void;
  flush(): void;
  cancel(): void;
}

export interface Clock {
  now: () => number;
  later: (fn: () => void, ms: number) => unknown;
  clear: (handle: unknown) => void;
}

const realClock: Clock = {
  now: () => performance.now(),
  later: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>)
};

export function throttle<A extends unknown[]>(fn: (...args: A) => void, every: number, clock: Clock = realClock): Throttled<A> {
  let last = -Infinity;
  let pending: A | null = null;
  let handle: unknown = null;

  const stopTimer = () => {
    if (handle !== null) clock.clear(handle);
    handle = null;
  };

  const run = () => {
    handle = null;
    if (!pending) return;
    const args = pending;
    pending = null;
    last = clock.now();
    fn(...args);
  };

  return {
    call(...args: A) {
      pending = args;
      const wait = every - (clock.now() - last);
      if (wait <= 0) {
        stopTimer();
        run();
      } else if (handle === null) {
        handle = clock.later(run, wait);
      }
    },
    flush() {
      stopTimer();
      run();
    },
    cancel() {
      stopTimer();
      pending = null;
    }
  };
}

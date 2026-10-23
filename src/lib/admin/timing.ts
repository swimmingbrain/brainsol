// two small timers the controls share. debounce waits until the hand stops
// (a tuning slider), throttle passes the first call at once and then at most
// one per interval, always ending on the newest value (a light that is dragged)

export interface Timed<A extends unknown[]> {
  call(...args: A): void;
  // runs a waiting call right now
  flush(): void;
  // drops a waiting call
  cancel(): void;
  readonly waiting: boolean;
}

export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number): Timed<A> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let last: A | null = null;

  function fire() {
    if (timer) clearTimeout(timer);
    timer = null;
    const args = last;
    last = null;
    if (args) fn(...args);
  }

  return {
    call(...args: A) {
      last = args;
      if (timer) clearTimeout(timer);
      timer = setTimeout(fire, ms);
    },
    flush: fire,
    cancel() {
      if (timer) clearTimeout(timer);
      timer = null;
      last = null;
    },
    get waiting() {
      return last !== null;
    }
  };
}

export function throttle<A extends unknown[]>(fn: (...args: A) => void, ms: number): Timed<A> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let last: A | null = null;

  function open() {
    timer = setTimeout(() => {
      timer = null;
      if (last) {
        const args = last;
        last = null;
        fn(...args);
        open();
      }
    }, ms);
  }

  return {
    call(...args: A) {
      if (timer) {
        last = args;
        return;
      }
      fn(...args);
      open();
    },
    flush() {
      if (timer) clearTimeout(timer);
      timer = null;
      const args = last;
      last = null;
      if (args) fn(...args);
    },
    cancel() {
      if (timer) clearTimeout(timer);
      timer = null;
      last = null;
    },
    get waiting() {
      return last !== null;
    }
  };
}

// how long a pin stays locked after too many wrong tries. lockedUntil is the
// Date.now time from the connection store, 0 when nothing is locked

export function secondsLeft(lockedUntil: number, now: number): number {
  if (!Number.isFinite(lockedUntil) || lockedUntil <= now) return 0;
  return Math.ceil((lockedUntil - now) / 1000);
}

// short waits read in seconds, the doubling lock soon needs minutes
export function waitText(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  if (s < 60) return `${s} s`;
  const minutes = Math.floor(s / 60);
  const rest = s % 60;
  return `${minutes}:${String(rest).padStart(2, '0')} min`;
}

// calls back once a second while the lock runs and once more at zero, the
// returned function stops it early
export function tick(
  lockedUntil: number,
  onTick: (seconds: number) => void,
  clock: { now: () => number; every: (fn: () => void, ms: number) => () => void } = {
    now: Date.now,
    every: (fn, ms) => {
      const id = setInterval(fn, ms);
      return () => clearInterval(id);
    }
  }
): () => void {
  let left = secondsLeft(lockedUntil, clock.now());
  onTick(left);
  if (left === 0) return () => {};
  // a quarter second keeps the shown number within one tick of the truth
  const stop = clock.every(() => {
    const next = secondsLeft(lockedUntil, clock.now());
    if (next === left) return;
    left = next;
    onTick(left);
    if (left === 0) stop();
  }, 250);
  return stop;
}

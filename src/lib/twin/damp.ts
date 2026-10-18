// easing for everything that moves in the scene. a critically damped spring
// reaches its target as fast as it can without ever swinging past it, and the
// step below is the exact solution for a target that holds still during the
// step, so a phone at 30 fps and a monitor at 144 fps end up at the same place

export interface Spring {
  x: number;
  v: number;
}

export function spring(x = 0): Spring {
  return { x, v: 0 };
}

// omega is the stiffness in 1/s, the spring covers most of a jump in about 4 / omega seconds
export function springStep(s: Spring, target: number, omega: number, dt: number): void {
  if (!(dt > 0)) return;
  if (!Number.isFinite(target)) return;
  const delta = s.x - target;
  const decay = Math.exp(-omega * dt);
  const temp = (s.v + omega * delta) * dt;
  s.v = (s.v - omega * temp) * decay;
  s.x = target + (delta + temp) * decay;
}

// close enough to stop rendering, the rest would not show on screen
export function settled(s: Spring, target: number, eps = 1e-3): boolean {
  return Math.abs(s.x - target) < eps && Math.abs(s.v) < eps * 10;
}

// snaps a resting spring onto its target, so the next comparison is exact
export function settle(s: Spring, target: number, eps = 1e-3): boolean {
  if (!settled(s, target, eps)) return false;
  s.x = target;
  s.v = 0;
  return true;
}

// share of the way an exponential follower covers in dt, the same at any frame rate
export function follow(rate: number, dt: number): number {
  return dt > 0 ? 1 - Math.exp(-rate * dt) : 0;
}

// the idle life of the simulation. a visitor who only watches sees the lamp
// drift slowly across the sky and the tracker follow it. the path is drawn in
// pose space, as the pan and tilt of a panel that would face the lamp: two
// slow sums of sines with periods that never line up. tilt passes 90 about
// once a minute, so the lamp crosses the zenith and spends half its time
// behind the tracker, and the head shows the move over the top. pan stays
// well inside the soft limits, so the head never has to swing round the side.
// the first time someone moves the lamp or the mode the engine stops it for good

import type { Light } from './physics';

// the lamp waits this long so the tracker can lock first, then eases into its path
export const WANDER_WAIT = 3;
export const WANDER_RAMP = 6;

// periods in seconds of path time, primes so the figure keeps changing
const P_PAN_A = 79;
const P_PAN_B = 127;
const P_TILT_A = 101;
const P_TILT_B = 67;
const TAU = 2 * Math.PI;

// the pose that faces the lamp at path time tau. at tau 0 it is pan 25 tilt 40,
// the phone light the engine starts with, so nothing jumps
export function wanderPose(tau: number, out = { pan: 0, tilt: 0 }): { pan: number; tilt: number } {
  out.pan = 25 * Math.cos((TAU * tau) / P_PAN_A) + 45 * Math.sin((TAU * tau) / P_PAN_B);
  out.tilt = 90 - 50 * Math.cos((TAU * tau) / P_TILT_A) + 25 * Math.sin((TAU * tau) / P_TILT_B);
  return out;
}

// 0 while waiting, then a smooth rise to 1, the share of path time per second
export function wanderPace(t: number): number {
  const x = (t - WANDER_WAIT) / WANDER_RAMP;
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  return x * x * (3 - 2 * x);
}

export class Wander {
  // seconds since the start and path time
  t = 0;
  tau = 0;
  private pose = { pan: 0, tilt: 0 };

  // moves the lamp along the path, in place
  step(dt: number, light: Light): void {
    this.t += dt;
    this.tau += wanderPace(this.t) * dt;
    const p = wanderPose(this.tau, this.pose);
    // the direction a panel at that pose faces, as azimuth and elevation. past
    // tilt 90 it looks backwards, the azimuth turns half round
    const back = p.tilt > 90;
    light.el = back ? 180 - p.tilt : p.tilt;
    const az = back ? p.pan + 180 : p.pan;
    light.az = az > 180 ? az - 360 : az;
  }
}

// the camera on a sphere around the tracker. azimuth like the lights,
// clockwise from the front seen from above, elevation above the table and a
// distance. input sets where the camera should be, the springs bring it there,
// so a flick of the mouse or a reset glides instead of jumping

import { clamp, DEG, type Vec3 } from '$lib/sim/kinematics';
import { settle, spring, springStep } from './damp';

export interface View {
  az: number;
  el: number;
  dist: number;
}

export interface OrbitLimits {
  minEl: number;
  maxEl: number;
  // as a share of the home distance
  minZoom: number;
  maxZoom: number;
}

export const LIMITS: OrbitLimits = { minEl: 3, maxEl: 84, minZoom: 0.5, maxZoom: 1.8 };

// stiffness of the camera springs, quick enough to feel direct
const OMEGA = 16;

export function cameraPosition(target: Vec3, view: View): Vec3 {
  const a = view.az * DEG;
  const e = view.el * DEG;
  return [target[0] + view.dist * Math.sin(a) * Math.cos(e), target[1] + view.dist * Math.cos(a) * Math.cos(e), target[2] + view.dist * Math.sin(e)];
}

export class Orbit {
  // where input wants the camera
  goal: View;
  private az = spring();
  private el = spring();
  private dist = spring();

  constructor(
    private home: View,
    private limits: OrbitLimits = LIMITS
  ) {
    this.goal = { ...home };
    this.snap();
  }

  get view(): View {
    return { az: this.az.x, el: this.el.x, dist: this.dist.x };
  }

  // a new home, for a new stage size. the zoom people chose stays as a share
  setHome(home: View, snap = false): void {
    const zoom = this.goal.dist / this.home.dist;
    this.home = { ...home };
    this.goal.dist = clamp(home.dist * zoom, this.minDist, this.maxDist);
    if (snap) {
      this.goal = { ...home };
      this.snap();
    }
  }

  get minDist(): number {
    return this.home.dist * this.limits.minZoom;
  }

  get maxDist(): number {
    return this.home.dist * this.limits.maxZoom;
  }

  rotate(dAz: number, dEl: number): void {
    if (!Number.isFinite(dAz) || !Number.isFinite(dEl)) return;
    this.goal.az += dAz;
    this.goal.el = clamp(this.goal.el + dEl, this.limits.minEl, this.limits.maxEl);
  }

  // factor above 1 moves away. false when the limit holds the camera where it is
  zoom(factor: number): boolean {
    if (!(factor > 0) || !Number.isFinite(factor)) return false;
    const before = this.goal.dist;
    this.goal.dist = clamp(before * factor, this.minDist, this.maxDist);
    return Math.abs(this.goal.dist - before) > 1e-6;
  }

  // back to the home view the short way round
  reset(): void {
    const turns = Math.round((this.az.x - this.home.az) / 360);
    this.goal = { ...this.home, az: this.home.az + turns * 360 };
  }

  // true while the camera still moves
  step(dt: number): boolean {
    springStep(this.az, this.goal.az, OMEGA, dt);
    springStep(this.el, this.goal.el, OMEGA, dt);
    springStep(this.dist, this.goal.dist, OMEGA, dt);
    const a = settle(this.az, this.goal.az, 0.01);
    const e = settle(this.el, this.goal.el, 0.01);
    const d = settle(this.dist, this.goal.dist, 0.05);
    return !(a && e && d);
  }

  private snap(): void {
    this.az = spring(this.goal.az);
    this.el = spring(this.goal.el);
    this.dist = spring(this.goal.dist);
  }
}

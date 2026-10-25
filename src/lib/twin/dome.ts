// the sky around the tracker as a sphere of thin lines, centred on the tilt
// axis so a direction from the panel is a point on it. the part above the
// horizon is the sky, below it the sphere runs on down to the table and fades.
// it lives in the back scene, the tracker is always drawn over it

import { Group } from 'three';
import type { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { DEG, type Vec3 } from '$lib/sim/kinematics';
import { segments, setLineColor, skyFade, type LineKit, type SkyFade } from './lines';
import { mix } from './ramp';
import type { Palette } from './palette';
import { onSphere } from './sky';

const RING_STEPS = 120;
const MERIDIAN_STEP = 30;
const PARALLELS = [30, 60];

export class Dome {
  readonly object = new Group();
  private grid: LineSegments2;
  private horizon: LineSegments2;
  private below: LineSegments2;
  private fades: SkyFade[] = [];

  constructor(
    private kit: LineKit,
    readonly centre: Vec3,
    readonly radius: number
  ) {
    this.object.name = 'sky';
    // where the sphere meets the table, below the horizon
    const floor = centre[2] < radius ? -Math.asin(centre[2] / radius) / DEG : -90;
    const ring = (el: number) => {
      const points: Vec3[] = [];
      for (let i = 0; i <= RING_STEPS; i++) points.push(onSphere(centre, radius, (i / RING_STEPS) * 360, el));
      return segments(points);
    };
    const meridian = (az: number, from: number, to: number) => {
      const points: Vec3[] = [];
      const n = Math.max(2, Math.ceil(Math.abs(to - from) / 3));
      for (let i = 0; i <= n; i++) points.push(onSphere(centre, radius, az, from + ((to - from) * i) / n));
      return segments(points);
    };

    const grid: number[] = [];
    for (const el of PARALLELS) grid.push(...ring(el));
    // the meridians stop short of the zenith, where they would all meet in a knot
    for (let az = 0; az < 360; az += MERIDIAN_STEP) grid.push(...meridian(az, 0, 82));
    const below: number[] = [];
    for (let el = -15; el > floor + 4; el -= 15) below.push(...ring(el));
    for (let az = 0; az < 360; az += MERIDIAN_STEP) below.push(...meridian(az, floor + 1.5, 0));

    this.grid = kit.make(grid, { width: 1, depthTest: false });
    this.horizon = kit.make(ring(0), { width: 1.25, depthTest: false });
    this.below = kit.make(below, { width: 1, depthTest: false });
    this.grid.renderOrder = 3;
    this.horizon.renderOrder = 3;
    this.below.renderOrder = 3;
    this.fades = [skyFade(this.grid, centre, 0.85, 0.22), skyFade(this.horizon, centre, 1, 0.35), skyFade(this.below, centre, 0.4, 0.1)];
    this.object.add(this.below, this.grid, this.horizon);
  }

  setPalette(p: Palette): void {
    // lines in the chart grid colour are too quiet on the deep background, a
    // step towards the muted text gives them just enough
    setLineColor(this.grid, mix(p.grid, p.muted, p.light ? 0.25 : 0.32));
    setLineColor(this.horizon, mix(p.grid, p.muted, p.light ? 0.5 : 0.55));
    setLineColor(this.below, mix(p.grid, p.muted, 0.2));
  }

  // the grid steps back while a sky map is shown
  setQuiet(quiet: boolean): void {
    const k = quiet ? 0.45 : 1;
    this.fades[0].near.value = 0.85 * k;
    this.fades[0].far.value = 0.22 * k;
  }

  dispose(): void {
    this.kit.dispose(this.grid);
    this.kit.dispose(this.horizon);
    this.kit.dispose(this.below);
  }
}

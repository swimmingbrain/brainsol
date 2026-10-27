// where the light is. the lamp of the simulation and the sun sit as small
// glyphs on the sky sphere, a thin beam runs from the light to the panel. a
// tracker without a simulated light gets a faint ray along the panel normal
// while it tracks, because that is where its sensors say the light is.
//
// the glyphs are html on top of the canvas, sharp at every pixel ratio and
// easy to grab. the scene only writes their position and two data flags

import { Color, Group, Raycaster, SRGBColorSpace, Vector3, type Camera, type Object3D } from 'three';
import type { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import type { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import type { StateFrame } from '$lib/link/protocol';
import { angleBetween, direction, type Vec3 } from '$lib/sim/kinematics';
import { follow, settle, spring, springStep } from './damp';
import { Glide } from './glide';
import { setLineColor, type LineKit } from './lines';
import type { Palette } from './palette';
import { mix, type Rgb } from './ramp';
import { add, onSphere, raySphere, scale } from './sky';

// a light this close to the sun is the sun, one glyph is enough
const SAME_LIGHT = 2;
const OMEGA = 20;

export interface Sky {
  az: number;
  el: number;
}

// one light on the sky, eased like the joints
class Source {
  private az = new Glide(true);
  private el = new Glide();
  private azS = spring();
  private elS = spring();
  shown = false;
  on = true;

  get known(): boolean {
    return this.az.has;
  }

  push(az: number, el: number, at: number): void {
    if (!Number.isFinite(az) || !Number.isFinite(el)) return;
    const first = !this.az.has;
    this.az.push(az, at);
    this.el.push(el, at);
    if (first) {
      this.azS = spring(az);
      this.elS = spring(el);
    }
  }

  // jumps to where a hand put it, the stream catches up later
  hold(az: number, el: number, at: number): void {
    const near = this.azS.x + (((((az - this.azS.x + 180) % 360) + 360) % 360) - 180);
    this.az.reset(near, at);
    this.el.reset(el, at);
    this.azS = spring(near);
    this.elS = spring(el);
  }

  step(now: number, dt: number): boolean {
    if (!this.az.has) return false;
    const a = this.az.sample(now);
    const e = this.el.sample(now);
    springStep(this.azS, a, OMEGA, dt);
    springStep(this.elS, e, OMEGA, dt);
    const restA = settle(this.azS, a, 0.002);
    const restE = settle(this.elS, e, 0.002);
    return !(restA && restE) || this.az.moving(now) || this.el.moving(now);
  }

  get sky(): Sky {
    return { az: this.azS.x, el: this.elS.x };
  }
}

export class Lights {
  readonly object = new Group();
  readonly lamp = new Source();
  readonly sun = new Source();
  private beam: LineSegments2;
  private ray: LineSegments2;
  private rayAlpha = 0;
  private rayGoal = 0;
  private raycaster = new Raycaster();
  private glyphs: { lamp: HTMLElement | null; sun: HTMLElement | null } = { lamp: null, sun: null };
  // what the last frame said, for the glyphs and the ray
  private state = { lamp: false, sun: false, ray: false };
  // a hand on the lamp, the lamp follows the hand and not the stream
  dragging = false;
  private heldUntil = 0;

  constructor(
    private kit: LineKit,
    readonly centre: Vec3,
    readonly radius: number
  ) {
    this.object.name = 'light';
    this.beam = kit.make([0, 0, 0, 0, 0, 1], { width: 1.25, opacity: 0.6 });
    this.ray = kit.make([0, 0, 0, 0, 0, 1], { width: 1.5, opacity: 0 });
    (this.ray.geometry as LineSegmentsGeometry).setColors([1, 1, 1, 0, 0, 0]);
    (this.ray.material as unknown as { vertexColors: boolean }).vertexColors = true;
    this.beam.visible = false;
    this.ray.visible = false;
    this.object.add(this.beam, this.ray);
  }

  bind(lamp: HTMLElement | null, sun: HTMLElement | null): void {
    this.glyphs = { lamp, sun };
  }

  // a new frame. sim is the lamp, sun the sun, neither means a real tracker
  intake(frame: StateFrame, at: number): void {
    const sim = frame.sim ?? null;
    const sun = frame.sun ?? null;
    this.state.sun = Boolean(sun && Number.isFinite(sun.az) && Number.isFinite(sun.el) && sun.el > -0.5);
    if (sun) this.sun.push(sun.az, sun.el, at);
    this.state.lamp = Boolean(sim && Number.isFinite(sim.az) && Number.isFinite(sim.el));
    if (sim) {
      this.lamp.on = sim.on !== false;
      // after a drag the lamp waits until the stream has caught up with the hand
      if (!this.dragging && performance.now() > this.heldUntil) this.lamp.push(sim.az, sim.el, at);
      else if (!this.dragging && this.lamp.known && angleBetween(direction(sim.az, sim.el), direction(this.lamp.sky.az, this.lamp.sky.el)) < 1) this.heldUntil = 0;
    }
    if (this.state.lamp && this.state.sun && sun && sim && angleBetween(direction(sim.az, sim.el), direction(sun.az, sun.el)) < SAME_LIGHT) this.state.lamp = false;
    this.state.ray = !sim && (frame.st === 'tracking' || frame.st === 'locked');
  }

  // the stream went away, nothing is known about the light any more
  clear(): void {
    this.state = { lamp: false, sun: false, ray: false };
  }

  // a hand moved the lamp here
  hold(sky: Sky, release = false): void {
    this.lamp.hold(sky.az, sky.el, performance.now());
    this.lamp.shown = true;
    if (release) this.heldUntil = performance.now() + 1500;
  }

  // stops waiting for the stream, the lamp goes where the tracker says it is
  release(): void {
    this.heldUntil = 0;
  }

  // true while something still eases
  step(now: number, dt: number): boolean {
    let busy = false;
    if (this.lamp.step(now, dt)) busy = true;
    if (this.sun.step(now, dt)) busy = true;
    this.rayGoal = this.state.ray ? 1 : 0;
    this.rayAlpha += (this.rayGoal - this.rayAlpha) * follow(5, dt);
    if (Math.abs(this.rayAlpha - this.rayGoal) > 0.01) busy = true;
    else this.rayAlpha = this.rayGoal;
    return busy;
  }

  get showsLamp(): boolean {
    return (this.state.lamp || this.dragging) && this.lamp.known;
  }

  // what else the lights show, a change of it asks for a new frame
  get signature(): string {
    const s = this.sun.known ? this.sun.sky : null;
    return `${this.state.lamp} ${this.state.sun} ${this.lamp.on} ${this.rayAlpha.toFixed(3)} ${s ? `${s.az.toFixed(2)} ${s.el.toFixed(2)}` : ''}`;
  }

  get lampSky(): Sky | null {
    return this.lamp.known ? this.lamp.sky : null;
  }

  position(sky: Sky): Vec3 {
    return onSphere(this.centre, this.radius, sky.az, sky.el);
  }

  // puts beam, ray and glyphs where they belong for this camera and pose
  place(camera: Camera, size: { w: number; h: number }, panel: { centre: Vec3; normal: Vec3 }, blockers: Object3D[]): void {
    const showLamp = this.showsLamp;
    const showSun = this.state.sun && this.sun.known;
    const lit = showSun ? this.sun.sky : showLamp && this.lamp.on ? this.lamp.sky : null;

    this.beam.visible = Boolean(lit);
    if (lit) setSegment(this.beam, this.position(lit), panel.centre);

    const alpha = this.rayAlpha;
    this.ray.visible = alpha > 0.01;
    if (this.ray.visible) {
      const hit = raySphere(panel.centre, panel.normal, this.centre, this.radius);
      const length = hit ? Math.max(20, hit[1] * 0.92) : this.radius * 0.8;
      setSegment(this.ray, panel.centre, add(panel.centre, scale(panel.normal, length)));
      (this.ray.material as unknown as { opacity: number }).opacity = 0.75 * alpha;
    }

    this.placeGlyph(this.glyphs.lamp, showLamp ? this.lamp.sky : null, camera, size, blockers, !this.lamp.on);
    this.placeGlyph(this.glyphs.sun, showSun ? this.sun.sky : null, camera, size, blockers, false);
  }

  private placeGlyph(el: HTMLElement | null, sky: Sky | null, camera: Camera, size: { w: number; h: number }, blockers: Object3D[], off: boolean): void {
    if (!el) return;
    if (!sky) {
      if (el.style.visibility !== 'hidden') el.style.visibility = 'hidden';
      return;
    }
    const p = this.position(sky);
    const v = new Vector3(p[0], p[1], p[2]).project(camera);
    if (v.z > 1) {
      el.style.visibility = 'hidden';
      return;
    }
    const x = ((v.x + 1) / 2) * size.w;
    const y = ((1 - v.y) / 2) * size.h;
    el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    el.style.visibility = 'visible';
    // a light behind the tracker shows faded, the html glyph is always on top
    const from = camera.position;
    const to = new Vector3(p[0], p[1], p[2]);
    const dist = from.distanceTo(to);
    this.raycaster.set(from, to.sub(from).normalize());
    this.raycaster.far = dist - 3;
    const behind = this.raycaster.intersectObjects(blockers, false).length > 0;
    flag(el, 'behind', behind);
    flag(el, 'off', off);
  }

  setPalette(p: Palette): void {
    setLineColor(this.beam, p.accent);
    setLineColor(this.ray, [1, 1, 1]);
    const start = new Color().setRGB(...p.accent, SRGBColorSpace);
    const end = new Color().setRGB(...(mix(p.accent, p.bg, 0.92) as Rgb), SRGBColorSpace);
    (this.ray.geometry as LineSegmentsGeometry).setColors([start.r, start.g, start.b, end.r, end.g, end.b]);
  }

  dispose(): void {
    this.kit.dispose(this.beam);
    this.kit.dispose(this.ray);
    this.object.removeFromParent();
  }
}

function flag(el: HTMLElement, name: string, on: boolean): void {
  if (on && el.dataset[name] !== '') el.dataset[name] = '';
  else if (!on && name in el.dataset) delete el.dataset[name];
}

// moves the one segment of a line in place, without new buffers
export function setSegment(line: LineSegments2, a: Vec3, b: Vec3): void {
  const geometry = line.geometry as LineSegmentsGeometry;
  const start = geometry.getAttribute('instanceStart') as unknown as { data: { array: Float32Array; needsUpdate: boolean } };
  const array = start.data.array;
  array[0] = a[0];
  array[1] = a[1];
  array[2] = a[2];
  array[3] = b[0];
  array[4] = b[1];
  array[5] = b[2];
  start.data.needsUpdate = true;
}

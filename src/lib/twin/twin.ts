// the live 3D twin. one renderer, two scenes: the back holds the table and
// the sky and is always drawn behind, the front holds the tracker and what has
// to pass in front of or behind it. nothing renders unless something changed
// or still eases, a tracker that rests costs no frames at all.
//
// telemetry comes in through the plain fields of the store, never through
// runes: a frame listener only wakes the loop, the loop reads telemetry.frame

import { AmbientLight, Color, DirectionalLight, HemisphereLight, PerspectiveCamera, Scene, SRGBColorSpace, WebGLRenderer } from 'three';
import { telemetry } from '$lib/stores/telemetry.svelte';
import type { StateFrame } from '$lib/link/protocol';
import type { Vec3 } from '$lib/sim/kinematics';
import { STANDIN, STANDIN_ASSEMBLY, type Assembly } from './assembly';
import { settle, spring, springStep } from './damp';
import { Glide } from './glide';
import { Ground } from './ground';
import { cameraPosition, Orbit, type View } from './orbit';
import { readPalette, type Palette } from './palette';
import { panelTexture } from './panelface';
import { Rig } from './rig';
import { standinPieces, type Piece } from './standin';

// the sky sphere around the tilt axis, in millimetres
export const DOME_RADIUS = 210;
// stiffness of the joint springs, the glide already gives the pace
const JOINT_OMEGA = 22;
// the pose before the first frame: parked, panel flat
const PARK = { pan: 0, tilt: 90 };
const FOV = 28;
const MAX_PIXEL_RATIO = 2;

export interface TwinOptions {
  // the 3D context went away or came back
  onContext?: (lost: boolean) => void;
}

// three.js needs webgl 2
export function webglSupported(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return Boolean(gl);
  } catch {
    return false;
  }
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export class Twin {
  private renderer: WebGLRenderer;
  private front = new Scene();
  private back = new Scene();
  private camera = new PerspectiveCamera(FOV, 1, 5, 6000);
  private orbit: Orbit;
  private target: Vec3 = [0, 0, 80];
  private palette: Palette;
  private ground: Ground | null = null;
  private rig: Rig | null = null;
  private assembly: Assembly = STANDIN_ASSEMBLY;
  private lights: { hemi: HemisphereLight; key: DirectionalLight; fill: DirectionalLight; rim: DirectionalLight; ambient: AmbientLight };

  private pan = { glide: new Glide(), spring: spring(PARK.pan) };
  private tilt = { glide: new Glide(), spring: spring(PARK.tilt) };
  private seen: StateFrame | null = null;
  private started = false;

  private raf = 0;
  private last = 0;
  private dirty = true;
  private visible = true;
  private inView = true;
  private lost = false;
  private disposed = false;
  private size = { w: 1, h: 1 };
  private cleanups: (() => void)[] = [];
  // renders so far, for a quick look at how idle the scene is
  renders = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private options: TwinOptions = {}
  ) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.autoClear = false;

    this.camera.up.set(0, 0, 1);
    this.orbit = new Orbit(this.homeView());
    this.palette = readPalette();

    const hemi = new HemisphereLight(0xffffff, 0x444444, 1);
    hemi.position.set(0, 0, 1);
    const key = new DirectionalLight(0xffffff, 2);
    key.position.set(-260, 420, 520);
    const fill = new DirectionalLight(0xffffff, 0.6);
    fill.position.set(420, 120, 160);
    const rim = new DirectionalLight(0xffffff, 0.9);
    rim.position.set(80, -480, 300);
    const ambient = new AmbientLight(0xffffff, 0.2);
    this.lights = { hemi, key, fill, rim, ambient };
    this.front.add(hemi, key, fill, rim, ambient);
    for (const light of [key, fill, rim]) this.front.add(light.target);

    this.useModel(STANDIN_ASSEMBLY, standinPieces());
    this.applyPalette();
    this.watch();
    this.resize();
  }

  // a model to show, the stand in or the cad export
  private useModel(assembly: Assembly, pieces: Record<string, Piece[]>): void {
    this.rig?.dispose();
    this.ground?.object.removeFromParent();
    this.ground?.dispose();
    this.assembly = assembly;
    this.rig = new Rig(assembly, pieces, panelTexture(this.renderer, ...(assembly.panel?.size ?? [125, 85])));
    this.front.add(this.rig.root);
    const centre = this.centre;
    const s = STANDIN.base;
    const bounds = assembly.bounds;
    const footprint = bounds
      ? { x: (bounds.min[0] + bounds.max[0]) / 2, y: (bounds.min[1] + bounds.max[1]) / 2, w: bounds.max[0] - bounds.min[0], d: bounds.max[1] - bounds.min[1], r: s.r }
      : { x: 0, y: 0, w: s.w, d: s.d, r: s.r };
    this.ground = new Ground([centre[0], centre[1]], this.groundRadius, footprint);
    this.back.add(this.ground.object);
    this.target = [centre[0], centre[1] + 12, centre[2] * 0.62];
    this.rig.setPose(this.pan.spring.x, this.tilt.spring.x);
    this.applyPalette();
    this.dirty = true;
    this.wake();
  }

  // the middle of the sky sphere, the tilt axis at pan 0
  get centre(): Vec3 {
    return this.assembly.joints.tilt?.origin ?? [0, 0, 100];
  }

  // where the sphere meets the table
  get groundRadius(): number {
    const h = this.centre[2];
    return h < DOME_RADIUS ? Math.sqrt(DOME_RADIUS * DOME_RADIUS - h * h) : DOME_RADIUS;
  }

  // a three quarter view from the front right that shows the tracker and its sky
  private homeView(): View {
    const aspect = this.size.w / Math.max(1, this.size.h);
    const half = (FOV / 2) * (Math.PI / 180);
    const fit = Math.min(Math.tan(half), Math.tan(half) * aspect);
    const radius = DOME_RADIUS * 0.78;
    return { az: 38, el: 16, dist: radius / fit };
  }

  setPalette(): void {
    this.palette = readPalette();
    this.applyPalette();
  }

  private applyPalette(): void {
    const p = this.palette;
    this.renderer.setClearColor(new Color().setRGB(...p.bg, SRGBColorSpace), 1);
    this.ground?.setPalette(p);
    const { hemi, key, fill, rim, ambient } = this.lights;
    // a bright room asks for softer contrast, the dark page for a clearer rim
    hemi.color.set(p.light ? 0xffffff : 0xf2efe9);
    hemi.groundColor.set(p.light ? 0x9a9aa0 : 0x3a3836);
    hemi.intensity = p.light ? 1.9 : 1.5;
    key.intensity = p.light ? 2.1 : 2.3;
    fill.intensity = p.light ? 0.7 : 0.55;
    rim.intensity = p.light ? 0.6 : 1.1;
    ambient.intensity = p.light ? 0.3 : 0.15;
    this.dirty = true;
    this.wake();
  }

  private watch(): void {
    this.cleanups.push(telemetry.onFrame(() => this.wake()));

    const onVisibility = () => {
      this.visible = document.visibilityState !== 'hidden';
      if (this.visible) {
        this.dirty = true;
        this.wake();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    this.cleanups.push(() => document.removeEventListener('visibilitychange', onVisibility));

    const host = this.canvas.parentElement ?? this.canvas;
    const resize = new ResizeObserver(() => this.resize());
    resize.observe(host);
    this.cleanups.push(() => resize.disconnect());

    const seen = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      this.inView = entry ? entry.isIntersecting : true;
      if (this.inView) {
        this.dirty = true;
        this.wake();
      }
    });
    seen.observe(this.canvas);
    this.cleanups.push(() => seen.disconnect());

    const onLost = (event: Event) => {
      // asking for the context back, three.js rebuilds its state on restore
      event.preventDefault();
      this.lost = true;
      cancelAnimationFrame(this.raf);
      this.raf = 0;
      this.options.onContext?.(true);
    };
    const onRestored = () => {
      this.lost = false;
      this.applyPalette();
      this.resize();
      this.options.onContext?.(false);
    };
    this.canvas.addEventListener('webglcontextlost', onLost);
    this.canvas.addEventListener('webglcontextrestored', onRestored);
    this.cleanups.push(() => {
      this.canvas.removeEventListener('webglcontextlost', onLost);
      this.canvas.removeEventListener('webglcontextrestored', onRestored);
    });
  }

  resize(): void {
    const host = this.canvas.parentElement ?? this.canvas;
    const w = Math.max(1, Math.round(host.clientWidth));
    const h = Math.max(1, Math.round(host.clientHeight));
    if (w === this.size.w && h === this.size.h && !this.dirty) return;
    this.size = { w, h };
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.orbit.setHome(this.homeView(), !this.started);
    this.dirty = true;
    this.wake();
  }

  // asks for one more frame, the loop keeps itself going while things move
  wake(): void {
    if (this.raf || this.disposed || this.lost || !this.visible || !this.inView) return;
    this.raf = requestAnimationFrame(this.tick);
  }

  private tick = (now: number): void => {
    this.raf = 0;
    if (this.disposed || this.lost) return;
    const dt = this.last ? Math.min(0.1, Math.max(0, (now - this.last) / 1000)) : 1 / 60;
    this.last = now;
    const busy = this.update(performance.now(), dt);
    if (this.dirty) this.render();
    if (busy) this.wake();
    else this.last = 0;
  };

  // moves everything one step, true while something still eases
  private update(now: number, dt: number): boolean {
    let busy = false;
    this.intake();

    // the joints: the glide gives a continuous target, the spring rounds it off
    for (const joint of [this.pan, this.tilt]) {
      const goal = joint.glide.has ? joint.glide.sample(now) : joint.spring.x;
      springStep(joint.spring, goal, JOINT_OMEGA, dt);
      if (!settle(joint.spring, goal, 0.002) || joint.glide.moving(now)) busy = true;
    }
    if (this.rig?.setPose(this.pan.spring.x, this.tilt.spring.x)) this.dirty = true;

    if (this.orbit.step(dt)) {
      busy = true;
      this.dirty = true;
    }
    return busy;
  }

  // takes a new frame into the glides, nulls and missing numbers keep the last value
  private intake(): void {
    const frame = telemetry.frame;
    if (frame === this.seen) return;
    this.seen = frame;
    if (!frame) return;
    const at = telemetry.at || performance.now();
    const pan = num(frame.pan, this.pan.glide.has ? this.pan.glide.end : this.pan.spring.x);
    const tilt = num(frame.tilt, this.tilt.glide.has ? this.tilt.glide.end : this.tilt.spring.x);
    if (!this.started) {
      // the very first frame shows the pose as it is, nothing swings in
      this.started = true;
      this.pan.spring = spring(pan);
      this.tilt.spring = spring(tilt);
    }
    this.pan.glide.push(pan, at);
    this.tilt.glide.push(tilt, at);
  }

  private render(): void {
    this.dirty = false;
    const view = this.orbit.view;
    const p = cameraPosition(this.target, view);
    this.camera.position.set(p[0], p[1], p[2]);
    this.camera.lookAt(this.target[0], this.target[1], this.target[2]);
    this.renderer.clear();
    this.renderer.render(this.back, this.camera);
    this.renderer.clearDepth();
    this.renderer.render(this.front, this.camera);
    this.renders++;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    for (const cleanup of this.cleanups.splice(0)) cleanup();
    this.rig?.dispose();
    this.ground?.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}

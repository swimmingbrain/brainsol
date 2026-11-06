// the live 3D twin. one renderer, two scenes: the back holds the table and
// the sky and is always drawn behind, the front holds the tracker and what has
// to pass in front of or behind it. nothing renders unless something changed
// or still eases, a tracker that rests costs no frames at all.
//
// telemetry comes in through the plain fields of the store, never through
// runes: a frame listener only wakes the loop, the loop reads telemetry.frame

import { AmbientLight, Color, DirectionalLight, HemisphereLight, PerspectiveCamera, Raycaster, Scene, SRGBColorSpace, Vector2, WebGLRenderer } from 'three';
import { telemetry } from '$lib/stores/telemetry.svelte';
import type { ScanMessage, StateFrame } from '$lib/link/protocol';
import { clamp, dot, wrap180, type Vec3 } from '$lib/sim/kinematics';
import { EYES, ROLE_COLORS, STANDIN, STANDIN_ASSEMBLY, type Assembly } from './assembly';
import { follow, settle, spring, springStep } from './damp';
import { Glide } from './glide';
import { Heat } from './heat';
import { transformDir, transformPoint } from './joints';
import { Arcs } from './arcs';
import { Controls } from './controls';
import { Dome } from './dome';
import { Ground } from './ground';
import { Lights, type Sky } from './light';
import { LineKit } from './lines';
import { cameraPosition, Orbit, type View } from './orbit';
import { readPalette, type Palette } from './palette';
import { EYE_RAMP, glow, LUX_RAMP, luxLevel, stepGlow, type Glow } from './eyes';
import { panelTexture } from './panelface';
import { Rig } from './rig';
import { dragPoint, round1, skyAngles, sub } from './sky';
import { throttle } from './throttle';
import { loadModel, measure } from './loader';
import type { Piece } from './standin';

// the sky sphere around the tilt axis, in millimetres
export const DOME_RADIUS = 190;
// stiffness of the joint springs, the glide already gives the pace
const JOINT_OMEGA = 22;
// the pose before the first frame: parked, panel flat
const PARK = { pan: 0, tilt: 90 };
const FOV = 28;
const MAX_PIXEL_RATIO = 2;
const ORANGE = new Color(ROLE_COLORS.accent);
// strength of the edge light on the charcoal parts in the dark theme
const RIM = 0.12;
// changes smaller than this are noise of a resting tracker, not light
const WARMTH_BAND = 0.2;

export interface TwinOptions {
  // the 3D context went away or came back
  onContext?: (lost: boolean) => void;
  // the lamp was dragged here, at most about 20 times a second
  onLamp?: (az: number, el: number) => void;
  // the lamp under the hand, null when the hand lets go
  onLampDrag?: (sky: Sky | null) => void;
}

// a drag sends at most this often, about 20 times a second
const SEND_EVERY = 50;

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
  private dome: Dome | null = null;
  private arcs: Arcs | null = null;
  private light: Lights | null = null;
  private heat: Heat | null = null;
  private scan: ScanMessage | null = null;
  // the clock of the shaders, seconds since the twin started
  private born = performance.now();
  private glyphs: { lamp: HTMLElement | null; sun: HTMLElement | null } = { lamp: null, sun: null };
  private lightSeen = '';
  private controls: Controls;
  private raycaster = new Raycaster();
  private draggable = false;
  private dragLast: Vec3 | null = null;
  private dragSky: Sky | null = null;
  private send = throttle((sky: Sky) => {
    this.options.onLamp?.(sky.az, sky.el);
    this.options.onLampDrag?.(this.light?.dragging ? sky : null);
  }, SEND_EVERY);
  private kit = new LineKit();
  private rig: Rig | null = null;
  private assembly: Assembly = STANDIN_ASSEMBLY;
  private lights: { hemi: HemisphereLight; key: DirectionalLight; fill: DirectionalLight; rim: DirectionalLight; ambient: AmbientLight };

  private pan = { glide: new Glide(), spring: spring(PARK.pan) };
  private tilt = { glide: new Glide(), spring: spring(PARK.tilt) };
  private seen: StateFrame | null = null;
  private eyes: Glow[] = EYES.map(() => glow(EYE_RAMP));
  private luxGlow: Glow = glow(LUX_RAMP);
  private warmth = { goal: 0, now: 0, drawn: -1 };
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

    this.controls = new Controls(canvas, {
      orbit: this.orbit,
      wake: () => {
        this.dirty = true;
        this.wake();
      },
      canDragLamp: () => this.draggable && Boolean(this.light?.showsLamp),
      lampStart: () => this.lampStart(),
      lampMove: (x, y) => this.lampMove(x, y),
      lampEnd: () => this.lampEnd(),
      lampNudge: (az, el) => this.lampNudge(az, el)
    });
    this.cleanups.push(() => this.controls.dispose());

    this.applyPalette();
    this.watch();
    this.resize();
    void this.start();
  }

  // the cad export when it is there, the stand in otherwise. the stage shows
  // only its background for the moment this takes
  private async start(): Promise<void> {
    const model = await loadModel();
    if (this.disposed) {
      for (const list of Object.values(model.pieces)) for (const piece of list) piece.geometry.dispose();
      return;
    }
    this.useModel(model.assembly, model.pieces);
  }

  // a model to show, the stand in or the cad export
  private useModel(assembly: Assembly, pieces: Record<string, Piece[]>): void {
    this.rig?.dispose();
    this.ground?.object.removeFromParent();
    this.ground?.dispose();
    this.dome?.object.removeFromParent();
    this.dome?.dispose();
    this.arcs?.dispose();
    this.light?.dispose();
    this.heat?.dispose();
    this.assembly = assembly;
    this.rig = new Rig(assembly, pieces, panelTexture(this.renderer, ...(assembly.panel?.size ?? [125, 85])));
    this.front.add(this.rig.root);
    const centre = this.centre;
    const s = STANDIN.base;
    const bounds = assembly.bounds ?? measure(pieces);
    // the shadow lies under what stands on the table, the head of the real
    // tracker is wider than its base
    const fixed = Object.fromEntries(assembly.parts.filter((part) => part.joint === null).map((part) => [part.id, pieces[part.id] ?? []]));
    const foot = measure(fixed) ?? bounds;
    const footprint = foot
      ? { x: (foot.min[0] + foot.max[0]) / 2, y: (foot.min[1] + foot.max[1]) / 2, w: foot.max[0] - foot.min[0], d: foot.max[1] - foot.min[1], r: s.r }
      : { x: 0, y: 0, w: s.w, d: s.d, r: s.r };
    this.ground = new Ground(this.kit, [centre[0], centre[1]], this.groundRadius, footprint);
    this.dome = new Dome(this.kit, centre, DOME_RADIUS);
    this.back.add(this.dome.object);
    this.heat = new Heat(this.kit, centre, DOME_RADIUS);
    this.back.add(this.heat.object);
    this.heat.set(this.scan, this.seconds);
    this.dome.setQuiet(this.heat.shown);
    this.back.add(this.ground.object);
    const panJoint = assembly.joints.pan;
    const tiltJoint = assembly.joints.tilt;
    const reach = bounds ? Math.max(-bounds.min[0], bounds.max[0]) : s.w / 2;
    this.arcs = new Arcs(
      this.kit,
      [panJoint?.origin[0] ?? centre[0], panJoint?.origin[1] ?? centre[1]],
      this.groundRadius - 16,
      panJoint?.range ?? [-90, 90],
      centre,
      reach + 12,
      62
    );
    this.front.add(this.arcs.pan);
    this.rig.group(tiltJoint?.parent ?? 'pan').add(this.arcs.tilt);
    this.light = new Lights(this.kit, centre, DOME_RADIUS);
    this.light.bind(this.glyphs.lamp, this.glyphs.sun);
    this.front.add(this.light.object);
    this.target = [centre[0], centre[1] + 10, centre[2] * 1.02];
    this.rig.setPose(this.pan.spring.x, this.tilt.spring.x);
    this.arcs.set(this.pan.spring.x, this.tilt.spring.x);
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
    // a tall phone screen lets the sky run off the sides a little, the
    // tracker is what has to be big
    const radius = DOME_RADIUS * (aspect < 0.9 ? 0.94 : 1.06);
    return { az: -35, el: 18, dist: radius / fit };
  }

  setPalette(): void {
    this.palette = readPalette();
    this.applyPalette();
  }

  private applyPalette(): void {
    const p = this.palette;
    this.renderer.setClearColor(new Color().setRGB(...p.bg, SRGBColorSpace), 1);
    this.ground?.setPalette(p);
    this.dome?.setPalette(p);
    this.arcs?.setPalette(p);
    this.light?.setPalette(p);
    this.heat?.setPalette(p);
    const { hemi, key, fill, rim, ambient } = this.lights;
    // a bright room asks for softer contrast, the dark page for a clearer rim
    hemi.color.set(p.light ? 0xffffff : 0xf2efe9);
    hemi.groundColor.set(p.light ? 0x9a9aa0 : 0x3a3836);
    hemi.intensity = p.light ? 1.9 : 1.5;
    key.intensity = p.light ? 2.1 : 2.3;
    fill.intensity = p.light ? 0.7 : 0.55;
    rim.intensity = p.light ? 0.6 : 1.1;
    ambient.intensity = p.light ? 0.3 : 0.15;
    // the charcoal head would melt into the dark page at its edges, a bright room needs no help
    this.rig?.setRim(p.light ? new Color(0x000000) : new Color().setRGB(...p.secondary, SRGBColorSpace).multiplyScalar(RIM));
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
    // the words sit on top of the stage, the picture moves down a little to make room
    this.camera.setViewOffset(w, h, 0, -Math.round(h * (w / h < 0.9 ? 0.07 : 0.04)), w, h);
    this.camera.updateProjectionMatrix();
    this.kit.resize(w, h);
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
    if (this.rig?.setPose(this.pan.spring.x, this.tilt.spring.x)) {
      this.arcs?.set(this.pan.spring.x, this.tilt.spring.x);
      this.dirty = true;
    }

    const frame = telemetry.frame;
    if (this.glow(frame, dt)) busy = true;
    if (this.warm(frame, dt)) busy = true;

    // the lights on the sky, a render only when what they show has changed
    if (this.light) {
      if (this.light.step(now, dt)) busy = true;
      const lamp = this.light.lampSky;
      const seen = `${this.light.showsLamp}${lamp ? `${lamp.az.toFixed(2)} ${lamp.el.toFixed(2)}` : ''}${this.light.signature}`;
      if (seen !== this.lightSeen) {
        this.lightSeen = seen;
        this.dirty = true;
      }
    }

    if (this.heat?.step(this.seconds)) {
      busy = true;
      this.dirty = true;
    }

    if (this.orbit.step(dt)) {
      busy = true;
      this.dirty = true;
    }
    return busy;
  }

  // each eye shows the level its sensor reports, the lux window the light on
  // the panel, eased so a 20 Hz stream does not flicker. sensor noise of a
  // resting tracker stays inside a dead band and costs no frame
  private glow(frame: StateFrame | null, dt: number): boolean {
    const rig = this.rig;
    if (!rig) return false;
    let busy = false;
    const windows = rig.eyes.map((eye) => ({ eye, state: this.eyes[EYES.indexOf(eye.name)], level: num(frame?.ldr?.[EYES.indexOf(eye.name)], 0), stops: EYE_RAMP }));
    if (rig.lux) windows.push({ eye: rig.lux, state: this.luxGlow, level: luxLevel(frame?.lux), stops: LUX_RAMP });
    for (const { eye, state, level, stops } of windows) {
      if (!state) continue;
      const step = stepGlow(state, level, stops, dt);
      if (step.busy) busy = true;
      if (step.draw) {
        eye.material.color.setRGB(...step.draw, SRGBColorSpace);
        this.dirty = true;
      }
    }
    return busy;
  }

  // the panel warms a little the closer it faces the light, nothing in low light
  private warm(frame: StateFrame | null, dt: number): boolean {
    const off = frame?.off;
    const w = this.warmth;
    const fresh = typeof off === 'number' && Number.isFinite(off) ? Math.max(0, 1 - Math.abs(off) / 35) ** 2 : 0;
    if (Math.abs(fresh - w.goal) > WARMTH_BAND || fresh === 0) w.goal = fresh;
    const goal = w.goal;
    w.now += (goal - w.now) * follow(6, dt);
    const busy = Math.abs(goal - w.now) > 0.002;
    if (!busy) w.now = goal;
    if (Math.abs(w.now - w.drawn) > 0.004) {
      w.drawn = w.now;
      this.rig?.setWarmth(w.now, ORANGE);
      this.dirty = true;
    }
    return busy;
  }

  // takes a new frame into the glides, nulls and missing numbers keep the last value
  private intake(): void {
    const frame = telemetry.frame;
    if (frame === this.seen) return;
    this.seen = frame;
    if (!frame) {
      this.light?.clear();
      return;
    }
    const at = telemetry.at || performance.now();
    this.light?.intake(frame, at);
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

  // the html glyphs of lamp and sun, the scene keeps them on their lights
  bindGlyphs(lamp: HTMLElement | null, sun: HTMLElement | null): void {
    this.glyphs = { lamp, sun };
    this.light?.bind(lamp, sun);
    this.controls.bindLamp(lamp);
    this.dirty = true;
    this.wake();
  }

  private get seconds(): number {
    return (performance.now() - this.born) / 1000;
  }

  // a sky map from a scan, null takes it away
  setScan(scan: ScanMessage | null): void {
    if (scan === this.scan) return;
    this.scan = scan;
    this.heat?.set(scan, this.seconds);
    this.dome?.setQuiet(Boolean(this.heat?.shown));
    this.dirty = true;
    this.wake();
  }

  // whether a hand may move the lamp, the stage decides who may
  setDraggable(on: boolean): void {
    this.draggable = on;
    if (!on && this.light?.dragging) this.lampEnd();
  }

  // the stage fills the screen, a finger on it never scrolls the page
  setPresenting(on: boolean): void {
    this.controls.setScroll(!on);
  }

  // back to the three quarter view
  resetView(): void {
    this.orbit.reset();
    this.dirty = true;
    this.wake();
  }

  // the tracker said no to a lamp move, the lamp goes back to what it reports
  lampRefused(): void {
    if (this.light && !this.light.dragging) this.light.release();
  }

  private lampStart(): void {
    const light = this.light;
    if (!light) return;
    light.dragging = true;
    const sky = light.lampSky;
    this.dragLast = sky ? light.position(sky) : null;
  }

  private lampMove(clientX: number, clientY: number): void {
    const light = this.light;
    if (!light?.dragging) return;
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    const ndc = new Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -(((clientY - rect.top) / rect.height) * 2 - 1));
    this.camera.updateMatrixWorld();
    this.raycaster.setFromCamera(ndc, this.camera);
    const { origin, direction } = this.raycaster.ray;
    const point = dragPoint([origin.x, origin.y, origin.z], [direction.x, direction.y, direction.z], light.centre, light.radius, this.dragLast);
    this.dragLast = point;
    const sky = skyAngles(point, light.centre);
    this.dragSky = { az: round1(wrap180(sky.az)), el: round1(sky.el) };
    light.hold(this.dragSky);
    this.send.call(this.dragSky);
    this.dirty = true;
    this.wake();
  }

  private lampEnd(): void {
    const light = this.light;
    if (!light?.dragging) return;
    light.dragging = false;
    this.send.flush();
    if (this.dragSky) light.hold(this.dragSky, true);
    this.options.onLampDrag?.(null);
    this.dragSky = null;
    this.dragLast = null;
    this.dirty = true;
    this.wake();
  }

  private lampNudge(dAz: number, dEl: number): void {
    const light = this.light;
    const sky = light?.lampSky;
    if (!light || !sky) return;
    const next = { az: round1(wrap180(sky.az + dAz)), el: round1(clamp(sky.el + dEl, 0, 90)) };
    light.hold(next, true);
    this.send.call(next);
    this.dirty = true;
    this.wake();
  }

  // the tilt protractor moves to the side of the head the camera sees. a small
  // dead zone keeps it from flipping while the camera looks along the panel
  private sideOfArc(camera: Vec3): void {
    if (!this.rig || !this.arcs) return;
    const m = this.rig.matrixOf(this.assembly.joints.tilt?.parent ?? 'pan');
    const across = transformDir(m, [1, 0, 0]);
    const toCamera = sub(camera, transformPoint(m, this.centre));
    const k = dot(across, toCamera) / Math.max(1, Math.hypot(...toCamera));
    if (Math.abs(k) > 0.08) this.arcs.side(k > 0, this.centre[0]);
  }

  private render(): void {
    this.dirty = false;
    const view = this.orbit.view;
    const p = cameraPosition(this.target, view);
    this.camera.position.set(p[0], p[1], p[2]);
    this.camera.lookAt(this.target[0], this.target[1], this.target[2]);
    this.sideOfArc(p);
    this.camera.updateMatrixWorld();
    this.front.updateMatrixWorld();
    if (this.rig && this.light) this.light.place(this.camera, this.size, { centre: this.rig.panelCentre(), normal: this.rig.panelNormal() }, this.rig.meshes);
    this.renderer.clear();
    this.renderer.render(this.back, this.camera);
    this.renderer.clearDepth();
    this.renderer.render(this.front, this.camera);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.send.cancel();
    for (const cleanup of this.cleanups.splice(0)) cleanup();
    this.rig?.dispose();
    this.ground?.dispose();
    this.dome?.dispose();
    this.arcs?.dispose();
    this.light?.dispose();
    this.heat?.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}

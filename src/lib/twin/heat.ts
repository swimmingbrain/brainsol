// the sky map drawn on the sky sphere: one patch per measured cell in the
// heat ramp of the charts, a small ring on the brightest place. new cells fade
// in as the scan visits them. like the sphere lines the patches fade on the far
// side and sit behind the tracker

import { BufferAttribute, BufferGeometry, Color, DoubleSide, Group, Mesh, ShaderMaterial, SRGBColorSpace, Vector3 } from 'three';
import type { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import type { ScanMessage } from '$lib/link/protocol';
import type { Vec3 } from '$lib/sim/kinematics';
import { skyMap } from './cells';
import { segments, setLineColor, skyFade, type LineKit } from './lines';
import type { Palette } from './palette';
import { ramp, type Rgb } from './ramp';
import { add, cross, scale, unit } from './sky';

// how long a new cell takes to appear, seconds
const FADE_IN = 0.35;

const vertex = `
  uniform vec3 skyCentre;
  uniform float time;
  attribute vec3 tint;
  attribute float born;
  varying vec3 vTint;
  varying float vAlpha;
  void main() {
    vec4 world = modelMatrix * vec4( position, 1.0 );
    float facing = dot( normalize( world.xyz - skyCentre ), normalize( cameraPosition - skyCentre ) );
    float grow = clamp( ( time - born ) / ${FADE_IN.toFixed(2)}, 0.0, 1.0 );
    vAlpha = mix( 0.05, 0.62, smoothstep( -0.35, 0.3, facing ) ) * grow;
    vTint = tint;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragment = `
  uniform float opacity;
  varying vec3 vTint;
  varying float vAlpha;
  void main() {
    gl_FragColor = vec4( vTint, vAlpha * opacity );
    #include <colorspace_fragment>
  }
`;

export class Heat {
  readonly object = new Group();
  private material: ShaderMaterial;
  private mesh: Mesh | null = null;
  private ring: LineSegments2 | null = null;
  private born = new Map<string, number>();
  private id: string | null = null;
  private lastBorn = -Infinity;
  private heat: Rgb[] = [];
  private ringColor: Rgb = [1, 1, 1];
  private scan: ScanMessage | null = null;

  constructor(
    private kit: LineKit,
    private centre: Vec3,
    private radius: number
  ) {
    this.object.name = 'sky map';
    this.material = new ShaderMaterial({
      uniforms: { skyCentre: { value: new Vector3(...centre) }, time: { value: 0 }, opacity: { value: 1 } },
      vertexShader: vertex,
      fragmentShader: fragment,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: DoubleSide
    });
  }

  get shown(): boolean {
    return this.mesh !== null;
  }

  // a scan message, or null to clear the map. now is in seconds
  set(scan: ScanMessage | null, now: number): void {
    this.scan = scan;
    if (!scan || scan.id !== this.id) {
      this.born.clear();
      this.id = scan?.id ?? null;
    }
    this.build(now);
  }

  private build(now: number): void {
    this.clear();
    const map = skyMap(this.scan);
    if (map.cells.length === 0) return;
    const per = (map.sub + 1) * (map.sub + 1);
    const positions = new Float32Array(map.cells.length * per * 3);
    const tints = new Float32Array(map.cells.length * per * 3);
    const borns = new Float32Array(map.cells.length * per);
    const index: number[] = [];
    const color = new Color();
    map.cells.forEach((cell, c) => {
      let born = this.born.get(cell.key);
      if (born === undefined) {
        born = now;
        this.born.set(cell.key, born);
        this.lastBorn = Math.max(this.lastBorn, now);
      }
      const rgb = ramp(this.heat, cell.level);
      color.setRGB(rgb[0], rgb[1], rgb[2], SRGBColorSpace);
      const base = c * per;
      cell.corners.forEach((d, k) => {
        // a hair inside the sphere lines, so they stay on top
        const p = add(this.centre, scale(d, this.radius * 0.996));
        positions.set(p, (base + k) * 3);
        tints.set([color.r, color.g, color.b], (base + k) * 3);
        borns[base + k] = born;
      });
      const row = map.sub + 1;
      for (let a = 0; a < map.sub; a++) {
        for (let b = 0; b < map.sub; b++) {
          const i = base + a * row + b;
          index.push(i, i + 1, i + row, i + 1, i + row + 1, i + row);
        }
      }
    });
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    geometry.setAttribute('tint', new BufferAttribute(tints, 3));
    geometry.setAttribute('born', new BufferAttribute(borns, 1));
    geometry.setIndex(index);
    this.mesh = new Mesh(geometry, this.material);
    this.mesh.renderOrder = 4;
    this.mesh.frustumCulled = false;
    this.object.add(this.mesh);

    if (map.best) {
      // a small ring around the best direction, drawn on the sphere
      const d = unit(map.best);
      const helper: Vec3 = Math.abs(d[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
      const u = unit(cross(d, helper));
      const v = cross(d, u);
      const r = 0.045;
      const points: Vec3[] = [];
      for (let i = 0; i <= 40; i++) {
        const a = (i / 40) * Math.PI * 2;
        const p = unit(add(d, add(scale(u, Math.cos(a) * r), scale(v, Math.sin(a) * r))));
        points.push(add(this.centre, scale(p, this.radius * 0.998)));
      }
      this.ring = this.kit.make(segments(points), { width: 1.5, depthTest: false });
      this.ring.renderOrder = 5;
      skyFade(this.ring, this.centre, 1, 0.2);
      setLineColor(this.ring, this.ringColor);
      this.object.add(this.ring);
    }
  }

  // true while cells still fade in
  step(now: number): boolean {
    this.material.uniforms.time.value = now;
    return this.mesh !== null && now - this.lastBorn < FADE_IN + 0.05;
  }

  setPalette(p: Palette): void {
    this.heat = p.heat;
    this.ringColor = p.light ? p.secondary : [0.93, 0.93, 0.94];
    if (this.scan) this.build(this.material.uniforms.time.value as number);
  }

  private clear(): void {
    if (this.mesh) {
      this.mesh.geometry.dispose();
      this.mesh.removeFromParent();
      this.mesh = null;
    }
    if (this.ring) {
      this.kit.dispose(this.ring);
      this.ring.removeFromParent();
      this.ring = null;
    }
  }

  dispose(): void {
    this.clear();
    this.material.dispose();
    this.object.removeFromParent();
  }
}

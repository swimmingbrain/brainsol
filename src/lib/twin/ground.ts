// the table under the tracker: a flat disc in the surface colour of the page,
// a soft contact shadow under the base, quiet tick marks around the rim every
// 15 degrees and an orange mark where the front of the tracker looks. all flat
// colour, no lights touch them, so they sit as quiet as the panels around

import { CanvasTexture, CircleGeometry, Group, Mesh, MeshBasicMaterial, PlaneGeometry, Shape, ShapeGeometry, SRGBColorSpace } from 'three';
import type { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { DEG, type Vec3 } from '$lib/sim/kinematics';
import { segments, setLineColor, type LineKit } from './lines';
import type { Palette } from './palette';
import { mix } from './ramp';

export interface Footprint {
  x: number;
  y: number;
  w: number;
  d: number;
  r: number;
}

// how far the shadow spreads past the base, in millimetres
const SPREAD = 26;

function shadowTexture(footprint: Footprint): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  if (!g) return null;
  // the texture covers the shadow plane, which is as wide as the footprint plus the spread
  const k = size / (footprint.w + 2 * SPREAD);
  const kd = size / (footprint.d + 2 * SPREAD);
  // only the blur of a shape drawn off the canvas lands on it, the filter
  // property of canvas is not everywhere yet. a wide soft shade, then a tight
  // one along the edge, so a base on short feet still sits on the table
  const layer = (grow: number, blur: number, alpha: number) => {
    const w = footprint.w * k * grow;
    const d = footprint.d * kd * grow;
    g.shadowColor = `rgba(0, 0, 0, ${alpha})`;
    g.shadowBlur = blur * k;
    g.shadowOffsetX = size * 2;
    g.fillStyle = '#000';
    g.beginPath();
    g.roundRect((size - w) / 2 - size * 2, (size - d) / 2, w, d, footprint.r * k * grow);
    g.fill();
  };
  layer(0.94, SPREAD * 0.9, 0.8);
  layer(0.99, 5, 1);
  return new CanvasTexture(canvas);
}

export class Ground {
  readonly object = new Group();
  private discMaterial = new MeshBasicMaterial({ depthTest: false, depthWrite: false });
  private shadowMaterial: MeshBasicMaterial;
  private markMaterial = new MeshBasicMaterial({ depthTest: false, depthWrite: false });
  private texture: CanvasTexture | null;
  private rim: LineSegments2;
  private ticks: LineSegments2;

  constructor(
    private kit: LineKit,
    centre: [number, number],
    radius: number,
    footprint: Footprint
  ) {
    this.object.name = 'ground';
    const disc = new Mesh(new CircleGeometry(radius, 128), this.discMaterial);
    disc.position.set(centre[0], centre[1], 0);
    disc.renderOrder = 0;
    this.object.add(disc);

    this.texture = shadowTexture(footprint);
    this.shadowMaterial = new MeshBasicMaterial({ color: 0x000000, map: this.texture, transparent: true, depthTest: false, depthWrite: false });
    const shadow = new Mesh(new PlaneGeometry(footprint.w + 2 * SPREAD, footprint.d + 2 * SPREAD), this.shadowMaterial);
    shadow.position.set(footprint.x, footprint.y, 0.1);
    shadow.renderOrder = 1;
    this.object.add(shadow);

    const at = (az: number, r: number): Vec3 => [centre[0] + r * Math.sin(az * DEG), centre[1] + r * Math.cos(az * DEG), 0];
    const rim: Vec3[] = [];
    for (let i = 0; i <= 160; i++) rim.push(at((i / 160) * 360, radius));
    this.rim = kit.make(segments(rim), { width: 1, depthTest: false });
    const ticks: number[] = [];
    // the front gets the orange mark instead of a tick
    for (let az = 15; az < 360; az += 15) ticks.push(...at(az, radius), ...at(az, radius - (az % 45 === 0 ? 11 : 5)));
    this.ticks = kit.make(ticks, { width: 1, depthTest: false });
    this.rim.renderOrder = 2;
    this.ticks.renderOrder = 2;
    this.object.add(this.rim, this.ticks);

    // a small arrow at the rim that points the way the tracker faces at pan 0
    const arrow = new Shape();
    arrow.moveTo(0, 0);
    arrow.lineTo(-5.5, -9);
    arrow.lineTo(5.5, -9);
    arrow.closePath();
    const mark = new Mesh(new ShapeGeometry(arrow), this.markMaterial);
    mark.position.set(centre[0], centre[1] + radius - 2, 0.2);
    mark.renderOrder = 2;
    this.object.add(mark);
  }

  setPalette(p: Palette): void {
    this.discMaterial.color.setRGB(...p.surface, SRGBColorSpace);
    this.shadowMaterial.opacity = p.light ? 0.36 : 0.62;
    this.markMaterial.color.setRGB(...p.accent, SRGBColorSpace);
    setLineColor(this.rim, mix(p.border, p.muted, 0.28));
    setLineColor(this.ticks, mix(p.border, p.muted, 0.45));
  }

  dispose(): void {
    this.object.traverse((o) => {
      if (o instanceof Mesh) o.geometry.dispose();
    });
    this.kit.dispose(this.rim);
    this.kit.dispose(this.ticks);
    this.discMaterial.dispose();
    this.shadowMaterial.dispose();
    this.markMaterial.dispose();
    this.texture?.dispose();
  }
}

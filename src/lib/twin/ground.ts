// the table under the tracker: a flat disc in the surface colour of the page
// and a soft contact shadow under the base. both are flat colour, no lights
// touch them, so they sit as quiet as the panels around the stage

import { CanvasTexture, CircleGeometry, Group, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from 'three';
import type { Palette } from './palette';

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
  const k = size / (footprint.w + 2 * SPREAD);
  const w = footprint.w * k * 0.94;
  const d = footprint.d * k * 0.94;
  const r = footprint.r * k;
  // only the blur of a shape drawn off the canvas lands on it, the filter
  // property of canvas is not everywhere yet
  g.shadowColor = 'rgba(0, 0, 0, 1)';
  g.shadowBlur = SPREAD * k * 0.9;
  g.shadowOffsetX = size * 2;
  g.fillStyle = '#000';
  g.beginPath();
  g.roundRect((size - w) / 2 - size * 2, (size - d) / 2, w, d, r);
  g.fill();
  return new CanvasTexture(canvas);
}

export class Ground {
  readonly object = new Group();
  private discMaterial = new MeshBasicMaterial({ depthTest: false, depthWrite: false });
  private shadowMaterial: MeshBasicMaterial;
  private texture: CanvasTexture | null;

  constructor(centre: [number, number], radius: number, footprint: Footprint) {
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
  }

  setPalette(p: Palette): void {
    this.discMaterial.color.setRGB(...p.surface, SRGBColorSpace);
    this.shadowMaterial.opacity = p.light ? 0.2 : 0.62;
  }

  dispose(): void {
    this.object.traverse((o) => {
      if (o instanceof Mesh) o.geometry.dispose();
    });
    this.discMaterial.dispose();
    this.shadowMaterial.dispose();
    this.texture?.dispose();
  }
}

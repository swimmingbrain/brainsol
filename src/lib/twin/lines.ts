// thin lines with a width in screen pixels. webgl draws its own lines one
// device pixel wide, a hairline on a phone and a smudge on a projector, so the
// scene uses the line addon of three.js and keeps every material at the size of
// the stage

import { DoubleSide, SRGBColorSpace, Vector3 } from 'three';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import type { Vec3 } from '$lib/sim/kinematics';
import type { Rgb } from './ramp';

export interface LineStyle {
  // css pixels
  width: number;
  opacity?: number;
  depthTest?: boolean;
}

// a polyline as the start and end points of its segments
export function segments(points: Vec3[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < points.length; i++) out.push(...points[i - 1], ...points[i]);
  return out;
}

export class LineKit {
  private materials = new Set<LineMaterial>();
  private size = { w: 1, h: 1 };

  make(positions: number[], style: LineStyle): LineSegments2 {
    const geometry = new LineSegmentsGeometry();
    geometry.setPositions(positions);
    const material = new LineMaterial({
      linewidth: style.width,
      worldUnits: false,
      transparent: true,
      opacity: style.opacity ?? 1,
      depthTest: style.depthTest ?? true,
      depthWrite: false,
      // a mirrored arc turns its quads around, they must still show
      side: DoubleSide
    });
    material.resolution.set(this.size.w, this.size.h);
    this.materials.add(material);
    const line = new LineSegments2(geometry, material);
    // the bounds of a line that changes would go stale, and the lines are few
    line.frustumCulled = false;
    return line;
  }

  // css pixels of the stage, the line widths are in the same unit
  resize(w: number, h: number): void {
    this.size = { w, h };
    for (const material of this.materials) material.resolution.set(w, h);
  }

  dispose(line: LineSegments2): void {
    line.geometry.dispose();
    const material = line.material as LineMaterial;
    material.dispose();
    this.materials.delete(material);
  }
}

export function setLineColor(line: LineSegments2, rgb: Rgb): void {
  (line.material as LineMaterial).color.setRGB(rgb[0], rgb[1], rgb[2], SRGBColorSpace);
}

export interface SkyFade {
  near: { value: number };
  far: { value: number };
}

// lines on a sphere fade on the far side, where they would only cross the
// near ones. near and far are the opacities facing the camera and facing away
export function skyFade(line: LineSegments2, centre: Vec3, near: number, far: number): SkyFade {
  const material = line.material as LineMaterial;
  const uniforms: SkyFade & { centre: { value: Vector3 } } = {
    centre: { value: new Vector3(...centre) },
    near: { value: near },
    far: { value: far }
  };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.skyCentre = uniforms.centre;
    shader.uniforms.skyNear = uniforms.near;
    shader.uniforms.skyFar = uniforms.far;
    shader.vertexShader = shader.vertexShader.replace(
      'void main() {',
      `uniform vec3 skyCentre;
      varying float vSky;
      void main() {
        vec3 skyPoint = ( position.y < 0.5 ) ? instanceStart : instanceEnd;
        vec3 skyWorld = ( modelMatrix * vec4( skyPoint, 1.0 ) ).xyz;
        vSky = dot( normalize( skyWorld - skyCentre ), normalize( cameraPosition - skyCentre ) );`
    );
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform float skyNear;\nuniform float skyFar;\nvarying float vSky;\nvoid main() {')
      .replace('gl_FragColor = vec4( diffuseColor.rgb, alpha );', 'gl_FragColor = vec4( diffuseColor.rgb, alpha * mix( skyFar, skyNear, smoothstep( -0.35, 0.35, vSky ) ) );');
  };
  material.customProgramCacheKey = () => 'sky fade';
  material.needsUpdate = true;
  return uniforms;
}

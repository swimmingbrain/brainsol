// two thin arcs that read like a protractor: pan on the table around the pan
// axis, from the front to where the neck points, and tilt in a plane beside
// the head, from the front up over the top. a faint track shows the whole
// range, the orange part the angle right now

import { Group, Mesh, MeshBasicMaterial, SphereGeometry, SRGBColorSpace } from 'three';
import type { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import type { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { DEG, type Vec3 } from '$lib/sim/kinematics';
import { segments, setLineColor, type LineKit } from './lines';
import type { Palette } from './palette';
import { mix } from './ramp';

// the arcs are drawn in steps of this many degrees, the orange part shows as many as the angle covers
const STEP = 0.5;

interface Arc {
  track: LineSegments2;
  live: LineSegments2;
  dot: Mesh;
  point: (deg: number) => Vec3;
  sign: boolean;
}

export class Arcs {
  readonly pan: Group = new Group();
  readonly tilt: Group = new Group();
  private arcs: Arc[] = [];
  private dotMaterial = new MeshBasicMaterial({ toneMapped: false });
  private dotGeometry = new SphereGeometry(2.2, 16, 10);

  constructor(
    private kit: LineKit,
    // pan axis on the table and the radius of the pan arc
    panAt: [number, number],
    panRadius: number,
    panRange: [number, number],
    // tilt axis, the side plane of the tilt arc and its radius, at pan 0
    tiltAt: Vec3,
    tiltX: number,
    tiltRadius: number
  ) {
    this.pan.name = 'pan arc';
    this.tilt.name = 'tilt arc';
    // pan turns clockwise seen from above, the arc is drawn for positive angles
    // and mirrored for negative ones
    this.arcs.push(
      this.arc(this.pan, (deg) => [panAt[0] + panRadius * Math.sin(deg * DEG), panAt[1] + panRadius * Math.cos(deg * DEG), 0.6], panRange, true, (deg) => [panRadius * Math.sin(deg * DEG), panRadius * Math.cos(deg * DEG), 0], [panAt[0], panAt[1], 0.6])
    );
    this.arcs.push(
      this.arc(this.tilt, (deg) => [tiltX, tiltAt[1] + tiltRadius * Math.cos(deg * DEG), tiltAt[2] + tiltRadius * Math.sin(deg * DEG)], [0, 180], false, (deg) => [0, tiltRadius * Math.cos(deg * DEG), tiltRadius * Math.sin(deg * DEG)], [tiltX, tiltAt[1], tiltAt[2]])
    );
  }

  private arc(group: Group, point: (deg: number) => Vec3, range: [number, number], sign: boolean, local: (deg: number) => Vec3, origin: Vec3): Arc {
    const track: Vec3[] = [];
    for (let deg = range[0]; deg <= range[1] + 1e-9; deg += STEP) track.push(point(deg));
    const trackLine = this.kit.make(segments(track), { width: 1, opacity: 0.9 });
    const reach = Math.max(Math.abs(range[0]), Math.abs(range[1]));
    const live: Vec3[] = [];
    for (let deg = 0; deg <= reach + 1e-9; deg += STEP) live.push(local(deg));
    const liveLine = this.kit.make(segments(live), { width: 1.6 });
    liveLine.position.set(...origin);
    const dot = new Mesh(this.dotGeometry, this.dotMaterial);
    group.add(trackLine, liveLine, dot);
    return { track: trackLine, live: liveLine, dot, point, sign };
  }

  // the tilt arc stands on the side of the head the camera sees, mirrored
  // about the tilt axis. axisX is where the axis sits across the head
  side(right: boolean, axisX: number): boolean {
    const scale = right ? 1 : -1;
    if (this.tilt.scale.x === scale) return false;
    this.tilt.scale.x = scale;
    this.tilt.position.x = right ? 0 : 2 * axisX;
    return true;
  }

  // the angles right now, pan and tilt in degrees
  set(pan: number, tilt: number): void {
    const angles = [pan, tilt];
    this.arcs.forEach((arc, i) => {
      const deg = Number.isFinite(angles[i]) ? angles[i] : 0;
      const count = Math.round(Math.abs(deg) / STEP);
      (arc.live.geometry as LineSegmentsGeometry).instanceCount = count;
      arc.live.visible = count > 0;
      arc.live.scale.x = arc.sign && deg < 0 ? -1 : 1;
      arc.dot.position.set(...arc.point(deg));
    });
  }

  setPalette(p: Palette): void {
    for (const arc of this.arcs) {
      setLineColor(arc.track, mix(p.border, p.muted, p.light ? 0.35 : 0.3));
      setLineColor(arc.live, p.accent);
    }
    this.dotMaterial.color.setRGB(...p.accent, SRGBColorSpace);
  }

  dispose(): void {
    for (const arc of this.arcs) {
      this.kit.dispose(arc.track);
      this.kit.dispose(arc.live);
    }
    this.dotMaterial.dispose();
    this.dotGeometry.dispose();
    this.pan.removeFromParent();
    this.tilt.removeFromParent();
  }
}

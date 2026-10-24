// the built in stand in for the cad export. every piece is made in the device
// frame at pan 0 and tilt 0, exactly like a glb of the contract, so the rig does
// not know which of the two it draws. soft bevels everywhere, a printed part
// never has a razor edge

import { BufferGeometry, CircleGeometry, CylinderGeometry, ExtrudeGeometry, LatheGeometry, Matrix4, Path, Shape, Vector2 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { STANDIN, STANDIN_ASSEMBLY, type Role } from './assembly';

export interface Piece {
  geometry: BufferGeometry;
  role: Role;
}

const CURVE = 10;

function roundedRect(w: number, h: number, r: number, target: Shape | Path = new Shape()): Shape | Path {
  const x = w / 2;
  const y = h / 2;
  const k = Math.min(r, x, y);
  target.moveTo(-x + k, -y);
  target.lineTo(x - k, -y);
  target.absarc(x - k, -y + k, k, -Math.PI / 2, 0, false);
  target.lineTo(x, y - k);
  target.absarc(x - k, y - k, k, 0, Math.PI / 2, false);
  target.lineTo(-x + k, y);
  target.absarc(-x + k, y - k, k, Math.PI / 2, Math.PI, false);
  target.lineTo(-x, -y + k);
  target.absarc(-x + k, -y + k, k, Math.PI, Math.PI * 1.5, false);
  return target;
}

// a rounded slab between z0 and z1 whose outer size includes the bevel
function slab(w: number, h: number, r: number, z0: number, z1: number, bevel: number, hole?: { w: number; h: number; r: number }): BufferGeometry {
  const b = Math.min(bevel, (z1 - z0) / 2 - 0.05);
  const shape = roundedRect(w - 2 * b, h - 2 * b, Math.max(r - b, 0.5)) as Shape;
  if (hole) shape.holes.push(roundedRect(hole.w + 2 * b, hole.h + 2 * b, hole.r + b, new Path()) as Path);
  const geometry = new ExtrudeGeometry(shape, {
    depth: z1 - z0 - 2 * b,
    bevelEnabled: b > 0,
    bevelThickness: b,
    bevelSize: b,
    bevelSegments: 2,
    curveSegments: CURVE
  });
  geometry.translate(0, 0, z0 + b);
  return geometry;
}

// lathe profiles are drawn as (radius, height) and turn about y
function lathe(points: [number, number][], segments = 48): BufferGeometry {
  return new LatheGeometry(
    points.map(([r, h]) => new Vector2(r, h)),
    segments
  );
}

// y up of a lathe or cylinder onto z up of the device frame
const Y_TO_Z = new Matrix4().makeRotationX(Math.PI / 2);

// shape coordinates (s, t) and extrusion depth e onto the device frame as y = s, z = t, x = e
const SIDE_PLANE = new Matrix4().set(0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1);

// a shape drawn in x y and extruded along z onto the head: x stays, the depth
// runs forward from the back face and y turns into z. a true turn and no mirror,
// so the faces keep their winding, the head shapes are symmetric top to bottom
function headMatrix(back: number, tiltZ: number): Matrix4 {
  return new Matrix4().set(1, 0, 0, 0, 0, 0, 1, back, 0, -1, 0, tiltZ, 0, 0, 0, 1);
}

// one geometry per colour, with only what the matte material needs
function merged(list: BufferGeometry[]): BufferGeometry {
  const parts = list.map((g) => (g.index ? g.toNonIndexed() : g));
  const out = mergeGeometries(
    parts.map((g) => {
      const clean = new BufferGeometry();
      clean.setAttribute('position', g.getAttribute('position'));
      clean.setAttribute('normal', g.getAttribute('normal'));
      return clean;
    })
  );
  for (const g of list) g.dispose();
  for (const g of parts) g.dispose();
  return out ?? new BufferGeometry();
}

function base(): Piece[] {
  const s = STANDIN.base;
  const top = s.h;
  const lidBottom = top - s.lid;
  const trayTop = lidBottom - s.gap;
  const tray = slab(s.w, s.d, s.r, s.pad, trayTop, 1.4);
  const lid = slab(s.w, s.d, s.r, lidBottom, top, 1.0);
  // the dark line between tray and lid is this core seen through the gap
  const core = slab(s.w - 3, s.d - 3, s.r - 1.5, trayTop - 0.6, lidBottom + 0.6, 0);
  const feet: BufferGeometry[] = [];
  const inset = 12;
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const foot = lathe(
        [
          [0, 0],
          [6.2, 0],
          [7, 0.8],
          [7, s.pad + 0.2],
          [0, s.pad + 0.2]
        ],
        32
      );
      foot.applyMatrix4(Y_TO_Z);
      foot.translate(sx * (s.w / 2 - inset), sy * (s.d / 2 - inset), 0);
      feet.push(foot);
    }
  }
  return [
    { geometry: merged([tray, lid]), role: 'body' },
    { geometry: merged([core, ...feet]), role: 'dark' }
  ];
}

function neck(): Piece[] {
  const s = STANDIN;
  const z0 = s.base.h;
  const zf = z0 + s.foot.h;
  const top = s.tiltZ + s.neck.above;
  const foot = lathe([
    [0, 0.2],
    [s.foot.r - 1, 0.2],
    [s.foot.r, 1.2],
    [s.foot.r, s.foot.h - 1.6],
    [s.foot.r - 1.6, s.foot.h],
    [0, s.foot.h]
  ]);
  foot.applyMatrix4(Y_TO_Z);
  foot.translate(s.turret.x, s.turret.y, z0);
  const column = slab(s.neck.w, s.neck.d, s.neck.r, zf - 0.5, top, 3);
  column.translate(s.turret.x, s.turret.y, 0);
  return [{ geometry: merged([foot, column]), role: 'dark' }];
}

function head(): Piece[] {
  const s = STANDIN;
  const h = s.head;
  const back = s.turret.y + h.offset;
  const m = headMatrix(back, s.tiltZ);
  const bezelT = 1.6;
  const shell = slab(h.w, h.h, h.r, 0, h.t - bezelT, 1.2);
  const opening = { w: s.panel.w - 2 * s.panel.lip, h: s.panel.h - 2 * s.panel.lip, r: 1.5 };
  const bezel = slab(h.w, h.h, h.r, h.t - bezelT - 0.2, h.t, 0.6, opening);
  shell.applyMatrix4(m);
  bezel.applyMatrix4(m);

  // two ears carry the head from the hubs on the tilt axis to its back face
  const ears: BufferGeometry[] = [];
  const hubs: BufferGeometry[] = [];
  const caps: BufferGeometry[] = [];
  const e = s.ear;
  for (const side of [-1, 1]) {
    const inner = s.neck.w / 2 + e.gap;
    const outline = new Shape();
    outline.moveTo(0, -e.hub);
    outline.lineTo(h.offset + 0.5, -e.w / 2);
    outline.lineTo(h.offset + 0.5, e.w / 2);
    outline.lineTo(0, e.hub);
    outline.absarc(0, 0, e.hub, Math.PI / 2, Math.PI * 1.5, false);
    const plate = new ExtrudeGeometry(outline, { depth: e.t - 1, bevelEnabled: true, bevelThickness: 0.5, bevelSize: 0.5, bevelSegments: 2, curveSegments: CURVE });
    plate.translate(0, 0, 0.5);
    plate.applyMatrix4(SIDE_PLANE);
    plate.translate(side > 0 ? inner : -inner - e.t, s.turret.y, s.tiltZ);
    ears.push(plate);

    const hub = lathe(
      [
        [0, 0],
        [e.hub, 0],
        [e.hub, e.hubH - 0.8],
        [e.hub - 0.8, e.hubH],
        [0, e.hubH]
      ],
      40
    );
    // the lathe height runs along x, outwards on both sides
    hub.applyMatrix4(new Matrix4().makeRotationZ((-side * Math.PI) / 2));
    hub.translate(side * (inner + e.t), s.turret.y, s.tiltZ);
    hubs.push(hub);

    const cap = new CylinderGeometry(e.cap, e.cap, e.capT, 40);
    cap.applyMatrix4(new Matrix4().makeRotationZ(Math.PI / 2));
    cap.translate(side * (inner + e.t + e.hubH + e.capT / 2 - 0.4), s.turret.y, s.tiltZ);
    caps.push(cap);
  }

  // a collar around each light sensor, the shade wall of section 5
  const collars: BufferGeometry[] = [];
  for (const name of ['L', 'R', 'U', 'D'] as const) {
    const p = STANDIN_ASSEMBLY.sensors[name]!;
    const collar = lathe(
      [
        [s.eye.hole, -0.2],
        [s.eye.collar, -0.2],
        [s.eye.collar, s.eye.high * 0.55],
        [s.eye.collar - 0.7, s.eye.high],
        [s.eye.hole, s.eye.high],
        [s.eye.hole, -0.2]
      ],
      36
    );
    collar.translate(p[0], back + h.t, p[2]);
    collars.push(collar);
  }
  // the small window of the lux sensor
  const lux = STANDIN_ASSEMBLY.sensors.lux!;
  const window = new CircleGeometry(1.8, 4);
  window.rotateX(-Math.PI / 2);
  window.rotateY(Math.PI / 4);
  window.translate(lux[0], back + h.t + 0.08, lux[2]);

  return [
    { geometry: merged([shell, bezel, ...ears, ...hubs, ...collars]), role: 'dark' },
    { geometry: merged(caps), role: 'accent' },
    { geometry: merged([window]), role: 'panel' }
  ];
}

function panel(): Piece[] {
  const s = STANDIN;
  const c = STANDIN_ASSEMBLY.panel!.center;
  const shape = roundedRect(s.panel.w, s.panel.h, 1) as Shape;
  const geometry = new ExtrudeGeometry(shape, { depth: 0.4, bevelEnabled: false, curveSegments: 2 });
  geometry.translate(0, 0, -0.4);
  geometry.applyMatrix4(headMatrix(c[1], c[2]));
  geometry.translate(c[0], 0, 0);
  return [{ geometry: merged([geometry]), role: 'panel' }];
}

// the pieces of every stand in part, keyed by the part ids of the assembly
export function standinPieces(): Record<string, Piece[]> {
  return { base: base(), neck: neck(), head: head(), panel: panel() };
}

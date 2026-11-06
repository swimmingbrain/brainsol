// the cad export puts all printed parts of a group into one mesh with one
// material, so the orange caps on the tilt hubs and the dark feet under the
// tray arrive in the colour of their group. the parts inside a mesh still do
// not touch each other, so every solid can be found again by what is joined
// to what, and the small ones get their own role back from where they sit

import { BufferAttribute, BufferGeometry } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Vec3 } from '$lib/sim/kinematics';
import type { Assembly, PartSpec, Role } from './assembly';
import type { Joint } from './joints';
import type { Piece } from './standin';

export interface Box {
  min: Vec3;
  max: Vec3;
}

// a cap is a thin disc, this thin along its axis and at most this wide
const CAP_THICK = 4;
const CAP_WIDE = 20;
// how far the middle of a cap may sit from the joint axis
const CAP_OFF_AXIS = 1.5;
// a foot stands on the floor of a fixed part and is low and small
const FOOT_HIGH = 6;
const FOOT_WIDE = 30;

// the solids of a mesh, one geometry each. vertices at the same spot count as
// one, the export splits them along sharp edges for the normals
export function splitSolids(geometry: BufferGeometry): BufferGeometry[] {
  const position = geometry.getAttribute('position');
  if (!position) return [geometry];
  const index = geometry.getIndex();
  const count = position.count;
  const triangles = Math.floor((index ? index.count : count) / 3);
  const corner = (t: number, k: number) => (index ? index.getX(t * 3 + k) : t * 3 + k);

  const spot = new Int32Array(count);
  const spots = new Map<string, number>();
  for (let i = 0; i < count; i++) {
    const key = `${Math.round(position.getX(i) * 1000)} ${Math.round(position.getY(i) * 1000)} ${Math.round(position.getZ(i) * 1000)}`;
    let id = spots.get(key);
    if (id === undefined) {
      id = spots.size;
      spots.set(key, id);
    }
    spot[i] = id;
  }

  const parent = new Int32Array(spots.size);
  for (let i = 0; i < parent.length; i++) parent[i] = i;
  const find = (a: number): number => {
    while (parent[a] !== a) {
      parent[a] = parent[parent[a]];
      a = parent[a];
    }
    return a;
  };
  const join = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };
  for (let t = 0; t < triangles; t++) {
    join(spot[corner(t, 0)], spot[corner(t, 1)]);
    join(spot[corner(t, 0)], spot[corner(t, 2)]);
  }

  const groups = new Map<number, number[]>();
  for (let t = 0; t < triangles; t++) {
    const root = find(spot[corner(t, 0)]);
    const list = groups.get(root);
    if (list) list.push(t);
    else groups.set(root, [t]);
  }
  if (groups.size <= 1) return [geometry];

  const names = Object.keys(geometry.attributes);
  const remap = new Int32Array(count).fill(-1);
  const out: BufferGeometry[] = [];
  for (const list of groups.values()) {
    const used: number[] = [];
    const indices = new Uint32Array(list.length * 3);
    list.forEach((t, n) => {
      for (let k = 0; k < 3; k++) {
        const v = corner(t, k);
        if (remap[v] < 0) {
          remap[v] = used.length;
          used.push(v);
        }
        indices[n * 3 + k] = remap[v];
      }
    });
    const part = new BufferGeometry();
    for (const name of names) {
      const source = geometry.getAttribute(name);
      const size = source.itemSize;
      const array = new Float32Array(used.length * size);
      used.forEach((v, i) => {
        for (let c = 0; c < size; c++) array[i * size + c] = source.getComponent(v, c);
      });
      // getComponent already turns packed values into plain floats
      part.setAttribute(name, new BufferAttribute(array, size));
    }
    part.setIndex(new BufferAttribute(used.length > 65535 ? indices : Uint16Array.from(indices), 1));
    for (const v of used) remap[v] = -1;
    out.push(part);
  }
  return out;
}

function boxOf(geometry: BufferGeometry): Box | null {
  geometry.computeBoundingBox();
  const b = geometry.boundingBox;
  if (!b || b.isEmpty()) return null;
  return { min: b.min.toArray(), max: b.max.toArray() };
}

// a thin round solid centred on a joint axis, the cover over a pivot screw
export function isCap(box: Box, joints: Joint[]): boolean {
  const size = [0, 1, 2].map((i) => box.max[i] - box.min[i]);
  const mid = [0, 1, 2].map((i) => (box.max[i] + box.min[i]) / 2);
  if (Math.max(...size) > CAP_WIDE) return false;
  return joints.some((joint) => {
    const len = Math.hypot(...joint.axis);
    const a = joint.axis.map((v) => Math.abs(v) / len);
    // the extent along the axis, exact for an axis along x, y or z
    const along = a[0] * size[0] + a[1] * size[1] + a[2] * size[2];
    const across = Math.max(...size.map((s, i) => (a[i] < 0.5 ? s : 0)));
    if (along > CAP_THICK || across < 2 * along) return false;
    const d = [0, 1, 2].map((i) => mid[i] - joint.origin[i]);
    const u = joint.axis.map((v) => v / len);
    const t = d[0] * u[0] + d[1] * u[1] + d[2] * u[2];
    return Math.hypot(d[0] - t * u[0], d[1] - t * u[1], d[2] - t * u[2]) < CAP_OFF_AXIS;
  });
}

// a low small solid on the floor of a part that stands on the table
export function isFoot(box: Box, part: Box): boolean {
  const high = box.max[2] - box.min[2];
  const wide = Math.max(box.max[0] - box.min[0], box.max[1] - box.min[1]);
  return box.min[2] <= part.min[2] + 0.5 && high <= FOOT_HIGH && wide <= FOOT_WIDE && part.max[2] - part.min[2] > 3 * high;
}

// the pieces of one part with the roles of their small solids restored. pieces
// in keep had a material named after a role and stay as they are
export function recast(list: Piece[], part: PartSpec, assembly: Assembly, keep: Set<Piece> = new Set()): Piece[] {
  const joints = Object.values(assembly.joints);
  const loose = list.filter((piece) => !keep.has(piece));
  if (loose.length === 0) return list;

  const whole: Box = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  const solids: { geometry: BufferGeometry; role: Role; box: Box | null }[] = [];
  for (const piece of loose) {
    const parts = splitSolids(piece.geometry);
    if (parts.length > 1 || parts[0] !== piece.geometry) piece.geometry.dispose();
    for (const geometry of parts) {
      const box = boxOf(geometry);
      if (box) {
        for (let i = 0; i < 3; i++) {
          whole.min[i] = Math.min(whole.min[i], box.min[i]);
          whole.max[i] = Math.max(whole.max[i], box.max[i]);
        }
      }
      solids.push({ geometry, role: piece.role, box });
    }
  }

  for (const solid of solids) {
    if (!solid.box) continue;
    if (isCap(solid.box, joints)) solid.role = 'accent';
    else if (part.joint === null && isFoot(solid.box, whole)) solid.role = 'dark';
  }

  // one geometry per role again, so a part costs as few draw calls as before
  const out: Piece[] = list.filter((piece) => keep.has(piece));
  const roles = [...new Set(solids.map((solid) => solid.role))];
  for (const role of roles) {
    const mine = solids.filter((solid) => solid.role === role).map((solid) => solid.geometry);
    const geometry = mine.length === 1 ? mine[0] : mergeGeometries(mine);
    if (!geometry) {
      out.push(...mine.map((g) => ({ geometry: g, role })));
      continue;
    }
    if (geometry !== mine[0]) for (const g of mine) g.dispose();
    out.push({ geometry, role });
  }
  return out;
}

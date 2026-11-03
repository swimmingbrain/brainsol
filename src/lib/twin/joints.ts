// the joints of the 3D model contract in assembly.json. every joint turns
// its group about an axis through an origin, both given in the device frame at
// pan 0 and tilt 0, and carries its parent along. the matrices are 4 by 4 and
// column major, the same layout as three.js, so they drop into Matrix4.fromArray

import { DEG, type Vec3 } from '$lib/sim/kinematics';

export type Mat4 = number[];

export interface Joint {
  origin: Vec3;
  axis: Vec3;
  parent: string | null;
  range?: [number, number];
}

export function identity(): Mat4 {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

export function multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Array<number>(16);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a[k * 4 + row] * b[col * 4 + k];
      out[col * 4 + row] = sum;
    }
  }
  return out;
}

export function translation(v: Vec3): Mat4 {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, v[0], v[1], v[2], 1];
}

// right handed turn by deg about an axis through the origin
export function rotation(axis: Vec3, deg: number): Mat4 {
  const len = Math.hypot(axis[0], axis[1], axis[2]);
  if (!(len > 0) || !Number.isFinite(deg)) return identity();
  const x = axis[0] / len;
  const y = axis[1] / len;
  const z = axis[2] / len;
  const c = Math.cos(deg * DEG);
  const s = Math.sin(deg * DEG);
  const t = 1 - c;
  return [
    t * x * x + c, t * x * y + s * z, t * x * z - s * y, 0,
    t * x * y - s * z, t * y * y + c, t * y * z + s * x, 0,
    t * x * z + s * y, t * y * z - s * x, t * z * z + c, 0,
    0, 0, 0, 1
  ];
}

// the turn of one joint on its own, about its origin
export function jointMatrix(joint: Joint, deg: number): Mat4 {
  const o = joint.origin;
  return multiply(translation(o), multiply(rotation(joint.axis, deg), translation([-o[0], -o[1], -o[2]])));
}

// where every joint group is for these angles, parents first. a joint without
// an angle stays at 0, an unknown parent or a loop counts as no parent
export function poseMatrices(joints: Record<string, Joint>, angles: Record<string, number>): Record<string, Mat4> {
  const done: Record<string, Mat4> = {};
  const visiting = new Set<string>();
  const resolve = (name: string): Mat4 => {
    if (done[name]) return done[name];
    const joint = joints[name];
    if (!joint) return identity();
    visiting.add(name);
    const parent = joint.parent && joints[joint.parent] && !visiting.has(joint.parent) ? resolve(joint.parent) : identity();
    visiting.delete(name);
    const angle = angles[name];
    done[name] = multiply(parent, jointMatrix(joint, Number.isFinite(angle) ? angle : 0));
    return done[name];
  };
  for (const name of Object.keys(joints)) resolve(name);
  return done;
}

export function transformPoint(m: Mat4, p: Vec3): Vec3 {
  return [
    m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
    m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]
  ];
}

export function transformDir(m: Mat4, d: Vec3): Vec3 {
  return [m[0] * d[0] + m[4] * d[1] + m[8] * d[2], m[1] * d[0] + m[5] * d[1] + m[9] * d[2], m[2] * d[0] + m[6] * d[1] + m[10] * d[2]];
}

// the virtual sky around the tracker. a light at azimuth and elevation sits on
// a sphere around the tilt axis, so a line from the glyph to the panel is close
// to the real light direction. dragging the lamp turns a pointer ray into a
// point on that sphere and the point back into azimuth and elevation

import { azEl, clamp, direction, dot, type Vec3 } from '$lib/sim/kinematics';

export function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function scale(a: Vec3, k: number): Vec3 {
  return [a[0] * k, a[1] * k, a[2] * k];
}

export function unit(a: Vec3): Vec3 {
  const len = Math.hypot(a[0], a[1], a[2]);
  return len > 0 ? [a[0] / len, a[1] / len, a[2] / len] : [0, 0, 1];
}

export function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

// where a light at az and el sits on the sphere
export function onSphere(centre: Vec3, radius: number, az: number, el: number): Vec3 {
  return add(centre, scale(direction(az, el), radius));
}

// the two distances along a ray (dir of unit length) where it meets the sphere, near first
export function raySphere(origin: Vec3, dir: Vec3, centre: Vec3, radius: number): [number, number] | null {
  const oc = sub(origin, centre);
  const b = dot(oc, dir);
  const c = dot(oc, oc) - radius * radius;
  const disc = b * b - c;
  if (disc < 0) return null;
  const root = Math.sqrt(disc);
  return [-b - root, -b + root];
}

// the point on the sphere a drag means. of the two hits the one next to the
// last point wins, that keeps the lamp on the side it was grabbed and lets it
// roll over the rim to the far side. a ray past the sphere takes the rim point
export function dragPoint(origin: Vec3, dir: Vec3, centre: Vec3, radius: number, last: Vec3 | null): Vec3 {
  const d = unit(dir);
  const hits = raySphere(origin, d, centre, radius);
  if (hits) {
    const candidates = hits.filter((t) => t >= 0).map((t) => add(origin, scale(d, t)));
    if (candidates.length === 1 || (candidates.length === 2 && !last)) return candidates[0];
    if (candidates.length === 2 && last) return distance(candidates[0], last) <= distance(candidates[1], last) ? candidates[0] : candidates[1];
  }
  // the point of the ray closest to the centre, pushed out onto the sphere
  const along = Math.max(0, dot(sub(centre, origin), d));
  const closest = add(origin, scale(d, along));
  return add(centre, scale(unit(sub(closest, centre)), radius));
}

// azimuth and elevation of a point seen from the centre, the lamp stays on or above the horizon
export function skyAngles(point: Vec3, centre: Vec3): { az: number; el: number } {
  const { az, el } = azEl(sub(point, centre));
  return { az, el: clamp(el, 0, 90) };
}

// one decimal, the way angles travel on the wire
export function round1(value: number): number {
  return Math.round(value * 10) / 10 + 0;
}

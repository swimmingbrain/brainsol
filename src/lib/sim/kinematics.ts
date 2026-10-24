// the frames and angles every part shares. device frame: x to the right, y
// forward, z up, seen from behind. pan turns right, tilt is the elevation of the
// panel normal, past 90 the panel looks backwards over the top

export type Vec3 = [number, number, number];

export const DEG = Math.PI / 180;

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function length(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2]);
}

// the direction the panel faces
export function normal(pan: number, tilt: number): Vec3 {
  const p = pan * DEG;
  const t = tilt * DEG;
  return [Math.sin(p) * Math.cos(t), Math.cos(p) * Math.cos(t), Math.sin(t)];
}

// the right edge of the panel, it only turns with pan
export function right(pan: number): Vec3 {
  const p = pan * DEG;
  return [Math.cos(p), -Math.sin(p), 0];
}

// the top edge of the panel
export function up(pan: number, tilt: number): Vec3 {
  const p = pan * DEG;
  const t = tilt * DEG;
  return [-Math.sin(p) * Math.sin(t), -Math.cos(p) * Math.sin(t), Math.cos(t)];
}

// unit vector from the device towards a light at azimuth az (clockwise from forward) and elevation el
export function direction(az: number, el: number): Vec3 {
  const a = az * DEG;
  const e = el * DEG;
  return [Math.sin(a) * Math.cos(e), Math.cos(a) * Math.cos(e), Math.sin(e)];
}

// azimuth -180 to 180 and elevation -90 to 90 of any vector
export function azEl(v: Vec3): { az: number; el: number } {
  const len = length(v) || 1;
  const el = Math.asin(clamp(v[2] / len, -1, 1)) / DEG;
  const az = Math.atan2(v[0], v[1]) / DEG;
  return { az, el };
}

// folds any angle into -180 to 180
export function wrap180(angle: number): number {
  const a = ((((angle + 180) % 360) + 360) % 360) - 180;
  return a === -180 && angle > 0 ? 180 : a;
}

// the pose that points the panel at a direction. the rear half of the sky is
// reached over the top, pan stays inside -90 to 90
export function poseFor(az: number, el: number): { pan: number; tilt: number } {
  const a = wrap180(az);
  if (Math.abs(a) <= 90) return { pan: a, tilt: el };
  return { pan: a > 0 ? a - 180 : a + 180, tilt: 180 - el };
}

// a direction can be reached two ways: in front, or with pan turned half round
// and tilt over the top. near the sides both end at a soft limit, so the pose
// stays on the side the head is on until that side misses the light by more
// than hold degrees beyond the other one. that keeps a target crawling along
// the edge from flipping the head back and forth
// sun mode asks every tick, so it works on plain numbers and writes into out
export function poseNear(
  az: number,
  el: number,
  from: { pan: number; tilt: number },
  limits: { pan: [number, number]; tilt: [number, number] },
  hold = 3,
  out = { pan: 0, tilt: 0 }
): { pan: number; tilt: number } {
  const w = wrap180(az);
  const front = Math.abs(w) <= 90;
  const firstPan = front ? w : w > 0 ? w - 180 : w + 180;
  const firstTilt = front ? el : 180 - el;
  const aPan = clamp(firstPan, limits.pan[0], limits.pan[1]);
  const aTilt = clamp(firstTilt, limits.tilt[0], limits.tilt[1]);
  const bPan = clamp(firstPan > 0 ? firstPan - 180 : firstPan + 180, limits.pan[0], limits.pan[1]);
  const bTilt = clamp(180 - firstTilt, limits.tilt[0], limits.tilt[1]);
  const missA = miss(aPan, aTilt, az, el);
  const missB = miss(bPan, bTilt, az, el);
  const bestIsA = missA <= missB;
  const nearIsA = Math.max(Math.abs(aPan - from.pan), Math.abs(aTilt - from.tilt)) <= Math.max(Math.abs(bPan - from.pan), Math.abs(bTilt - from.tilt));
  const useA = nearIsA === bestIsA ? bestIsA : (nearIsA ? missA : missB) <= Math.min(missA, missB) + hold ? nearIsA : bestIsA;
  out.pan = useA ? aPan : bPan;
  out.tilt = useA ? aTilt : bTilt;
  return out;
}

// offAxis on plain numbers, both are unit vectors
function miss(pan: number, tilt: number, az: number, el: number): number {
  const p = pan * DEG;
  const t = tilt * DEG;
  const a = az * DEG;
  const e = el * DEG;
  const d = Math.sin(p) * Math.cos(t) * Math.sin(a) * Math.cos(e) + Math.cos(p) * Math.cos(t) * Math.cos(a) * Math.cos(e) + Math.sin(t) * Math.sin(e);
  return Math.acos(clamp(d, -1, 1)) / DEG;
}

// the angle in degrees between two directions
export function angleBetween(a: Vec3, b: Vec3): number {
  const la = length(a) || 1;
  const lb = length(b) || 1;
  return Math.acos(clamp(dot(a, b) / (la * lb), -1, 1)) / DEG;
}

// how far the panel normal at a pose is from a light direction
export function offAxis(pan: number, tilt: number, az: number, el: number): number {
  return angleBetween(normal(pan, tilt), direction(az, el));
}

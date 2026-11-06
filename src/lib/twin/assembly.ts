// the 3D model contract of assembly.json as types, a parser that only
// lets a sound assembly.json through, and the stand in that follows the same
// contract while the cad export is not there. all lengths in millimetres in the
// device frame at pan 0 and tilt 0, x to the right, y forward, z up

import type { Vec3 } from '$lib/sim/kinematics';
import type { Joint } from './joints';

export type Role = 'body' | 'dark' | 'accent' | 'panel';
export const ROLES: Role[] = ['body', 'dark', 'accent', 'panel'];

// the fixed colours of the printed parts, the same in both themes
export const ROLE_COLORS: Record<Role, string> = {
  body: '#e4e2dd',
  dark: '#2a2a2e',
  accent: '#ff8b4b',
  panel: '#141a2a'
};

export type SensorName = 'L' | 'R' | 'U' | 'D' | 'lux';
export const EYES: SensorName[] = ['L', 'R', 'U', 'D'];

export interface PartSpec {
  id: string;
  // a glb next to assembly.json, null for a part the stand in draws
  file: string | null;
  // the joint the part moves with, null for the fixed base
  joint: string | null;
  color: Role;
}

export interface PanelSpec {
  center: Vec3;
  size: [number, number];
  normal: Vec3;
  up: Vec3;
}

export interface Assembly {
  parts: PartSpec[];
  joints: Record<string, Joint>;
  sensors: Partial<Record<SensorName, Vec3>>;
  panel: PanelSpec | null;
  bounds: { min: Vec3; max: Vec3 } | null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function vec3(value: unknown): Vec3 | null {
  if (!Array.isArray(value) || value.length !== 3) return null;
  if (!value.every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
  return [value[0], value[1], value[2]];
}

function vec2(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  if (!value.every((n) => typeof n === 'number' && Number.isFinite(n) && n > 0)) return null;
  return [value[0], value[1]];
}

function nonZero(v: Vec3 | null): Vec3 | null {
  return v && Math.hypot(v[0], v[1], v[2]) > 1e-9 ? v : null;
}

// what the problem is, for the console, or the assembly itself
export function readAssembly(value: unknown): { assembly: Assembly } | { problem: string } {
  if (!isObject(value)) return { problem: 'not an object' };
  if (value.units !== undefined && value.units !== 'mm') return { problem: `units ${String(value.units)}, expected mm` };

  const joints: Record<string, Joint> = {};
  if (value.joints !== undefined && !isObject(value.joints)) return { problem: 'joints is not an object' };
  for (const [name, raw] of Object.entries((value.joints ?? {}) as Record<string, unknown>)) {
    if (!isObject(raw)) return { problem: `joint ${name} is not an object` };
    const origin = vec3(raw.origin);
    const axis = nonZero(vec3(raw.axis));
    if (!origin || !axis) return { problem: `joint ${name} needs an origin and an axis` };
    const parent = typeof raw.parent === 'string' ? raw.parent : null;
    const range = vec2Range(raw.range);
    joints[name] = { origin, axis, parent, ...(range ? { range } : {}) };
  }

  if (!Array.isArray(value.parts) || value.parts.length === 0) return { problem: 'no parts' };
  const parts: PartSpec[] = [];
  const ids = new Set<string>();
  for (const raw of value.parts) {
    if (!isObject(raw) || typeof raw.id !== 'string' || raw.id === '') return { problem: 'a part without an id' };
    if (ids.has(raw.id)) return { problem: `part ${raw.id} twice` };
    ids.add(raw.id);
    const file = typeof raw.file === 'string' && raw.file.trim() !== '' ? raw.file.trim() : null;
    if (file && (file.includes('..') || /^[a-z]+:/i.test(file) || file.startsWith('/'))) return { problem: `part ${raw.id} points outside the models folder` };
    const joint = typeof raw.joint === 'string' ? raw.joint : null;
    if (joint && !joints[joint]) return { problem: `part ${raw.id} moves with an unknown joint ${joint}` };
    const color = ROLES.includes(raw.color as Role) ? (raw.color as Role) : 'dark';
    parts.push({ id: raw.id, file, joint, color });
  }

  const sensors: Partial<Record<SensorName, Vec3>> = {};
  if (isObject(value.sensors)) {
    for (const name of [...EYES, 'lux'] as SensorName[]) {
      const p = vec3(value.sensors[name]);
      if (p) sensors[name] = p;
    }
  }

  let panel: PanelSpec | null = null;
  if (isObject(value.panel)) {
    const center = vec3(value.panel.center);
    const size = vec2(value.panel.size);
    const normal = nonZero(vec3(value.panel.normal)) ?? [0, 1, 0];
    const up = nonZero(vec3(value.panel.up)) ?? [0, 0, 1];
    if (center && size) panel = { center, size, normal, up };
  }

  let bounds: Assembly['bounds'] = null;
  if (isObject(value.bounds)) {
    const min = vec3(value.bounds.min);
    const max = vec3(value.bounds.max);
    if (min && max && min.every((v, i) => v < max[i])) bounds = { min, max };
  }

  return { assembly: { parts, joints, sensors, panel, bounds } };
}

function vec2Range(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  if (!value.every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
  return value[0] <= value[1] ? [value[0], value[1]] : null;
}

export function parseAssembly(value: unknown): Assembly | null {
  const read = readAssembly(value);
  return 'assembly' in read ? read.assembly : null;
}

// the files a browser has to fetch, none for the stand in
export function filesOf(assembly: Assembly): string[] {
  return assembly.parts.flatMap((part) => (part.file ? [part.file] : []));
}

// the joint the panel moves with, the sensors and the light sit on the same group
export function panelJoint(assembly: Assembly): string | null {
  const panel = assembly.parts.find((part) => part.color === 'panel') ?? assembly.parts.find((part) => part.id === 'panel');
  if (panel) return panel.joint;
  return assembly.joints.tilt ? 'tilt' : null;
}

// the stand in, sized like the printed body in the cad
// parameters: a rounded base, a slim neck on a round foot behind the centre,
// the head on two ears in front of the tilt axis
export const STANDIN = {
  base: { w: 156, d: 156, h: 48, r: 20, lid: 3, gap: 0.8, pad: 3 },
  turret: { x: 0, y: -30 },
  foot: { r: 26, h: 10, flare: 6 },
  neck: { w: 40, d: 30, r: 6, above: 13.5 },
  tiltZ: 106,
  ear: { gap: 0.5, t: 6, hub: 9, hubH: 5, w: 26, cap: 6, capT: 1.6 },
  head: { w: 151, h: 111, t: 13, r: 12, offset: 24 },
  panel: { w: 125, h: 85, lip: 2, recess: 1.2 },
  eye: { from: 5, collar: 5, hole: 3.1, high: 1.6 }
} as const;

function standinAssembly(): Assembly {
  const s = STANDIN;
  const back = s.turret.y + s.head.offset;
  const front = back + s.head.t;
  const eyeY = front + 0.05;
  const eu = s.panel.w / 2 + s.eye.from;
  const ev = s.panel.h / 2 + s.eye.from;
  return {
    parts: [
      { id: 'base', file: null, joint: null, color: 'body' },
      { id: 'neck', file: null, joint: 'pan', color: 'dark' },
      { id: 'head', file: null, joint: 'tilt', color: 'dark' },
      { id: 'panel', file: null, joint: 'tilt', color: 'panel' }
    ],
    joints: {
      pan: { origin: [s.turret.x, s.turret.y, s.base.h], axis: [0, 0, -1], parent: null, range: [-90, 90] },
      tilt: { origin: [s.turret.x, s.turret.y, s.tiltZ], axis: [1, 0, 0], parent: 'pan', range: [0, 180] }
    },
    sensors: {
      L: [-eu, eyeY, s.tiltZ],
      R: [eu, eyeY, s.tiltZ],
      U: [0, eyeY, s.tiltZ + ev],
      D: [0, eyeY, s.tiltZ - ev],
      lux: [-eu, eyeY, s.tiltZ + 38]
    },
    panel: { center: [0, front - s.panel.recess, s.tiltZ], size: [s.panel.w, s.panel.h], normal: [0, 1, 0], up: [0, 0, 1] },
    bounds: { min: [-s.base.w / 2, -s.base.d / 2, 0], max: [s.base.w / 2, s.base.d / 2, s.tiltZ + s.head.h / 2] }
  };
}

export const STANDIN_ASSEMBLY: Assembly = standinAssembly();

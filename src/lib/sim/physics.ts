// the light and sensor model of the simulation, the same formulas as the python
// side. four photoresistors behind shade walls on the panel, a BH1750 on the
// panel plane, two servos with a speed limit

import { clamp, DEG } from './kinematics';
import type { Quad } from '$lib/link/protocol';

// shade wall height over sensor width
export const K = 1.2;
// the sum of 8 readings of a 10 bit adc
export const RAW_MAX = 8184;
// photoresistor: 10 k at 10 lux, falling with lux to the power of GAMMA
export const R10 = 10000;
export const GAMMA = 0.7;
// the fixed resistor of the divider
export const R_FIXED = 10000;
// how fast a servo can turn, degrees per second
export const SERVO_SPEED = 400;
// below this cosine the light grazes the panel and no sensor sees it directly
const GRAZE = 0.02;

export interface Light {
  az: number;
  el: number;
  on: boolean;
  // direct illuminance on a surface facing the light, and the ambient light, both lux
  lux0: number;
  amb: number;
}

export const PHONE_LIGHT: Light = { az: 25, el: 40, on: true, lux0: 900, amb: 60 };
export const SUN_LIGHT: Light = { az: 25, el: 40, on: true, lux0: 80000, amb: 9000 };

export interface Reading {
  // direct illuminance on the panel plane
  E: number;
  // how much of the direct light reaches each sensor, L R U D
  f: Quad;
  // adc sums, L R U D
  raw: Quad;
  // the BH1750 on the panel plane
  lux: number;
}

// a small seeded generator, so a test sees the same noise every run
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// normal distribution by box muller
export function gauss(random: () => number, sigma: number): number {
  if (sigma === 0) return 0;
  const u = 1 - random();
  const v = random();
  return sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// the divider output as an adc sum, brighter is higher
export function rawFor(lux: number): number {
  const r = R10 * Math.pow(Math.max(lux, 0.05) / 10, -GAMMA);
  return (RAW_MAX * R_FIXED) / (r + R_FIXED);
}

// which share of the direct light reaches each sensor past its shade wall
export function shading(cn: number, cr: number, cv: number, k = K): Quad {
  if (cn <= GRAZE) return [0, 0, 0, 0];
  const tx = cr / cn;
  const ty = cv / cn;
  return [
    clamp(1 - k * Math.max(0, tx), 0, 1),
    clamp(1 - k * Math.max(0, -tx), 0, 1),
    clamp(1 - k * Math.max(0, -ty), 0, 1),
    clamp(1 - k * Math.max(0, ty), 0, 1)
  ];
}

// everything the sensors report at a pose. noise is a normal random source,
// leave it out for the clean values
export function sense(pan: number, tilt: number, light: Light, random?: () => number, k = K): Reading {
  return senseInto(newReading(), pan, tilt, light, random, k);
}

export function newReading(): Reading {
  return { E: 0, f: [0, 0, 0, 0], raw: [0, 0, 0, 0], lux: 0 };
}

// the same as sense, written into a reading that is reused tick after tick so
// the loop allocates nothing. the noise is drawn in the same order as in sense
export function senseInto(out: Reading, pan: number, tilt: number, light: Light, random?: () => number, k = K): Reading {
  const lux0 = light.on ? light.lux0 : 0;
  const a = light.az * DEG;
  const e = light.el * DEG;
  const sx = Math.sin(a) * Math.cos(e);
  const sy = Math.cos(a) * Math.cos(e);
  const sz = Math.sin(e);
  const sp = Math.sin(pan * DEG);
  const cp = Math.cos(pan * DEG);
  const st = Math.sin(tilt * DEG);
  const ct = Math.cos(tilt * DEG);
  // s against the normal, the right edge and the top edge of the panel, with
  // the products grouped like dot() so the numbers match sense bit for bit
  const cn = sx * (sp * ct) + sy * (cp * ct) + sz * st;
  const cr = sx * cp + sy * -sp + sz * 0;
  const cv = sx * (-sp * st) + sy * (-cp * st) + sz * ct;
  const E = lux0 * Math.max(0, cn);
  const f = out.f;
  if (cn <= GRAZE) {
    f[0] = f[1] = f[2] = f[3] = 0;
  } else {
    const tx = cr / cn;
    const ty = cv / cn;
    f[0] = clamp(1 - k * Math.max(0, tx), 0, 1);
    f[1] = clamp(1 - k * Math.max(0, -tx), 0, 1);
    f[2] = clamp(1 - k * Math.max(0, -ty), 0, 1);
    f[3] = clamp(1 - k * Math.max(0, ty), 0, 1);
  }
  const raw = out.raw;
  for (let i = 0; i < 4; i++) {
    const value = rawFor(E * f[i] + light.amb) + (random ? gauss(random, 6) : 0);
    raw[i] = clamp(Math.round(value), 0, RAW_MAX);
  }
  const lux = (E + light.amb) * (1 + (random ? gauss(random, 0.01) : 0));
  out.E = E;
  out.lux = Math.max(0, lux);
  return out;
}

// one servo moves towards its command, never faster than it can
export function servoStep(angle: number, command: number, dt: number, speed = SERVO_SPEED): number {
  return angle + clamp(command - angle, -speed * dt, speed * dt);
}

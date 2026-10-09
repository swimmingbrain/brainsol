// the light and sensor model of the simulation, the same formulas as the python
// side. four photoresistors behind shade walls on the panel, a BH1750 on the
// panel plane, two servos with a speed limit

import { clamp, direction, dot, normal, right, up } from './kinematics';
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
  const lux0 = light.on ? light.lux0 : 0;
  const s = direction(light.az, light.el);
  const n = normal(pan, tilt);
  const cn = dot(s, n);
  const cr = dot(s, right(pan));
  const cv = dot(s, up(pan, tilt));
  const E = lux0 * Math.max(0, cn);
  const f = shading(cn, cr, cv, k);
  const raw = f.map((share) => {
    const value = rawFor(E * share + light.amb) + (random ? gauss(random, 6) : 0);
    return clamp(Math.round(value), 0, RAW_MAX);
  }) as Quad;
  const lux = (E + light.amb) * (1 + (random ? gauss(random, 0.01) : 0));
  return { E, f, raw, lux: Math.max(0, lux) };
}

// one servo moves towards its command, never faster than it can
export function servoStep(angle: number, command: number, dt: number, speed = SERVO_SPEED): number {
  return angle + clamp(command - angle, -speed * dt, speed * dt);
}

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseAssembly } from './assembly';
import { poseMatrices, transformDir, transformPoint } from './joints';
import type { Vec3 } from '$lib/sim/kinematics';

// the shipped cad model moved by the same joint math the twin uses. the cad
// checks that the head clears the base at every pose, so a miss here would be
// a mistake in how the twin turns the parts

const MODELS = new URL('../../../static/models/', import.meta.url);
const assembly = parseAssembly(JSON.parse(readFileSync(new URL('assembly.json', MODELS), 'utf-8')))!;

// the positions of the one mesh in a glb of the export
function positions(file: string): Float32Array {
  const buf = readFileSync(new URL(file, MODELS));
  const jsonLength = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLength).toString('utf8'));
  const accessor = json.accessors[json.meshes[0].primitives[0].attributes.POSITION];
  const view = json.bufferViews[accessor.bufferView];
  const start = 20 + jsonLength + 8 + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  return new Float32Array(buf.buffer.slice(buf.byteOffset + start, buf.byteOffset + start + accessor.count * 12));
}

function extent(p: Float32Array): { min: Vec3; max: Vec3 } {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], p[i + k]);
      max[k] = Math.max(max[k], p[i + k]);
    }
  }
  return { min, max };
}

describe('the cad model in the twin', () => {
  it('keeps the head above the base at every pose', () => {
    const head = positions('head.glb');
    const base = extent(positions('base.glb'));
    let lowest = Infinity;
    for (let pan = -90; pan <= 90; pan += 10) {
      for (let tilt = 0; tilt <= 180; tilt += 10) {
        const m = poseMatrices(assembly.joints, { pan, tilt }).tilt;
        for (let i = 0; i < head.length; i += 3) {
          const [x, y, z] = transformPoint(m, [head[i], head[i + 1], head[i + 2]]);
          if (x > base.min[0] && x < base.max[0] && y > base.min[1] && y < base.max[1]) lowest = Math.min(lowest, z - base.max[2]);
        }
      }
    }
    expect(lowest).toBeGreaterThan(2);
  });

  it('turns the head to its right for a positive pan and faces forward at tilt 0', () => {
    const panel = assembly.panel!;
    const right = poseMatrices(assembly.joints, { pan: 30, tilt: 0 }).tilt;
    expect(transformPoint(right, panel.center)[0]).toBeGreaterThan(10);
    const level = poseMatrices(assembly.joints, { pan: 0, tilt: 0 }).tilt;
    expect(transformDir(level, panel.normal)).toEqual([0, 1, 0]);
    const flat = poseMatrices(assembly.joints, { pan: 0, tilt: 90 }).tilt;
    expect(transformDir(flat, panel.normal)[2]).toBeCloseTo(1, 9);
  });

  it('has each sensor on the side its name says', () => {
    const { L, R, U, D, lux } = assembly.sensors;
    const { center: c, size } = assembly.panel!;
    expect(size).toEqual([137, 85]);
    expect(L![0]).toBeLessThan(c[0] - size[0] / 2);
    expect(R![0]).toBeGreaterThan(c[0] + size[0] / 2);
    expect(U![2]).toBeGreaterThan(c[2] + size[1] / 2);
    expect(D![2]).toBeLessThan(c[2] - size[1] / 2);
    expect(lux).toBeDefined();
  });
});

import { BoxGeometry, BufferGeometry, CylinderGeometry, Matrix4 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { describe, expect, it } from 'vitest';
import { STANDIN_ASSEMBLY, type PartSpec } from './assembly';
import { isCap, isFoot, recast, splitSolids } from './solids';
import type { Piece } from './standin';

const TILT = STANDIN_ASSEMBLY.joints.tilt;
const PAN = STANDIN_ASSEMBLY.joints.pan;

// a box with corners split for flat normals, like the export writes them
function box(w: number, d: number, h: number, x: number, y: number, z: number): BufferGeometry {
  const g = new BoxGeometry(w, d, h);
  g.translate(x, y, z);
  return g;
}

// a disc on the tilt axis, its flat faces looking along x
function cap(x: number): BufferGeometry {
  const g = new CylinderGeometry(6, 6, 1.6, 24);
  g.applyMatrix4(new Matrix4().makeRotationZ(Math.PI / 2));
  g.translate(x, TILT.origin[1], TILT.origin[2]);
  return g;
}

function one(list: BufferGeometry[]): BufferGeometry {
  return mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)))!;
}

const part = (id: string, joint: string | null): PartSpec => ({ id, file: `${id}.glb`, joint, color: joint ? 'dark' : 'body' });

describe('the solids inside a cad mesh', () => {
  it('finds every solid again, also across split corners', () => {
    const solids = splitSolids(one([box(40, 40, 20, 0, 0, 10), box(10, 10, 3, 30, 30, 1.5), cap(30)]));
    expect(solids).toHaveLength(3);
    const tris = solids.map((g) => g.index!.count / 3).sort((a, b) => a - b);
    // 12 for each box, a cylinder of 24 sides has 96
    expect(tris).toEqual([12, 12, 96]);
  });

  it('leaves a mesh of one solid alone', () => {
    const g = box(10, 10, 10, 0, 0, 0);
    expect(splitSolids(g)[0]).toBe(g);
  });

  it('knows a cap on a joint axis from other small parts', () => {
    const joints = [PAN, TILT];
    const at = (g: BufferGeometry) => {
      g.computeBoundingBox();
      return { min: g.boundingBox!.min.toArray(), max: g.boundingBox!.max.toArray() };
    };
    expect(isCap(at(cap(30)), joints)).toBe(true);
    expect(isCap(at(cap(-30)), joints)).toBe(true);
    // off the axis, too thick, too big
    const off = cap(30);
    off.translate(0, 5, 0);
    expect(isCap(at(off), joints)).toBe(false);
    expect(isCap(at(box(8, 12, 12, 30, TILT.origin[1], TILT.origin[2])), joints)).toBe(false);
    expect(isCap(at(box(1.6, 40, 40, 30, TILT.origin[1], TILT.origin[2])), joints)).toBe(false);
  });

  it('knows a foot under a part that stands on the table', () => {
    const whole = { min: [-78, -78, 0] as [number, number, number], max: [78, 78, 48] as [number, number, number] };
    expect(isFoot({ min: [59, 59, 0], max: [73, 73, 3] }, whole)).toBe(true);
    expect(isFoot({ min: [59, 59, 3], max: [73, 73, 6] }, whole)).toBe(false);
    expect(isFoot({ min: [-78, -78, 0], max: [78, 78, 3] }, whole)).toBe(false);
  });

  it('gives caps and feet their role back and keeps one geometry per role', () => {
    const head: Piece[] = [{ geometry: one([box(150, 12, 110, 0, -5, TILT.origin[2]), cap(30), cap(-30)]), role: 'dark' }];
    const headOut = recast(head, part('head', 'tilt'), STANDIN_ASSEMBLY);
    expect(headOut.map((p) => p.role).sort()).toEqual(['accent', 'dark']);

    const tray = box(156, 156, 45, 0, 0, 25.5);
    const feet = [-1, 1].flatMap((sx) => [-1, 1].map((sy) => box(14, 14, 3, sx * 66, sy * 66, 1.5)));
    const base: Piece[] = [{ geometry: one([tray, ...feet]), role: 'body' }];
    const baseOut = recast(base, part('base', null), STANDIN_ASSEMBLY);
    expect(baseOut.map((p) => p.role).sort()).toEqual(['body', 'dark']);
    const dark = baseOut.find((p) => p.role === 'dark')!;
    expect(dark.geometry.index!.count / 3).toBe(48);
  });

  it('does not touch a piece whose material named its role', () => {
    const piece: Piece = { geometry: one([box(10, 10, 10, 0, 0, 0), cap(30)]), role: 'panel' };
    const out = recast([piece], part('head', 'tilt'), STANDIN_ASSEMBLY, new Set([piece]));
    expect(out).toEqual([piece]);
  });
});

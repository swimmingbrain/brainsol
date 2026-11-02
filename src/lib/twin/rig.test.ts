import { describe, expect, it } from 'vitest';
import { normal, type Vec3 } from '$lib/sim/kinematics';
import { STANDIN_ASSEMBLY } from './assembly';
import { eyeSpot, Rig, planarUv } from './rig';
import { standinPieces } from './standin';
import { BufferGeometry, Float32BufferAttribute } from 'three';

function close(a: Vec3, b: Vec3, digits = 9) {
  a.forEach((value, i) => expect(value).toBeCloseTo(b[i], digits));
}

describe('the rig', () => {
  it('points the panel along n(pan, tilt) and keeps the tilt axis in place', () => {
    const rig = new Rig(STANDIN_ASSEMBLY, standinPieces(), null);
    for (const [pan, tilt] of [
      [0, 0],
      [35, 40],
      [-90, 120],
      [90, 180]
    ]) {
      rig.setPose(pan, tilt);
      close(rig.panelNormal(), normal(pan, tilt));
    }
    rig.dispose();
  });

  it('has a sensor disc for each of the four eyes and one for the lux window', () => {
    const rig = new Rig(STANDIN_ASSEMBLY, standinPieces(), null);
    expect(rig.eyes.map((e) => e.name)).toEqual(['L', 'R', 'U', 'D']);
    expect(rig.lux?.name).toBe('lux');
    rig.dispose();
  });

  it('lifts a disc deep in its well up to where the well opens', () => {
    const panel = { center: [0, 2.6, 107.5] as Vec3, size: [125, 85] as [number, number], normal: [0, 1, 0] as Vec3, up: [0, 0, 1] as Vec3 };
    // a photoresistor face 4.5 mm behind the panel face comes up to its back face
    close(eyeSpot([-67.5, -1.9, 107.5], panel), [-67.5, 2.6 - 2.5 + 0.12, 107.5]);
    // a sensor near the front stays where it is
    close(eyeSpot([0, 7, 160], panel), [0, 7.12, 160]);
    close(eyeSpot([0, 7, 160], null), [0, 7.12, 160]);
  });

  it('ignores a pose that is not a number and says when nothing moved', () => {
    const rig = new Rig(STANDIN_ASSEMBLY, standinPieces(), null);
    expect(rig.setPose(10, 50)).toBe(true);
    expect(rig.setPose(10, 50)).toBe(false);
    expect(rig.setPose(NaN, 50)).toBe(false);
    expect(rig.setPose(10, Infinity)).toBe(false);
    close(rig.panelNormal(), normal(10, 50));
    rig.dispose();
  });

  it('moves the panel centre with the pose, over the top to the back', () => {
    const rig = new Rig(STANDIN_ASSEMBLY, standinPieces(), null);
    rig.setPose(0, 0);
    const front = rig.panelCentre();
    rig.setPose(0, 180);
    const back = rig.panelCentre();
    const axis = STANDIN_ASSEMBLY.joints.tilt.origin;
    expect(front[1]).toBeGreaterThan(axis[1]);
    expect(back[1]).toBeLessThan(axis[1]);
    expect(front[1] - axis[1]).toBeCloseTo(axis[1] - back[1], 9);
    rig.dispose();
  });

  it('lays the panel texture across the panel face from its corners', () => {
    const panel = STANDIN_ASSEMBLY.panel!;
    const [cx, cy, cz] = panel.center;
    const [w, h] = panel.size;
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute([cx - w / 2, cy, cz - h / 2, cx + w / 2, cy, cz + h / 2, cx, cy, cz], 3));
    planarUv(g, panel);
    const uv = Array.from(g.getAttribute('uv').array).map((v) => Math.round(v * 1000) / 1000);
    expect(uv).toEqual([0, 0, 1, 1, 0.5, 0.5]);
  });
});

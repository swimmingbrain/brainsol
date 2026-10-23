import { describe, expect, it } from 'vitest';
import { normal, right, up, type Vec3 } from '$lib/sim/kinematics';
import { identity, jointMatrix, multiply, poseMatrices, rotation, transformDir, transformPoint, translation, type Joint } from './joints';

function close(a: Vec3, b: Vec3, digits = 9) {
  a.forEach((value, i) => expect(value).toBeCloseTo(b[i], digits));
}

// the joints exactly as the contract writes them
const JOINTS: Record<string, Joint> = {
  pan: { origin: [0, -30, 48], axis: [0, 0, -1], parent: null, range: [-90, 90] },
  tilt: { origin: [0, -30, 106], axis: [1, 0, 0], parent: 'pan', range: [0, 180] }
};

describe('the joint matrices', () => {
  it('multiply like matrices do', () => {
    const t = translation([1, 2, 3]);
    expect(multiply(identity(), t)).toEqual(t);
    close(transformPoint(multiply(t, t), [0, 0, 0]), [2, 4, 6]);
  });

  it('turn right handed about the axis', () => {
    close(transformDir(rotation([0, 0, 1], 90), [1, 0, 0]), [0, 1, 0]);
    close(transformDir(rotation([1, 0, 0], 90), [0, 1, 0]), [0, 0, 1]);
    // a zero axis or a broken angle leaves things where they are
    expect(rotation([0, 0, 0], 30)).toEqual(identity());
    expect(rotation([0, 0, 1], NaN)).toEqual(identity());
  });

  it('turn about the joint origin, which stays in place', () => {
    const m = jointMatrix(JOINTS.tilt, 63);
    close(transformPoint(m, JOINTS.tilt.origin), JOINTS.tilt.origin);
  });

  it('point the panel along n(pan, tilt) of section 3 for every pose', () => {
    for (const pan of [-90, -40, 0, 25, 90]) {
      for (const tilt of [0, 30, 90, 140, 180]) {
        const m = poseMatrices(JOINTS, { pan, tilt });
        close(transformDir(m.tilt, [0, 1, 0]), normal(pan, tilt));
        close(transformDir(m.tilt, [1, 0, 0]), right(pan));
        close(transformDir(m.tilt, [0, 0, 1]), up(pan, tilt));
        // the neck only turns with pan
        close(transformDir(m.pan, [0, 1, 0]), normal(pan, 0));
      }
    }
  });

  it('carry the tilt axis around with pan', () => {
    const m = poseMatrices(JOINTS, { pan: 90, tilt: 0 });
    // the axis sits 30 mm behind the pan axis, so a quarter turn moves it to the left
    close(transformPoint(m.tilt, [0, -30, 106]), [0, -30, 106]);
    close(transformPoint(m.tilt, [0, 0, 106]), [30, -30, 106]);
  });

  it('treat a missing angle as zero and survive an unknown parent or a loop', () => {
    const m = poseMatrices(JOINTS, { pan: NaN });
    expect(m.pan).toEqual(identity());
    const odd: Record<string, Joint> = {
      a: { origin: [0, 0, 0], axis: [0, 0, 1], parent: 'b' },
      b: { origin: [0, 0, 0], axis: [0, 0, 1], parent: 'a' },
      c: { origin: [0, 0, 0], axis: [0, 0, 1], parent: 'nowhere' }
    };
    const n = poseMatrices(odd, { a: 10, b: 20, c: 30 });
    close(transformDir(n.c, [1, 0, 0]), transformDir(rotation([0, 0, 1], 30), [1, 0, 0]));
    expect(Object.keys(n).sort()).toEqual(['a', 'b', 'c']);
  });
});

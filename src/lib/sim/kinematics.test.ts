import { describe, expect, it } from 'vitest';
import { angleBetween, azEl, direction, dot, length, normal, offAxis, poseFor, poseNear, right, up, wrap180, type Vec3 } from './kinematics';

function close(a: Vec3, b: Vec3, digits = 9) {
  a.forEach((value, i) => expect(value).toBeCloseTo(b[i], digits));
}

describe('kinematics', () => {
  it('faces forward at pan 0 tilt 0, up at tilt 90 and backwards at tilt 180', () => {
    close(normal(0, 0), [0, 1, 0]);
    close(normal(0, 90), [0, 0, 1]);
    close(normal(0, 180), [0, -1, 0]);
  });

  it('turns to the right for a positive pan, clockwise seen from above', () => {
    close(normal(90, 0), [1, 0, 0]);
    close(normal(-90, 0), [-1, 0, 0]);
  });

  it('keeps normal, right and up at right angles and of unit length', () => {
    for (const pan of [-90, -37, 0, 12.5, 64, 90]) {
      for (const tilt of [0, 23, 90, 133, 180]) {
        const n = normal(pan, tilt);
        const r = right(pan);
        const v = up(pan, tilt);
        expect(length(n)).toBeCloseTo(1, 12);
        expect(length(r)).toBeCloseTo(1, 12);
        expect(length(v)).toBeCloseTo(1, 12);
        expect(dot(n, r)).toBeCloseTo(0, 12);
        expect(dot(n, v)).toBeCloseTo(0, 12);
        expect(dot(r, v)).toBeCloseTo(0, 12);
      }
    }
  });

  it('moves the normal towards up when tilt grows and towards right when pan grows in front', () => {
    const n0 = normal(10, 30);
    const n1 = normal(10, 30.01);
    const n2 = normal(10.01, 30);
    expect(dot([n1[0] - n0[0], n1[1] - n0[1], n1[2] - n0[2]], up(10, 30))).toBeGreaterThan(0);
    expect(dot([n2[0] - n0[0], n2[1] - n0[1], n2[2] - n0[2]], right(10))).toBeGreaterThan(0);
  });

  it('turns the pan response around once the panel looks over the top', () => {
    const n0 = normal(10, 130);
    const n2 = normal(10.01, 130);
    expect(dot([n2[0] - n0[0], n2[1] - n0[1], n2[2] - n0[2]], right(10))).toBeLessThan(0);
  });

  it('gives a light direction from azimuth and elevation and back', () => {
    close(direction(0, 0), [0, 1, 0]);
    close(direction(90, 0), [1, 0, 0]);
    close(direction(0, 90), [0, 0, 1]);
    for (const [az, el] of [
      [25, 40],
      [-120, 10],
      [170, 75],
      [-5, 3]
    ]) {
      const back = azEl(direction(az, el));
      expect(back.az).toBeCloseTo(az, 9);
      expect(back.el).toBeCloseTo(el, 9);
    }
  });

  it('wraps angles into -180 to 180', () => {
    expect(wrap180(190)).toBe(-170);
    expect(wrap180(-190)).toBe(170);
    expect(wrap180(180)).toBe(180);
    expect(wrap180(-180)).toBe(-180);
    expect(wrap180(725)).toBe(5);
  });

  it('points straight at a light in front', () => {
    expect(poseFor(25, 40)).toEqual({ pan: 25, tilt: 40 });
    expect(poseFor(-90, 10)).toEqual({ pan: -90, tilt: 10 });
  });

  it('reaches the rear half of the sky over the top', () => {
    expect(poseFor(150, 30)).toEqual({ pan: -30, tilt: 150 });
    expect(poseFor(-135, 50)).toEqual({ pan: 45, tilt: 130 });
    expect(poseFor(180, 20)).toEqual({ pan: 0, tilt: 160 });
  });

  it('always lands on the light with the pose it picks', () => {
    for (let az = -180; az <= 180; az += 15) {
      for (let el = 0; el <= 90; el += 15) {
        const pose = poseFor(az, el);
        expect(pose.pan).toBeGreaterThanOrEqual(-90);
        expect(pose.pan).toBeLessThanOrEqual(90);
        expect(pose.tilt).toBeGreaterThanOrEqual(0);
        expect(pose.tilt).toBeLessThanOrEqual(180);
        // acos near 1 loses digits, a millionth of a degree is still the same direction
        expect(offAxis(pose.pan, pose.tilt, az, el)).toBeLessThan(1e-4);
      }
    }
  });

  it('picks the straight pose for a light well in front or well behind', () => {
    const limits = { pan: [-88, 88] as [number, number], tilt: [4, 176] as [number, number] };
    expect(poseNear(25, 40, { pan: 0, tilt: 90 }, limits)).toEqual({ pan: 25, tilt: 40 });
    expect(poseNear(150, 30, { pan: 0, tilt: 40 }, limits)).toEqual({ pan: -30, tilt: 150 });
  });

  it('stays on the side the head is on while a light crawls along the edge', () => {
    const limits = { pan: [-88, 88] as [number, number], tilt: [4, 176] as [number, number] };
    // the light passes the left side from front to back at 20 degrees elevation
    let pose = poseNear(-80, 20, { pan: 0, tilt: 20 }, limits);
    const flips: number[] = [];
    for (let az = -80; az >= -100; az -= 0.25) {
      const next = poseNear(az, 20, pose, limits);
      if (Math.abs(next.pan - pose.pan) > 20) flips.push(az);
      pose = next;
    }
    // exactly one swing, and only once the front side misses by more than the hold
    expect(flips).toHaveLength(1);
    // the front side ends at pan -88 and misses by about (az + 88) cos 20 there
    expect(flips[0]).toBeLessThan(-91);
    expect(flips[0]).toBeGreaterThan(-93);
    expect(pose.tilt).toBeGreaterThan(90);
    expect(offAxis(pose.pan, pose.tilt, -100, 20)).toBeLessThan(1e-6);
  });

  it('measures the angle between two directions', () => {
    expect(angleBetween([1, 0, 0], [0, 1, 0])).toBeCloseTo(90, 9);
    expect(angleBetween([0, 0, 2], [0, 0, 1])).toBeCloseTo(0, 6);
    expect(angleBetween([1, 0, 0], [-1, 0, 0])).toBeCloseTo(180, 9);
  });
});

import { describe, expect, it } from 'vitest';
import { direction, type Vec3 } from '$lib/sim/kinematics';
import { distance, dragPoint, onSphere, raySphere, round1, skyAngles, sub, unit } from './sky';

const C: Vec3 = [0, -30, 106];
const R = 200;

function close(a: Vec3, b: Vec3, digits = 6) {
  a.forEach((value, i) => expect(value).toBeCloseTo(b[i], digits));
}

describe('the sky', () => {
  it('puts a light on the sphere in its direction', () => {
    close(onSphere(C, R, 0, 0), [0, 170, 106]);
    close(onSphere(C, R, 90, 0), [200, -30, 106]);
    close(onSphere(C, R, 0, 90), [0, -30, 306]);
    const p = onSphere(C, R, 25, 40);
    expect(distance(p, C)).toBeCloseTo(R, 9);
    close(unit(sub(p, C)), direction(25, 40));
  });

  it('reads azimuth and elevation back from a point', () => {
    for (const [az, el] of [
      [25, 40],
      [-120, 10],
      [170, 75],
      [0, 0]
    ]) {
      const a = skyAngles(onSphere(C, R, az, el), C);
      expect(a.az).toBeCloseTo(az, 9);
      expect(a.el).toBeCloseTo(el, 9);
    }
  });

  it('keeps the lamp on or above the horizon', () => {
    expect(skyAngles([0, 200, 0], [0, 0, 106]).el).toBe(0);
  });

  it('finds where a ray meets the sphere, near side first', () => {
    const hits = raySphere([0, -30, 1000], [0, 0, -1], C, R);
    expect(hits).not.toBeNull();
    expect(hits![0]).toBeCloseTo(1000 - 306, 9);
    expect(hits![1]).toBeCloseTo(1000 - 106 + 200, 9);
    expect(raySphere([500, -30, 1000], [0, 0, -1], C, R)).toBeNull();
  });

  it('drags on the side the lamp was grabbed', () => {
    const origin: Vec3 = [0, 900, 106];
    const dir: Vec3 = [0, -1, 0.05];
    const near = dragPoint(origin, dir, C, R, onSphere(C, R, 0, 5));
    const far = dragPoint(origin, dir, C, R, onSphere(C, R, 180, 5));
    expect(near[1]).toBeGreaterThan(C[1]);
    expect(far[1]).toBeLessThan(C[1]);
    expect(distance(near, C)).toBeCloseTo(R, 6);
    expect(distance(far, C)).toBeCloseTo(R, 6);
  });

  it('takes the near hit when it knows no last point', () => {
    const p = dragPoint([0, 900, 106], [0, -1, 0], C, R, null);
    close(p, [0, 170, 106]);
  });

  it('holds the lamp on the rim when the ray passes the sphere', () => {
    const p = dragPoint([500, 900, 106], [0, -1, 0], C, R, null);
    expect(distance(p, C)).toBeCloseTo(R, 6);
    close(unit(sub(p, C)), [1, 0, 0]);
  });

  it('works from inside the sphere too', () => {
    const p = dragPoint(C, [0, 0, 1], C, R, null);
    close(p, [0, -30, 306]);
  });

  it('rounds to one decimal without a negative zero', () => {
    expect(round1(12.345)).toBe(12.3);
    expect(Object.is(round1(-0.04), 0)).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { follow, settle, settled, spring, springStep } from './damp';

function run(fps: number, seconds: number, target: number, omega = 12) {
  const s = spring(0);
  const steps = Math.round(seconds * fps);
  for (let i = 0; i < steps; i++) springStep(s, target, omega, 1 / fps);
  return s;
}

describe('the spring', () => {
  it('reaches a held target and stays there', () => {
    const s = run(60, 2, 10);
    expect(s.x).toBeCloseTo(10, 4);
    expect(s.v).toBeCloseTo(0, 3);
  });

  it('never swings past the target, it is critically damped', () => {
    const s = spring(0);
    let max = 0;
    for (let i = 0; i < 600; i++) {
      springStep(s, 1, 15, 1 / 120);
      max = Math.max(max, s.x);
    }
    expect(max).toBeLessThanOrEqual(1 + 1e-12);
  });

  it('ends at the same place at 30, 60 and 144 frames a second', () => {
    const a = run(30, 0.5, 5);
    const b = run(60, 0.5, 5);
    const c = run(144, 0.5, 5);
    expect(b.x).toBeCloseTo(a.x, 6);
    expect(c.x).toBeCloseTo(a.x, 6);
  });

  it('gives the same result for one long step as for many short ones', () => {
    const one = spring(2);
    springStep(one, -3, 9, 0.2);
    const many = spring(2);
    for (let i = 0; i < 20; i++) springStep(many, -3, 9, 0.01);
    expect(many.x).toBeCloseTo(one.x, 9);
    expect(many.v).toBeCloseTo(one.v, 9);
  });

  it('ignores a zero or negative step and a target that is not a number', () => {
    const s = spring(1);
    springStep(s, 4, 10, 0);
    springStep(s, 4, 10, -1);
    springStep(s, NaN, 10, 0.016);
    springStep(s, Infinity, 10, 0.016);
    expect(s).toEqual({ x: 1, v: 0 });
  });

  it('knows when it rests and snaps onto the target then', () => {
    const s = spring(0);
    expect(settled(s, 1)).toBe(false);
    expect(settle(s, 1)).toBe(false);
    const near = { x: 1.0004, v: 0.001 };
    expect(settle(near, 1)).toBe(true);
    expect(near).toEqual({ x: 1, v: 0 });
  });
});

describe('follow', () => {
  it('covers the same share over a second at any frame rate', () => {
    const at = (fps: number) => {
      let x = 0;
      for (let i = 0; i < fps; i++) x += (1 - x) * follow(5, 1 / fps);
      return x;
    };
    expect(at(30)).toBeCloseTo(at(144), 9);
    expect(at(60)).toBeCloseTo(1 - Math.exp(-5), 9);
  });

  it('does nothing without time', () => {
    expect(follow(5, 0)).toBe(0);
  });
});

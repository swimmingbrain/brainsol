import { describe, expect, it } from 'vitest';
import { Glide } from './glide';

describe('the glide', () => {
  it('starts on the first sample', () => {
    const g = new Glide();
    expect(g.has).toBe(false);
    g.push(12, 1000);
    expect(g.has).toBe(true);
    expect(g.sample(1000)).toBe(12);
    expect(g.sample(5000)).toBe(12);
  });

  it('runs straight from the old value to the new one over one interval', () => {
    const g = new Glide();
    g.push(0, 0);
    g.push(10, 50);
    expect(g.sample(50)).toBe(0);
    expect(g.sample(75)).toBeCloseTo(5, 9);
    expect(g.sample(100)).toBeCloseTo(10, 9);
    expect(g.moving(75)).toBe(true);
    expect(g.moving(100)).toBe(false);
  });

  it('never jumps when a sample comes early or late', () => {
    const g = new Glide();
    g.push(0, 0);
    let value = 0;
    let at = 0;
    let before = g.sample(0);
    // an uneven 20 Hz beat like the 50 Hz loop gives, 40 and 60 ms apart
    for (let i = 0; i < 40; i++) {
      at += i % 2 ? 40 : 60;
      value += 3;
      const just = g.sample(at - 0.001);
      g.push(value, at);
      expect(Math.abs(g.sample(at) - just)).toBeLessThan(0.01);
      expect(g.sample(at)).toBeGreaterThanOrEqual(before - 1e-9);
      before = g.sample(at);
    }
  });

  it('rests on the last value when the stream stops', () => {
    const g = new Glide();
    g.push(0, 0);
    g.push(4, 50);
    g.push(8, 100);
    expect(g.sample(10_000)).toBeCloseTo(8, 9);
    expect(g.moving(10_000)).toBe(false);
  });

  it('learns a slower beat but not from one stall', () => {
    const g = new Glide();
    g.push(0, 0);
    for (let i = 1; i <= 30; i++) g.push(i, i * 200);
    // after many 200 ms gaps half of the next gap is about half the way
    g.push(100, 6200);
    expect(g.sample(6300)).toBeGreaterThan(30 + 0.4 * 70);
    expect(g.sample(6300)).toBeLessThan(30 + 0.6 * 70);

    const h = new Glide();
    h.push(0, 0);
    for (let i = 1; i <= 30; i++) h.push(i, i * 50);
    // a stall of five seconds, then the beat goes on
    h.push(40, 6500);
    h.push(41, 6550);
    expect(h.sample(6600)).toBeCloseTo(41, 6);
  });

  it('takes the short way round for wrapped angles', () => {
    const g = new Glide(true);
    g.push(170, 0);
    g.push(-170, 50);
    // half way from 170 to 190, not back through zero
    expect(g.sample(75)).toBeCloseTo(180, 6);
    expect(g.sample(100)).toBeCloseTo(190, 6);
  });

  it('skips samples that are not numbers', () => {
    const g = new Glide();
    g.push(3, 0);
    g.push(NaN, 50);
    g.push(Infinity, 60);
    expect(g.sample(100)).toBe(3);
  });

  it('jumps on reset and forgets on clear', () => {
    const g = new Glide();
    g.push(0, 0);
    g.push(50, 50);
    g.reset(-20, 60);
    expect(g.sample(60)).toBe(-20);
    g.clear();
    expect(g.has).toBe(false);
  });
});

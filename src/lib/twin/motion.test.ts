import { describe, expect, it } from 'vitest';
import { settle, spring, springStep } from './damp';
import { Glide } from './glide';

// the joint motion of the twin: frames go into a glide, every screen frame
// the spring follows the glide. this plays a stream through it at 60 fps
function play(frames: { at: number; value: number }[], until: number, fps = 60) {
  const glide = new Glide();
  const s = spring(frames[0].value);
  const shown: number[] = [];
  let next = 0;
  for (let now = 0; now <= until; now += 1000 / fps) {
    while (next < frames.length && frames[next].at <= now) {
      glide.push(frames[next].value, frames[next].at);
      next++;
    }
    springStep(s, glide.sample(now), 22, 1 / fps);
    shown.push(s.x);
  }
  return shown;
}

describe('the joint motion', () => {
  it('turns an uneven 20 Hz stream into an even motion', () => {
    // 30 degrees a second, frames 40 and 60 ms apart with a little jitter
    const frames = [];
    let at = 0;
    for (let i = 0; i < 60; i++) {
      frames.push({ at, value: (at / 1000) * 30 });
      at += (i % 2 ? 40 : 60) + ((i * 7) % 5) - 2;
    }
    const shown = play(frames, at);
    // the steady part, after the start and before the end
    const steps = shown.slice(30, shown.length - 30).map((v, i, a) => (i ? v - a[i - 1] : NaN)).slice(1);
    const mean = steps.reduce((a, b) => a + b, 0) / steps.length;
    expect(mean).toBeCloseTo(0.5, 1);
    // no step is more than a third off the mean, no stutter on the beat of the frames
    for (const step of steps) expect(Math.abs(step - mean)).toBeLessThan(mean / 3);
    // and it never runs backwards
    for (const step of steps) expect(step).toBeGreaterThan(0);
  });

  it('comes to rest where the stream stopped, without swinging past', () => {
    const frames = Array.from({ length: 20 }, (_, i) => ({ at: i * 50, value: Math.min(i, 10) * 2 }));
    const shown = play(frames, 3000);
    expect(Math.max(...shown)).toBeLessThanOrEqual(20 + 1e-6);
    expect(shown[shown.length - 1]).toBeCloseTo(20, 3);
  });

  it('rests when the stream stalls and moves on when it comes back', () => {
    const frames = [
      ...Array.from({ length: 10 }, (_, i) => ({ at: i * 50, value: i })),
      // two seconds of silence
      ...Array.from({ length: 10 }, (_, i) => ({ at: 2450 + i * 50, value: 9 + i }))
    ];
    const shown = play(frames, 3500);
    const during = shown.slice(Math.round(1.2 * 60), Math.round(2.4 * 60));
    expect(Math.max(...during) - Math.min(...during)).toBeLessThan(0.01);
    expect(shown[shown.length - 1]).toBeCloseTo(18, 2);
  });

  it('settles to the exact value so a resting scene draws nothing', () => {
    const s = spring(0);
    let frames = 0;
    while (!settle(s, 5, 0.002) && frames < 600) {
      springStep(s, 5, 22, 1 / 60);
      frames++;
    }
    expect(s.x).toBe(5);
    expect(frames).toBeLessThan(60);
  });
});

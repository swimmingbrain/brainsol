// how the sensor windows on the head light up. the four photoresistors glow
// along the dark theme ramp from the colour of the head up to copper, they sit
// on the charcoal head in both themes. the lux window measures on the panel
// plane, so it glows in the cool blue of the panel and never passes for one of
// the four eyes

import { follow } from './damp';
import { mix, parseColor, ramp, steps, type Rgb } from './ramp';

export const EYE_RAMP: Rgb[] = ['#26221f', '#4a3a2b', '#7a5c3d', '#a87c52', '#d19a66'].map((c) => parseColor(c) as Rgb);
export const LUX_RAMP: Rgb[] = ['#161b27', '#222c40', '#36445f', '#55688a', '#7d90b2'].map((c) => parseColor(c) as Rgb);

// changes smaller than this are noise of a resting tracker, not light
const LEVEL_BAND = 0.05;

export interface Glow {
  level: number;
  now: Rgb;
  drawn: Rgb;
}

export function glow(stops: readonly Rgb[]): Glow {
  return { level: 0, now: [...stops[0]] as Rgb, drawn: [-1, -1, -1] };
}

// lux on a log scale: 10 lx and less is dark, about 3000 lx is full
export function luxLevel(lux: unknown): number {
  if (typeof lux !== 'number' || !Number.isFinite(lux) || lux <= 10) return 0;
  return Math.min(1, (Math.log10(lux) - 1) / 2.5);
}

// one step towards the level a sensor reports. busy while it still eases, the
// colour to draw when it changed enough to see, else null
export function stepGlow(state: Glow, level: number, stops: readonly Rgb[], dt: number): { busy: boolean; draw: Rgb | null } {
  const value = Number.isFinite(level) ? Math.min(1, Math.max(0, level)) : 0;
  if (Math.abs(value - state.level) > LEVEL_BAND || value === 0 || value === 1) state.level = value;
  const goal = ramp(stops, state.level);
  state.now = mix(state.now, goal, follow(10, dt));
  let busy = true;
  if (steps(state.now, goal) <= 0.5) {
    state.now = goal;
    busy = false;
  }
  if (steps(state.now, state.drawn) < 1) return { busy, draw: null };
  state.drawn = [...state.now];
  return { busy, draw: state.drawn };
}

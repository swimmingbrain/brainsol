// the maths behind the light balance widget: a level painted on the five step
// heat ramp, the ink that stays readable on it, and the bubble level that maps
// the two errors into a disc

export type Rgb = [number, number, number];

// #rgb, #rrggbb or rgb(a) as css writes them, null for anything else
export function parseColor(text: string): Rgb | null {
  const value = text.trim();
  let match = /^#([0-9a-f]{3})$/i.exec(value);
  if (match) return [...match[1]].map((c) => parseInt(c + c, 16)) as Rgb;
  match = /^#([0-9a-f]{6})$/i.exec(value);
  if (match) return [0, 2, 4].map((i) => parseInt(match![1].slice(i, i + 2), 16)) as Rgb;
  match = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(value);
  if (match) return [Number(match[1]), Number(match[2]), Number(match[3])];
  return null;
}

export function toHex(rgb: Rgb): string {
  return `#${rgb.map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, '0')).join('')}`;
}

// a level 0 to 1 along the ramp. the five steps are the stops, in between the
// colour runs straight, so a level that creeps up never jumps a whole step
export function heatColor(level: number, ramp: readonly string[]): string {
  const stops = ramp.map(parseColor).filter((c): c is Rgb => c !== null);
  if (stops.length === 0) return '#000000';
  if (stops.length === 1 || !Number.isFinite(level)) return toHex(stops[0]);
  const x = Math.min(1, Math.max(0, level)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const f = x - i;
  const a = stops[i];
  const b = stops[i + 1];
  return toHex([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]);
}

// relative luminance after wcag
export function luminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// text on a filled area is near white or near black, whichever reads better
export function inkOn(color: string): 'light' | 'dark' {
  const rgb = parseColor(color);
  if (!rgb) return 'light';
  const l = luminance(rgb);
  // contrast against white (1.05) and against near black (l of #111113 is about 0.006)
  return 1.05 / (l + 0.05) >= (l + 0.05) / 0.056 ? 'light' : 'dark';
}

// how far from the centre an error sits, 0 to 1. a plain linear scale would
// squeeze the dead band of a few hundredths into a dot, this one opens the
// middle up and still reaches the rim at an error of 1
export const SOFT = 0.15;

export function spread(error: number, soft = SOFT): number {
  const e = Math.min(1, Math.abs(error));
  return (e * (1 + soft)) / (e + soft);
}

// the dot of the bubble level for the two errors, inside the unit disc.
// x grows to the right where R is brighter, y grows upwards where U is brighter
export function bubble(ex: number, ey: number, soft = SOFT): { x: number; y: number } {
  if (!Number.isFinite(ex) || !Number.isFinite(ey)) return { x: 0, y: 0 };
  const r = Math.hypot(ex, ey);
  if (r === 0) return { x: 0, y: 0 };
  const scaled = spread(r, soft);
  return { x: (ex / r) * scaled, y: (ey / r) * scaled };
}

// one step of an exponential follow, dt and tau in seconds. a large dt lands on the target
export function follow(current: number, target: number, dt: number, tau: number): number {
  if (!(tau > 0)) return target;
  return current + (target - current) * (1 - Math.exp(-Math.max(0, dt) / tau));
}

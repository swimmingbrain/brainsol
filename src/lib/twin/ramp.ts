// colours for the scene as plain numbers 0 to 1. the css tokens arrive as
// strings, the heat ramp of the charts has five steps and the scene needs
// every shade in between, for the sensor eyes and the sky map

export type Rgb = [number, number, number];

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const FUNC = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i;

// #rgb, #rrggbb, rgb() and rgba(), the alpha is left out. null for anything else
export function parseColor(text: string | null | undefined): Rgb | null {
  const value = (text ?? '').trim();
  const hex = HEX.exec(value);
  if (hex) {
    let digits = hex[1];
    if (digits.length === 3) digits = [...digits].map((d) => d + d).join('');
    const n = parseInt(digits, 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }
  const func = FUNC.exec(value);
  if (func) return [Number(func[1]) / 255, Number(func[2]) / 255, Number(func[3]) / 255].map((c) => Math.min(1, Math.max(0, c))) as Rgb;
  return null;
}

export function color(text: string | null | undefined, fallback: string): Rgb {
  return parseColor(text) ?? (parseColor(fallback) as Rgb);
}

export function mix(a: Rgb, b: Rgb, t: number): Rgb {
  const k = t <= 0 ? 0 : t >= 1 ? 1 : t;
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

// t from 0 to 1 across the stops, evenly spaced. outside the range it holds the ends
export function ramp(stops: readonly Rgb[], t: number): Rgb {
  if (stops.length === 0) return [0, 0, 0];
  if (stops.length === 1 || !(t > 0)) return [...stops[0]];
  if (t >= 1) return [...stops[stops.length - 1]];
  const at = t * (stops.length - 1);
  const i = Math.floor(at);
  return mix(stops[i], stops[i + 1], at - i);
}

// the biggest difference of one channel in 8 bit steps, to skip a redraw nobody would see
export function steps(a: Rgb, b: Rgb): number {
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2])) * 255;
}

export function toHex(c: Rgb): string {
  return `#${c.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('')}`;
}

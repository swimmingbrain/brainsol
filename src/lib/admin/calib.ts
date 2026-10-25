// the guided calibration: the steps in order, what the tracker answers to each
// and how that reads as a sentence. the ack data of calib is not part of
// protocol.ts, so everything coming back is read with care and may be missing

import type { CalibStep, Quad } from '$lib/link/protocol';

// the raw sums of eight ADC readings run from 0 to this
export const RAW_MAX = 8184;
// less than this between dark and bright and a sensor cannot tell light from shade
export const MIN_SPAN = 50;
export const SENSORS = ['L', 'R', 'U', 'D'] as const;
export type Sensor = (typeof SENSORS)[number];

export type FlowStep = Exclude<CalibStep, 'reset'>;
export const FLOW: FlowStep[] = ['dark', 'bright', 'zero', 'polarity', 'save'];

// how far a bar is filled, null while the tracker has no reading
export function barLevel(raw: number | null | undefined): number | null {
  if (raw === null || raw === undefined || !Number.isFinite(raw)) return null;
  return Math.min(1, Math.max(0, raw / RAW_MAX));
}

export interface SpanReport {
  dark: number[];
  bright: number[];
  span: number[];
  inverted: boolean[];
  weak: boolean[];
}

function quad(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length !== 4) return null;
  return value.every((n) => typeof n === 'number' && Number.isFinite(n)) ? (value as number[]) : null;
}

// dark and bright side by side, worked out here when the tracker leaves it out
export function spanOf(dark: number[], bright: number[]): SpanReport {
  const span = dark.map((d, i) => Math.round((bright[i] - d) * 10) / 10);
  return {
    dark,
    bright,
    span,
    inverted: span.map((s) => s < 0),
    weak: span.map((s) => Math.abs(s) < MIN_SPAN)
  };
}

// the answer to dark, bright, save and reset: {dark, bright, span, inverted, weak}
export function readSpan(data: unknown): SpanReport | null {
  if (typeof data !== 'object' || data === null) return null;
  const record = data as Record<string, unknown>;
  const dark = quad(record.dark);
  const bright = quad(record.bright);
  if (!dark || !bright) return null;
  return spanOf(dark, bright);
}

export interface PolarityReport {
  // 1 when the wiring matches the docs, -1 when the loop has to turn that axis around
  sx: number;
  sy: number;
}

export function readPolarity(data: unknown): PolarityReport | null {
  if (typeof data !== 'object' || data === null) return null;
  const { sx, sy } = data as Record<string, unknown>;
  if ((sx !== 1 && sx !== -1) || (sy !== 1 && sy !== -1)) return null;
  return { sx, sy };
}

export interface ZeroReport {
  pan_us: number;
  tilt_us: number;
}

export function readZero(data: unknown): ZeroReport | null {
  if (typeof data !== 'object' || data === null) return null;
  const { pan_us, tilt_us } = data as Record<string, unknown>;
  if (typeof pan_us !== 'number' || typeof tilt_us !== 'number') return null;
  return { pan_us: Math.round(pan_us), tilt_us: Math.round(tilt_us) };
}

// the names of the sensors a flag points at, for a sentence like "U and D"
export function sensorsWhere(flags: boolean[]): Sensor[] {
  return SENSORS.filter((_, i) => flags[i]);
}

// the raw readings of this moment as a quad, null while any is missing
export function rawNow(raw: (number | null)[] | null | undefined): Quad | null {
  if (!raw || raw.length !== 4 || raw.some((n) => n === null || !Number.isFinite(n))) return null;
  return raw as Quad;
}

// polarity turns the head a few degrees around where it stands. near flat the
// pan has no clear direction, the tracker refuses there
export const FLAT_MARGIN = 5;

export function nearFlat(tilt: number | null, zenithBand: number): boolean {
  return tilt !== null && Math.abs(tilt - 90) < zenithBand + FLAT_MARGIN;
}

// a tilt clearly outside that band on the side the head already leans to
export function polarityTilt(tilt: number | null, zenithBand: number, limits: [number, number]): number {
  const away = zenithBand + FLAT_MARGIN + 15;
  const target = tilt !== null && tilt > 90 ? 90 + away : 90 - away;
  return Math.min(limits[1], Math.max(limits[0], target));
}

// the first step not done yet, the one the tab points at
export function nextStep(done: Iterable<FlowStep>): FlowStep | null {
  const seen = new Set(done);
  return FLOW.find((step) => !seen.has(step)) ?? null;
}

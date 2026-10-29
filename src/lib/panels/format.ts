// how the panels write their numbers. plain functions on top of fmt, so the
// tiles, the charts and the results all say a value the same way. null in,
// null out, the caller draws the quiet placeholder

import { fmt } from '$lib/i18n';
import type { Lang } from '$lib/stores/preferences.svelte';

export interface Figure {
  value: string;
  unit: string;
}

// the gain ratio against the fixed panel as a signed percent, 1.34 is +34
export function gainPercent(gain: number | null | undefined, lang?: Lang): string | null {
  if (gain === null || gain === undefined || !Number.isFinite(gain)) return null;
  const percent = Math.round((gain - 1) * 100);
  const text = fmt(Math.abs(percent), 0, lang);
  if (text === null) return null;
  if (percent > 0) return `+${text}`;
  if (percent < 0) return `-${text}`;
  return text;
}

// panel power in milliwatts, switches to watts at one watt so the figure stays short
export function power(mw: number | null | undefined, lang?: Lang): Figure | null {
  if (mw === null || mw === undefined || !Number.isFinite(mw)) return null;
  const size = Math.abs(mw);
  if (size >= 1000) {
    const watts = mw / 1000;
    return { value: fmt(watts, Math.abs(watts) >= 10 ? 1 : 2, lang) ?? '', unit: 'W' };
  }
  const digits = size >= 100 ? 0 : size >= 10 ? 1 : 2;
  return { value: fmt(mw, digits, lang) ?? '', unit: 'mW' };
}

// an illuminance in lux, one decimal only in the dark where it matters
export function lux(value: number | null | undefined, lang?: Lang): string | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return fmt(value, Math.abs(value) < 10 ? 1 : 0, lang);
}

// a level 0 to 1 as a whole percent
export function percent(level: number | null | undefined, lang?: Lang): string | null {
  if (level === null || level === undefined || !Number.isFinite(level)) return null;
  return fmt(Math.round(level * 100), 0, lang);
}

// the off target angle only claims what the sensors can tell: whole degrees,
// and below one degree just that it is under one
export function roughAngle(degrees: number | null | undefined): { under: boolean; value: number } | null {
  if (degrees === null || degrees === undefined || !Number.isFinite(degrees)) return null;
  const size = Math.abs(degrees);
  if (size < 1) return { under: true, value: 1 };
  return { under: false, value: Math.round(size) };
}

// a value with its sign, so +0.022 and -0.022 read as the two sides they are.
// a value that rounds to zero gets no sign
export function signed(value: number | null | undefined, digits: number, lang?: Lang): string | null {
  const text = fmt(value, digits, lang);
  if (text === null || value === null || value === undefined) return null;
  return value > 0 && /[1-9]/.test(text) ? `+${text}` : text;
}

// an angle with one decimal, the way the tracker sends it
export function angle(degrees: number | null | undefined, lang?: Lang): string | null {
  return fmt(degrees, 1, lang);
}

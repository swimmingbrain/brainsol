// the plan of the planner on the brain server, the "plan" key next to the
// recipe. it says whether the plant gets its light today, what that light costs
// in revenue and how far the panel turns away from the sun in each hour of the
// rest of the day. every field may be missing, the tab shows what is there and
// a key this page does not know is left alone

import { minutes, type Window } from './recipe';
import type { Key } from '$lib/i18n';

export interface PlanHour {
  from: string;
  to: string;
  // degrees away from the sun, 0 faces it and 90 is edge on
  offset: number | null;
  // sun, light, price, stress, shade or power_hour, a newer planner may send others
  why: string | null;
  // the power price in that hour as the planner sends it
  price: number | null;
}

// three values for a poor, a middle and a good sky
export type Band = [number, number, number];

export interface DayPlan {
  date: string | null;
  // the planner's simulated time of day, "HH:MM"
  now: string | null;
  // whether the light duty can be met today, null when the planner does not say
  reachable: boolean | null;
  light: { dli: number | null; target: number | null; end: Band | null };
  revenue: { end: Band | null; cost: number | null; share: number | null };
  hours: PlanHour[];
  // the three hours the planner holds to
  block: Window | null;
}

const CLOCK = /^(?:[01]\d|2[0-3]):[0-5]\d$|^24:00$/;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function clock(value: unknown): string | null {
  return typeof value === 'string' && CLOCK.test(value) ? value : null;
}

function band(value: unknown): Band | null {
  if (!Array.isArray(value) || value.length !== 3) return null;
  const out = value.map(num);
  return out.every((n): n is number => n !== null) ? (out as Band) : null;
}

function span(value: unknown): Window | null {
  const v = record(value);
  const from = clock(v.from);
  const to = clock(v.to);
  return from && to && minutes(from) < minutes(to) ? { from, to } : null;
}

// the plan if it is an object, null otherwise. hours that make no sense are dropped
export function parsePlan(value: unknown): DayPlan | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const p = value as Record<string, unknown>;
  const light = record(p.light);
  const revenue = record(p.revenue);
  const hours: PlanHour[] = [];
  for (const entry of Array.isArray(p.hours) ? p.hours : []) {
    const h = record(entry);
    const time = span(h);
    if (!time) continue;
    hours.push({ ...time, offset: num(h.offset), why: typeof h.why === 'string' && h.why ? h.why : null, price: num(h.price) });
  }
  return {
    date: typeof p.date === 'string' && p.date ? p.date : null,
    now: clock(p.now),
    reachable: typeof p.reachable === 'boolean' ? p.reachable : null,
    light: { dli: num(light.dli), target: num(light.dli_target), end: band(light.dli_end) },
    revenue: { end: band(revenue.elec_end_eur_ha), cost: num(revenue.plant_cost_eur_ha), share: num(revenue.plant_cost_share) },
    hours,
    block: span(p.block)
  };
}

// true when the hour lies in the binding block
export function inBlock(hour: PlanHour, block: Window | null): boolean {
  if (!block) return false;
  return minutes(hour.from) < minutes(block.to) && minutes(hour.to) > minutes(block.from);
}

// the reasons this page has words for, anything else shows as the planner sent it
export const REASONS = ['sun', 'light', 'price', 'stress', 'shade', 'power_hour', 'night'] as const;
export type Reason = (typeof REASONS)[number];

export function isReason(why: string | null | undefined): why is Reason {
  return typeof why === 'string' && (REASONS as readonly string[]).includes(why);
}

// the reason in words, tr is t() or translate() with a language
export function reasonText(why: string | null | undefined, tr: (key: Key) => string): string {
  if (isReason(why)) return tr(`admin.plan.why.${why}` as Key);
  return why ?? '';
}

// the address of the full plan page. through the pi an admin's token goes along,
// the pi turns it into a cookie so the buttons of that page work as well
export function planPage(base: string, token: string | null = null): string {
  return `${base.replace(/\/+$/, '')}/plan/${token ? `?token=${encodeURIComponent(token)}` : ''}`;
}

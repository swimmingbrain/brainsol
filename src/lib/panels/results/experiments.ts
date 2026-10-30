// what the panels make of an experiment result: the fitted cosine as a curve,
// the step response around the final pose, the gain of each compare round,
// one headline per result and a csv for the paper

import type { CompareResult, CosineResult, ExpKind, ExpResult, ExperimentRecord, ExperimentSummary, StepResult } from '$lib/link/protocol';

export const EXP_KINDS: ExpKind[] = ['cosine', 'compare', 'step'];

export function isCosine(kind: ExpKind, result: ExpResult): result is CosineResult {
  return kind === 'cosine' && Array.isArray((result as CosineResult).points);
}

export function isCompare(kind: ExpKind, result: ExpResult): result is CompareResult {
  return kind === 'compare' && Array.isArray((result as CompareResult).rounds);
}

export function isStep(kind: ExpKind, result: ExpResult): result is StepResult {
  return kind === 'step' && Array.isArray((result as StepResult).samples);
}

// lux = amb + peak * max(0, cos(delta - offset)), the model the tracker fitted.
// the offset is the few degrees the lock sat off the light, without it the
// curve misses the points at the ends of the sweep
export function cosineFit(result: CosineResult, delta: number): number {
  const offset = Number.isFinite(result.offset) ? (result.offset as number) : 0;
  return result.amb + result.peak * Math.max(0, Math.cos(((delta - offset) * Math.PI) / 180));
}

// one table for the chart: every whole degree across the sweep plus the
// measured angles, the measured lux only where a point was taken
export function cosineTable(result: CosineResult): { delta: number[]; measured: (number | null)[]; fit: number[] } {
  const points = [...result.points].filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1])).sort((a, b) => a[0] - b[0]);
  const lo = Math.floor(Math.min(-60, ...points.map((p) => p[0])));
  const hi = Math.ceil(Math.max(60, ...points.map((p) => p[0])));
  const at = new Map<number, number>();
  for (const [d, lux] of points) at.set(d, lux);
  const xs = new Set<number>(points.map((p) => p[0]));
  for (let d = lo; d <= hi; d++) xs.add(d);
  const delta = [...xs].sort((a, b) => a - b);
  return {
    delta,
    measured: delta.map((d) => at.get(d) ?? null),
    fit: delta.map((d) => cosineFit(result, d))
  };
}

// the step response as distance from where the head came to rest, so the
// curve starts at the offset and ends at zero
export function stepTable(result: StepResult): { t: number[]; pan: number[]; tilt: number[]; ex: number[]; ey: number[] } {
  const samples = result.samples.filter((s) => s.every((v) => Number.isFinite(v)));
  const last = samples.at(-1);
  const pan0 = last ? last[3] : 0;
  const tilt0 = last ? last[4] : 0;
  return {
    t: samples.map((s) => s[0]),
    ex: samples.map((s) => s[1]),
    ey: samples.map((s) => s[2]),
    pan: samples.map((s) => s[3] - pan0),
    tilt: samples.map((s) => s[4] - tilt0)
  };
}

export function roundGains(result: CompareResult): (number | null)[] {
  return result.rounds.map((r) => (r.fixed > 0 ? r.tracked / r.fixed : null));
}

// the newest first, one entry per id
export function mergeRecords(...lists: ExperimentSummary[][]): ExperimentSummary[] {
  const seen = new Map<string, ExperimentSummary>();
  for (const list of lists) for (const item of list) if (!seen.has(item.id)) seen.set(item.id, item);
  return [...seen.values()].sort((a, b) => b.ts - a.ts);
}

// the list endpoint answers an array, a wrapped one is taken as well
export function parseList(value: unknown): ExperimentSummary[] {
  const list = Array.isArray(value)
    ? value
    : value && typeof value === 'object'
      ? ((value as { experiments?: unknown; items?: unknown }).experiments ?? (value as { items?: unknown }).items)
      : null;
  if (!Array.isArray(list)) return [];
  return list.filter(
    (item): item is ExperimentSummary =>
      !!item &&
      typeof item === 'object' &&
      typeof (item as ExperimentSummary).id === 'string' &&
      EXP_KINDS.includes((item as ExperimentSummary).kind) &&
      typeof (item as ExperimentSummary).ts === 'number'
  );
}

export function csvUrl(api: string, id: string): string {
  return `${api}/api/experiments/${encodeURIComponent(id)}.csv`;
}

const cell = (value: number | null) => (value === null || !Number.isFinite(value) ? '' : String(Math.round(value * 1e4) / 1e4));

// the result as a plain csv with a header line, the same columns the tracker writes
export function toCsv(record: ExperimentRecord): string {
  const { kind, result } = record;
  const rows: string[] = [];
  if (isCosine(kind, result)) {
    rows.push('delta_deg,lux,fit_lux');
    for (const [d, lux] of result.points) rows.push([d, lux, cosineFit(result, d)].map(cell).join(','));
  } else if (isCompare(kind, result)) {
    rows.push('round,fixed_lux,tracked_lux,gain');
    result.rounds.forEach((r, i) => rows.push([i + 1, r.fixed, r.tracked, r.fixed > 0 ? r.tracked / r.fixed : null].map(cell).join(',')));
  } else if (isStep(kind, result)) {
    rows.push('t_s,ex,ey,pan_deg,tilt_deg');
    for (const s of result.samples) rows.push(s.map(cell).join(','));
  }
  return rows.join('\n') + '\n';
}

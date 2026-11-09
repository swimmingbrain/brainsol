// the three experiments for the seminar paper: what each needs, when one is
// running and the one figure that sums up a finished one. the curves and
// tables are drawn by the result views under results in the same tab

import type { CompareResult, CosineResult, ExpKind, ExpMessage, StepResult } from '$lib/link/protocol';

export const KINDS: ExpKind[] = ['cosine', 'compare', 'step'];

// cosine and compare measure lux, a tracker without a light sensor cannot run them
export function needsLux(kind: ExpKind): boolean {
  return kind === 'cosine' || kind === 'compare';
}

export function isOver(exp: ExpMessage | null): boolean {
  return exp !== null && (exp.result !== null || exp.phase === 'done' || exp.phase === 'error');
}

// an experiment runs while the tracker reports it as its activity. before the
// first sys frame the message itself is all there is
export function expRunning(exp: ExpMessage | null, act: string | null | undefined): boolean {
  if (act !== undefined) return act === 'exp';
  return exp !== null && !isOver(exp);
}

export interface Headline {
  name: 'r2' | 'gain' | 'settle';
  value: number | null;
  digits: number;
  unit: string;
}

const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

// the one figure of a finished experiment: how well the cosine fits, how much
// tracking gains, how fast the loop settles (null when it did not within 8 s)
export function headline(exp: ExpMessage | null): Headline | null {
  if (!exp || !exp.result) return null;
  switch (exp.kind) {
    case 'cosine':
      return { name: 'r2', value: num((exp.result as CosineResult).r2), digits: 3, unit: '' };
    case 'compare':
      return { name: 'gain', value: num((exp.result as CompareResult).gain), digits: 2, unit: '×' };
    case 'step':
      return { name: 'settle', value: num((exp.result as StepResult).settle), digits: 2, unit: ' s' };
    default:
      return null;
  }
}

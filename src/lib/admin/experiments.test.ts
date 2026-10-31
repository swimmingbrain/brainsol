import { describe, expect, it } from 'vitest';
import { expRunning, headline, isOver, KINDS, needsLux } from './experiments';
import type { ExpMessage } from '$lib/link/protocol';

const exp = (extra: Partial<ExpMessage>): ExpMessage => ({ t: 'exp', id: 'e1', kind: 'cosine', phase: 'sweep', progress: 0.4, result: null, ...extra });

describe('the experiments', () => {
  it('has the three kinds of the protocol and knows which need a light sensor', () => {
    expect(KINDS).toEqual(['cosine', 'compare', 'step']);
    expect(needsLux('cosine')).toBe(true);
    expect(needsLux('compare')).toBe(true);
    expect(needsLux('step')).toBe(false);
  });

});

describe('expRunning', () => {
  it('trusts the activity of the tracker', () => {
    expect(expRunning(exp({}), 'exp')).toBe(true);
    expect(expRunning(exp({}), null)).toBe(false);
    expect(expRunning(null, 'exp')).toBe(true);
  });

  it('falls back to the message before the first sys frame', () => {
    expect(expRunning(exp({}), undefined)).toBe(true);
    expect(expRunning(exp({ phase: 'error' }), undefined)).toBe(false);
    expect(expRunning(exp({ phase: 'done', progress: 1 }), undefined)).toBe(false);
    expect(expRunning(null, undefined)).toBe(false);
  });

  it('calls an experiment with a result over', () => {
    expect(isOver(exp({ result: { peak: 1, amb: 0, r2: 1, points: [] } }))).toBe(true);
    expect(isOver(exp({}))).toBe(false);
  });
});

describe('headline', () => {
  it('picks the figure that sums each kind up', () => {
    expect(headline(exp({ phase: 'done', result: { peak: 880, amb: 60, r2: 0.9978, points: [] } }))).toEqual({ name: 'r2', value: 0.9978, digits: 3, unit: '' });
    expect(headline(exp({ kind: 'compare', phase: 'done', result: { gain: 1.42, spread: 0.03, rounds: [] } }))?.value).toBe(1.42);
    expect(headline(exp({ kind: 'step', phase: 'done', result: { settle: 1.84, overshoot: 2.1, samples: [] } }))).toEqual({ name: 'settle', value: 1.84, digits: 2, unit: ' s' });
  });

  it('keeps a step that never settled as null and ignores a running one', () => {
    expect(headline(exp({ kind: 'step', phase: 'done', result: { settle: null, overshoot: 4, samples: [] } }))?.value).toBeNull();
    expect(headline(exp({}))).toBeNull();
    expect(headline(null)).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { followText } from './follow';
import { translate, type Key, type Params } from '$lib/i18n';
import type { PlanFollow } from '$lib/link/protocol';

const en = (key: Key, params?: Params) => translate('en', key, params);

// what brainsolpi/modes.py sends in the plan field of a state frame
const FOLLOW: PlanFollow = {
  ok: true,
  lost: false,
  up: true,
  date: '2025-06-04',
  time: '09:20',
  offset: 20,
  why: 'light',
  speed: 60,
  paused: false
};

describe('followText', () => {
  it('names the simulated day and time and why the panel turns away', () => {
    expect(followText(FOLLOW, en)).toEqual(['Simulated day 2025-06-04, 09:20.', '20° away from the sun, the plant needs light.']);
  });

  it('says the head parks at night in the simulation', () => {
    expect(followText({ ...FOLLOW, up: false, why: 'night', offset: 0 }, en)[1]).toBe('Night in the simulation, the head parks.');
  });

  it('says when the brain is silent, before the first answer and after 10 s', () => {
    expect(followText({ ...FOLLOW, ok: false, up: null, date: null, time: null }, en)).toEqual([en('admin.plan.wait')]);
    expect(followText({ ...FOLLOW, ok: false }, en)).toEqual(['Simulated day 2025-06-04, 09:20.', en('admin.plan.away')]);
    expect(followText({ ...FOLLOW, ok: false, lost: true }, en)).toEqual([en('admin.plan.lost')]);
  });

  it('says nothing outside the plan mode and adds a paused simulation', () => {
    expect(followText(null, en)).toEqual([]);
    expect(followText({ ...FOLLOW, paused: true }, en)).toContain('The simulation is paused.');
  });
});

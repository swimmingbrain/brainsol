import { describe, expect, it } from 'vitest';
import { inBlock, parsePlan, planPage, reasonText } from './plan';
import { translate } from '$lib/i18n';

// the plan key as the brain server sends it next to the recipe
const PLAN = {
  date: '2025-06-04',
  now: '09:20',
  reachable: true,
  light: { dli: 4.1, dli_target: 25.0, dli_end: [22.0, 25.4, 28.1] },
  revenue: { elec_end_eur_ha: [180.0, 210.0, 240.0], plant_cost_eur_ha: 12.0, plant_cost_share: 0.05 },
  hours: [
    { from: '09:00', to: '10:00', offset: 0, why: 'sun', price: 87.3 },
    { from: '10:00', to: '11:00', offset: 60, why: 'light', price: 12.0 },
    { from: '12:00', to: '13:00', offset: 30, why: 'power_hour', price: 40.0 }
  ],
  block: { from: '09:00', to: '12:00' }
};

describe('parsePlan', () => {
  it('reads the plan of the contract', () => {
    const plan = parsePlan(PLAN);
    expect(plan).toEqual({
      date: '2025-06-04',
      now: '09:20',
      reachable: true,
      light: { dli: 4.1, target: 25, end: [22, 25.4, 28.1] },
      revenue: { end: [180, 210, 240], cost: 12, share: 0.05 },
      hours: PLAN.hours,
      block: { from: '09:00', to: '12:00' }
    });
  });

  it('is no plan when the planner is not ready', () => {
    expect(parsePlan(null)).toBeNull();
    expect(parsePlan(undefined)).toBeNull();
    expect(parsePlan('soon')).toBeNull();
    expect(parsePlan([1, 2])).toBeNull();
  });

  it('keeps what is there, drops broken hours and ignores keys it does not know', () => {
    const plan = parsePlan({
      reachable: 'maybe',
      light: { dli: 'a lot', dli_end: [1, 2] },
      hours: [{ from: '13:00', to: '12:00' }, { from: '14:00', to: '15:00', offset: null, why: 'fog' }, 'x'],
      block: { from: '25:00', to: '26:00' },
      weather: { cloud: 0.4 },
      model: 'v9'
    });
    expect(plan).toEqual({
      date: null,
      now: null,
      reachable: null,
      light: { dli: null, target: null, end: null },
      revenue: { end: null, cost: null, share: null },
      hours: [{ from: '14:00', to: '15:00', offset: null, why: 'fog', price: null }],
      block: null
    });
  });
});

describe('the binding block', () => {
  it('marks the hours inside it', () => {
    const plan = parsePlan(PLAN)!;
    expect(plan.hours.map((h) => inBlock(h, plan.block))).toEqual([true, true, false]);
    expect(inBlock(plan.hours[0], null)).toBe(false);
  });
});

describe('reasonText', () => {
  it('puts every reason of the planner into words and shows a new one as it came', () => {
    const en = (key: Parameters<typeof translate>[1]) => translate('en', key);
    const de = (key: Parameters<typeof translate>[1]) => translate('de', key);
    for (const why of ['sun', 'light', 'price', 'stress', 'shade', 'power_hour', 'night']) {
      expect(reasonText(why, en)).not.toContain('admin.');
      expect(reasonText(why, de)).not.toBe(reasonText(why, en));
    }
    expect(reasonText('fog', en)).toBe('fog');
    expect(reasonText(null, en)).toBe('');
  });
});

describe('planPage', () => {
  it('opens the planner page under the base and hands the token of the pi along', () => {
    expect(planPage('http://jetson:8000')).toBe('http://jetson:8000/plan/');
    expect(planPage('http://brainsol.local:8080/brain/', 'a b')).toBe('http://brainsol.local:8080/brain/plan/?token=a%20b');
  });
});

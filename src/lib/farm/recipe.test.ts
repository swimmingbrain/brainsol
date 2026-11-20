import { describe, expect, it } from 'vitest';
import { minutes, parseAsk, parseRecipe } from './recipe';

const tomato = (over: Record<string, unknown> = {}) => ({
  v: 3,
  plant: 'Tomato',
  names: { en: 'Tomato', de: 'Tomate' },
  light_target: 14,
  max_temp: 30,
  avoid_sun: [{ from: '11:00', to: '15:00' }],
  power_first: [{ from: '17:00', to: '21:00' }],
  source: 'unchecked, from memory',
  ...over
});

describe('parseRecipe', () => {
  it('takes a good recipe as it is', () => {
    expect(parseRecipe(tomato())).toEqual(tomato());
  });

  it('allows an unknown temperature, no windows and no source', () => {
    const r = parseRecipe(tomato({ max_temp: null, avoid_sun: [], power_first: [], source: undefined }));
    expect(r?.max_temp).toBeNull();
    expect(r?.avoid_sun).toEqual([]);
    expect(r?.source).toBe('');
  });

  it.each([
    ['an older version', { v: 2 }],
    ['no plant name', { plant: ' ' }],
    ['no names', { names: undefined }],
    ['a name missing', { names: { en: 'Basil' } }],
    ['too little light', { light_target: 0 }],
    ['too much light', { light_target: 41 }],
    ['light that is not a number', { light_target: NaN }],
    ['a hot temperature', { max_temp: 80 }],
    ['a window backwards', { avoid_sun: [{ from: '15:00', to: '11:00' }] }],
    ['a window without a time', { power_first: [{ from: '17:00' }] }],
    ['a time that is no time', { power_first: [{ from: '5pm', to: '21:00' }] }]
  ])('refuses %s', (_, over) => {
    expect(parseRecipe(tomato(over))).toBeNull();
  });

  it('refuses things that are no recipe at all', () => {
    expect(parseRecipe(null)).toBeNull();
    expect(parseRecipe('recipe')).toBeNull();
  });

  it('reads midnight as the end of the day', () => {
    expect(minutes('24:00')).toBe(1440);
    expect(parseRecipe(tomato({ power_first: [{ from: '17:00', to: '24:00' }] }))).not.toBeNull();
  });
});

describe('parseAsk', () => {
  const known = [{ name: 'Brinjal', names: { en: 'Eggplant', de: 'Aubergine' } }];

  it('reads an unknown plant and the known ones', () => {
    expect(parseAsk({ plant: ' Safran ', known })).toEqual({ plant: 'Safran', known });
  });

  it('reads a missing plant as null', () => {
    expect(parseAsk({ plant: null, known })?.plant).toBeNull();
    expect(parseAsk({ plant: '', known })?.plant).toBeNull();
  });

  it('refuses a broken question', () => {
    expect(parseAsk({ plant: 3, known })).toBeNull();
    expect(parseAsk({ plant: null })).toBeNull();
    expect(parseAsk({ plant: null, known: [{ name: 'Brinjal' }] })).toBeNull();
  });
});

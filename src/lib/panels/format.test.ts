import { describe, expect, it } from 'vitest';
import { angle, gainPercent, lux, percent, power, roughAngle } from './format';

describe('the panel number formats', () => {
  it('write the gain as a signed percent against the fixed panel', () => {
    expect(gainPercent(1.34, 'en')).toBe('+34');
    expect(gainPercent(0.97, 'en')).toBe('-3');
    expect(gainPercent(1.001, 'en')).toBe('0');
    expect(gainPercent(13.5, 'de')).toBe('+1.250');
    expect(gainPercent(null, 'en')).toBeNull();
    expect(gainPercent(NaN, 'en')).toBeNull();
  });

  it('give panel power in milliwatts below one watt and in watts above', () => {
    expect(power(14.04, 'en')).toEqual({ value: '14.0', unit: 'mW' });
    expect(power(3.456, 'en')).toEqual({ value: '3.46', unit: 'mW' });
    expect(power(512.4, 'en')).toEqual({ value: '512', unit: 'mW' });
    expect(power(1520, 'de')).toEqual({ value: '1,52', unit: 'W' });
    expect(power(12340, 'en')).toEqual({ value: '12.3', unit: 'W' });
    expect(power(null)).toBeNull();
  });

  it('keep lux whole except in the dark', () => {
    expect(lux(968.4, 'en')).toBe('968');
    expect(lux(80120, 'de')).toBe('80.120');
    expect(lux(4.26, 'en')).toBe('4.3');
    expect(lux(undefined)).toBeNull();
  });

  it('turn a level into a whole percent', () => {
    expect(percent(0.843, 'en')).toBe('84');
    expect(percent(1, 'en')).toBe('100');
    expect(percent(null)).toBeNull();
  });

  it('round the off target angle to whole degrees and say under one below that', () => {
    expect(roughAngle(2.4)).toEqual({ under: false, value: 2 });
    expect(roughAngle(17.6)).toEqual({ under: false, value: 18 });
    expect(roughAngle(0.4)).toEqual({ under: true, value: 1 });
    expect(roughAngle(null)).toBeNull();
  });

  it('write angles with one decimal in the language', () => {
    expect(angle(21.66, 'en')).toBe('21.7');
    expect(angle(-4.25, 'de')).toBe('-4,3');
  });
});

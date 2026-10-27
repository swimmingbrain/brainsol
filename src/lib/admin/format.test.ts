import { describe, expect, it } from 'vitest';
import { clockTime, uptimeText } from './format';

const units = { d: 'd', h: 'h', min: 'min', s: 's' };

describe('uptimeText', () => {
  it('shows the two largest parts', () => {
    expect(uptimeText(45, units)).toBe('45 s');
    expect(uptimeText(250, units)).toBe('4 min 10 s');
    expect(uptimeText(2 * 3600 + 5 * 60 + 9, units)).toBe('2 h 5 min');
    expect(uptimeText(3 * 86400 + 4 * 3600 + 59, units)).toBe('3 d 4 h');
  });

  it('leaves out a second part that is zero', () => {
    expect(uptimeText(3600, units)).toBe('1 h');
    expect(uptimeText(86400 + 30, units)).toBe('1 d');
  });

  it('starts at zero and has nothing to say about broken input', () => {
    expect(uptimeText(0, units)).toBe('0 s');
    expect(uptimeText(null, units)).toBeNull();
    expect(uptimeText(-5, units)).toBeNull();
    expect(uptimeText(NaN, units)).toBeNull();
  });

  it('takes the units of the language', () => {
    expect(uptimeText(90000, { d: 'T', h: 'h', min: 'min', s: 's' })).toBe('1 T 1 h');
  });
});

describe('clockTime', () => {
  it('writes unix seconds as a local clock time with leading zeros', () => {
    const date = new Date(2026, 10, 14, 9, 5, 7);
    expect(clockTime(date.getTime() / 1000)).toBe('09:05:07');
    expect(clockTime(NaN)).toBe('');
  });
});

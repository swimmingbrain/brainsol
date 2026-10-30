import { describe, expect, it } from 'vitest';
import { formatField, parseField } from './number';

describe('a number field', () => {
  it('writes the decimal comma in german and the dot in english, without trailing zeros', () => {
    expect(formatField(48.21, 2, 'de')).toBe('48,21');
    expect(formatField(48.2, 2, 'en')).toBe('48.2');
    expect(formatField(-16.37, 2, 'de')).toBe('-16,37');
    expect(formatField(900, 0, 'de')).toBe('900');
    expect(formatField(12000, 0, 'de')).toBe('12000');
    expect(formatField(-0.001, 2, 'de')).toBe('0');
    expect(formatField(NaN, 2, 'en')).toBe('0');
  });

  it('reads a comma or a dot as the decimal mark, whichever was typed', () => {
    expect(parseField('48,21')).toBe(48.21);
    expect(parseField('48.21')).toBe(48.21);
    expect(parseField(' -16,37 ° ')).toBe(-16.37);
    expect(parseField(',5')).toBe(0.5);
    expect(parseField('1e3')).toBe(1000);
  });

  it('takes the last mark as the decimal one when someone groups thousands', () => {
    expect(parseField('1.234,5')).toBe(1234.5);
    expect(parseField('1,234.5')).toBe(1234.5);
    expect(parseField('12.000.000')).toBe(12000000);
    expect(parseField('1,000,000')).toBe(1000000);
  });

  it('gives NaN for anything that is not a number, the field then keeps its value', () => {
    for (const text of ['', '  ', 'abc', '-', '.', '1,2,3.4.5', '--5', '5-']) expect(parseField(text), text).toBeNaN();
  });
});

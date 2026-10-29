import { describe, expect, it } from 'vitest';
import { roleColor, themeColors } from './theme';

describe('the panel colours', () => {
  it('fall back to the dark tokens where there is no page to read them from', () => {
    const colors = themeColors();
    expect(colors.series).toEqual(['#5b8fc9', '#c4853f', '#8f6bb8']);
    expect(colors.heat).toHaveLength(5);
    expect(colors.accent).toBe('#d19a66');
  });

  it('paint each role with its colour', () => {
    const colors = themeColors();
    expect(roleColor(colors, 'series1')).toBe(colors.series[0]);
    expect(roleColor(colors, 'series3')).toBe(colors.series[2]);
    expect(roleColor(colors, 'accent')).toBe(colors.accent);
    expect(roleColor(colors, 'neutral')).toBe(colors.neutral);
  });
});

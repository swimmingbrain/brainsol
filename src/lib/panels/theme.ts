// the chart colours of the current theme. call it inside $derived or an
// effect: reading the theme rune makes the caller run again after a switch,
// and by then app.css has already swapped the tokens on the html element

import { chartColors, cssVar, type ChartColors } from '$lib/ui/tokens';
import { preferences } from '$lib/stores/preferences.svelte';

export interface PanelColors extends ChartColors {
  surface: string;
  deep: string;
  elevated: string;
  accent: string;
  strong: string;
  secondary: string;
}

export function themeColors(): PanelColors {
  void preferences.theme;
  const base = chartColors();
  return {
    ...base,
    surface: cssVar('--bg-surface', '#19191c'),
    deep: cssVar('--bg-deep', '#111113'),
    elevated: cssVar('--bg-elevated', '#212124'),
    accent: cssVar('--accent', '#d19a66'),
    strong: cssVar('--text-strong', '#ececef'),
    secondary: cssVar('--text-secondary', '#a1a1aa')
  };
}

// what a chart mark may be painted with: a series colour in its fixed order,
// the accent for the one thing that matters, the quiet neutral for the rest
export type ColorRole = 'series1' | 'series2' | 'series3' | 'neutral' | 'accent';

export function roleColor(colors: PanelColors, role: ColorRole): string {
  if (role === 'series1') return colors.series[0];
  if (role === 'series2') return colors.series[1];
  if (role === 'series3') return colors.series[2];
  if (role === 'accent') return colors.accent;
  return colors.neutral;
}

// the two inks for text on a filled mark, the same in both themes
export const INK = { light: '#ffffff', dark: '#111113' } as const;

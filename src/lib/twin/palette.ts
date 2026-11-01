// the colours of the scene, read from the css tokens of the current theme. the
// printed parts keep their own colours (assembly.ts), everything around them
// follows the page: background, ground, lines, accent and the heat ramp

import { chartColors, cssVar } from '$lib/ui/tokens';
import { color, type Rgb } from './ramp';

export interface Palette {
  light: boolean;
  bg: Rgb;
  surface: Rgb;
  elevated: Rgb;
  border: Rgb;
  grid: Rgb;
  muted: Rgb;
  secondary: Rgb;
  accent: Rgb;
  heat: Rgb[];
}

export function readPalette(): Palette {
  const chart = chartColors();
  const light = typeof document !== 'undefined' && document.documentElement.dataset.theme === 'light';
  return {
    light,
    bg: color(cssVar('--bg-deep'), light ? '#f4f4f5' : '#111113'),
    surface: color(cssVar('--bg-surface'), light ? '#ffffff' : '#19191c'),
    elevated: color(cssVar('--bg-elevated'), light ? '#f0f0f2' : '#212124'),
    border: color(cssVar('--border'), light ? '#e0e0e4' : '#2e2e33'),
    grid: color(chart.grid, '#2e2e33'),
    muted: color(cssVar('--text-muted'), '#8b8b94'),
    secondary: color(cssVar('--text-secondary'), '#a1a1aa'),
    accent: color(cssVar('--accent'), '#d19a66'),
    heat: chart.heat.map((c, i) => color(c, ['#26221f', '#4a3a2b', '#7a5c3d', '#a87c52', '#d19a66'][i]))
  };
}
